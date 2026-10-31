# Valeurs de build du front de production

Relevé du 31 octobre 2026, lu dans le code servi par `organigrad-front`
(`organigrad-frontend:20261025-a70cc12`, révision `a70cc12`). Vite inscrit les
`VITE_*` dans le bundle au moment du build : ils ne survivent ni dans l'image (étape
de build séparée) ni dans aucun fichier du serveur. Ce document les rend
reproductibles.

| Variable | Valeur servie | Preuve dans le bundle |
|---|---|---|
| `VITE_SUPABASE_URL` | `https://xucmfdggetwxmpquqjvj.supabase.co` | chaîne présente (2 occurrences) |
| `VITE_SUPABASE_ANON_KEY` | clé `anon` du projet `xucmfdggetwxmpquqjvj` | JWT `role=anon`, `ref=xucmfdggetwxmpquqjvj` ; **non versionnée ici**, à reprendre du tableau Supabase (clé publique, mais hors git) |
| `VITE_ORCHESTRATOR_URL` | `https://orchestrator.nouvelleeredigital.fr` | chaîne présente (3 occurrences) ; ancien hôte `orchestrator.srv1017182.hstgr.cloud` absent |
| `VITE_PROJECTS_ENABLED` | `true` | « Les projets ne sont pas activés. » éliminé du bundle |
| `VITE_PRIVATE_PROJECTS_ENABLED` | `true` | « Accès Synapse » présent dans `ProjectsView` |
| `VITE_PROJECT_SERVICE_DELEGATIONS_ENABLED` | absente ou différente de `true` | « Autorisations de service » éliminé du bundle |

Un drapeau évalué à faux à la compilation fait disparaître le code qu'il garde :
l'absence d'un texte propre à la fonctionnalité vaut preuve, sa présence aussi.

## Historique : l'URL morte de l'image du 06/10

L'image `organigrad-frontend:20261006-69cfb1d` portait
`VITE_ORCHESTRATOR_URL=https://orchestrator.srv1017182.hstgr.cloud`, hôte de l'ancien
serveur `hermes-vps` qui répond **502** depuis le rapatriement de l'orchestrateur sur
`apps2026-prod` (06/09). Du 06/10 au 25/10, tout ce que le front demandait à
l'orchestrateur (graphe en direct, jetons des projets privés, lancement Synapse) partait
vers cette adresse. Corrigé par l'image du 25/10 (relevé ci-dessus) ; le CORS de
`orchestrator.nouvelleeredigital.fr` accepte `https://organigrad.nouvelleeredigital.fr`
(préflight 204, en-têtes `authorization` et `x-workspace-id` acceptés, revérifié le 31/10).

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
`orchestrator.nouvelleeredigital.fr`. Avant de construire, refaire le relevé ci-dessus
sur l'image en service : c'est elle qui fait foi, pas ce document.
