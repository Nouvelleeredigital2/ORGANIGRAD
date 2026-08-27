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

## Correctifs livrés

### xlsx (SheetJS) — vulnérabilités high corrigées

| | |
|---|---|
| Avis | [GHSA-4r6h-8v6p-xvw6](https://github.com/advisories/GHSA-4r6h-8v6p-xvw6) (prototype pollution, corrigé en 0.19.3) · [GHSA-5pgg-2g8v-p4x9](https://github.com/advisories/GHSA-5pgg-2g8v-p4x9) (ReDoS, corrigé en 0.20.2) |
| Version installée | 0.20.3, vendored dans vendor/xlsx-0.20.3.tgz |
| Provenance | CDN officiel SheetJS; SHA-256 8DC73FC3B00203E72D176E85B50938627C7B086E607C682E8D3C22C02BB99FE8 |

Le registre npm s'arrête à 0.18.5; le tarball 0.20.3 est donc versionné localement
pour garder une installation reproductible sans dépendre du CDN en CI. La version
est postérieure aux deux versions corrigées indiquées par les avis.

**Exposition réelle.** `xlsx` ne s'exécute que dans le navigateur, sur un
fichier que l'utilisateur choisit lui-même d'importer. Il n'est jamais appelé
côté serveur, ni sur une entrée réseau non sollicitée.

**Défenses complémentaires** :

- import dynamique (`await import('xlsx')` dans `src/services/importService.ts`) :
  la bibliothèque part dans un chunk séparé — `vendor-xlsx-*.js`, confirmé au
  build — chargé au seul moment d'un import XLSX, jamais au démarrage ;
- lecture défensive : `cellFormula: false`, `cellHTML: false`, `bookVBA: false`,
  et `sheetRows` borné à `maxRows + 1` ;
- bornes d'import dans `src/services/sheetSecurity.ts` : 5 Mo, 20 feuilles,
  20 000 lignes, 100 colonnes, 10 000 caractères par cellule ;
- les dimensions déclarées par la feuille sont vérifiées **avant**
  matérialisation des lignes.

Ces bornes restent nécessaires contre les fichiers disproportionnés et complètent
la version corrigée du parseur.

## Ajouter une acceptation

Deux endroits, sous peine d'échec de la porte :

1. `scripts/audit-gate.mjs` → objet `ACCEPTES` (avis, raison, date `revoir`) ;
2. ce fichier, avec l'exposition réelle et les atténuations.

Une date de revue dépassée fait échouer la CI. C'est voulu : le risque est
reporté, jamais oublié.
