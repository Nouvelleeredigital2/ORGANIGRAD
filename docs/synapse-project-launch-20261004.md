# Ouverture de projet depuis Synapse — 4 octobre 2026

## Finalité

Un membre déjà authentifié dans OrganiGrad ouvre un projet depuis Synapse avec le même `ProjectRef`. Les données métier restent dans OrganiGrad ; Synapse conserve les droits, le ticket court, les références et les reçus.

## Parcours livré dans le code

1. Synapse émet un code court, signé côté serveur et à usage unique.
2. `/synapse/launch?code=…` demande un choix explicite parmi les espaces OrganiGrad accessibles.
3. Le navigateur transmet uniquement le code, le JWT Supabase et l'identifiant d'espace au backend OrganiGrad.
4. Le backend vérifie l'appartenance native, échange le code avec Synapse au moyen du jeton applicatif serveur, crée ou relit le projet avec l'UUID exact du `ProjectRef`, persiste la liaison, puis confirme le compte natif.
5. L'utilisateur est redirigé vers la vue projets avec les identifiants projet et espace natifs.

Les routes machine `/api/synapse/suite/spaces…` utilisent un credential distinct, constant-time, et ne passent jamais par le frontend. La préparation est idempotente. Une invitation Synapse ajoute le rôle `member` par défaut. Le retrait ne supprime une adhésion au workspace que si le pont l'avait lui-même créée et qu'aucun autre grant actif ne la nécessite.

## Schéma

La migration `20261004120000_synapse_suite_projects.sql` ajoute :

- `synapse_project_links`, liaison opaque et unique entre le projet natif et l'espace Synapse ;
- `synapse_project_grants`, reçus de droits et indicateur d'adhésion créée par le pont.

Les deux tables ont la RLS active, aucune policy cliente et aucun privilège `anon`/`authenticated`. Elles sont réservées au backend de confiance. La migration est additive et rejouable.

## Activation

Le backend exige simultanément `SYNAPSE_SUITE_ENABLED=1`, Postgres, `PROJECTS_ENABLED=true`, `APP_URL` et `SYNAPSE_URL` en HTTPS, `SYNAPSE_SUITE_APP_TOKEN` et `SYNAPSE_SUITE_SERVICE_CREDENTIAL`. Ces deux secrets restent exclusivement côté serveur.

Le frontend exige l'URL publique qualifiée de l'orchestrateur dans `VITE_ORCHESTRATOR_URL`.

## Validation du candidat local

- Frontend : lint, typecheck, 500 tests et build réussis.
- Orchestrateur : typecheck, 735 tests réussis, 63 tests historiques ignorés, build réussi.
- Migration : exécutée deux fois sur PGlite ; lignes projet préexistantes conservées et RLS vérifiée.
- Tests spécifiques : code invalide, ordre persistance puis confirmation, conflits compte/projet, jeton serveur, routes humaines/machine, choix explicite d'espace et redirection.

Cette preuve est une validation du candidat de code. La migration distante, l'image immuable, le raccordement des secrets, la recette réelle A/B et la persistance après redémarrage restent à effectuer après fusion.
