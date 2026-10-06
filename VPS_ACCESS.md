# VPS prod APPS-2026

Toutes les informations daccess SSH et de deploiement sont centralisees dans le
document maitre :

> [../VPS_ACCESS.md](../VPS_ACCESS.md)

Resume :
- Host : `A_CONSERVER_DANS_LE_COFFRE_FORT` (port 22), utilisateur `A_CONSERVER_DANS_LE_COFFRE_FORT`
- **Cible à vérifier avant toute opération** : lire [la référence infrastructure actuelle](../apps2026-hub/ETAT_INFRA_ACTUEL.md) (relevé du 7 septembre 2026). Aucun alias unique ne convient à tous les logiciels et sous-services.
- L'ancien résumé indiquait `hermes-vps` pour toutes les applications : ce n'est plus une cible de déploiement par défaut. Identifier le composant et vérifier sa machine réelle ; ne pas déplacer une application à partir de ce seul fichier.
- Empreinte cle autorisee : `SHA256:QCynB0KXTfAIaS7ncUxrJV1c8tu03kzOfe+a7feuMAY`

Ne pas dupliquer le contenu ici. Toute mise a jour se fait dans le document maitre.

