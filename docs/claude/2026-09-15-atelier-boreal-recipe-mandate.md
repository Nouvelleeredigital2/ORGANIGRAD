# Claude Code — Atelier Boréal : mandat temporaire de recette

## Mission

Préparer, sans appliquer, **une migration additive Orvion** pour le mandat de service temporaire du projet existant `TEST FICTIF — Atelier Boréal`. Ne créer ni projet Boréal Production, ni migration d’activation des bots, ni migration de circuit. Comparer d’abord les signatures réellement installées, sans jamais rejouer un historique.

Le mandat est uniquement destiné à la recette connectée LINK → OrganiGrad → Orvion → Engine. Telegram et toute publication externe restent hors périmètre.

## Ce qui existe déjà — ne pas dupliquer

- OrganiGrad possède l’activation contrôlée : `bot_activation_status(uuid)`, `activate_verified_bot(uuid)`, `deactivate_bot(uuid,text)` et `guard_bot_activation`.
- Les circuits OrganiGrad persistent déjà : définitions, exécutions, tentatives, décisions humaines, version et idempotence.
- Orvion a les dossiers éditoriaux versionnés dans `public`, le binding board ↔ `ProjectRef` et la RPC humaine `editorial_command(p_board,p_action,p_payload)` ; `service_role` n’a pas `EXECUTE`.
- LINK rattache déjà conversation et projet. La liaison explicite d’identité LINK ↔ OrganiGrad fait l’objet du document `2026-09-15-boreal-identity-execution-migrations.md` : elle doit exister avant qu’une décision LINK atteigne un circuit.

## Qualification obligatoire, en lecture seule

Sur Atelier Orvion, relever base, rôle, schéma, objets `boards`, `editorial_project_bindings`, `editorial_dossiers`, `editorial_artifacts`, `editorial_command` et `editorial_command_native`, les migrations présentes et les droits `anon`, `authenticated`, `service_role`. Si un objet diffère du contrat, arrêter et signaler l’écart au lieu d’adapter le SQL.

## Migration attendue

Créer un mandat de service distinct de toute session humaine, borné à **un seul board déjà lié au `ProjectRef` d’Atelier Boréal**. Le propriétaire du board le crée et le révoque ; le service ne peut employer que ce mandat opaque.

Opérations limitées : `watch:create`, `article:create`, `brief:create`, `review:create`, `version:create`, `image:attach`. Chaque appel porte mandat, `ProjectRef`, board, clé UUID d’idempotence et payload. Une même clé avec une empreinte différente renvoie `IDEMPOTENCY_CONFLICT`.

La nouvelle RPC `SECURITY DEFINER` peut s’appeler, si le catalogue le permet :

```text
project_editorial_service_command(
  p_operation text,
  p_mandate_id uuid,
  p_project jsonb,
  p_board_id uuid,
  p_idempotency_key uuid,
  p_payload jsonb
) returns jsonb
```

Elle renvoie une référence de livrable, jamais la copie du contenu. Elle vérifie le mandat après verrou et juste avant l’écriture. Mandat expiré/révoqué, board ou projet différent, opération non prévue : refus explicite.

Contraintes : `search_path = ''`, objets qualifiés, aucune session/JWT/clé Engine/secret Telegram stocké, RLS sans policy si accès RPC seul, et après chaque table :

```sql
revoke all on table public.<nouvelle_table> from public, anon, authenticated, service_role;
```

Pas de `disable trigger`, pas d’`ALTER DEFAULT PRIVILEGES` global, pas de grant large.

## Tests et livrables

Tester : idempotence, conflit d’empreinte, mismatch board/projet, mandat expiré/révoqué, article v2 qui conserve v1, rapport `review` du Gardien sans validation/publication, refus direct de `service_role`/`anon`/`authenticated`, droits propriétaire et refus non-membre, réexécution en base neuve.

Livrer sur branche : migration neuve, tests, qualification, contrat RPC (signature, rôle, erreurs, rollback) et procédure de révocation du mandat après recette. Le rollback ne supprime que les nouveaux objets après export du journal si nécessaire.
