# HARNESS E2E — MODE D'EMPLOI

Harness de test end-to-end au navigateur pour les applications de **APPLICATION-2026**.
Aucune valeur n'est inventée dans ce harness : tout ce qui dépend de ton environnement est renseigné par toi dans `01-CONFIG.md`, et rien ne démarre tant que ce fichier est incomplet.

---

## PRINCIPES

1. **Tu es le seul à t'authentifier.** L'agent n'entre jamais d'identifiant ni de mot de passe. Il ouvre le navigateur, s'arrête une fois, tu te connectes toi-même, tu dis `GO`, il déroule.
2. **Le fichier d'état sur disque fait foi.** Une session qui meurt ne fait rien perdre : on relance, l'agent reprend à la ligne suivante.
3. **Aucune question intermédiaire.** La seule interruption autorisée est la pause d'authentification.
4. **La base de connaissance précède le test.** L'agent lit d'abord la documentation de l'écosystème et celle de l'application, puis teste ce qui est censé exister.
5. **Compte réel, données réelles.** Interdictions dures, données de test préfixées, liste de nettoyage.

---

## CONTENU DU HARNESS

| Fichier | Rôle | Qui le remplit |
|---|---|---|
| `00-README.md` | Ce document | — |
| `01-CONFIG.md` | Fiche de session : app, URL, périmètre | **Toi**, avant chaque campagne |
| `02-PROMPT-CLAUDE-CODE.md` | Prompt d'exécution E2E | Collé tel quel |
| `03-PROMPT-CODEX.md` | Même mission, adaptée à Codex | Collé tel quel |
| `04-PROMPT-DOCUMENTATION.md` | Lecture de la base de connaissance + production de la doc | Collé tel quel |
| `05-TEMPLATE-PROGRESS.md` | Modèle du fichier d'état | L'agent |
| `06-TEMPLATE-RAPPORT.md` | Modèle du rapport final | L'agent |

---

## FICHES QUI NE VIVENT PAS ICI

| Application | Fiche de référence | Depuis |
|---|---|---|
| Memoria Player Studio 3.0 | `Memoria_studio 3.0\HARNESS-E2E\01-CONFIG.md` | 2026-09-03 |
| Atelier Vision | `Atelier_vision\HARNESS-E2E\01-CONFIG.md` | 2026-09-03 |
| Atelier Orvion (NotebookPro V2) | `ATELIER_ORVION\HARNESS-E2E\01-CONFIG.md` | 2026-09-03 |
| IA Studio Pro (podcastai-pro) | `podcastai-pro (2)\HARNESS-E2E\01-CONFIG.md` | 2026-09-03 |
| Virtual Production OS | `Virtual_Production_OS\HARNESS-E2E\01-CONFIG.md` | 2026-09-04 |

Ces fiches **font foi dans le dépôt de leur application**, pas ici. Ne pas en recréer une copie
dans ce dossier : deux exemplaires divergent en silence, et le prompt 02 lit celui du dépôt.
Le nom `01-CONFIG.md` n'est pas un oubli — c'est le seul nom que l'amorçage du prompt 02 lit.

---

## RESYNCHRONISER LA COPIE AVANT CHAQUE CAMPAGNE

**Ce dossier est la source ; les copies dans les dépôts d'applications sont des instantanés.**
Ils vieillissent en quelques heures. Le 2026-09-03, deux campagnes complètes se sont déroulées
sur des copies qui ignoraient trois règles ajoutées entre-temps — chemin de suppression avant
création, clic par référence, panneau navigateur visible. L'une d'elles a créé deux galeries de
test avant de découvrir qu'aucune suppression n'existe : c'est exactement ce que la première de
ces règles prévient.

**Plusieurs sessions écrivent ici en parallèle.** Ce n'est pas une hypothèse : le fichier `02`
a changé quatre fois dans la même journée. Une resynchronisation « faite une fois pour toutes »
n'existe donc pas.

Avant chaque campagne, depuis le dépôt de l'application :

```bash
S="C:/Users/5070 Ti/Downloads/---APPLICATION-2026---/HARNESS-E2E"
for f in 00-README.md 02-PROMPT-CLAUDE-CODE.md 03-PROMPT-CODEX.md \
         04-PROMPT-DOCUMENTATION.md 05-TEMPLATE-PROGRESS.md \
         06-TEMPLATE-RAPPORT.md 01-CONFIG.VIERGE.md; do
  cp "$S/$f" "HARNESS-E2E/$f"
done
```

**`01-CONFIG.md` n'est jamais dans cette liste** : c'est la fiche de l'application, elle vit
dans son dépôt et l'écraser reviendrait à repartir d'un gabarit vierge.

