# Architecture des données & source de vérité

## Couches et responsabilités
| Couche | Rôle | Vérité ? |
|---|---|---|
| **Supabase / PostgreSQL** | persistance (nœuds, transitions, notifications, workspaces) | **Source de vérité** |
| **Orchestrateur** | moteur d'exécution (machine à états HITL), MCP, notifications | exécution |
| **Frontend (SPA)** | projection + cache temporaire | non |
| **CSV / XLSX** | import / export uniquement | non |
| **SSE** | diffusion d'événements (transitions) | non |
| **node_transitions** | journal append-only (audit) | historique |

## Cycle de vie d'un nœud (statuts)
`IDLE → EXECUTING → {CONTROL_PENDING_IA | WAITING_HUMAN_APPROVAL | ERROR}`
`CONTROL_PENDING_IA → {WAITING_HUMAN_APPROVAL | ERROR}`
`WAITING_HUMAN_APPROVAL → {IDLE (approve) | ERROR (reject)}`
`ERROR → IDLE (reset)`

Les transitions sont **centralisées** dans `orchestrator/src/domain/stateMachine.ts`
(`transition()`), seule porte autorisée pour muter un statut. Toute transition
illégale lève `IllegalTransitionError` (→ 409) sans muter.

## Écriture & cohérence
- Le moteur consomme un store **explicitement asynchrone** (`GraphStore`) ; toute
  écriture SQL est **attendue** avant la réponse HTTP (aucun succès prématuré).
- `PgGraphStore.applyTransition` : `UPDATE hybrid_nodes` + `INSERT node_transitions`
  dans **une transaction** avec `SELECT … FOR UPDATE` (anti double-exécution).
- Concurrence : la machine à états + le verrou ligne empêchent deux `EXECUTING`
  concurrents sur le même nœud.

## Cache frontend
- Cache nœuds **namespacé par workspace** (`hybridNodeStore` → clé `…::<ws>`).
- Au changement de workspace : purge immédiate + rechargement ; jamais de données
  d'un workspace précédent.
- Échec de lecture distante → repli sur le cache **du même workspace** marqué
  `stale` (bannière UI), jamais présenté comme frais.

## Synchronisation
- Lecture initiale via `GET /api/graph` (orchestrateur) ou `hybridNodeRepo` (Supabase).
- Live via SSE (transitions) filtré par workspace.
- Pas de synchronisation bidirectionnelle implicite : la SPA projette, elle n'est
  pas autoritaire.

## Limites connues
- Champ de **version** (verrou optimiste) non encore ajouté sur `hybrid_nodes`.
- Caches CSV legacy (`storageService`) globaux (organigramme RH mono-source).
