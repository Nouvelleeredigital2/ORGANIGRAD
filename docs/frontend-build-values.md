# Valeurs de build du front de production

Relevé du 25 octobre 2026, lu dans le code servi par `organigrad-front`
(`organigrad-frontend:20261006-69cfb1d`, révision `69cfb1d`). Vite inscrit les
`VITE_*` dans le bundle au moment du build : ils ne survivent ni dans l'image (étape
de build séparée) ni dans aucun fichier du serveur. Ce document les rend
reproductibles.

| Variable | Valeur servie le 25/10 | Preuve dans le bundle |
|---|---|---|
| `VITE_SUPABASE_URL` | `https://xucmfdggetwxmpquqjvj.supabase.co` | chaîne présente (2 occurrences) |
| `VITE_SUPABASE_ANON_KEY` | clé `anon` du projet `xucmfdggetwxmpquqjvj` | JWT `role=anon`, `ref=xucmfdggetwxmpquqjvj` ; **non versionnée ici**, à reprendre du tableau Supabase (clé publique, mais hors git) |
| `VITE_ORCHESTRATOR_URL` | `https://orchestrator.srv1017182.hstgr.cloud` ⚠️ | chaîne présente (3 occurrences) |
| `VITE_PROJECTS_ENABLED` | `true` | entrée « Projets » de la barre latérale non conditionnelle ; « Les projets ne sont pas activés. » éliminé du bundle |
| `VITE_PRIVATE_PROJECTS_ENABLED` | `true` | « Accès Synapse » présent dans `ProjectsView` |
| `VITE_PROJECT_SERVICE_DELEGATIONS_ENABLED` | absente ou différente de `true` | « Autorisations de service » éliminé du bundle |

Un drapeau évalué à faux à la compilation fait disparaître le code qu'il garde :
l'absence d'un texte propre à la fonctionnalité vaut preuve, sa présence aussi.

## ⚠️ L'URL de l'orchestrateur servie est morte

`orchestrator.srv1017182.hstgr.cloud` résout vers l'ancien serveur `hermes-vps`
(`72.60.185.225`) et répond **502** (IPv4 et IPv6). L'orchestrateur a été rapatrié sur
`apps2026-prod` le 06/09 sous `orchestrator.nouvelleeredigital.fr` (Caddyfile de
production), qui répond **200** et dont le CORS autorise déjà
`https://organigrad.nouvelleeredigital.fr` (préflight vérifié : 204, origine et en-têtes
`authorization, content-type, x-workspace-id` acceptés).

Conséquence : depuis l'image du 06/10, tout ce que le front demande à l'orchestrateur
(graphe en direct, jetons des projets privés, lancement Synapse) part vers une adresse
qui ne répond pas. Le prochain build doit utiliser
`VITE_ORCHESTRATOR_URL=https://orchestrator.nouvelleeredigital.fr` — changement de
comportement à valider par le propriétaire avant déploiement.

## Construire l'image

Le `Dockerfile` racine ne déclare pas `VITE_PROJECT_SERVICE_DELEGATIONS_ENABLED` en
`ARG` : sans argument, elle reste indéfinie, ce qui reproduit l'état servi.

```bash
docker build \
  --build-arg VITE_SUPABASE_URL=https://xucmfdggetwxmpquqjvj.supabase.co \
  --build-arg VITE_SUPABASE_ANON_KEY=<clé anon du projet> \
  --build-arg VITE_ORCHESTRATOR_URL=https://orchestrator.nouvelleeredigital.fr \
  --build-arg VITE_PROJECTS_ENABLED=true \
  --build-arg VITE_PRIVATE_PROJECTS_ENABLED=true \
  --label org.opencontainers.image.revision=<sha> \
  -t organigrad-frontend:<AAAAMMJJ>-<sha7> .
```

Puis `deployer-compose organigrad-front organigrad-front organigrad-frontend:<AAAAMMJJ>-<sha7> <qui>`
et vérification : la page se charge, et ses appels partent vers
`orchestrator.nouvelleeredigital.fr`.
