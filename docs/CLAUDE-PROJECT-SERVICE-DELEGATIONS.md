# Claude Code — candidat OrganiGrad : délégations techniques par projet

Préparation locale du 14 septembre 2026. **Ne pas appliquer dans cette phase locale.** Aucune migration distante réalisée par Codex. Relire l’état réel et demander la phase de migration déjà prévue avec l’utilisateur avant toute écriture.

## Cible à requalifier

Application OrganiGrad ; référence historiquement attestée `xucmfdggetwxmpquqjvj`, à requalifier via application, configuration réellement chargée, connecteur et URL retournée. Les autres références Supabase du réseau ne sont pas interchangeables. Ne pas rejouer les migrations historiques.

## Candidat exact

`ORGANIGRAD/.worktrees/projects-frontend-20260913/supabase/migrations/20260914110000_project_service_delegations.sql`

SHA-256 : `9059D49BF0A4BAF9E16470EBBC6F81E9CF58D8B8D58D73834DFC7034CE002B39`.

Prérequis à lire dans le catalogue, pas à supposer : `projects(id,workspace_id)` unique et archived_at ; workspace_members(workspace_id,user_id,role) ; workspace_api_keys(id,workspace_id,scopes,expires_at,revoked_at,name) ; hybrid_nodes(id,workspace_id,type,nom) ; team_circuits(id,workspace_id,project_id) et circuit_executions(id,workspace_id,circuit_id,version,state). Ce lot réutilise l’authentification technique existante ; il ne crée ni clé ni utilisateur.

Ajouts : deux tables `project_service_delegations` / `project_service_delegation_audit`, index projet, séquence audit, RPC `project_service_delegation_command(uuid,uuid,uuid,uuid,text,jsonb)` en SECURITY DEFINER / search_path vide. Le backend authentifie p_user/p_key ; le RPC n’est jamais invocable par anon/authenticated. service_role n’a que EXECUTE sur cette fonction, aucun accès direct aux tables/séquence. Revoke explicite incluant service_role pour neutraliser les DEFAULT PRIVILEGES actuels, sans ALTER DEFAULT PRIVILEGES global. RLS sans policies volontaire : parcours API uniquement.

## Vérification avant et après éventuelle application autorisée

1. Confirmer cible et absence de ces objets/version, comparer le hash. Une présence préalable exige réconciliation, pas une exécution aveugle ; ce candidat n’emploie pas IF NOT EXISTS pour masquer une divergence.
2. Vérifier les prérequis natifs et privilèges du propriétaire d’exécution. Ne pas retargeter vers LINK/Orvion.
3. Jouer `npm test --prefix orchestrator -- projectServiceDelegations` dans le worktree (12 tests SQL/API/configuration, PGlite isolé). Tester aussi les autres circuits concernés.
4. Après application future : contrôler pg_class/pg_proc, RLS, absence de policies navigateur et privilèges effectifs table/séquence/RPC, y compris service_role.
5. Conserver flags serveur/frontend fermés tant que code, cible, authentification et session pilote ne sont pas qualifiés. Activer uniquement lors de la recette autorisée, sans lancer de worker.
6. Recette réelle à construire : deux comptes/deux projets ; admin configure une clé limitée et un nœud ; clé vérifie run exact ; mauvais client/capacité/projet/version refusés ; retrait rôle admin, scope clé, archive et révocation bloquent immédiatement un nouveau contrôle. Compléter avec vrai PostgreSQL multiconnexion pour les courses aux verrous.

Le flag serveur nouveau exige circuits et projets actifs : `PROJECT_SERVICE_DELEGATIONS_ENABLED`. UI : `VITE_PROJECT_SERVICE_DELEGATIONS_ENABLED` avec `VITE_PROJECTS_ENABLED`. Aucun fichier .env n’a été modifié.

Retour arrière opérationnel : fermer ces flags et revenir au code précédent ; conserver grants/audits. Une suppression SQL n’est ni demandée ni préparée comme rollback automatique. Les grants schedule:create, consentements personnels, anciens exports et données des projets restent inchangés.

