# Validation du relais

Le module Bots fournit l'édition visuelle des fiches, leur liaison à l'organigramme
et un bundle compilé côté serveur. Les 14 fiches historiques sont converties et
relues ; leurs UUID LINK et 30 URL sont conservés. Organigrad devient la référence
des personas ; LINK conserve les validations humaines.

La revue a corrigé le refus des rôles SQL NULL, les suppressions non admin,
l'écrasement des métadonnées lors d'une liaison, les conflits de versions et la
confiance accordée aux colonnes de prompt compilé. Les lectures recompilent depuis
les champs métier ; l'aperçu client est comparé au serveur sur les 14 fiches.

Validation locale : 441 tests frontend réussis ; 538 tests backend réussis,
63 ignorés selon leurs prérequis ; 12 tests Python réussis. Lint frontend,
typecheck et build des deux paquets réussis. Après correction du chargement
dynamique du compilateur client, typecheck backend et les 18 tests ciblés de
parité et sécurité ont été rejoués avec succès. La CI vérifie séparément
PostgreSQL réel et E2E ; ses résultats doivent être lus sur le commit courant.

Deux séries en ligne de 14 générations sont documentées dans apps2026-hub,
hermes-veille/deployment/retest-20260911-134918/RESULTATS.md. Elles démontrent la
réception de chaque persona, pas une qualité globale 10/10. Les nouveaux prompts
ne sont pas installés.

Limite de livraison : aucune migration Supabase ni donnée importée à distance,
aucun déploiement de l'interface. get_project_url refuse les droits pour le projet
effectivement chargé xucmfdggetwxmpquqjvj. Qualifier cet accès puis les fonctions
SQL prérequises et le workspace avant de poursuivre. L'ancien export LINK reste
disponible tant que cette bascule n'est pas utilisable. Les garde-fous éditoriaux
déterministes, JSON de production, gateway et doublon Hermès restent des travaux
distincts non livrés par cette PR.
