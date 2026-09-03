# 03 — PROMPT E2E — CODEX (NAVIGATEUR)

> Lancer en mode autonome (`codex --full-auto` ou équivalent), sinon chaque commande déclenchera une demande d'approbation et la campagne s'interrompra en boucle.
> Pré-requis : `01-CONFIG.md` rempli, `_e2e/CONTEXTE-{APP}.md` produit par le prompt 04.
> Sans outil navigateur natif : voir **PROCÉDURE NAVIGATEUR** en fin de document.

---

## MISSION

Utiliser réellement l'application dans un navigateur, page par page, du premier écran jusqu'au dernier, comme un utilisateur lambda : cliquer chaque bouton, remplir chaque champ, soumettre chaque formulaire, déclencher chaque génération, vérifier le résultat, et corriger le code quand ça casse.

Tu n'évalues pas le code par lecture. Tu exécutes, tu observes, et tu ne descends dans le code qu'après avoir constaté une anomalie réelle à l'écran.

---

## AMORÇAGE

```bash
cat "HARNESS-E2E/01-CONFIG.md"
cat "_e2e/CONTEXTE-{APP}.md"     2>/dev/null || echo "CONTEXTE ABSENT"
cat "_e2e/PROGRESS-{APP}.md"     2>/dev/null || echo "PROGRESS ABSENT"
git status --short && git branch --show-current
```

- Ligne obligatoire de `01-CONFIG.md` encore à `À RENSEIGNER` → tu t'arrêtes et tu me la demandes. Seule question autorisée avant démarrage.
- `CONTEXTE ABSENT` → tu t'arrêtes : le contexte fonctionnel précède le test.
- `PROGRESS` présent → tu reprends au premier élément non coché, silencieusement, sans retester ce qui est `OK`.
- Tu n'inventes **aucune** URL et **aucun** chemin absent de la fiche de session.

---

## PAUSE D'AUTHENTIFICATION — L'UNIQUE INTERRUPTION AUTORISÉE

Tu ne t'authentifies jamais et ne saisis aucun identifiant ni mot de passe. Si la session n'est pas ouverte :

```
⏸ ATTENTE CONNEXION MANUELLE — {url}
Connecte-toi dans le navigateur, puis réponds GO.
```

Tu attends. Sur `GO`, tu vérifies que la session est active, puis tu déroules. Expiration en cours de campagne : même signal, même reprise. Aucune reconnexion automatique.

---

## CONTRAT D'EXÉCUTION AUTONOME

Ces six points priment sur ton comportement par défaut :

1. **Aucune question intermédiaire.** Jamais « veux-tu que je continue sur la page suivante ? » : la réponse est oui, pour toutes les pages, jusqu'à la dernière ligne du fichier d'état.
2. **Aucune demande d'approbation** pour les actions du parcours normal — clic, saisie, soumission, navigation, écriture dans `_e2e/` et dans le code. Seules les interdictions de `01-CONFIG.md §5` requièrent mon accord.
3. **Un échec n'interrompt rien** : `BLOQUÉ`, puis élément suivant.
4. **Aucun résumé intermédiaire dans le fil.** Une seule ligne par élément :
   `[12/87] /devis/nouveau — bouton « Générer le PDF » — CASSÉ P1 — corrigé`.
5. **Ambiguïté** → tu tranches comme un utilisateur lambda, tu écris `DÉCISION : …` dans le fichier d'état, tu continues.
6. **Ton outil de plan interne est un confort ; le fichier d'état sur disque est la source de vérité.** Il survit à la coupure de session, pas le plan.

Écris le fichier d'état après **chaque** élément, jamais en lot. Aucun DOM complet, aucune capture encodée, aucun log de plus de 10 lignes dans tes réponses.

---

## PHASE 0 — CARTOGRAPHIE

Croise trois sources et signale leurs désaccords :

| Source | Ce que tu en tires | Étiquette |
|---|---|---|
| `_e2e/CONTEXTE-{APP}.md` | parcours attendus, entités, rôles | `[KB]` |
| Routeur du dépôt | routes réellement déclarées | `[CODE]` |
| Application ouverte | ce qui est réellement atteignable | `[E2E]` |