Puis commiter la resynchronisation **avant** de lancer le prompt 02, sinon l'amorçage trouvera
un dépôt sale et s'arrêtera.

---

## CYCLE D'UNE CAMPAGNE

```
ÉTAPE 0   Tu remplis 01-CONFIG.md
          ↓
ÉTAPE 1   Prompt 04 — phase A+B
          Phase A : inventaire borné de la base de connaissance
          Produit : _e2e/KB-INVENTAIRE.md
          Phase B : contexte de l'application testée
          Produit : _e2e/CONTEXTE-{APP}.md
          À relire avant de continuer : la section 9 « Zones d'ombre »
          ↓
ÉTAPE 2   Prompt 02 (ou 03) — cartographie
          L'agent croise le contexte, le routeur et l'application ouverte
          Produit : _e2e/PROGRESS-{APP}.md
          ↓
ÉTAPE 3   PAUSE AUTHENTIFICATION — tu te connectes, tu réponds GO
          ↓
ÉTAPE 4   Exécution autonome, élément par élément, jusqu'à N/N
          Produit : captures, corrections, commits
          ↓
ÉTAPE 5   Rapport : _e2e/RAPPORT-{APP}-{date}.md
          ↓
ÉTAPE 6   Prompt 04 — phase C
          Documentation de l'existant réel + écarts avec la base de connaissance
          Produit : _e2e/DOC-{APP}.md
```

Si la session s'interrompt à l'étape 4, tu relances exactement le même prompt : l'agent lit le fichier d'état et reprend seul.

---

## ARBORESCENCE PRODUITE DANS LE DÉPÔT

```
_e2e/
  KB-INVENTAIRE.md           inventaire borné de la base de connaissance
  CONTEXTE-{APP}.md          contexte extrait de la base de connaissance
  PROGRESS-{APP}.md          fichier d'état, source de vérité de l'avancement
  RAPPORT-{APP}-{date}.md    rapport de campagne
  DOC-{APP}.md               documentation de l'existant réel
  ECARTS-KB-{APP}.md         écarts entre la base de connaissance et la réalité
  captures/                  captures d'écran, nommées {NN}-{route}-{element}.png
                             — **peut rester vide** : beaucoup d'outils navigateur rendent
                               l'image dans la conversation sans jamais l'écrire sur le
                               disque. L'agent établit le MODE DE PREUVE au premier élément
                               et, s'il ne peut pas écrire, démontre par mesure DOM, relevé
                               réseau et texte exact. Un dossier vide n'est pas un dossier
                               de preuves : le rapport le dit en §10
  fixtures/                  fichiers générés pour les téléversements
```

À ajouter au `.gitignore` : `_e2e/captures/`, `_e2e/fixtures/`.
À suivre en Git : les `.md` de `_e2e/`.

---

## AVANT DE LANCER — VÉRIFICATIONS

- [ ] **La copie du harness dans le dépôt de l'app est resynchronisée depuis celle-ci** — voir la section ci-dessous : elle vieillit vite, et une campagne menée sur une copie périmée applique des règles retirées depuis
- [ ] `01-CONFIG.md` est rempli, aucune ligne `À RENSEIGNER` ne subsiste
- [ ] L'application tourne et est atteignable dans le navigateur
- [ ] Un outil navigateur est actif pour l'agent (Claude in Chrome, MCP Playwright, ou navigateur natif Codex)
- [ ] **Le panneau navigateur est visible, et le restera pendant toute la campagne.** Replié, il fige le rendu de chaque page : l'agent voit un « chargement infini » là où l'application fonctionne, et le symptôme résiste au redémarrage du serveur comme au rechargement. Six routes ont déjà été déclarées cassées à tort pour cette raison. L'agent vérifie `document.visibilityState` à l'amorçage et s'arrête s'il vaut `hidden`
- [ ] Si tu veux de **vraies captures PNG sur disque**, c'est le choix d'outil qui le décide, pas la consigne : seul un pilotage Playwright (`page.screenshot({ path })`, cf. `03-PROMPT-CODEX.md`) l'assure. Sinon la campagne se déroulera en « preuves citées », ce qui est prévu et opposable
- [ ] Les permissions d'outil sont accordées d'avance, sinon la session s'interrompra à chaque action
- [ ] Le dépôt est propre : `git status` vide, branche dédiée créée
- [ ] Tu es disponible dans les 2 premières minutes pour la pause d'authentification

---

## LIMITE CONNUE

Un agent qui pilote un navigateur sur ton compte personnel manipule de vraies données. Les interdictions inscrites dans les prompts réduisent le risque, elles ne le suppriment pas. Si l'application gère plusieurs espaces, clients ou organisations, crée un espace dédié au test avant la campagne : c'est plus fiable qu'une consigne.
