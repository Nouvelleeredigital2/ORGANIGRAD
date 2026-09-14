# Recette locale — Boréal Production

## Ce qui est vérifié localement

Le modèle « Boréal Production — parcours éditorial » est construit à partir d'un projet existant et de cinq identités distinctes : Éric, Design, Engine, Gardien de marque et une personne qui valide. Il contient exactement :

```text
Veille sourcée → Choix du sujet → Rédaction → Brief visuel →
Génération → Contrôle → Validation finale
```

- aucune programmation n'est créée ;
- les trois personas du pilote doivent être activés avant la création du modèle ;
- le Gardien produit un contrôle, il ne porte pas la validation finale ;
- la validation est humaine ;
- un nouvel appel de préparation pour le même projet retrouve le circuit existant ;
- le moteur de circuit garde les livrables par version et invalide les sorties en aval lors d'une correction ;
- l'adaptateur Engine enregistre une tentative avant le POST et ne renvoie pas une seconde tâche lorsqu'un reçu est incertain.

## Commandes de vérification locale

```powershell
Push-Location orchestrator
npm test -- borealProductionTemplate.test.ts borealProductionRoute.test.ts piloteBoreal.test.ts engineDispatch.test.ts
npm run typecheck
Pop-Location

npm test -- BorealProductionSetup.test.tsx circuitClient.test.ts BotsView.test.tsx
npm run typecheck
npm run build
```

## Ce qui n'est pas une preuve de production

Cette recette ne crée aucun projet distant, n'active aucun bot réel, n'appelle pas LINK, Orvion ni Engine, et ne publie aucun contenu. Le jeu `TEST FICTIF — Atelier Boréal` reste intact.

## Préconditions avant préproduction

1. Claude a qualifié puis livré le mandat de service Orvion décrit dans `docs/claude/2026-09-15-boreal-production-migrations.md`.
2. Les migrations sont revues, appliquées sur la préproduction ciblée et leurs signatures sont comparées au contrat réseau.
3. Un propriétaire crée Boréal Production, l'espace LINK et le board Orvion liés au même `ProjectRef`.
4. Éric, Design et Gardien ont chacun une vérification réussie ; le Gardien a au moins une source HTTPS ; seuls ces profils sont activés avec leurs reçus.
5. Le pont LINK et le mandat Orvion sont configurés côté serveur. Aucun secret n'est enregistré dans le navigateur.
6. Engine répond à sa vérification de disponibilité depuis le serveur. En cas d'échec, le prompt est conservé et l'état reste « En attente d’Engine ».

## Recette de préproduction à mener avec l'utilisateur

1. Démarrer manuellement un seul dossier, puis répéter la même demande après une réponse perdue : un seul dossier Orvion doit exister.
2. Vérifier qu'un non-membre ne voit ni projet, ni conversation LINK, ni dossier Orvion.
3. Déposer une veille réelle avec sources, choisir un sujet dans LINK et constater la même décision officielle dans le circuit.
4. Produire article, brief et visuel ; refuser l’article, produire v2 et vérifier que le contrôle de v1 est invalidé.
5. Vérifier que le Gardien rend son rapport sans pouvoir faire passer le dossier à « Validé ».
6. Valider humainement. Le seul état final acceptable est **« Validé — prêt à publier »**.
7. Simuler Engine indisponible, redémarrage de l’orchestrateur et clic répété. Aucun visuel fictif ni double tâche Engine ne doit apparaître.

Telegram reste exclu jusqu'à réussite complète de cette recette LINK.
