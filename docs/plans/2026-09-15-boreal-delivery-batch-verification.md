# Boréal — passe 2, consommateur local vérifié

État au 15 septembre 2026. Base : master ebc450171032de1d7da2990ada627b54fc478c3a.
Branche : fix/boreal-delivery-batch-20260915. Aucun déploiement, aucune écriture distante.

## Réalisé

- Contrat §8.2 écrit dans le worktree hub boreal-contract-batch-20260915 avant le code.
- Liste ordonnée de livrables, reçu et clé par position, empreinte engageant le lot entier.
- Veille avec sélection : watch:create puis version:create kind subject. Sans sélection, mono-livraison compatible.
- Réservation et passage incertain atomiques sous verrou du run avant chaque effet.
- Réponses perdues et anciennes réservations bloquées ; références acceptées relues sans réécriture.
- Pause/reprise : aucun contournement par changement de version. Un ancien reçu accepté non consommé par completed bloque aussi.
- Cible autorisée égale au board Orvion utilisé. Droit revérifié avant l'effet.
- Complétion seulement après toutes les acceptations ; contrôle antérieur supersédé à la reprise.
- Aucun SQL nouveau, aucune opération companions, aucune tentative Engine détournée.

## Mesures locales

Sur le code de cette branche, orchestrator :

- npm test -- --maxWorkers=2 : 729 réussis, 63 ignorés, 0 échec (17:11 Paris).
- npm run typecheck : réussi.
- tests/circuitDelivery.test.ts : 22 réussis. Régressions reproduites en échec avant correction : concurrence, batch, réponse perdue partielle, pause/reprise incertain et accepté non consommé, cible de board divergente.
- Revue indépendante : les trois défauts supplémentaires de frontière/reprise ont été corrigés.

PGlite exécute les migrations existantes localement ; Orvion répond par un simulateur derrière son vrai client.
Ces résultats ne prouvent ni la passe 1 réelle sous mandat, ni une image Engine réelle, ni un parcours LINK authentifié.

## Intégration locale revue (17:27 Paris)

La branche integrate/boreal-reviewed-20260915 assemble le correctif de lot et #33 nettoyée (4ba899c), sans modifier master.
La recette locale simule maintenant veille + sujets, sélection signée, article, brief, Engine, contrôle du Gardien et validation humaine finale.
Engine exige la cible autorisée exacte et, à la récupération, l'empreinte de l'origine, du moteur et du prompt initial. L'autorisation est revérifiée avant consultation et après la réponse externe.

- Suite intégrée : 752 tests réussis, 63 ignorés, zéro échec. Rapport JSON : output/boreal-integrated-tests-20260915.json à la racine Applications 2026.
- Typecheck réussi ; revue indépendante favorable sur les corrections Engine.
- Ces recettes emploient PGlite et des services simulés. Elles ne constituent pas un parcours authentifié entre les applications déployées.

## Intégration restante

1. Faire relire la branche intégrée et son contrat de récupération Engine.
2. Conserver les PR en brouillon tant que le reçu réel requis manque.
3. Obtenir et conserver le reçu réel de passe 1 avant fusion de passe 2, selon la priorité existante.
4. Après qualification LINK/projet et mandat, exécuter la recette authentifiée distincte.

Les fonctions restent désactivées par défaut. Ne pas interpréter cette note comme une autorisation de migration ou de mise en production.
