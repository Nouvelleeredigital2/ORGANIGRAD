# Boréal Production — design validé

## Objectif

Créer un pilote éditorial réel dans un projet séparé de la recette fictive
Atelier Boréal. Le résultat reste interne : `Validé — prêt à publier` ne
déclenche aucune publication externe.

## Parcours

1. Éric produit une veille sourcée.
2. L'utilisateur choisit un sujet dans LINK.
3. Éric rédige l'article et Orvion en conserve les versions.
4. Design crée le brief et soumet une tâche à Engine.
5. Le Gardien de marque rend un rapport de contrôle sans pouvoir approuver.
6. L'utilisateur approuve ou demande une correction dans LINK.

Chaque commande porte le `ProjectRef`, l'exécution, l'étape, la version et une
clé d'idempotence. Une nouvelle version invalide le contrôle associé. Engine
indisponible laisse l'étape en attente avec son prompt, sans résultat fictif.

## Responsabilités

- OrganiGrad conserve les membres, le circuit, les exécutions et la décision
  finale.
- LINK présente la veille, le choix du sujet et les validations.
- Orvion possède les livrables éditoriaux et leurs versions.
- Engine possède le résultat visuel.
- Synapse transporte seulement des références et des événements corrélés.

## Sécurité et activation

Seuls les profils Éric, Design et Gardien de marque seront activables pour le
pilote. Une migration distincte doit fournir un RPC propriétaire vérifiant un
profil compilé, ses sources, son modèle, ses outils et son canal avant de lever
le brouillon. Les mandats Orvion seront dédiés au projet, révocables et ne
réutiliseront aucune session humaine.

## Déploiement et canaux

La première recette de production passe par LINK. Telegram vient seulement
après une recette LINK complète. Les migrations et contrats sont préparés pour
Claude Code, revus et appliqués séparément. Aucun déploiement n'est compris
dans ce chantier local.
