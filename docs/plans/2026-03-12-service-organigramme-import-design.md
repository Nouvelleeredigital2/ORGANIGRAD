# Import Local Et Organigrammes Par Service Design

**Date:** 2026-03-12

## Objectif

Permettre l'import local de fichiers `.csv` et `.xlsx`, puis afficher des organigrammes distincts par service, sélectionnables dans la barre latérale, sans inventer de liens hiérarchiques individuels absents du fichier.

## Contraintes validées

- Rester fidèle au fichier source.
- Ne pas créer de faux nœud visible pour le service dans l'organigramme.
- Construire un organigramme différent pour chaque service.
- La sélection du service se fait dans la leftbar.
- Le fichier réel peut être encodé en `windows-1252`.

## Décisions

### Source de données

- Ajouter un mode `import local`.
- Accepter `.csv` et `.xlsx`.
- Mapper les colonnes françaises du fichier réel vers le modèle interne.
- Utiliser la première feuille d'un fichier `.xlsx`.

### Modèle de navigation

- Générer un annuaire des services groupés par `Pôle / Direction`.
- Mémoriser un `selectedServiceKey` dans le contrôleur.
- Garder `dashboard` et `settings`, mais faire évoluer la vue `orgchart` vers une vue service.

### Organigramme par service

- Ne pas construire d'arbre par `rattachementId` pour les imports réels.
- Déduire des niveaux hiérarchiques à partir des intitulés de poste, du grade et du statut.
- Afficher les agents par rangs successifs dans le service sélectionné.
- Utiliser des cartes agents existantes, avec un nouveau rendu de type "tiers" par service.

## Hors périmètre

- Inférence de managers individuels.
- Édition complète du fichier importé.
- Persistance durable du contenu d'un fichier local après rechargement navigateur.
