# Design: Refonte UI en Mode Clair Unique

## Objectif

Transformer l'application vers une interface claire unique, plus harmonieuse, plus moderne et plus epuree. Le rendu vise un niveau de sobriete et de finition proche d'un produit premium: surfaces lumineuses, contrastes mieux doses, hierarchie visuelle nette, interactions discretes.

## Probleme actuel

- L'application reste visuellement trop `slate` et trop technique.
- Le mode sombre ajoute de la complexite sans valeur immediate.
- Plusieurs composants utilisent des contrastes durs, des halos colores lourds et des surfaces trop denses.

## Direction retenue

### Theme

- Un seul theme clair.
- Fond principal ivoire froid tres leger.
- Panneaux blancs satinés avec transparence legere.
- Bordures fines et gris neutres.
- Accent principal bleu acier clair, moins sature.

### Shell

- Sidebar plus calme, plus structuree, avec separation douce du contenu.
- Topbar plus minimaliste, sans toggle de theme.
- Fond global avec degrade pale et texture quasi invisible.

### Organigramme

- Cartes agents plus propres, moins “glassmorphism agressif”.
- Badges plus fins.
- Ombres plus basses et plus diffuses.
- Interactions plus discretes.

### Vues secondaires

- Dashboard plus editorial, moins “widget”.
- Parametres plus lisibles, plus sobres, sans bloc “apparence”.

## Impacts fonctionnels

- Le mode sombre est retire de l'UX.
- Le stockage `darkMode` peut rester techniquement present sans etre expose, ou etre neutralise.
- La topbar et les parametres n'affichent plus de controle de theme.

## Verification

- Verification sur organigramme, dashboard et parametres.
- Controle du contraste, des espacements et de la lisibilite.
- Validation technique: lint + build + test navigateur.
