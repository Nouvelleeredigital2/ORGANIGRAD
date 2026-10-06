# Ouverture de projet depuis Synapse — 4 octobre 2026

## Finalité

Un membre déjà authentifié dans OrganiGrad ouvre un projet depuis Synapse avec le même `ProjectRef`. Les données métier restent dans OrganiGrad ; Synapse conserve les droits, le ticket court, les références et les reçus.

## Parcours livré dans le code

1. Synapse émet un code court, signé côté serveur et à usage unique.
2. `/synapse/launch?code=…` demande un choix explicite parmi les espaces OrganiGrad accessibles.
3. Le navigateur transmet uniquement le code, le JWT Supabase et l'identifiant d'espace au backend OrganiGrad.
4. Le backend vérifie l'appartenance native, échange le code avec Synapse au moyen du jeton applicatif serveur, crée ou relit le projet avec l'UUID exact du `ProjectRef`, persiste la liaison, puis confirme le compte natif.
5. L'utilisateur est redirigé vers la vue projets avec les identifiants projet et espace natifs.

La colonne `created_by` du lien conserve l'identité du membre qui a matérialisé le projet. Elle ne constitue pas une autorisation exclusive : un autre membre disposant d'un ticket Synapse valide, de l'adhésion native et d'un grant explicite peut rouvrir le même projet sans réécrire ce reçu d'origine.

Les routes machine `/api/synapse/suite/spaces…` utilisent un credential distinct, constant-time, et ne passent jamais par le frontend. La préparation est idempotente. Une invitation Synapse ajoute le rôle `member` par défaut. Le retrait ne supprime une adhésion au workspace que si le pont l'avait lui-même créée et qu'aucun autre grant actif ne la nécessite.

## Schéma

La migration `20261004120000_synapse_suite_projects.sql` ajoute :

- `synapse_project_links`, liaison opaque et unique entre le projet natif et l'espace Synapse ;
- `synapse_project_grants`, reçus de droits et indicateur d'adhésion créée par le pont.

Les deux tables ont la RLS active, aucune policy cliente et aucun privilège `anon`/`authenticated`. Elles sont réservées au backend de confiance. La migration est additive et rejouable.

La recette A/B a ensuite révélé que l'adhésion native au workspace rendait encore tous ses projets visibles à un membre invité. La migration additive `20261004160000_synapse_project_access.sql` ferme cette fuite :

- un projet natif non lié conserve les droits historiques du workspace ;
- un projet lié à Synapse reste visible aux `owner`/`admin`, à son créateur et aux comptes portant un grant explicite pour ce projet ;
- les mêmes règles protègent les tâches via RLS ;
- les routes serveur `/api/projects` et `/api/projects/:id/context` appliquent le même filtre, même lorsque leur connexion PostgreSQL contourne la RLS.

## Activation

Le backend exige simultanément `SYNAPSE_SUITE_ENABLED=1`, Postgres, `PROJECTS_ENABLED=true`, `APP_URL` et `SYNAPSE_URL` en HTTPS, `SYNAPSE_SUITE_APP_TOKEN` et `SYNAPSE_SUITE_SERVICE_CREDENTIAL`. Ces deux secrets restent exclusivement côté serveur.

Le frontend exige l'URL publique qualifiée de l'orchestrateur dans `VITE_ORCHESTRATOR_URL`.

## Validation du candidat local

- Frontend : lint, typecheck, 500 tests et build réussis.
- Orchestrateur : typecheck, 735 tests réussis, 63 tests historiques ignorés, build réussi.
- Migration : exécutée deux fois sur PGlite ; lignes projet préexistantes conservées et RLS vérifiée.
- Tests spécifiques : code invalide, ordre persistance puis confirmation, conflits compte/projet, jeton serveur, routes humaines/machine, choix explicite d'espace et redirection.
- Réouverture collaborative : un second membre autorisé relit le lien créé par le premier sans conflit sur `created_by`.

Cette preuve est une validation du candidat de code. La migration distante, l'image immuable, le raccordement des secrets, la recette réelle A/B et la persistance après redémarrage restent à effectuer après fusion.

## État distant avant le correctif d'isolation

- PR d'ouverture fusionnée dans `master` au SHA `38312d6e7173f5e8fab937226a0f7b642fc2f227` après CI verte.
- Migration `20261004120000` appliquée sur la cible qualifiée `xucmfdggetwxmpquqjvj` ; 1 projet, 2 workspaces et 5 memberships préexistants conservés.
- Images immuables `organigrad-backend:20261004-synapse-38312d6e` et `organigrad-frontend:20261004-synapse-38312d6e` déployées et saines.
- Synapse et OrganiGrad raccordés par secrets serveur dédiés ; origine et adaptateur qualifiés, refus machine sans credential vérifié à HTTP 401.
- La réception A/B demeure bloquée jusqu'à fusion, migration et déploiement du correctif d'isolation par projet. Le statut reste `PARTIELLEMENT VALIDÉ`.

## Mise à jour du 6 octobre 2026

Synapse émet désormais un code compact signé `synapse-launch+jws`. La version `f80320c6` d’OrganiGrad refusait ce format avant l’échange serveur, car elle n’acceptait que le code opaque historique de 43 caractères. La PR #44 valide la forme bornée du JWS et son en-tête exact, puis laisse Synapse vérifier signature, expiration et usage unique.

Le correctif a été fusionné au SHA `892a4c4bd25ef267806cf5db6161a2384fb604bc`, après réussite du lint, du typecheck, des tests frontend et orchestrateur, du build, de Playwright, de l’hygiène dépôt et de la sécurité SQL. L’image `organigrad-backend:20261006-892a4c4` est déployée et saine.

La recette connectée n’a pas encore repris : l’incident décrit dans `security/incident-20261006-runtime-secrets.md` impose d’abord la rotation fournisseur de deux secrets Supabase encore actifs. Le statut demeure `PARTIELLEMENT VALIDÉ`.
