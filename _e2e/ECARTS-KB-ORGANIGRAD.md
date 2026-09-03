# Écarts base de connaissance ↔ réalité — ORGANIGRAD

Établi le **2026-09-03**, en croisant [`CONTEXTE-ORGANIGRAD.md`](CONTEXTE-ORGANIGRAD.md),
[`PROGRESS-ORGANIGRAD.md`](PROGRESS-ORGANIGRAD.md) et
[`RAPPORT-ORGANIGRAD-2026-09-03.md`](RAPPORT-ORGANIGRAD-2026-09-03.md).

**Rien n'a été modifié dans la racine `---APPLICATION-2026---`.** Ce document propose ;
l'arbitrage « c'est le code qui a tort » ou « c'est la doc qui a tort » revient à Laurent.

Deux remarques avant la liste. D'abord, **la base de connaissance d'Organigrad est bonne** :
sur sept écarts majeurs, cinq portent sur des documents que leurs auteurs avaient déjà
signalés comme datés, et deux viennent de ce qu'une lecture de code ne pouvait pas voir.
Ensuite, **aucun écart ne relève d'une invention** : rien de ce qui est documenté n'a été
trouvé imaginaire.

---

## 1. Documenté mais inexistant

| Élément | Source KB | Constat E2E | Action proposée |
|---|---|---|---|
| `VITE_ORCHESTRATOR_URL` — « URL de l'orchestrateur (optionnel ; sans elle → mode brouillon) » | `README.md` §3, tableau des variables SPA | La variable **n'est lue nulle part** dans `src/` ni `orchestrator/src/` (`grep` vide). Seul le `localStorage` configure l'orchestrateur (`useOrchestratorConfig.ts:13`), alimenté par l'écran Réglages | **Corriger la doc** : retirer la variable du tableau, ou dire qu'elle est inerte. Elle figure aussi dans `.env.example` et `.env.local`, ce qui entretient l'illusion |
| `import_org_agents` à 6 paramètres | `supabase/migrations/20260901090000_import_org_agents_optimistic_lock.sql`, présente au dépôt | La fonction **n'existe pas** sous cette signature en production : `PGRST202`. Seule la version à 5 paramètres répond | **Corriger la base** (appliquer la migration), pas la doc — l'ordre est déjà écrit dans `etat-production-2026-09-02.md` §3 |
| Port `5199` de la SPA | `.claude/launch.json`, versionné (commit `21a1262`) | La SPA écoute sur **5173** ; `vite.config.ts` ne surcharge rien | **Corriger `launch.json`**, ou documenter pourquoi 5199. En l'état, un agent qui démarre par cette configuration cherche l'application au mauvais endroit |

---

## 2. Existant mais non documenté

| Élément | Constat E2E | Où l'ajouter |
|---|---|---|
| **Bouton « Reset » de l'organigramme** — vide tout le workspace, irréversible, affiché en permanence sans contrôle de rôle (`App.tsx:400-410`) | Trouvé à l'écran ; l'audit du 29/08 ne le mentionne nulle part, alors qu'il signale la « Zone de Danger » qui présente le même défaut en moins exposé | `AUDIT-ORGANIGRAD-2026-08-29.md` Phase 3, liste des blocages — à ajouter **au-dessus** de la Zone de Danger |
| **L'écriture directe en base ne demande pas un orchestrateur configuré** — un orchestrateur *jamais* configuré suffit ; le prompt système est alors stocké en clair | L'audit décrit uniquement le cas « configuré mais éteint ». Le défaut est plus large et se déclenche dans la configuration **par défaut** de l'application | `AUDIT-ORGANIGRAD-2026-08-29.md` Phase 2, parcours 3 — élargir la formulation |
| **La barre supérieure se superpose à elle-même à 375 px** — trois textes empilés | Constaté sur Membres et Clés API | `AUDIT-ORGANIGRAD-2026-08-29.md` Phase 2, parcours 5 (mobile) |
| **Deux composants décrivent l'état vide différemment** — l'organigramme dit « sélectionnez un pôle », la barre latérale dit « aucun pôle disponible » | Rupture de parcours réelle, aucun des deux ne dit d'importer | Nouveau constat P2 fonctionnel |
| **Les graphiques du tableau de bord n'ont pas d'état vide** | Cartes vides, sans un mot | Nouveau constat P3 |
| **Le menu du sélecteur de workspace ne se ferme pas avec `Échap`** | Deux pressions sans effet ; seul un second clic le referme | Nouveau constat P3 |
| **Les libellés de la barre latérale et de la Zone de Danger sont sans accents** (`csvSource.ts:17-18`, `SettingsView`) | L'audit parle d'« accents manquants (écrans legacy) » — c'est ici la navigation principale | Préciser la portée dans l'audit |
| **`public/data.csv` ne contient que son en-tête** (82 octets) | Explique l'organigramme vide au premier lancement | `README.md` §6, ou un mot dans la section source de données |

---

## 3. Documenté différemment de la réalité

