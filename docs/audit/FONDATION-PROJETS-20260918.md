# Audit local de la fondation projets — 18 septembre 2026

## Version et périmètre

- Checkout utilisateur observé : `master` à `c8c190f`, avec des modifications préexistantes laissées intactes.
- Version auditée : `903f229` (`chore/boreal-local-preflight-20260915`).
- Travail isolé : `.worktrees/foundation-false-success-20260918`, branche `codex/foundation-false-success-20260918`.
- Aucune requête distante, migration, fusion, publication ou livraison.
- Aucune association Supabase OrganiGrad n'est documentée dans `MCP-PROJECTS.md`; toute future écriture distante resterait bloquée jusqu'à qualification de la cible.

## Finalité et parcours essentiel

OrganiGrad possède le projet, le circuit, la décision humaine, les tentatives et les reçus. Une livraison reçoit une clé de service serveur, retrouve le projet du run dans l'état persisté, revalide la délégation sur ce même projet, réserve un reçu idempotent, appelle Orvion et n'avance l'étape qu'après une référence acceptée et persistée. Un refus, une réponse perdue ou un reçu incertain doit laisser une reprise explicite sans second effet.

Entrées réelles attendues : workspace authentifié, clé de service, run/version/étape, `ProjectRef` du run, délégation et livrable. Transformations : contrôle des droits, réservation durable, appel propriétaire, validation de la référence, acceptation du reçu puis transition du run. Sorties visuelles attendues : reçu consultable, référence du livrable et état de l'étape. Persistance : `circuit_step_attempts`, `circuit_execution_receipts` et état du run. Droits : la route refuse une session humaine, une cible différente et une délégation absente.

## Défaut recherché et résultat

Aucun faux succès n'a été reproduit sur ce périmètre. Les scénarios PGlite utilisent les migrations réelles du dépôt et démontrent localement :

- même `ProjectRef` relu depuis le run puis contrôlé par la délégation ;
- identité serveur obligatoire et absence de reçu avant autorisation ;
- un seul propriétaire durable lors d'appels concurrents ;
- réponse perdue transformée en reçu incertain, sans second POST ;
- reprise d'un batch à partir du seul livrable manquant ;
- refus d'une cible board différente et d'une clé sans droit ;
- aucun contenu ni mandat dans la réponse ou les journaux vérifiés.

Commande : `npx vitest run tests/circuitDelivery.test.ts tests/circuitAttempts.test.ts --reporter=verbose` depuis `orchestrator`. Résultat : **29 tests réussis, 0 échec, 0 ignoré**.

Vérifications de compilation : `npm run typecheck` à la racine, `npm run build` dans `orchestrator` et `npm run build` à la racine ont réussi. Le build Vite signale seulement des chunks supérieurs à 500 kB.

## Limites

Ce résultat couvre un banc local PGlite et des doubles HTTP contrôlés. Il ne prouve ni la base distante, ni la version déployée, ni un mandat vivant, ni un livrable Orvion réel visible dans l'interface. Aucun code métier n'a été modifié ; le rapport garde la preuve bornée et évite de transformer les tests locaux en recette.
