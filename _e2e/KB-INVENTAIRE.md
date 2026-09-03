# Inventaire — APPLICATION-2026

Racine : `C:\Users\5070 Ti\Downloads\---APPLICATION-2026---`
Parcourue le : **2026-09-03** · balayage **borné** (profondeur 3, exclusions du prompt 04 §A)
**132 documents retenus** en propre (16 racine + 58 `apps2026-hub` + 43 `ORGANIGRAD` + 15 comptages d'appoint)
· **63 documents écartés** pour la seule application testée (worktrees) · ~1 240 non détaillés (autres applications, comptés seulement)

> **Portée de cet inventaire.** La racine porte plus de 1 300 fichiers `.md` sur trois niveaux.
> Les détailler tous produirait un document illisible et inexploitable. Le parti retenu :
> **exhaustif** sur la vue d'ensemble et sur l'application testée, **quantitatif** sur les
> autres applications. C'est une limite assumée, pas un oubli — elle est reprise en §6.

---

## 1. Vue d'ensemble

### 1.1 Racine — cadrage permanent

| Document | Portée | Dernière modif | Fiabilité |
|---|---|---|---|
| `CLAUDE.md` (32 ko) | Cadrage de la racine : périmètres, git, règle d'or APPS-2026, contrat partagé, ports, VPS, Synapse, Ollama, Supabase, retours d'expérience §16-18 | 2026-09-01 | **RÉFÉRENCE** |
| `..\CLAUDE.md` (Downloads) | Cadrage produit Identity Core / Vector Studio | — | **RÉFÉRENCE** hors périmètre Organigrad |
| `SUPABASE_MCP_ACCESS.md` | Accès connecteurs MCP Supabase | 2026-08-06 | SECONDAIRE |
| `SECRET_ROTATION_2026-07-09.md` | Rotation de secrets | 2026-07-09 | SECONDAIRE (daté) |
| `VPS_ACCESS.md` (144 o) | Pointeur d'accès, volontairement expurgé | 2026-08-09 | SECONDAIRE |
| `_BACKUP_GIT_home-profile-2026-08-04.README.md` | Justification de l'archive git de 13 Go | 2026-08-04 | **RÉFÉRENCE** (pour ne pas restaurer l'archive) |
| `PROMPT_CORRECTION_*.md` (8 fichiers) + `PROMPTS_CORRECTION_AUTRES_APPS.md` | Prompts de correction ponctuels : Élite SEO, Infra CI, Mémoire Vive, Necromancia, NotebookPro, SnapBooth ×2, VPOS | 2026-08-16 / 17 | **DOUTEUX** — vagues de travail closes, à ne pas rejouer en aveugle |
| `PATCH_GH_CI_TOKEN_GUARD.md` | Correctif CI ponctuel | 2026-08-17 | DOUTEUX (même raison) |
| `PROMPT_SONDE_CI_VPS_OBSERVATORY.md` | Sonde CI/observabilité | 2026-08-16 | DOUTEUX |

Aucun de ces documents ne concerne Organigrad autrement que par le cadrage général.

### 1.2 `apps2026-hub\` — le dépôt d'information transverse

