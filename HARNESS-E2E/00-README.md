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
  fixtures/                  fichiers générés pour les téléversements
```

À ajouter au `.gitignore` : `_e2e/captures/`, `_e2e/fixtures/`.
À suivre en Git : les `.md` de `_e2e/`.

---

## AVANT DE LANCER — VÉRIFICATIONS

- [ ] `01-CONFIG.md` est rempli, aucune ligne `À RENSEIGNER` ne subsiste
- [ ] L'application tourne et est atteignable dans le navigateur
- [ ] Un outil navigateur est actif pour l'agent (Claude in Chrome, MCP Playwright, ou navigateur natif Codex)
- [ ] Les permissions d'outil sont accordées d'avance, sinon la session s'interrompra à chaque action
- [ ] Le dépôt est propre : `git status` vide, branche dédiée créée
- [ ] Tu es disponible dans les 2 premières minutes pour la pause d'authentification

---

## LIMITE CONNUE

Un agent qui pilote un navigateur sur ton compte personnel manipule de vraies données. Les interdictions inscrites dans les prompts réduisent le risque, elles ne le suppriment pas. Si l'application gère plusieurs espaces, clients ou organisations, crée un espace dédié au test avant la campagne : c'est plus fiable qu'une consigne.
