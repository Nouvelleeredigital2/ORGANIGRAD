# Vulnérabilités des dépendances — état et risques acceptés

**Dernière revue : 2026-08-14.**

La CI n'utilise plus `npm audit --audit-level=high || true` : cette forme
affichait les vulnérabilités puis passait quoi qu'il arrive, indéfiniment.
La porte est désormais `scripts/audit-gate.mjs`, qui échoue sur toute
vulnérabilité `high`/`critical` non corrigée **et** non acceptée explicitement
ici, ainsi que sur toute acceptation périmée ou devenue inutile.

## Corrigées le 2026-08-14

Toutes par mise à jour non cassante (`package.json` inchangé sauf `vite`,
patch dans la plage `^7.3.1` déjà déclarée).

| Paquet | Sévérité | Chaîne | Portée |
|---|---|---|---|
| `fast-uri` | high | `fastify` | **runtime orchestrateur** |
| `find-my-way` | high | `fastify` | **runtime orchestrateur** |
| `dompurify` | moderate | `jspdf` | **runtime navigateur** (export PDF) |
| `undici` | high | `jsdom` | dev (environnement de test) |
| `js-yaml` | high | `eslint` | dev |
| `brace-expansion` | high | `eslint`, `typescript-eslint` | dev |
| `postcss` | high | direct + `tailwindcss`, `autoprefixer` | build |
| `nanoid` | high | `postcss` | build |
| `esbuild` | low | `vite` | dev (serveur de dev, Windows) |

`esbuild` a demandé un détour : `vite@7.3.5` épingle `esbuild ^0.27.0`, sous la
version corrigée. `vite@7.3.6` accepte `^0.27.0 || ^0.28.0` — c'est un patch,
donc la correction reste non cassante.

Résultat : orchestrateur **0 vulnérabilité**, frontend **1** (ci-dessous).

## Risques acceptés

### `xlsx` (SheetJS) — high — accepté jusqu'au 2026-11-14

| | |
|---|---|
| Avis | [GHSA-4r6h-8v6p-xvw6](https://github.com/advisories/GHSA-4r6h-8v6p-xvw6) (prototype pollution, corrigé en 0.19.3) · [GHSA-5pgg-2g8v-p4x9](https://github.com/advisories/GHSA-5pgg-2g8v-p4x9) (ReDoS, corrigé en 0.20.2) |
| Version installée | `0.18.5` |
| Correctif applicable | **Aucun via npm** |

**Pourquoi aucun correctif.** SheetJS ne publie plus sur le registre npm : la
dernière version qui s'y trouve est `0.18.5`, antérieure aux deux correctifs.
Les versions ≥ 0.19.3 ne sont distribuées que depuis le CDN de l'éditeur.
Aucun `npm audit fix` ne peut donc résoudre cette entrée — ce n'est pas un
oubli de mise à jour.

**Exposition réelle.** `xlsx` ne s'exécute que dans le navigateur, sur un
fichier que l'utilisateur choisit lui-même d'importer. Il n'est jamais appelé
côté serveur, ni sur une entrée réseau non sollicitée.

**Atténuations en place** (antérieures à cette revue, vérifiées le 2026-08-14) :

- import dynamique (`await import('xlsx')` dans `src/services/importService.ts`) :
  la bibliothèque part dans un chunk séparé — `vendor-xlsx-*.js`, confirmé au
  build — chargé au seul moment d'un import XLSX, jamais au démarrage ;
- lecture défensive : `cellFormula: false`, `cellHTML: false`, `bookVBA: false`,
  et `sheetRows` borné à `maxRows + 1` ;
- bornes d'import dans `src/services/sheetSecurity.ts` : 5 Mo, 20 feuilles,
  20 000 lignes, 100 colonnes, 10 000 caractères par cellule ;
- les dimensions déclarées par la feuille sont vérifiées **avant**
  matérialisation des lignes.

Ces bornes couvrent bien le ReDoS. Elles réduisent la surface du prototype
pollution sans l'éliminer : la pollution se produirait à l'intérieur de
`XLSX.read` / `sheet_to_json`, en amont de nos contrôles.

**Options pour la revue du 2026-11-14** — à trancher, aucune n'est engagée :

1. **Vendorer** le tarball SheetJS ≥ 0.20.2 depuis le CDN de l'éditeur, comme
   c'est déjà fait pour `@apps2026/voice-client`. Corrige réellement les deux
   avis, mais ajoute un binaire au dépôt et déplace la confiance du registre
   npm vers le CDN de l'éditeur : c'est une décision de chaîne
   d'approvisionnement, pas une mise à jour de routine.
2. **Remplacer** par une bibliothèque maintenue sur npm (p. ex. `exceljs`).
   Coût de portage réel, `xlsx` étant aussi utilisé par les tests d'import.
3. **Reconduire** l'acceptation si l'exposition n'a pas changé.

## Ajouter une acceptation

Deux endroits, sous peine d'échec de la porte :

1. `scripts/audit-gate.mjs` → objet `ACCEPTES` (avis, raison, date `revoir`) ;
2. ce fichier, avec l'exposition réelle et les atténuations.

Une date de revue dépassée fait échouer la CI. C'est voulu : le risque est
reporté, jamais oublié.