| Document | Portée | Dernière modif | Fiabilité |
|---|---|---|---|
| `ECOSYSTEM.md` (**198 ko**) | Référence figée : rôles, ports, refs Supabase, dépôts, domaines, contrat, critères MVP, journal d'opérations | 2026-09-01 | **RÉFÉRENCE** |
| `RESTE_A_FAIRE_APPS2026.md` (**122 ko**) | Check-liste vivante : acquis, bloquants, dettes | 2026-08-30 | **RÉFÉRENCE** |
| `ETAT_MISE_EN_LIGNE_VPS.md` (44 ko) | Qui est en ligne, où, et pourquoi pas | 2026-09-01 | **RÉFÉRENCE** |
| `CLAUDE-RACINE.md` (33 ko) | Copie du `CLAUDE.md` racine | 2026-09-01 | SECONDAIRE — **doublon**, cf. §4 |
| `MCP_CONNECTEURS.md` | Correspondance connecteurs MCP ↔ applications | **2026-09-03** | **RÉFÉRENCE** (le plus récent de la base) |
| `README.md` | Point d'entrée du hub | 2026-08-30 | RÉFÉRENCE |
| `HERMES_INTEGRATION.md` · `ARCHITECTURE_MULTI_MODELES.md` | Intégration Hermès ; architecture multi-modèles | 2026-06-25 / 06-29 | SECONDAIRE (anciens) |
| `mcp-server/GUIDE.md` · `mcp-server/README.md` | Serveur MCP d'audit Supabase multi-projets | 2026-08-04 / 08-30 | SECONDAIRE |
| `hermes-ops/` · `hermes-veille/` · `vps-ops/` (3 README) | Exploitation | 2026-08-20 → 08-31 | SECONDAIRE |
| `plans/` (**26 documents**) | Plans en cours : bus Synapse, chaîne d'approbation, unification LLM, observatoire VPS, fournisseurs IA, Supabase | 2026-06-22 → 2026-08-30 | SECONDAIRE à RÉFÉRENCE selon date |
| `docs/` (5 documents) | Livraisons et évaluations | 2026-07-25 → 2026-08-30 | SECONDAIRE |
| `archives/` (**13 documents**) | Rapports datés : audits 06/24, 07/09, 07/28, cartographie 08/08, récaps | 2026-06-22 → 2026-08-21 | **DOUTEUX par construction** — datés, à ne jamais lire comme l'état courant |

**Documents `plans/` touchant directement Organigrad** :
`2026-08-22-chaine-approbation-bus.md` (24 ko, 2026-08-30) et
`2026-08-20-bascule-bus-synapse.md` — la chaîne d'approbation et le producteur Synapse
sont précisément ce qu'Organigrad porte côté bus.

---

## 2. Par application

### ORGANIGRAD — 43 documents retenus, 63 écartés

**Racine du dépôt**

| Document | Portée | Dernière modif | Fiabilité |
|---|---|---|---|
| `README.md` (8 ko) | Périmètre, stack, variables d'environnement, migrations, sécurité, **modèle d'autorisation**, rotation des clés, limites connues | 2026-09-01 | **RÉFÉRENCE** |
| `AUDIT-ORGANIGRAD-2026-08-29.md` (21 ko) | Audit code + fonctionnel + admin : 0 P0, 7 P1, ~28 P2, ~49 P3 ; ~95 éléments interactifs inventoriés | **2026-09-02** (contenu daté du 29/08) | **RÉFÉRENCE** pour le périmètre, cf. §4 |
| `VPS_ACCESS.md` (491 o) | Pointeur expurgé | 2026-07-14 | SECONDAIRE |

**`docs/` — état et exploitation**

| Document | Portée | Dernière modif | Fiabilité |
|---|---|---|---|
| `etat-production-2026-09-02.md` | **État réel de la production, constaté** : SPA en ligne sur VPS, CORS, RLS, faille P0-2 fermée, e-mails muets, migration en attente | 2026-09-02 | **RÉFÉRENCE — fait foi** |
| `reste-a-faire-production-2026-09-01.md` | Reste à faire | 2026-09-02 | **DOUTEUX** — se déclare lui-même partiellement périmé, cf. §4 |
| `audit-2026-08-22-fonctionnel.md` (21 ko) | Audit fonctionnel antérieur | 2026-09-02 | SECONDAIRE |
| `recette-staging-2026-08-05.md` (22 ko) | Recette de staging | 2026-08-11 | SECONDAIRE (modèle de rapport de recette) |
| `synchronisation-livraison.md` · `deployment.md` · `testing.md` | Livraison, déploiement, tests | 2026-08-11 / 2026-09-01 | SECONDAIRE |
| `audit-initial.md` · `final-correction-report.md` | Audits de juin | 2026-06-19 / 06-21 | DOUTEUX (anciens) |

**`docs/plans/` — 13 documents**

