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
import { log } from "../lib/logger.js";

/** Forme minimale d'un nœud HUMAN (structurellement compatible avec HybridNode). */
export interface HumanGateNode {
  id: string;
  nom?: string;
  roleTitre?: string;
}

export type ValidationDecision = "approved" | "rejected";

/** Abstraction injectée dans le moteur d'orchestration. */
export interface HumanGateNotifier {
  /** Appelé quand le flux atteint un garant humain. Ne doit jamais lever. */
  onHumanGate(node: HumanGateNode): Promise<void>;
  /**
   * Appelé quand une décision humaine est prise (approve/reject). Émet
   * `validation.approved` / `validation.rejected` sur le bus pour fermer la
   * boucle (LINK, Mémoire Vive). Optionnel — ne doit jamais lever.
   */
  onDecision?(nodeId: string, decision: ValidationDecision, reason?: string): Promise<void>;
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
 * Construit l'enveloppe canonique de DÉCISION (`validation.approved` /
 * `validation.rejected`). Même `correlationId` déterministe que la demande
 * (`val-<nodeId>`) → chaîne corrélée de bout en bout. `targetApps` : LINK (mise
 * à jour du fil) + Mémoire Vive (archivage de la décision).
 */
export function buildValidationDecisionEvent(
  nodeId: string,
  decision: ValidationDecision,
  opts: { reason?: string; decidedBy?: string } = {},
): SynapseEvent {
  return createEvent({
    type: decision === "approved" ? "validation.approved" : "validation.rejected",
    sourceApp: "organigrad",
    targetApps: ["link", "memoire-vive-connect"],
    validationId: nodeId,
    correlationId: `val-${nodeId}`,
    causationId: `val-${nodeId}`,
    payload: {
      nodeId,
      decision,
      decidedBy: opts.decidedBy ?? "organigrad-orchestrator",
      ...(opts.reason ? { reason: opts.reason } : {}),
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
  memoireViveUrl?: string;
  memoireViveKey?: string;
  log?: (msg: string) => void;
} = {}): HumanGateNotifier {
  const base = (opts.synapseUrl ?? process.env.SYNAPSE_URL)?.replace(/\/$/, "");
  const appUrl = opts.appUrl ?? process.env.APP_URL;
  const mvUrl = (opts.memoireViveUrl ?? process.env.SUPABASE_MEMOIRE_VIVE_URL)?.replace(/\/$/, "");
  const mvKey = opts.memoireViveKey ?? process.env.SUPABASE_MEMOIRE_VIVE_KEY;

  const post = async (evt: SynapseEvent): Promise<void> => {
    if (!base) return;
    try {
      const res = await fetch(`${base}/api/events`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(evt),
      });
      if (!res.ok) log('warn', 'synapse-producer.bus.error', { status: res.status });
    } catch (e) {
      log('warn', 'synapse-producer.emit.failed', { error: e instanceof Error ? e.message : String(e) });
    }
  };

  // Hop 6 — archive la décision dans Mémoire Vive (best-effort, idempotent).
  const archiveDecision = async (
    nodeId: string,
    decision: ValidationDecision,
    reason?: string,
  ): Promise<void> => {
    if (!mvUrl || !mvKey) return;
    try {
      await fetch(`${mvUrl}/rest/v1/archived_decisions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "apikey": mvKey,
          "authorization": `Bearer ${mvKey}`,
          "prefer": "resolution=ignore-duplicates,return=minimal",
        },
        body: JSON.stringify({
          correlation_key: `val-${nodeId}`,
          validation_id: nodeId,
          decision,
          source_app: "organigrad",
          decided_by: "organigrad-orchestrator",
          correlation_id: `val-${nodeId}`,
          causation_id: `val-${nodeId}`,
          ...(reason ? { reason } : {}),
        }),
      });
    } catch (e) {
      log('warn', 'synapse-producer.archive.failed', { nodeId, error: e instanceof Error ? e.message : String(e) });
    }
  };

  return {
    async onHumanGate(node: HumanGateNode): Promise<void> {
      const correlationId = `val-${node.id}`;
      log('info', 'validation.requested', { correlationId, nodeId: node.id });
      const actionUrl = appUrl ? `${appUrl}?view=orchestration&nodeId=${node.id}` : undefined;
      await post(buildValidationRequestedEvent(node, { actionUrl }));
    },
    async onDecision(
      nodeId: string,
      decision: ValidationDecision,
      reason?: string,
    ): Promise<void> {
      const correlationId = `val-${nodeId}`;
      log('info', 'decision', { correlationId, causationId: correlationId, nodeId, decision });
      await post(buildValidationDecisionEvent(nodeId, decision, { reason }));
      await archiveDecision(nodeId, decision, reason);
    },
  };
}
