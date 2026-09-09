# Migrations

> ⚠️ **Les migrations antérieures au 2026-08-03 ne sont pas rejouables.**
> Pour provisionner un environnement neuf, utiliser
> [`../schema/baseline_2026-08-03.sql`](../schema/README.md), puis uniquement
> les migrations datées après cette date.

Ces fichiers décrivent l'intention historique, pas l'état réel de la base. Une
partie du schéma de production a été créée hors dépôt : `profiles`,
`workspace_invitations`, la vue `workspace_members_view`, l'enum
`workspace_role` et six fonctions n'apparaissent dans aucune migration.
`20260617130000_rls.sql` n'a jamais été appliqué tel quel — les policies de
production portent d'autres noms.

Le détail de l'écart est dans [`../schema/README.md`](../schema/README.md).

## Historique distant réconcilié le 2026-09-09 — et ce qui en est volontairement absent

L'historique de `supabase_migrations.schema_migrations` a été complété : **six
migrations appliquées en base sans y être journalisées** ont été inscrites après
vérification que leurs objets existent (`notifications_idempotency`,
`parent_same_workspace`, `org_agents`, `org_agents_rls`, `org_agents_import_rpc`,
`rls_execute_grants`). L'historique est passé de 21 à 27 entrées.

⛔ **`20260617120000_init_schema.sql` et `20260617130000_rls.sql` en sont exclus
délibérément.** Vérification objet par objet : la base porte bien les tables, mais
sous les noms d'une autre série de migrations — `ws create authed` au lieu de
`workspaces_insert`, `hybrid_nodes_ws_idx` au lieu de `hybrid_nodes_workspace_idx`,
et ni `tg_workspace_add_owner` ni son déclencheur n'existent. Ces deux fichiers
**n'ont jamais été appliqués**, conformément à ce que dit déjà cette page.

**Ne pas les inscrire dans l'historique.** Un `supabase migration list` les
signalera comme absents : c'est correct et voulu. Les marquer « appliqués »
inscrirait un mensonge durable et masquerait la divergence.

Le provisionnement d'un environnement neuf reste couvert par
[`../schema/baseline_2026-08-03.sql`](../schema/README.md), **vérifié le 09/09
comme fidèle à la production** : elle porte les noms réels (`ws create authed`,
`hybrid_nodes_ws_idx`, `workspace_members_view`, `workspace_role`) et aucun des
noms jamais appliqués.

## Règle pour la suite

Toute évolution du schéma s'écrit **deux fois** :

1. une migration horodatée ici, incrémentale et idempotente ;
2. le report du changement dans `../schema/baseline_*.sql`.

Sans les deux, la dérive reprend — et elle ne se voit qu'au moment de monter
une préproduction ou de restaurer après incident.
