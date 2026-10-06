# organigrad — détection bornée des faux succès

18 septembre 2026. Métier : Gouvernance. **Lecture seule du code, aucun test exécuté par cette passe** ; aucun fournisseur IA, base distante, import ou publication appelé. Ce rapport ne certifie pas l'application.

Checkout : `C:\Users\5070 Ti\Downloads\---APPLICATION-2026---\ORGANIGRAD\.worktrees\boreal-delivery-batch-20260915`. HEAD local `903f22996851caf0b468bdeb0f47fe4644ad0603`. Les modifications locales éventuelles ne sont pas un déploiement. Le registre de départ peut pointer une branche ancienne : aucune affirmation sur main ou production.

## Résultat

**Contrôle observé, pas de faux succès établi.**

Sources inspectées : `orchestrator/src/api/circuitDeliveryRoutes.ts:77-96`.

Les erreurs de livraison deviennent 400/403/409/502/503, notamment DELIVERY_UNAVAILABLE ; pas de reçu réussi dans le catch lu.

## Recherche de tests et limites

Recherche locale de skip, assertions triviales et prérequis interop ; extraits candidats ci-dessous, **pas résultats de tests ni bugs automatiquement confirmés**. Un skip conditionnel peut être légitime, mais ne valide pas la capacité ignorée.

- `.\e2e-connected\auth-isolation.spec.ts:27:    test.skip(!CONFIGURE, '.env.connected non renseigné — voir .env.connected.example');`
- `.\e2e-connected\auth-isolation.spec.ts:104:    test.skip(`
- `.\e2e-connected\auth-isolation.spec.ts:226:    test.skip(!COMPTE_VIEWER, 'E2E_EMAIL_VIEWER absent — rôle viewer non testé');`
- `.\e2e-connected\noeuds-persistance.spec.ts:22:    test.skip(!CONFIGURE, '.env.connected non renseigné — voir .env.connected.example');`
- `.\e2e-connected\realtime-orchestration.spec.ts:66:    test.skip(!CONFIGURE, '.env.connected non renseigné — voir .env.connected.example');`

## Prochaine recette propre au métier

Couper Orvion dans le banc, vérifier reçu incertain/erreur puis reprise sans double effet.

Avant toute écriture : version et cible qualifiées, compte/projet de recette autorisés, coûts bornés si génération. Conserver résultat simulé/réel distinct, appels et références ; un écran qui s’ouvre seul n’est pas une preuve. Aucun correctif appliqué dans cette passe ; les constats P1 demandent reproduction ciblée avant modification et contrôle de la branche active.
