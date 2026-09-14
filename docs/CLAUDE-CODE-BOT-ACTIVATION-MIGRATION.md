# Claude Code — activation vérifiée des personas OrganiGrad

## But

Préparer l'activation humaine des personas sans modifier les profils existants. Le code local ajoute l'interface et les routes de l'orchestrateur ; la migration ci-dessous reste **non appliquée** tant que la cible OrganiGrad n'est pas requalifiée.

Fichier candidat : `supabase/migrations/20260914170000_bot_activation_workflow.sql`.

## Ce que la migration fait

- conserve le brouillon par défaut et le déclencheur `guard_bot_activation` ;
- interdit toujours une écriture directe de `enabled=true` ;
- ajoute une vérification des champs nécessaires : identité runtime, mission, prompt compilé avec empreinte, modèle et sources pour les veilleurs et gardiens ;
- n'autorise l'activation qu'à un `owner` ou `admin` authentifié ;
- inscrit chaque activation ou désactivation dans `bot_activation_receipts` ;
- n'active aucun des 14 profils à l'application de la migration.

Le canal Telegram, Vox ou Engine n'est pas considéré comme vérifié par cette première version : il n'existe pas encore de registre de connexions qui puisse fournir cette preuve. L'écran doit donc présenter ces contrôles comme un prérequis du prochain lot, et non comme une connexion déjà validée.

## Procédure à suivre

1. Lire `apps2026-hub/ETAT_INFRA_ACTUEL.md`, `MCP-PROJECTS.md` et l'association exacte d'OrganiGrad.
2. Vérifier la référence Supabase, l'environnement effectivement chargé et la présence des migrations `20260911120000_bot_profiles`, `20260911162000_bot_draft_activation` et `20260912152335_bot_portraits_correctif_conforme_depot`.
3. Vérifier que `bot_profiles` est bien la table de production attendue et que `workspace_members` contient les rôles `owner` et `admin`.
4. Exécuter les tests locaux avant toute écriture :

   ```powershell
   cd ORGANIGRAD/.worktrees/projects-frontend-20260913/orchestrator
   $env:PGLITE_MODULE_PATH = "$PWD/node_modules/@electric-sql/pglite/dist/index.cjs"
   .\node_modules\.bin\vitest.cmd run tests/botActivationWorkflow.test.ts tests/pgServerBots.test.ts
   npm run typecheck
   ```

5. Appliquer **uniquement** `20260914170000_bot_activation_workflow.sql` par le canal OrganiGrad qualifié. Ne pas rejouer les migrations historiques et ne pas contourner le déclencheur par `DISABLE TRIGGER`.
6. Après application, vérifier en lecture :

   ```sql
   select to_regclass('public.bot_activation_receipts') as receipts_table;
   select proname
   from pg_proc join pg_namespace on pg_namespace.oid = pg_proc.pronamespace
   where nspname = 'public'
     and proname in ('bot_activation_status', 'activate_verified_bot', 'deactivate_bot');
   select tgname, pg_get_triggerdef(oid)
   from pg_trigger
   where tgrelid = 'public.bot_profiles'::regclass and not tgisinternal;
   ```

7. Ne pas activer les 14 bots lors de cette opération. La première activation doit être une recette humaine distincte, sur un bot choisi, depuis OrganiGrad.

## Retour arrière

Ne pas supprimer les reçus pendant un retour arrière : ils sont l'historique de décision. Le retour fonctionnel est de désactiver le bot avec `deactivate_bot`, ce qui conserve la trace. Un retour de schéma exige une décision séparée après export des reçus ; il ne fait pas partie de cette migration.

