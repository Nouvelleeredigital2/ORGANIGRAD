/**
 * Producteur Synapse (APPS-2026) — Organigrad ÉMET `validation.requested` sur
 * le bus quand un nœud HUMAN est atteint (un humain doit valider).
 *
 * Patron event-shaped, miroir du consumer : ici Organigrad est la SOURCE de la
 * demande de validation ; une surface humaine (LINK) l'affiche, l'humain décide,
 * et la décision revient à Organigrad qui ré-émet `validation.approved` /
 * `validation.rejected` (cf. consumer.ts).
 *
 * L'enveloppe est construite via `@apps2026/contracts` (source unique) — donc
 * validée (Zod strict) au moment de la construction. Auto-désactivé si
 * `SYNAPSE_URL` est absent : aucune émission réseau hors démo.
 */
import { createEvent, type SynapseEvent } from "@apps2026/contracts";

/** Forme minimale d'un nœud HUMAN (structurellement compatible avec HybridNode). */
export interface HumanGateNode {
  id: string;
  nom?: string;
  roleTitre?: string;
}

/** Abstraction injectée dans le moteur d'orchestration. */
export interface HumanGateNotifier {
  /** Appelé quand le flux atteint un garant humain. Ne doit jamais lever. */
  onHumanGate(node: HumanGateNode): Promise<void>;
}

/**
 * Construit l'enveloppe canonique `validation.requested` pour un nœud HUMAN.
 * `validationId = node.id` et `correlationId` déterministe (`val-<nodeId>`) :
 * rejouer le même garant produit la même corrélation → idempotence côté bus.
 */
export function buildValidationRequestedEvent(
  node: HumanGateNode,
  opts: { actionUrl?: string; correlationId?: string } = {},
): SynapseEvent {
  return createEvent({
    type: "validation.requested",
    sourceApp: "organigrad",
    targetApps: ["link"],
    validationId: node.id,
    correlationId: opts.correlationId ?? `val-${node.id}`,
    payload: {
      nodeId: node.id,
      title: node.nom ? `Approbation requise : ${node.nom}` : "Approbation requise",
      nodeName: node.nom,
      roleTitle: node.roleTitre,
      sourceApp: "organigrad",
      ...(opts.actionUrl ? { actionUrl: opts.actionUrl } : {}),
    },
  });
}

/**
 * Crée un notifier qui POSTe `validation.requested` vers `SYNAPSE_URL/api/events`.
 * Auto-inactif si l'URL est absente (no-op silencieux). L'émission est
 * best-effort : une panne du bus ne doit jamais bloquer l'orchestration.
 */
export function createSynapseProducer(opts: {
  synapseUrl?: string;
  appUrl?: string;
  log?: (msg: string) => void;
} = {}): HumanGateNotifier {
  const base = (opts.synapseUrl ?? process.env.SYNAPSE_URL)?.replace(/\/$/, "");
  const appUrl = opts.appUrl ?? process.env.APP_URL;

  return {
    async onHumanGate(node: HumanGateNode): Promise<void> {
      if (!base) return; // hors démo : aucun effet
      const actionUrl = appUrl ? `${appUrl}?view=orchestration&nodeId=${node.id}` : undefined;
      const evt = buildValidationRequestedEvent(node, { actionUrl });
      try {
        const res = await fetch(`${base}/api/events`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(evt),
        });
        if (!res.ok) opts.log?.(`[synapse-producer] bus a répondu ${res.status}`);
      } catch (e) {
        opts.log?.(`[synapse-producer] émission échouée : ${e instanceof Error ? e.message : e}`);
      }
    },
  };
}