| Document | Portée | Dernière modif | Fiabilité |
|---|---|---|---|
| `2026-08-14-recette-manuelle-4-roles.md` | **Plan de recette manuelle des 4 rôles + extérieur** : 40 cas numérotés, avec les 3 défauts bloquants à reconfirmer | 2026-09-01 | **RÉFÉRENCE — alimente directement le plan de test** |
| `2026-08-14-runbook-mainteneur.md` | Runbook mainteneur | 2026-09-01 | RÉFÉRENCE |
| `2026-08-14-suite-plan-correction.md` | Suite du plan de correction | 2026-09-01 | SECONDAIRE |
| `2026-09-01-application-hardening.md` + `-design.md` | Durcissement applicatif | 2026-09-01 | **RÉFÉRENCE** (le plus récent) |
| `2026-03-11/12-*` (8 documents) | Organigramme, refonte UI claire, hiérarchie de pôles, import | 2026-03-11 / 03-12 | **DOUTEUX** — six mois, antérieurs à toute la refonte |

**`docs/architecture/` (3)** : `data-flow.md` (06-19, DOUTEUX), `actions-asynchrones.md` (08-04, SECONDAIRE), `concurrence-ecritures.md` (**09-01**, RÉFÉRENCE — le verrou optimiste).

**`docs/security/` (7)** : `verification-p0-2-supabase.md` (09-02, **RÉFÉRENCE**), `notify-email-audit.md` et `dependances.md` (09-01, RÉFÉRENCE), `authorization.md`, `encryption-at-rest.md`, `ssrf-protection.md`, `secrets-management.md` (06-19 → 06-21, SECONDAIRE : décrivent des principes stables).