Référence fonctionnelle : `output/frontend-reseau-local/organigrad-service-delegations-implementation.md`. Ce lot est une autorité de vérification, pas un dispatch Engine, une programmation ou une capacité d’approbation humaine.

Lecture historique intégrée le 14 septembre : `execution:read` accepte `runId` sans `runVersion` ou `stepId` et retourne `currentRunVersion`. Le SQL vérifie toujours la cohérence entre état et version SQL, projet réel, grant/clé/cible et droits actuels ; il n'exige pas qu'une exécution soit à l'étape de production initiale. `step:execute` conserve strictement version, étape courante et statut ready. L'ancien reçu Engine reste historique et ne devient pas une autorité. Le nouveau hash remplace celui `701E7DE7…` du candidat local précédent, jamais attesté appliqué. Interop locale réelle Engine → HTTP → auth → RPC : 18 assertions, aucune route de job activée.


## Extension vocale locale du 14 septembre — A16

Le même candidat non appliqué accepte désormais `voice:assign` et `voice:resolve`, avec scopes techniques homonymes explicites. Aucun scope vocal n’est ajouté aux clés par défaut. Le candidat remplace aussi `create_scoped_workspace_api_key` en conservant son contrôle administrateur et ses scopes techniques existants ; seuls ces deux scopes sont ajoutés à son allowlist. La vue des clés permet de les choisir séparément.

Ces contrôles sont hors exécution : corps `{grantId, action, nodeId, target}`, sans runId/version/étape. Cible stricte métier `{appId:"chat-vocal", workspaceId:<workspace JWT natif Vox>, resourceId:<UUID de voix native>}`. Le grant administrateur constitue l’affectation explicite de ce bot au projet ; aucune relation projet/nœud n’est inventée. Prérequis supplémentaire : `bot_profiles(id,workspace_id,enabled)` et `hybrid_nodes.type='AGENT_IA'`, profil enabled=true, vérifiés sous verrous lors de création ET chaque contrôle. Les nouveaux bots restés en brouillon ne sont jamais activés par ce lot.

La preuve inclut nodeId, la ProjectRef et l’audience habituelle, valide cinq secondes au plus. L’URL hors-run est construite côté API par `nativeProjectRef`, partagé avec les options de circuits ; aucune URL n’est inventée dans le SQL. Affecter ne permet pas résoudre sans scope distinct, résoudre ne permet pas affecter ni générer. Vérifier aussi le retrait du scope technique, profil désactivé, clé/grant/grantor révoqué et projet archivé. Le client Vox réauthentifie son JWT après le contrôle distant et teste son expiration/révocation dans la transaction native.

Aucun changement de cible, fichier .env, clé, migration distante ni activation n’a été effectué. Le schéma SQLite natif Vox est un autre chantier, décrit dans son propre relais ; ne jamais le traiter comme du SQL Supabase.

## Catalogue des projets autorisés

Le candidat de découverte `20260914150000_project_service_target_discovery.sql`, ses vérifications et son empreinte sont suivis séparément dans [CLAUDE-PROJECT-SERVICE-TARGETS.md](CLAUDE-PROJECT-SERVICE-TARGETS.md). Cette préparation locale ne constitue pas une migration appliquée.

### Revue indépendante voix A16 — 14 septembre 2026

SQL M02 et SHA inchangés (9059D49BF0A4BAF9E16470EBBC6F81E9CF58D8B8D58D73834DFC7034CE002B39). Les 14 tests SQL/API incluent désormais `projectVoiceKeyIntegration.test.ts` : création de clé via le vrai RPC sous rôle authenticated avec pgcrypto dans PGlite, scopes vocaux explicites, refus de scope humain et du membre nonadministrateur, authentification réelle `buildAuthHook` de cette clé sur les deux contrôles vocaux hors-run, puis refus après révocation. Les claims auth.uid sont des fixtures locales, pas une session distante certifiée. Aucun secret de test ni clé réelle n'est ajouté aux documents. Typecheck orchestrateur vert. La revue Vox corrige indépendamment les reçus périmés et la révocation CAS, sans modifier cette migration.
