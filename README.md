# OrgChart RH

Application React/Vite pour visualiser un organigramme RH, filtrer les poles, consulter les fiches agents et exporter l'organigramme.

## Demarrage

```bash
npm install
npm run dev
```

## Verification

```bash
npm test
npm run lint
npm run build
```

## Source de donnees

- Par defaut, l'application utilise `public/data.csv`.
- Si une URL CSV distante est renseignee dans l'interface, cette source devient prioritaire.
- Le mode local reste explicite tant qu'aucune URL distante n'est configuree.

## Fonctions principales

- navigation dans l'organigramme
- recherche spotlight
- edition locale des agents
- export CSV
- export PDF
- dashboard synthese

## Notes

- Les modifications d'edition sont locales au navigateur.
- Le projet inclut une petite suite de tests Vitest pour verrouiller les correctifs critiques.