Route documentée mais absente du code, ou codée mais inatteignable : constat P1, inscrit immédiatement.

Écris `_e2e/PROGRESS-{APP}.md` d'après `05-TEMPLATE-PROGRESS.md`. Ordre des parcours :
entrée publique → session authentifiée → création de la ressource principale → consultation, filtres, recherche → modification de ta propre donnée de test → générations (image, document, export, IA) → suppression de ta propre donnée de test → écrans périphériques → espace admin si applicable.

Enchaîne immédiatement sur la Phase 1.

---

## PHASE 1 — BOUCLE PAR ÉLÉMENT

**1 · OBSERVER** — capture dans `_e2e/captures/{NN}-{route}-{element}.png`, inventaire des éléments interactifs.

**2 · AGIR** — clic, saisie, sélection, téléversement. Valeurs plausibles, jamais `aaa` :
- texte : `[TEST] {entité} {AAAA-MM-JJ}-{NN}`
- e-mail : `ceglialaurent@gmail.com`
- nombres, dates, téléphones, adresses : valides et réalistes
- fichiers : générés dans `_e2e/fixtures/` (PNG 800×600, PDF 1 page, CSV 10 lignes)

**3 · ATTENDRE** — jusqu'à la durée max de `01-CONFIG.md §4`. Un chargement infini est un constat, pas un motif d'abandon.

**4 · VÉRIFIER** — les trois, systématiquement :
- écran : résultat attendu, message de succès, redirection, persistance après rechargement
- console : erreurs et avertissements JS
- réseau : statuts ≠ 2xx, requêtes échouées, appels en double

Génération : le fichier existe-t-il, s'ouvre-t-il, est-il non vide, conforme à la demande ? PDF blanc ou image de 0 octet = `CASSÉ`.

**5 · DIAGNOSTIQUER** (si anomalie) — cause précise, `fichier:ligne`. Sinon `[À CONFIRMER]` avec ce qu'il faudrait vérifier.

**6 · CONSIGNER** — immédiatement, une ligne :

```
- [x] Bouton « Enregistrer » — OK
- [x] Bouton « Générer l'image » — CASSÉ P1 — 504 sur POST /api/generate — cause : lib/generate.ts:88, timeout 10 s < durée réelle — CORRIGÉ
- [x] Champ « SIRET » — DÉGRADÉ P2 — aucune validation de format — components/SiretField.tsx:24 — correctif proposé, non appliqué
```

Verdicts : `OK` · `CASSÉ` · `DÉGRADÉ` · `NON CÂBLÉ` · `BLOQUÉ` · `NON TESTÉ`
Sévérités : `P0` · `P1` · `P2` · `P3`

---

## MODE CORRECTION

Sur chaque P0 / P1 : correctif minimal → **retest immédiat dans le navigateur** → `CORRIGÉ` ou `CORRECTION ÉCHOUÉE`. Deux tentatives maximum, puis `CORRECTION ABANDONNÉE`. Aucun refactoring opportuniste. Schéma et migrations hors périmètre.
P2 / P3 : correctif proposé, non appliqué.
Un commit par page : `fix(e2e): {page} — {n} corrections`.

---

## PHASE 2 — RAPPORT

À N/N seulement : `_e2e/RAPPORT-{APP}-{date}.md`, d'après `06-TEMPLATE-RAPPORT.md`.

---

## PROCÉDURE NAVIGATEUR (si aucun outil natif)

Pilote Playwright toi-même, en réutilisant **ma session existante** plutôt qu'en te connectant :

```bash
npm i -D playwright && npx playwright install chromium
```

- `launchPersistentContext` sur un profil dédié hors du dépôt, dans lequel j'ouvre la session manuellement au premier lancement.
- Un script par parcours dans `_e2e/scripts/`, exécuté puis analysé.
- Instrumentation obligatoire : `page.screenshot()` après chaque action, `page.on('console')`, `page.on('response')`.
- Aucun cookie de session, aucun profil, aucune capture ne rejoint le suivi Git.

---

## DÉMARRAGE

Amorçage, puis déroule sans t'arrêter jusqu'à la dernière ligne du fichier d'état.