| Élément | Version KB | Version réelle | Laquelle fait foi |
|---|---|---|---|
| Sens de la fenêtre de migration | `etat-production-2026-09-02.md` §3 : risque = **SPA ancienne + fonction nouvelle** → « import périmé » (`40001`) | **Code à jour + fonction ancienne** → fonction introuvable (`PGRST202`). Le dépôt local est du mauvais côté de la fenêtre | **La réalité.** Le document a raison sur le principe (« il n'existe pas d'ordre sans fenêtre »), faux sur le sens — à corriger, en gardant la séquence qu'il prescrit, qui reste la bonne |
| Changement de rôle d'un membre | Audit 29/08, Phase 3 : « appliqué au `onChange`, sans confirmation » | `MembersView.tsx:202` porte un `confirm()` nommant le membre et le rôle visé | **Le code.** Défaut corrigé depuis l'audit — **réserve à retirer** |
| Export CSV sans gestion d'échec | Audit 29/08, P2 frontend : « export CSV sans gestion d'échec (`App.tsx:214-225`) » | `App.tsx:231-251` est entouré d'un `try/catch`, et le commentaire du code **documente explicitement** la correction de ce P2 | **Le code.** **Réserve à retirer.** Réserve résiduelle : le message passe par `messageErreurUtilisateur`, donc `[object Object]` sur une erreur supabase-js |
| Défaut mobile | Audit 29/08 : `px-12` sur Members/ApiKeys (96 px sur 375) | Ces deux vues se comportent **bien** ; c'est la barre supérieure qui casse | **La réalité** — remplacer le constat, ne pas l'ajouter |
| Source de vérité de l'organigramme | `README.md` §9 : « Supabase = source de vérité persistante, CSV/XLSX = import/export seulement » | Exact **en écriture**. Mais l'écran affiche « Jeu local embarqué », qui désigne la source de **lecture initiale** (`/data.csv`) | **Les deux sont vrais** — ils parlent de deux choses. Le libellé de l'interface mériterait d'être moins ambigu |
| Version du contrat partagé | `CLAUDE.md` racine §4 : `@apps2026/contracts` **1.1.2** | **1.1.1** vendorée dans `orchestrator/` (audit 29/08, Phase 0) | À trancher : aligner le client ou corriger la mention. P3 |
| Volumétrie de la racine | `CLAUDE.md` racine §1 : « ~45 dossiers, dont ~40 dépôts git » | **119 entrées de premier niveau** | **La réalité.** Concerne la racine, pas Organigrad — signalé pour mémoire |

---

## 4. Ce que la base de connaissance annonçait et que la campagne n'a pas pu vérifier

À ne **pas** confondre avec un démenti. Ces points restent ouverts, faute d'accès :

- **P1 n°1** — boucle infinie sur cycle de graphe (`engine.ts:52-98`) : côté orchestrateur.
- **P1 n°2** — chemin `/mcp` cassé sous chiffrement actif : côté orchestrateur.
- **P1 n°3** — repli sur un serveur **sans authentification** en l'absence de `SUPABASE_DB_URL` :
  côté orchestrateur. `[À CONFIRMER]` en production, comme l'audit le note déjà.
- **P1 n°4** — désynchronisation d'ids après import : **hors d'atteinte**, l'import échouant en amont.
- **P1 n°5** — lien profond `?agent=` inopérant à froid : exige une fiche réelle.
- **Policy `wm write admin FOR ALL`** — un admin peut rétrograder l'owner par l'API directe :
  exige un second compte.
- **Point 1.13 de la recette** — second e-mail HITL : exige l'orchestrateur **et** `RESEND_API_KEY`.

---

## 5. Recommandations de mise à jour de la base

Par ordre, avec ce qu'il faut changer. **Aucune de ces modifications n'a été faite.**

1. **`ORGANIGRAD/docs/etat-production-2026-09-02.md` §3** — corriger le sens de la fenêtre de
   migration. Le document raisonne sur « SPA ancienne + fonction nouvelle » ; ajouter que le
   dépôt `master` est **déjà** passé à six paramètres, donc que **l'import est cassé pour
   quiconque lance la SPA depuis le dépôt**. La séquence prescrite reste valable, elle devient
   urgente.

2. **`ORGANIGRAD/AUDIT-ORGANIGRAD-2026-08-29.md`** — trois corrections :
   *retirer* la réserve sur la confirmation du changement de rôle et celle sur le `try/catch`
   de l'export CSV (toutes deux corrigées depuis) ; *remplacer* le constat mobile `px-12` par
   la superposition de la barre supérieure ; *ajouter* le bouton « Reset » de l'organigramme
   en tête des blocages admin, et élargir le parcours 3 (l'écriture directe ne demande pas un
   orchestrateur configuré).

3. **`ORGANIGRAD/README.md` §3** — retirer ou marquer inerte `VITE_ORCHESTRATOR_URL`, et dire
   que la connexion de l'orchestrateur se pose **dans l'écran Réglages**, en `localStorage`.
   Mentionner que `public/data.csv` est vide de lignes.

4. **`ORGANIGRAD/.claude/launch.json`** — aligner sur 5173, ou documenter le choix de 5199.

5. **`ORGANIGRAD/docs/plans/2026-08-14-recette-manuelle-4-roles.md`** — ajouter en tête que la
   recette reste **entièrement à faire** : sections 2 à 5 jamais exécutées, et section 1
   bloquée dès le point 1.2 (import) tant que la migration n'est pas appliquée.

6. **`apps2026-hub/ECOSYSTEM.md`** (table des ports) et **`CLAUDE.md` racine §5** — rien à
   corriger sur Organigrad : 3001 / 5173 est exact, confirmé à l'écran. Signalé pour clore le
   doute soulevé par `launch.json`.

7. **`CLAUDE.md` racine §1** — « ~45 dossiers » à réviser (119 entrées). Hors périmètre
   Organigrad, mais relevé par la phase A.

---

## 6. Un mot sur la méthode, puisqu'il éclaire les écarts

Les deux écarts les plus coûteux — l'import cassé et l'écriture directe en base — **ne
pouvaient pas être trouvés par lecture de code**. Le premier tient à l'état de la base de
production, le second à ce que l'application fait quand on ne configure rien. L'audit du
29/08 était rigoureux et honnête ; il annonçait « ~95 éléments interactifs, aucun cassé »,
et il avait raison **du point de vue du code**.

C'est l'argument le plus solide pour rejouer cette campagne après la migration : ce qu'elle
mesure n'est mesurable qu'à l'écran.
