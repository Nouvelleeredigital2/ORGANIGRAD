# Accès Synapse — remise frontend, 9 septembre 2026

Travail limité au worktree `projets-pilote-20260909`. Aucun commit effectué par
l’agent frontend. Le backend `e44eb76` et les deux retouches SQL appartenant à
main sont conservés, sans intervention frontend dessus. Aucun package modifié.

## Comportement implémenté localement — non déployé

- Bouton « Accès Synapse » sur le détail d’un projet réellement chargé.
  Opt-in explicite `VITE_PROJECTS_ENABLED=true` et
  `VITE_PRIVATE_PROJECTS_ENABLED=true` ; désactivé sinon.
- Nom libre (80 caractères maximum), durée demandée (15 min, 1 h, 24 h, 7 j),
  scope unique `projects:read`, expiration effective issue de la réponse serveur.
- Secret conservé uniquement en mémoire du panneau, masqué par défaut et absent
  du DOM tant qu’il n’est pas révélé. Révélation/masquage manuel ; aucun appel au
  presse-papiers. UUID propriétaire issu de la session, UUID espace et projet
  affichés avec le secret pour la saisie dans Synapse.
- Fermeture/démontage, changement compte/JWT/espace/projet/rôle, déconnexion ou
  disparition réelle du workspace accessible : effacement et abandon des requêtes.
  Les réponses anciennes, y compris après décodage JSON ou après réouverture,
  ne réinjectent aucun secret ni aucune ancienne liste.
- Correction de revue focus : une revérification de la même identité conserve
  le panneau, le brouillon, le secret et la confirmation de révocation. Pendant
  chargement/erreur de vérification, les nouvelles opérations sont suspendues et
  le secret est temporairement masqué. Il redevient disponible après validation.
- Liste réelle, chargement, erreur, nouvelle tentative, pagination UUID et
  confirmation avant révocation. Pas de lignes inventées après POST/DELETE :
  les métadonnées sont relues depuis le serveur.
- Verrous synchrones React et client contre une double émission. Un POST à
  résultat incertain n’est jamais réessayé automatiquement ni depuis le même
  formulaire ; l’interface demande de vérifier la liste avant une nouvelle demande.

## Transport et configuration

`src/services/privateProjectTokens.ts` utilise uniquement la variable de build
existante `VITE_ORCHESTRATOR_URL`. Elle doit fournir une URL HTTPS sans identifiants,
query ni fragment, avec un chemin racine ou `/api`. Absence/forme invalide : refus
avant `fetch`. Aucun localhost ni hôte de repli ; aucune URL issue du stockage
local, de la route ou de la saisie utilisateur. Main a laissé cette valeur vide
dans `.env.example` : sa qualification opérationnelle reste distincte de la
validation syntaxique du client.

POST/GET/DELETE sur `/api/private-projects/tokens` : Bearer humain uniquement,
`X-Workspace-Id`, `redirect: error`, `cache: no-store`, `credentials: omit`,
`referrerPolicy: no-referrer`, délai de 10 secondes couvrant aussi la lecture JSON.
`Content-Type: application/json` uniquement pour POST avec corps ; aucun corps ni
Content-Type pour GET/DELETE. `Origin` est fourni par le navigateur, pas par le code.
Les clés personnelles/techniques ne remplacent jamais la session humaine ; aucune
introspection ne sert à authentifier la gestion. Les erreurs sont génériques et
les corps d’erreur ne sont pas lus. Aucun stockage persistant ni log ajouté pour
le secret ou le JWT.

## Preuves exécutées

- RED initial, avant implémentation : 28 échecs attendus client/bouton absent,
  28 tests existants réussis. RED cycle de vie React : 19 échecs attendus avant
  ajout du panneau. RED UUID propriétaire avant leur affichage : 1 échec attendu.
- RED correction focus, avant modification : 3 échecs sur disparition du panneau,
  du brouillon ou de la confirmation de révocation pendant la revérification.
- Vérification finale : `npm run test -- --reporter=dot` → **54 fichiers,
  418 tests réussis, zéro échec**, durée 35,16 s. Suite frontend configurée pour
  exclure orchestrator et Playwright.
- `npm run typecheck` → sortie 0.
- `npx eslint src --max-warnings=0` → sortie 0, aucun avertissement.
- `npm run build` → sortie 0 ; build également rejoué après le correctif focus
  avec les deux flags UI temporairement activés dans le processus PowerShell,
  sortie 0. Aucun fichier `.env.local` écrit.
- `git diff --check -- src .env.example` → sortie 0.

La suite complète émet les messages stderr de scénarios d’échec existants dans
OrchestrationView et notificationService ; ces tests passent. Le build avertit
que le chunk PDF existant dépasse 500 kB (540,35 kB). Aucun avertissement de lint.

## Fichiers frontend à revoir

- `src/components/projects/PrivateProjectAccess.tsx`
- `src/services/privateProjectTokens.ts`
- `src/services/privateProjectTokens.test.ts`
- `src/components/views/ProjectsView.tsx`
- `src/components/views/ProjectsView.test.tsx`
- `src/lib/projectsFeature.ts`
- `src/vite-env.d.ts`
- `.env.example` : ajout du flag par frontend ; URL vide/commentaires de cible
  appartenant à main, conservés.

## Limites de cette remise

Tests client/React avec transport simulé, sans token réel ni donnée de démo dans
l’interface livrée. Aucun test navigateur connecté, aucune sonde de cible, aucun
déploiement, aucune migration ni suite backend exécutés par cette tâche frontend.
Main a rejoué `npm run check` complet : lint, types, 418 tests et build réussis.
La revue indépendante finale du frontend n'a trouvé aucun défaut actionnable ;
92 tests ciblés supplémentaires ont passé. Les deux parcours Chromium existants
PC/375 px ont passé, mais leur flag privé est désactivé : ils ne valident pas
le nouveau panneau en navigateur. La qualification runtime reste à faire.

Annuler une requête ne prouve pas qu’un POST déjà reçu par le serveur n’a pas créé
de jeton. Le contrat n’a pas de clé d’idempotence : après une réponse perdue, la
récupération consiste à consulter/révoquer l’accès dans la liste puis, si nécessaire,
à en demander explicitement un nouveau. Le secret perdu n’est jamais reconstitué.
