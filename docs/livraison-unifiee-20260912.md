# Candidat de livraison Organigrad — 12 septembre 2026

Base distante master bb31375 (PR23 projets et PR24 bots) ; correctifs de
conditionnement 77b64d0 et 6bb8587 reportés sans conflit en b233a67/e464d29.
Aucun déploiement effectué par ce lot. Les worktrees concurrents sont préservés.

Validation sur les sources réunies e464d29 : frontend lint, types, 441 tests
et build réussis ; backend types, 543 tests réussis, 63 ignorés, build réussi.
Les suites SQL connectées ignorées restent à exécuter sur cible qualifiée.
Les builds locaux n'intègrent pas une configuration publique de production
qualifiée ; ne pas copier leur dist pour activer les projets.

Contrôle SQL READ ONLY via la connexion déjà chargée dans orchestrator :
les migrations projets/jetons sont enregistrées sous 20260909164643 et
20260909164732. projects, project_tasks et personal_project_tokens existent,
RLS activée. Ne pas rejouer leurs migrations.

Le filtrage de l'historique sur les noms contenant bot ne retourne aucune
migration. Cela ne suffit pas à prouver l'absence du schéma : inspecter les
objets de 20260911120000_bot_profiles.sql et leurs définitions, sauvegarder,
puis appliquer uniquement les éléments manquants avant activation de l'éditeur.

Livraison à préparer : configuration publique réelle du frontend, configuration
privée du backend, image identifiable, sauvegarde des dossiers actuellement
montés et retour arrière. Aucun service à remplacer par un simple git pull.
