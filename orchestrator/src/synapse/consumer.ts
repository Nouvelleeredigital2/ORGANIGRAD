/**
 * Consumer Synapse (APPS-2026) — fait d'Organigrad un vrai participant du bus.
 *
 * Patron event-shaped : Synapse ÉMET `validation.requested`, Organigrad (ici)
 * CONSOMME, puis DÉCIDE et ré-émet `validation.approved` / `validation.rejected`
 * sur le bus (avec `causationId` = id de la demande, pour que les surfaces —
 * ex. LINK — relient la décision à la demande). Organigrad reste l'autorité.
 *
 * Auto-désactivé si `SYNAPSE_URL` est absent (aucun effet hors démo).
 * Branché uniquement en mode dev in-memory (pas d'auth) — pas en mode pg.
 */
import type { FastifyInstance, FastifyReply } from "fastify";

interface PendingValidation {
  id: string;
  title: string;
  description?: string;
  sourceApp: string;
  actionUrl?: string;
  at?: string;
}

const POLL_MS = 3000;

export function registerSynapseConsumer(app: FastifyInstance): void {
  const base = process.env.SYNAPSE_URL?.replace(/\/$/, "");
  const pending = new Map<string, PendingValidation>();

  app.get("/api/synapse/validations", async () => ({
    items: [...pending.values()],
    synapse: base ? "live" : "disabled",
  }));

  const decide = async (
    eventId: string,
    decision: "approved" | "rejected",
    reply: FastifyReply,
  ): Promise<FastifyReply> => {
    const v = pending.get(eventId);
    if (!v) return reply.code(404).send({ error: "validation inconnue" });
    if (!base) return reply.code(503).send({ error: "SYNAPSE_URL non configuré" });

    const evt = {
      type: decision === "approved" ? "validation.approved" : "validation.rejected",
      sourceApp: "organigrad",
      causationId: eventId,
      payload: {
        requestedEventId: eventId,
        decision,
        decidedBy: "organigrad-orchestrator",
        title: v.title,
      },
    };
    try {
      const res = await fetch(`${base}/api/events`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(evt),
      });
      if (!res.ok) return reply.code(502).send({ error: `Synapse a répondu ${res.status}` });
      pending.delete(eventId);
      return reply.code(202).send(await res.json());
    } catch (e) {
      return reply.code(503).send({ error: e instanceof Error ? e.message : "Bus injoignable" });
    }
  };

  app.post<{ Params: { eventId: string } }>(
    "/api/synapse/validations/:eventId/approve",
    (req, reply) => decide(req.params.eventId, "approved", reply),
  );
  app.post<{ Params: { eventId: string } }>(
    "/api/synapse/validations/:eventId/reject",
    (req, reply) => decide(req.params.eventId, "rejected", reply),
  );

  if (!base) {
    app.log.warn("[synapse-consumer] SYNAPSE_URL absent — consumer inactif");
    return;
  }

  const ingest = (items: Array<Record<string, unknown>>): void => {
    for (const e of items) {
      const id = typeof e.id === "string" ? e.id : undefined;
      if (e.type !== "validation.requested" || !id || pending.has(id)) continue;
      const p = (e.payload ?? {}) as Record<string, unknown>;
      pending.set(id, {
        id,
        title: typeof p.title === "string" ? p.title : "Validation demandée",
        description: typeof p.description === "string" ? p.description : undefined,
        sourceApp: typeof p.sourceApp === "string" ? p.sourceApp : String(e.sourceApp ?? "?"),
        actionUrl: typeof p.actionUrl === "string" ? p.actionUrl : undefined,
        at: typeof e.createdAt === "string" ? e.createdAt : undefined,
      });
    }
  };

  const poll = async (): Promise<void> => {
    try {
      const r = await fetch(`${base}/api/events?limit=50`);
      if (!r.ok) return;
      const data = (await r.json()) as { items?: Array<Record<string, unknown>> };
      ingest(data.items ?? []);
    } catch {
      /* bus momentanément injoignable — on réessaie au prochain tick */
    }
  };

  void poll();
  const timer = setInterval(() => void poll(), POLL_MS);
  app.addHook("onClose", async () => clearInterval(timer));
  app.log.info(`[synapse-consumer] actif — bus ${base}`);
}
