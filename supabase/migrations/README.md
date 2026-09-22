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

## Règle pour la suite

Toute évolution du schéma s'écrit **deux fois** :

1. une migration horodatée ici, incrémentale et idempotente ;
2. le report du changement dans `../schema/baseline_*.sql`.

Sans les deux, la dérive reprend — et elle ne se voit qu'au moment de monter
une préproduction ou de restaurer après incident.
