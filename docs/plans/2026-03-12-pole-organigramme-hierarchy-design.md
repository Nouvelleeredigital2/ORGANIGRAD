# Design: Organigrammes par Pole avec Liens Inferes

## Contexte

L'implementation actuelle traite `Service / Secteur` comme unite de navigation principale. Cela ne correspond pas au besoin metier montre par l'exemple PowerPoint fourni: un organigramme selectionnable correspond a un `Pole / Direction`, puis les services et secteurs existent a l'interieur de cet organigramme.

Exemple valide:

- `RESSOURCES HUMAINES` est un organigramme.
- `Carriere Paie`, `Recrutement`, `Prevention`, `Secretariat` sont des branches internes, pas des organigrammes separes.

## Decision

L'application bascule vers un modele `pole -> organigramme`.

- La leftbar liste les poles disponibles.
- Le contenu principal affiche un seul organigramme pour le pole selectionne.
- Les liens hierarchiques sont inferes automatiquement a partir:
  - de l'ordre des lignes du fichier source
  - du rang deduit du poste/fonction
  - du service/secteur

## Heuristique de liens

Pour chaque pole:

1. Determiner la racine comme la personne la plus haute dans la hierarchie du pole.
2. Parcourir les agents dans l'ordre source du fichier.
3. Lorsqu'un responsable clair apparait (`Direction` ou `Responsable`, hors racine), il devient tete de branche.
4. Les agents suivants sont rattaches:
   - a la tete de branche courante si elle correspond au groupe actif
   - sinon a la racine du pole
5. Lorsqu'une nouvelle tete de branche apparait, elle remplace la branche courante.

Effet attendu sur `RESSOURCES HUMAINES`:

- `Elina Etchetto` est la racine.
- `Stelly Asdrubal`, `Fabienne Pierre`, `Leila Benahmed`, `Yann Christmann` restent rattaches directement a la racine.
- `Edith Droit` ouvre la branche `Developpement RH`.
- `Martial Lefebvre` et `Salma Saboni` sont rattaches a `Edith Droit`.
- `Nathalie Segonds` ouvre la branche `Carriere Paie`.
- Son equipe est rattachee a `Nathalie Segonds`.

## Impacts UI

- La leftbar est renommee et pilote les poles.
- La vue principale revient a un vrai arbre de personnes avec connecteurs.
- Le titre de page reprend le pole selectionne et le nombre total d'agents du pole.
- L'export PDF/CSV s'applique au pole courant ou a tous les poles en batch.

## Verification ciblee

- `RESSOURCES HUMAINES` doit devenir un organigramme unique.
- `FAMILLE / SOCIAL` doit devenir un organigramme unique.
- La selection dans la leftbar ne doit plus ouvrir `Carriere Paie`, `Recrutement`, etc. comme organigrammes separes.
