/**
 * Jeton de service pour parler au bus Synapse (SYNAPSE_AUTH_MODE=required
 * depuis le 2026-08-09). Port Node du même mécanisme que
 * `synapse_auth.py` côté pipeline Hermès (voir `apps2026-hub/hermes-ops`).
 *
 * Compte de service dédié "organigrad-prod" (aucune donnée métier, aucun
 * accès humain), distinct des comptes "hermes-vps" et "socialize-ea".
 *
 * Fichier de creds : chemin dans `SYNAPSE_SERVICE_CRED_FILE` (défaut
 * `/opt/organigrad/.synapse_service.json`, 600). Contient
 * `{ supabase_url, apikey, access_token, refresh_token, expires_at }`.
 *
 * Supabase FAIT TOURNER (rotate) le refresh_token à chaque usage : la
 * nouvelle paire DOIT être sauvée immédiatement, sinon le rafraîchissement
 * suivant échoue (jeton déjà consommé). Contrairement au pipeline Python
 * (plusieurs process concurrents → verrou fichier nécessaire), l'orchestrateur
 * est un seul process Node long-vivant : un verrou EN MÉMOIRE (une seule
 * promesse de rafraîchissement partagée) suffit à éviter la double
 * consommation entre deux appels concurrents dans le même process.
 */
import { readFileSync, writeFileSync, renameSync, chmodSync } from "node:fs";

const CRED_FILE = process.env.SYNAPSE_SERVICE_CRED_FILE ?? "/opt/organigrad/.synapse_service.json";
const MARGIN_S = 120; // rafraîchit un peu avant l'expiration réelle

interface ServiceCred {
  supabase_url: string;
  apikey: string;
  access_token: string;
  refresh_token: string;
  expires_at: number; // epoch seconds
}

function load(): ServiceCred {
  return JSON.parse(readFileSync(CRED_FILE, "utf-8")) as ServiceCred;
}

function save(cred: ServiceCred): void {
  const tmp = CRED_FILE + ".tmp";
  writeFileSync(tmp, JSON.stringify(cred));
  renameSync(tmp, CRED_FILE);
  try {
    chmodSync(CRED_FILE, 0o600);
  } catch {
    /* pas bloquant (ex. filesystem qui n'implémente pas chmod) */
  }
}

async function refresh(cred: ServiceCred): Promise<ServiceCred> {
  const res = await fetch(
    cred.supabase_url.replace(/\/+$/, "") + "/auth/v1/token?grant_type=refresh_token",
    {
      method: "POST",
      headers: { apikey: cred.apikey, "content-type": "application/json" },
      body: JSON.stringify({ refresh_token: cred.refresh_token }),
    },
  );
  if (!res.ok) throw new Error(`refresh Synapse auth échoué (${res.status})`);
  const tok = (await res.json()) as { access_token: string; refresh_token: string; expires_in?: number };
  const next: ServiceCred = {
    ...cred,
    access_token: tok.access_token,
    refresh_token: tok.refresh_token,
    expires_at: Math.floor(Date.now() / 1000) + (tok.expires_in ?? 3600) - 60,
  };
  save(next);
  return next;
}

let refreshInFlight: Promise<ServiceCred> | null = null;

/**
 * Jeton d'accès valide pour appeler Synapse, rafraîchi si besoin.
 * Best-effort sur l'échec de rafraîchissement (réseau momentané) : renvoie le
 * jeton en cache même expiré plutôt que d'échouer à coup sûr — Synapse
 * renverra 401 si vraiment périmé, propre à gérer côté appelant (best-effort,
 * jamais bloquant pour le flux métier — même patron que `producer.ts`).
 */
export async function getSynapseServiceToken(): Promise<string | undefined> {
  let cred: ServiceCred;
  try {
    cred = load();
  } catch {
    return undefined; // pas de compte de service configuré — mode dégradé (401 côté Synapse)
  }
  if (cred.expires_at - MARGIN_S > Math.floor(Date.now() / 1000)) {
    return cred.access_token;
  }
  if (!refreshInFlight) {
    refreshInFlight = refresh(cred)
      .catch(() => cred) // échec réseau : on retente le jeton en cache
      .finally(() => {
        refreshInFlight = null;
      });
  }
  const next = await refreshInFlight;
  return next.access_token;
}

/** En-têtes prêts à fusionner dans une requête fetch — {} si non configuré. */
export async function synapseAuthHeaders(): Promise<Record<string, string>> {
  const token = await getSynapseServiceToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}