**Ailleurs dans le dépôt (4)** : `orchestrator/README.md` (2026-05-17, DOUTEUX — le plus ancien du dépôt), `orchestrator/COMPLETION.md`, `supabase/migrations/README.md`, `supabase/schema/README.md` (08-04, RÉFÉRENCE pour l'ordre des migrations), `e2e-spine/` (2 documents, 06-24).

**Écartés — 63 documents, et c'est délibéré**
`.worktrees/audit-fixes/` (27 documents figés au 2026-08-05) et
`.worktrees/production-readiness/` (36 documents figés au 2026-08-22) contiennent des copies
**périmées** de toute la documentation. Elles portent les mêmes noms de fichiers que les
documents vivants, avec des contenus antérieurs : `docs/testing.md` y fait 2 621 o contre
5 668 o dans l'arbre principal, `recette-staging` 21 550 o dans les deux mais à des dates
différentes. **Les lire, c'est documenter une version morte de l'application** — le piège que
le `CLAUDE.md` racine §2 signale explicitement.

### Autres applications — comptage seulement

Comptage borné (profondeur 3, exclusions appliquées) des fichiers `.md` par dossier de
premier niveau. Ce n'est **pas** un jugement de qualité documentaire : un dépôt à 273
documents peut être mal documenté, un dépôt à 9 documents parfaitement.

| Volume | Dossiers |
|---|---|
| > 50 | `NED-IA-13` (273), `Dreams_planner_4.0` (85), `APP_NATURE&TECHV8` (77), `SNAPBOOTH3-main` (62), `Biblio-Tech-RAG3` (59), `apps2026-hub` (58) |
| 20 – 50 | `ELITE-STUDIO-WEDDINGS` (49), `Aura_Flow-master` (48), `Virtual_Production_OS` (43), `Vector-studio-pro-main` (42), `Snapbooth_Template-master` (41), `LINK` (39), `Nature&Tech_Scan` (30), `NED-IA-SYNAPSE-STANDALONE` (29), `identity-core (1)` (28), `SOCIALISE-IA` (28), `TREEPHOTOIA-v2-master` (25), `NEO_CORTEX_DIGITAL` (25), `Discernia` (25), `mindflow-ai-main3.0` (24), `MémoireViveConnectV5.0` (24), `FACTION-NED` (24), **`ORGANIGRAD` (23)**, `Form` (23), `ELITE-SEO-AI` (23), `Memoria_studio 3.0` (21), `paraphe` (20) |
| 5 – 19 | `ExploraViva` (19), `ned-media-engine` (17), `Nouvelle_ere_formation` (17), `CONNEXION_APP` (17), `AgentdetestUX` (17), `Atelier_vision` (15), `app-Necromancia` (14), `NECROMANCIA` (14), `podcastai-pro (2)` (9), `App_Forteresse` (9), `ATELIER_ORVION` (9), `fresque-action-ia` (8), `App_FilmEliteMariage` (7), `apps2026-contracts` (6), `CHAT-VOCAL` (6), `VPS_Observatory` (5) |
| ≤ 2 | `BZZZT!-v2` (2), `ned-voice-service` (1), `Suite-Studio-Nouvelle-Ere` (1), `DEMO_SYNAPS` (1), `_deploy_apps2026` (1) |

---

## 3. Contradictions relevées

**C1 — `reste-a-faire-production-2026-09-01.md` contre `etat-production-2026-09-02.md`.**
Le premier classe en **P0** « publier la SPA » parce que `organigrad.vercel.app` renvoie 404.
Le second démontre que ce P0 n'existe pas : Vercel a été supprimé de l'infrastructure les
21-22/08, l'URL est morte par construction, et la SPA est en ligne sur le VPS à
`https://organigrad.nouvelleeredigital.fr` (200 constaté). **Contradiction résolue dans la
base elle-même** : le document du 01/09 porte un avertissement en tête et renvoie vers celui
du 02/09. C'est un bon réflexe de documentation, pas un désordre. `[KB]` les deux fichiers.

**C2 — le `CLAUDE.md` racine dit « ~45 dossiers », il y en a 119.**
`[KB]` `CLAUDE.md` §1 : « ~45 dossiers, dont ~40 dépôts git ». `[CODE]` `ls` du 2026-09-03 :
**119 entrées de premier niveau**, dont ~60 dossiers d'application, 5 sauvegardes, une
trentaine de scripts `_*.cjs` et une quinzaine de `.md`. L'ordre de grandeur des dépôts reste
plausible ; le décompte global est faux.

**C3 — `apps2026-hub/CLAUDE-RACINE.md` double `CLAUDE.md`.**
Deux fichiers de 32-33 ko, tous deux datés du 2026-09-01, l'un copie de l'autre. Rien
n'indique lequel fait foi si les deux divergent un jour. Aujourd'hui ils concordent
`[À CONFIRMER]` — comparaison intégrale non faite.

**C4 — le port d'Organigrad : trois sources, deux valeurs.**
`.claude/launch.json` force **5199** (`--strictPort`, commit `21a1262` du 08-09) ;
`vite.config.ts` ne surcharge rien, donc **5173** ; `CLAUDE.md` §5 dit **3001 / 5173**.
Constaté à l'écran le 2026-09-03 : **5173**. Détaillé dans `HARNESS-E2E/01-CONFIG.md`.

---

## 4. Documents obsolètes

| Document | Pourquoi |
|---|---|
| `ORGANIGRAD/docs/plans/2026-03-11-*` et `2026-03-12-*` (8) | Six mois. Antérieurs à la refonte, au verrou optimiste, à la RLS actuelle et au modèle de rôles en vigueur |
| `ORGANIGRAD/orchestrator/README.md` | 2026-05-17, le plus ancien du dépôt, alors que l'orchestrateur a changé de mode d'exécution depuis |
| `ORGANIGRAD/docs/audit-initial.md`, `final-correction-report.md`, `docs/architecture/data-flow.md` | Juin. Utiles à l'histoire, pas à l'état |
| `ORGANIGRAD/docs/reste-a-faire-production-2026-09-01.md` | Se déclare périmé sur ses deux P0 (cf. C1) |
| Racine : les 10 `PROMPT_*.md` / `PATCH_*.md` d'août | Vagues de correction closes. `CLAUDE.md` §8 dit de ne pas les rejouer en aveugle |
| `apps2026-hub/archives/` (13) | Rapports datés, obsolètes par construction |
| `apps2026-hub/ARCHITECTURE_MULTI_MODELES.md`, `HERMES_INTEGRATION.md` | Fin juin, antérieurs à la bascule Ollama cloud/local décrite dans `CLAUDE.md` §12 |

**Aucun document ne mentionne une technologie abandonnée sans le signaler** — les `vercel.json`
et `render.yaml` inertes sont couverts par `CLAUDE.md` §10, et le document du 02/09 corrige
lui-même la mention Vercel du 01/09.

---

## 5. Manques : applications sans documentation

**Aucun dossier de premier niveau n'est totalement dépourvu de `.md`**, hors les cinq
sauvegardes (`_BACKUP_GIT_home-profile-2026-08-04`, `_BACKUP_GIT_NED-IA-13`,
`Atelier_vision-backups`, `VPOS-backups`, `_backup-esw-supabase`) — normal, ce sont des archives.

Documentation **réduite au strict minimum** (1 à 2 fichiers) : `ned-voice-service`,
`Suite-Studio-Nouvelle-Ere`, `DEMO_SYNAPS`, `BZZZT!-v2`, `_deploy_apps2026`. Une campagne E2E
sur l'une d'elles partirait sans contexte : la phase B y serait presque vide, et il faudrait
l'assumer plutôt que de combler.

**Sens inverse — documenté mais absent du dépôt** : `CLAUDE.md` §1 cite `Necromancia`,
`Snapbooth`, `Connexions`, `Forteresse`, `Nature&Tech`, `Tree Photo IA` sous des noms qui ne
correspondent pas exactement aux dossiers présents (`app-Necromancia` **et** `NECROMANCIA`,
`SNAPBOOTH3-main` **et** `Snapbooth_Template-master`, `CONNEXION_APP`, `App_Forteresse`,
`APP_NATURE&TECHV8` **et** `Nature&Tech_Scan`, `TREEPHOTOIA-v2-master`). Plusieurs dossiers
pour un nom d'application : ne pas en déduire plusieurs produits sans vérifier.

**Signalement — deux harnais coexistent.** `HARNESS-E2E/` (17 `.md`) et
`HARNESS-E2E-CODEX/` (10 `.md`) portent les mêmes fichiers `00` à `06` à des versions
différentes : `02-PROMPT-CLAUDE-CODE.md` fait 7 893 o dans l'un et 8 485 o dans l'autre,
`00-README.md` 4 496 o contre 4 713 o. Les deux dossiers ont été écrits dans la nuit du
2026-09-03 entre 01h40 et 02h27, **pendant cette session**, par un autre travail en cours.
Ce n'est pas une contradiction de fond : c'est un chantier actif. À ne pas traiter comme une
divergence à réconcilier sans demander.

---

## 6. Limites de cet inventaire

- **Balayage borné** à trois niveaux de profondeur, avec les exclusions du prompt 04 §A.
  Un document pertinent enterré plus bas dans une application non testée n'a pas été vu.
- **Détail exhaustif uniquement** sur la racine, `apps2026-hub` et `ORGANIGRAD`. Les autres
  applications sont comptées, pas lues : leurs contradictions internes ne sont pas visibles ici.
- **Formats autres que `.md` non inventoriés** : `.docx`, `.html`, `.json`, `.sql`. La base
  en contient (`AUDIT-identity-core-synthese-decideur.html`, `SECRET_SCAN_REPORT.json`,
  `supabase-project-registry.json`).
- **Fiabilité déduite de la date, du contenu et des renvois entre documents**, pas d'une
  relecture intégrale. Les 198 ko d'`ECOSYSTEM.md` et les 122 ko de `RESTE_A_FAIRE` n'ont pas
  été lus de bout en bout pour cette campagne — seulement les sections utiles à Organigrad.
- **La base bouge pendant la lecture** (cf. §5). Cet inventaire est un instantané du
  2026-09-03 vers 02h40.
