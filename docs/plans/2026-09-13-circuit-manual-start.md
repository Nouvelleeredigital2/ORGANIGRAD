# Lancement manuel du dossier pilote

Complément du lot 3 approuvé. Le circuit Boréal existe désormais en brouillon,
mais son API POST /api/circuits/:id/runs n'a pas de point d'entrée visuel.

- Ajouter le client HTTP utilisant la session humaine et le workspace existants.
- Ajouter « Démarrer un dossier » aux circuits pour les membres autorisés à
  node:run. Le démarrage crée un état persistant à la première étape ; il ne
  produit pas de livrable et n'active pas de programmation.
- Conserver la clé d'idempotence dans sessionStorage, isolée par compte,
  workspace et circuit, jusqu'à une réponse confirmée. Une réponse réseau
  perdue, même suivie d'un rechargement, reprend la même demande.
- Refuser les doubles clics et ignorer toute réponse d'un ancien contexte.
- Après confirmation, ouvrir la liste réelle des dossiers.
- Tests : contrat HTTP authentifié ; réponse perdue et remount ; isolation,
  double clic ; contrôle type/lint/build ; livraison et création d'un seul
  dossier Boréal. Pas de mutation SQL manuelle ni de résultat fictif annoncé.
