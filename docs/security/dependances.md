# Vulnérabilités des dépendances — état et risques acceptés

**Dernière revue : 2026-10-04.**

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

Résultat au 2026-09-01 : orchestrateur **0 vulnérabilité**, frontend **0
vulnérabilité high/critical**. Les versions transitives vulnérables de
`browserslist` et `postcss-selector-parser` ont été mises à jour dans le lockfile.

## Corrigées le 2026-10-04

| Paquet | Version corrigée | Chaîne | Portée |
|---|---:|---|---|
| `fastify` | 5.12.5 | direct | **runtime orchestrateur** |
| `brace-expansion` | 1.1.21 et 5.0.12 | `minimatch`, `typescript-eslint` | dev |
| `undici` | 7.29.1 | `jsdom` | dev (tests DOM) |

Ces versions remplacent immédiatement les versions signalées par la porte npm,
sans modifier son seuil.

## Acceptation levée le 2026-10-23 — `braces` et sa chaîne Tailwind

L'avis [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) n'est plus
remonté par `npm audit` : les cinq entrées (`braces`, `chokidar`, `fast-glob`, `micromatch`,
`tailwindcss`) sont retirées de `ACCEPTES`.

## Corrigées le 2026-10-23 (audit du 22/10, Lot 0)

| Paquet | Version corrigée | Chaîne | Portée |
|---|---:|---|---|
| `dompurify` | 3.4.17 | `jspdf` | **runtime frontend** (critique) |
| `vite` | 7.3.7 | direct | dev / build |

Orchestrateur : `vitest` 4.1.11 et `vite` 8.3.5 (dev). `npm install` de npm 10.9.3 y
échoue sur un bogue de résolution des pairs (`Cannot read properties of null (reading
'edgesOut')`, `build-ideal-tree.js`) : la mise à jour a été faite avec `npx npm@11 install` ;
le fichier de verrouillage obtenu passe `npm ci` avec npm 10.

## Acceptation temporaire — `zod` 3 dans l'orchestrateur (2026-10-23)

| | |
|---|---|
| Avis | [GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5), épuisement mémoire en validant des collections contraintes surdimensionnées |
| Version installée | `zod@3.25.76` (direct et via `@apps2026/contracts`) |
| Correctif publié | `zod` 4.6.6 seulement ; aucun en 3.x |
| Prochaine revue obligatoire | **2026-11-06** |

**Exposition réelle.** `zod` valide les corps d'API de l'orchestrateur (runtime). Fastify
plafonne chaque corps à 1 Mio par défaut (2 Kio sur les routes de jetons privés), ce qui borne
la taille des collections validées. **Sortie** : migrer l'orchestrateur et le contrat partagé
vers zod 4, ou une version 3.x corrigée si elle paraît.


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

**Exposition réelle.** xlsx ne s'exécute que dans le navigateur, sur un fichier
que l'utilisateur choisit lui-même d'importer. Il n'est jamais appelé côté serveur,
ni sur une entrée réseau non sollicitée.

**Défenses complémentaires** :

- import dynamique : la bibliothèque reste dans un chunk séparé, chargé au seul
  moment d'un import XLSX;
- lecture défensive : cellFormula, cellHTML et bookVBA sont désactivés, et
  sheetRows est borné à maxRows + 1;
- bornes d'import : 5 Mo, 20 feuilles, 20 000 lignes, 100 colonnes, 10 000
  caractères par cellule;
- dimensions déclarées vérifiées avant matérialisation des lignes.

Ces bornes restent nécessaires contre les fichiers disproportionnés et complètent
la version corrigée du parseur.

## Ajouter une acceptation

Deux endroits, sous peine d'échec de la porte :

1. `scripts/audit-gate.mjs` → objet `ACCEPTES` (avis, raison, date `revoir`) ;
2. ce fichier, avec l'exposition réelle et les atténuations.

Une date de revue dépassée fait échouer la CI. C'est voulu : le risque est
reporté, jamais oublié.
