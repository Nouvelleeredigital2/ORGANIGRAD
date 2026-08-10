/**
 * Consumer Synapse (APPS-2026) — fait d'Organigrad un vrai participant du bus.
 *
 * Patron event-shaped : Synapse ÉMET `validation.requested`, Organigrad (ici)
 * CONSOMME, puis DÉCIDE et ré-émet `validation.approved` / `validation.rejected`
 * sur le bus (avec `causationId` = id de la demande, pour que les surfaces —
 * ex. LINK — relient la décision à la demande). Organigrad reste l'autorité.
 *
 * Auto-désactivé si `SYNAPSE_URL` est absent (aucun effet hors démo).
 *
 * Modes : branché d'office en dev in-memory ; en mode pg (production) il faut
 * l'activer explicitement avec `SYNAPSE_CONSUMER=1` — voir `api/bootstrap.ts`.
 *
 * CLOISONNEMENT PAR WORKSPACE (2026-08-11) : la file `pending` associe désormais
 * un `workspaceId` à chaque validation, lu depuis `payload.workspaceId` de
 * l'événement source (ex. Hermès le pose déjà — voir `post_gate()` côté
 * pipeline). Un événement SANS `workspaceId` n'est PAS ingéré (log + rejet
 * explicite) plutôt que placé dans un panier partagé par défaut — un défaut
 * partagé serait exactement le trou qu'on referme ici. `GET
 * /api/synapse/validations` ne renvoie que les validations du workspace
 * appelant ; `/approve` et `/reject` renvoient 403 sur une validation d'un
 * AUTRE workspace (même si l'id est deviné). Les deux routes de décision
 * exigent en plus `human:approve`/`human:reject` (mêmes scopes que
 * `/api/nodes/:id/approve|reject` — une clé technique ne les a jamais par
 * défaut, seul un humain avec un rôle workspace les obtient).
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { assertScope, MissingScopeError, SCOPES } from "../api/scopes.js";

interface PendingValidation {
  id: string;
  title: string;
  description?: string;
  sourceApp: string;
  actionUrl?: string;
  at?: string;
  workspaceId: string;
}

const POLL_MS = 3000;

export function registerSynapseConsumer(app: FastifyInstance): void {
  const base = process.env.SYNAPSE_URL?.replace(/\/$/, "");
  const pending = new Map<string, PendingValidation>();

  app.get("/api/synapse/validations", async (req: FastifyRequest) => ({
    items: [...pending.values()].filter((v) => v.workspaceId === req.workspaceId),
    synapse: base ? "live" : "disabled",
  }));

  const decide = async (
    eventId: string,
    decision: "approved" | "rejected",
    req: FastifyRequest,
    reply: FastifyReply,
  ): Promise<FastifyReply> => {
    try {
      assertScope(req.scopes, decision === "approved" ? SCOPES.humanApprove : SCOPES.humanReject);
    } catch (err) {
      if (err instanceof MissingScopeError) {
        return reply.code(403).send({ error: "INSUFFICIENT_SCOPE", required: err.required });
      }
      throw err;
    }
    const v = pending.get(eventId);
    if (!v) return reply.code(404).send({ error: "validation inconnue" });
    if (v.workspaceId !== req.workspaceId) {
      // Existe, mais dans un AUTRE workspace : 404 (pas 403) pour ne pas
      // confirmer à l'appelant que l'id existe ailleurs.
      return reply.code(404).send({ error: "validation inconnue" });
    }
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
    (req, reply) => decide(req.params.eventId, "approved", req, reply),
  );
  app.post<{ Params: { eventId: string } }>(
    "/api/synapse/validations/:eventId/reject",
    (req, reply) => decide(req.params.eventId, "rejected", req, reply),
  );

  if (!base) {
    app.log.warn("[synapse-consumer] SYNAPSE_URL absent — consumer inactif");
    return;
  }

  const ingest = (items: Array<Record<string, unknown>>): void => {
    for (const e of items) {
      const id = typeof e.id === "string" ? e.id : undefined;
      if (e.type !== "validation.requested" || !id || pending.has(id)) continue;
      // Ne pas ré-ingérer nos PROPRES demandes : le producteur (hop 1) publie
      // `validation.requested` pour chaque nœud entrant en attente humaine. Les
      // reprendre ici ferait apparaître deux fois la même validation et
      // permettrait de la décider par un chemin qui court-circuite la machine
      // à états — l'approbation d'un nœud passe par /api/nodes/:id/approve.
      if (String(e.sourceApp ?? "").toLowerCase() === "organigrad") continue;
      const p = (e.payload ?? {}) as Record<string, unknown>;
      // Sans workspaceId, on ne sait à qui montrer cette validation — un
      // défaut partagé (ex. "unknown") la rendrait visible de tout le monde,
      // exactement le trou qu'on referme ici. On rejette plutôt que d'inventer.
      const workspaceId = typeof p.workspaceId === "string" && p.workspaceId ? p.workspaceId : undefined;
      if (!workspaceId) {
        app.log.warn(
          { eventId: id, sourceApp: e.sourceApp },
          "[synapse-consumer] validation.requested sans workspaceId — ignorée",
        );
        continue;
      }
      pending.set(id, {
        id,
        title: typeof p.title === "string" ? p.title : "Validation demandée",
        description: typeof p.description === "string" ? p.description : undefined,
        sourceApp: typeof p.sourceApp === "string" ? p.sourceApp : String(e.sourceApp ?? "?"),
        actionUrl: typeof p.actionUrl === "string" ? p.actionUrl : undefined,
        at: typeof e.createdAt === "string" ? e.createdAt : undefined,
        workspaceId,
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
