# Claude Code — Boréal Production : qualification et migrations restantes

## Mission

Préparer les migrations **additives** nécessaires au pilote réel Boréal Production. Ne rien appliquer avant d'avoir qualifié la base cible et comparé les signatures installées. Aucun historique ne doit être rejoué.

Le pilote est distinct de `TEST FICTIF — Atelier Boréal`. Il ne publie vers aucun blog, réseau social ou canal externe.

## Ce qui est déjà installé ou présent dans le code — ne pas dupliquer

1. **OrganiGrad : activation contrôlée des personas** est installée selon le contrat mesuré du 14 septembre :
   - `bot_activation_status(uuid)` ;
   - `activate_verified_bot(uuid)` ;
   - `deactivate_bot(uuid, text)` ;
   - `guard_bot_activation` reste armé.

   Les fonctions exigent une session humaine `owner`/`admin` pour activer ; `service_role` ne les exécute pas. Les migrations candidates du dépôt sont `20260914170000_bot_activation_workflow.sql` et le correctif de garde. **Ne pas les recréer ni les rejouer.**

2. **OrganiGrad : circuits persistants** existent : `team_circuits`, `circuit_executions`, `circuit_step_attempts`, définitions versionnées, décision humaine, pause/reprise/annulation et reçus d’envoi Engine. Les sorties référencent `{ id, kind, version, sourceApp, canonicalUrl }` et une correction invalide les sorties aval.

3. **Orvion : dossiers éditoriaux versionnés** existent dans `public`, avec le binding explicite board ↔ `ProjectRef` et la RPC humaine `editorial_command(p_board, p_action, p_payload)`. Elle exige un JWT humain et `service_role` n'a pas `EXECUTE`.

4. **LINK** dispose du rattachement persistant conversation ↔ projet. Le pilote commence dans LINK ; Telegram est hors de cette migration.

## Travail attendu : mandat de service Orvion borné à Boréal Production

### 1. Qualification obligatoire, lecture seule

Sur **Atelier Orvion uniquement**, confirmer avant toute écriture :

```sql
select current_database(), current_user, current_schema();
select n.nspname, c.relname, c.relkind
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('boards', 'editorial_project_bindings', 'editorial_dossiers', 'editorial_artifacts');
select p.proname, pg_get_function_identity_arguments(p.oid), pg_get_functiondef(p.oid)
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in ('editorial_command', 'editorial_command_native');
```

Documenter les résultats, les migrations réellement appliquées et les privilèges de `anon`, `authenticated` et `service_role`. Si un objet diffère, arrêter et produire un écart au lieu d'adapter silencieusement le SQL.

### 2. Migration additive à produire dans le dépôt Orvion

Créer un mandat de service distinct des sessions humaines. Il doit :

- être borné à **un** `ProjectRef` immutable et à **un** board Orvion déjà lié à ce `ProjectRef` ;
- être créé/révoqué par le propriétaire humain du board ;
- accepter uniquement `watch:create`, `article:create`, `brief:create`, `version:create` et `image:attach` ;
- porter une expiration courte, un identifiant de mandat, un numéro de version et une clé d'idempotence ;
- vérifier le mandat à nouveau après tout verrou et immédiatement avant l'écriture ;
- permettre la création d'un dossier et d'artefacts versionnés seulement par une nouvelle RPC `SECURITY DEFINER` dédiée ;
- ne jamais accepter ni stocker de JWT personnel, token Telegram, secret Engine ou clé globale dans une table publique ;
- refuser toute destination qui ne correspond pas au binding board + `ProjectRef` ;
- renvoyer une référence d'artefact, jamais une copie de contenu à Synapse.

Nom proposé, à conserver seulement s'il n'entre pas en collision avec le catalogue mesuré :

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

La signature finale doit être ajoutée au contrat réseau avec ses rôles, erreurs et exemples d'appels.

### 3. Contraintes SQL impératives

- `set search_path = ''` dans toute fonction `SECURITY DEFINER`, avec objets qualifiés ;
- vérifier `auth.uid()` uniquement pour les opérations humaines ; la voie de service doit vérifier un mandat opaque, pas réutiliser une identité humaine ;
- tables de mandat, audit et idempotence en RLS sans policy si elles sont accessibles uniquement par RPC ;
- immédiatement après chaque `create table`, exécuter :

```sql
revoke all on table public.<nouvelle_table> from public, anon, authenticated, service_role;
```

  Le défaut de privilèges du parc redonne sinon `ALL` à ces rôles sur les tables futures ;
- ne donner `EXECUTE` que sur la RPC nécessaire au rôle exact. Une policy RLS ne contient pas `service_role` car il a `BYPASSRLS` ;
- utiliser un verrou transactionnel et une contrainte unique pour l'idempotence ; une même clé avec un payload différent renvoie `IDEMPOTENCY_CONFLICT` ;
- aucun `disable trigger`, aucun `alter default privileges` global, aucun grant large de convenance.

### 4. Tests exigés avant proposition de migration

Écrire et faire passer des tests SQL sur PostgreSQL réel ou PGlite lorsque compatible :

1. création répétée de la même commande → un dossier/artefact ;
2. même clé, payload différent → conflit déterministe ;
3. board ou `ProjectRef` différent → refus ;
4. mandat expiré ou révoqué avant l'effet → refus ;
5. correction article v2 → article v1 conservé, version exacte retournée ;
6. `service_role`, `anon` et `authenticated` n'obtiennent aucun accès direct aux nouvelles tables ;
7. propriétaire humain peut créer/révoquer ; non-membre ne peut ni lire ni écrire ;
8. migration réexécutée dans une base neuve → état identique, sans modification d'objets historiques.

### 5. Livrables de Claude

- une branche et une migration nouvelle, jamais un fichier historique modifié ;
- tests verts et sortie des requêtes de qualification ;
- un document de contrat précisant signature, rôle, erreurs, idempotence et rollback ;
- un rollback qui ne supprime que les objets introduits par cette migration, après export du journal de mandat si des lignes existent ;
- une liste claire de ce qui reste à configurer manuellement : board Boréal Production, mandat, clé de service au coffre dédié et aucun secret dans le navigateur.

## Préparation côté Organigrad après migration revue

1. Créer Boréal Production dans le workspace voulu, puis son espace LINK et le board Orvion avec le même `ProjectRef`.
2. Vérifier les fiches d’Éric, Design et Gardien ; le Gardien doit avoir au moins une source HTTPS avant activation.
3. Activer uniquement ces trois personas via `activate_verified_bot` et conserver leurs reçus.
4. Créer le circuit « Boréal Production — parcours éditorial » sans programmation ; démarrer un seul dossier manuel.
5. Raccorder le mandat Orvion et Engine. Telegram est ajouté seulement après la recette LINK réussie.
