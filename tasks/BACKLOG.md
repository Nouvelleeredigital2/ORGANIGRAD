# Backlog priorisé

État au 23 septembre 2026. Chaque tâche reste `À APPROUVER` tant que l’utilisateur n’a pas donné son accord explicite.

## P0 — Rétablir des portes de validation locales déterministes

**Objectif utilisateur/métier** : permettre à chaque modification future d’être vérifiée de manière fiable avant livraison.

**Justification** : la commande E2E hors ligne hérite d’une URL réelle depuis `.env.local`, `eslint .` balaie les worktrees, et les suites Vitest complètes sont sensibles à la contention. Une porte instable masque les vraies régressions.

**Périmètre et dépendances** : neutralisation explicite de toute configuration réseau en mode test, exclusion des worktrees du lint, instrumentation puis stabilisation minimale de la concurrence/timeouts Vitest. Préserver les scripts CI et le comportement connecté.

**Fichiers probables** : `.env.test`, `playwright.config.ts`, `eslint.config.js`, `vitest.config.ts`, `orchestrator/vitest.config.ts`, tests PGlite concernés.

**Risques** : masquer une lenteur réelle en augmentant arbitrairement les timeouts ; réduire trop fortement le parallélisme CI ; modifier involontairement les tests connectés.

**Validations** : reproduire les échecs avant correction ; lint, typecheck et builds ; suites Vitest complètes au moins deux fois ; `npm run test:e2e` avec une `.env.local` contenant une URL orchestrateur factice ; vérifier qu’aucun appel externe n’a lieu.

**Définition de terminé** : les commandes documentées passent sans override manuel, restent hermétiques malgré `.env.local`, et aucun test n’est supprimé, ignoré ou affaibli.

**Résultat** : `.env.test` neutralise explicitement Supabase et l’orchestrateur ; ESLint ignore les worktrees ; Vitest utilise un worker avec les timeouts existants. Lint, typechecks, builds, deux passages Vitest par package et 47/47 E2E hors ligne réussis.

**Statut** : TERMINÉ le 23 septembre 2026.

## P0 — Réconcilier le checkout local avec `origin/master`

**Objectif** : repartir d’une base à jour sans perdre les modifications locales de documentation.

**Justification** : la branche est en retard de sept commits, dont un banc Supabase local et des contrôles Synapse.

**Périmètre/dépendances** : inventorier les changements locaux, choisir merge/rebase selon la politique du dépôt, résoudre uniquement les conflits nécessaires, relancer les portes.

**Risques** : conflits et écrasement de travail utilisateur. Action à confirmer séparément avant intégration Git.

**Tests/DoD** : diff local préservé, historique intelligible, validations du dépôt exécutées, aucun fichier utilisateur perdu.

**Statut** : À APPROUVER.

## P1 — Garantir le chiffrement des secrets d’intégration en mode connecté

**Objectif** : empêcher qu’un prompt système, webhook ou endpoint privé soit stocké en clair dans PostgreSQL.

**Justification** : le chiffrement est câblé mais la clé reste optionnelle et l’état de production n’est pas vérifié.

**Périmètre/dépendances** : politique d’environnement production, migration/rotation éventuelle, contrôle des chemins directs, lecture publique réduite aux indicateurs.

**Fichiers probables** : `orchestrator/src/config/env.ts`, `orchestrator/src/security/`, `pgGraphStore.ts`, documentation de déploiement.

**Risques** : données illisibles en cas de mauvaise rotation, interruption de service, exposition lors de la migration.

**Tests/DoD** : démarrage production refusé sans clé si champs sensibles activés, tests chiffrement/déchiffrement/rotation, inspection DB sans divulgation, lecture/édition fonctionnelles après redémarrage.

**Statut** : À APPROUVER.

## P1 — Revalider le schéma Supabase et l’isolation multi-workspace

**Objectif** : prouver que le schéma déployé, les migrations et les RLS correspondent au dépôt actuel.

**Justification** : dérive historique connue ; les validations d’août ne couvrent pas les migrations de septembre.

**Périmètre/dépendances** : banc Supabase isolé, baseline + migrations, diff de schéma, tests négatifs owner/admin/member/viewer et accès inter-workspace. Production d’abord en lecture seule ; toute migration exige sauvegarde et confirmation.

**Risques** : modification distante accidentelle, faux positif sur un environnement non représentatif.

**Tests/DoD** : reconstruction vierge prouvée, suites graph/security/concurrency vertes, inventaire Git/base sans divergence inexpliquée, aucune action production non autorisée.

**Statut** : À APPROUVER.

## P2 — Valider le parcours principal connecté de bout en bout

**Objectif** : authentifier un humain, charger un workspace, créer un nœud, lancer une chaîne, atteindre HITL, décider et retrouver l’état après rechargement.

**Justification** : c’est la valeur centrale du produit ; seuls des tests hermétiques/mockés ont été exécutés pendant cet audit.

**Dépendances** : portes déterministes, Supabase de test isolé, orchestrateur connecté, au moins deux rôles humains et une clé technique.

**Risques** : données de test résiduelles, erreurs de permission, double exécution.

**Tests/DoD** : API et UI, persistance, SSE, journal, idempotence, refus viewer et refus inter-workspace, rechargement après décision.

**Statut** : À APPROUVER.

## P3 — Qualifier les notifications HITL réelles

**Objectif** : confirmer qu’une demande de validation atteint réellement le destinataire une seule fois.

**Dépendances** : environnement de test Resend/Slack, secrets configurés, nœud avec destinataire autorisé.

**Risques** : envoi externe, données personnelles, doublons. Confirmation spécifique requise avant envoi.

**Tests/DoD** : réception réelle, destinataire non autorisé refusé, retry idempotent, panne fournisseur visible et réessayable, audit DB cohérent.

**Statut** : À APPROUVER.

## P3 — Qualifier un circuit réel avec reçus

**Objectif** : exécuter un circuit sur un projet test jusqu’à livraison ou validation, avec reprise sûre après interruption.

**Dépendances** : projets/circuits activés, service Engine ou Orvion de test, mandat et grants dédiés.

**Risques** : appels externes, coûts, doubles effets, artefacts incohérents.

**Tests/DoD** : création, démarrage, dispatch, reçu, idempotence, réponse perdue, décision, persistance après redémarrage et aucun secret dans les logs.

**Statut** : À APPROUVER.

## P4 — Cloisonner et activer prudemment le consommateur Synapse

**Objectif** : recevoir les événements Synapse sans qu’un workspace consomme ceux d’un autre.

**Justification** : le code avertit que le cloisonnement de file doit précéder toute activation durable.

**Tests/DoD** : test de conformité des types, isolation multi-workspace, reprise après panne, déduplication et activation uniquement par flag explicite.

**Statut** : À APPROUVER.

## P5 — Valider l’activation et la synchronisation des bots Hermès

**Objectif** : passer d’une fiche vérifiée à un bot réellement synchronisé sans divergence de prompt.

**Dépendances** : runtime Hermès de test et clé `bots:export` dédiée.

**Tests/DoD** : activation humaine, bundle exact, empreinte identique, installation distincte traçable, désactivation et absence d’exécution d’un brouillon.

**Statut** : À APPROUVER.

## P6 — Mesurer puis réduire le coût des gros bundles

**Objectif** : améliorer le chargement des fonctions PDF/XLSX sans régression d’import/export.

**Justification** : deux chunks dépassent environ 500 kB minifiés ; impact réel non mesuré.

**Tests/DoD** : mesure réseau et temps d’interaction avant/après, chargement à la demande confirmé, E2E import/export/PDF verts.

**Statut** : À APPROUVER.
