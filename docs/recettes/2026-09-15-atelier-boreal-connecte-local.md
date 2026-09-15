# Recette locale — TEST FICTIF — Atelier Boréal

## Finalité locale

Le code prépare uniquement la recette connectée d’Atelier Boréal. Boréal Production reste absent : aucun projet, espace LINK, board Orvion ou mandat de production n’est créé par ce lot.

Le circuit comprend :

```text
Veille sourcée → Choix du sujet → Rédaction → Brief visuel →
Génération → Contrôle → Validation finale
```

Il est sans programmation. Éric, Design et Gardien doivent avoir leur activation vérifiée ; le Gardien contrôle sans pouvoir valider. Le moteur conserve chaque référence versionnée, attend Engine sans inventer d’image, et reprend une tentative sans créer de seconde tâche.

## Vérifications locales

```powershell
Push-Location orchestrator
npm test
npm run typecheck
npm run build
Pop-Location

npm test
npm run typecheck
npm run build
```

## Ce que les tests locaux ne démontrent pas

Ils ne contactent aucun service distant : pas d’activation réelle, de message LINK, de mandat Orvion, de génération Engine, ni de publication. Atelier Boréal existant reste intact.

## Préconditions avant la recette connectée

1. Claude livre et la personne propriétaire applique en préproduction le mandat temporaire décrit dans `docs/claude/2026-09-15-atelier-boreal-recipe-mandate.md`.
2. La liaison explicite et révocable entre l’identité LINK et l’identité OrganiGrad est qualifiée selon `docs/claude/2026-09-15-boreal-identity-execution-migrations.md`.
3. Le même `ProjectRef` relie le projet Atelier Boréal existant, la conversation LINK et son board Orvion existant.
4. Les trois profils du pilote sont vérifiés puis activés par le RPC propriétaire avec reçus ; le Gardien dispose d’une charte Identity Core accessible.
5. Les deux serveurs LINK/OrganiGrad ont un secret de pont distinct configuré uniquement côté serveur. Le navigateur n’en connaît aucun.
6. Engine est qualifié côté serveur. S’il est indisponible, le prompt reste conservé et le circuit passe à `En attente d’Engine`.

## Recette préproduction

1. Lancer un seul dossier manuel et rejouer la requête : un seul dossier Orvion.
2. Vérifier que le non-membre ne voit ni projet, ni conversation, ni documents.
3. Déposer une veille sourcée, choisir son sujet dans LINK, puis vérifier la même décision dans le circuit.
4. Produire article, brief et visuel réel. Corriger l’article : v1 reste disponible, v2 est créée et le contrôle v1 est invalidé.
5. Le Gardien crée un rapport mais ne peut pas rendre le dossier valide.
6. Seule la validation humaine produit `Validé — prêt à publier`.
7. Simuler Engine indisponible, redémarrage du worker, réponse LINK perdue et double clic. Aucun doublon et aucun visuel fictif.

Après réussite documentée, créer Boréal Production avec son propre `ProjectRef`, espace LINK, board Orvion et mandat. Telegram reste exclu jusque-là.
