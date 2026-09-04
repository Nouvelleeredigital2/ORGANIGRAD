# 03 — PROMPT E2E — CODEX (NAVIGATEUR)

> Lancer en mode autonome (`codex --full-auto` ou équivalent), sinon chaque commande déclenchera une demande d'approbation et la campagne s'interrompra en boucle.
> Pré-requis : `01-CONFIG.md` rempli, `_e2e/CONTEXTE-{APP}.md` produit par le prompt 04.
> Sans outil navigateur natif : voir **PROCÉDURE NAVIGATEUR** en fin de document.

---

## MISSION

Utiliser réellement l'application dans un navigateur, page par page, du premier écran jusqu'au dernier, comme un utilisateur lambda : cliquer chaque bouton, remplir chaque champ, soumettre chaque formulaire, déclencher chaque génération et vérifier le résultat. Si `MODE = CORRECTION`, corriger le code quand ça casse, selon les règles ci-dessous ; si `MODE = CONSTAT`, **ne modifier ni le code ni l'historique Git**.

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
- `PROGRESS` présent → compare `IDENTIFIANT`, `BRANCHE`, `URL`, `MODE` et `COMMIT INITIAL` avec la fiche et l'état courant ; **une divergence bloque la reprise** et doit être signalée. Si tout concorde, tu reprends au premier élément non coché, sans retester ce qui est `OK`.
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

Route documentée mais absente du code, ou codée mais inatteignable : inscris d'abord un **ÉCART DE CARTOGRAPHIE**. Classe-le `P1` uniquement s'il casse un parcours attendu et documenté ; sinon `P2`/`P3` selon l'impact constaté, ou `[À CONFIRMER]`.

Écris `_e2e/PROGRESS-{APP}.md` d'après `05-TEMPLATE-PROGRESS.md`. **À sa création, renseigne un identifiant unique de campagne, le mode, la branche courante, l'URL de la fiche et le résultat de `git rev-parse HEAD` comme `COMMIT INITIAL`.** Ordre des parcours :
entrée publique → session authentifiée → création de la ressource principale → consultation, filtres, recherche → modification de ta propre donnée de test → générations (image, document, export, IA) → suppression de ta propre donnée de test → écrans périphériques → espace admin si applicable.

Enchaîne immédiatement sur la Phase 1.

---

## PHASE 1 — BOUCLE PAR ÉLÉMENT

**1 · OBSERVER** — inventaire des éléments interactifs, et **une preuve de ce que tu vois**.

Au **premier** élément de la campagne, établis une fois pour toutes ce que ton outil sait faire : tente d'écrire `_e2e/captures/{NN}-{route}-{element}.png`, puis vérifie par `ls -l` que le fichier existe et n'est pas vide. Une image rendue dans le fil n'est pas une image enregistrée — la plupart des outils navigateur ne touchent jamais au disque. Inscris le résultat dans le fichier d'état, une seule ligne, et tiens-t'en là :

```
MODE DE PREUVE : captures fichier    → _e2e/captures/ alimenté, chaque constat renvoie à son fichier
MODE DE PREUVE : preuves citées      → l'outil n'écrit pas sur le disque ; _e2e/captures/ restera vide
```

En mode « preuves citées », un constat d'écran se démontre autrement, et reste opposable : mesure DOM chiffrée, relevé réseau (méthode, URL, statut), texte exact affiché entre guillemets, `fichier:ligne` pour la cause. Ce qui est proscrit, c'est l'affirmation nue.

**Ne prétends jamais avoir enregistré une capture que tu n'as pas écrite.** Un dossier vide ne passe pas pour un dossier de preuves : le rapport le dit en §10.

En mode Playwright (voir PROCÉDURE NAVIGATEUR), tu es en « captures fichier » : `page.screenshot({ path })` écrit réellement, vérifie-le quand même au premier appel.

**2 · AGIR** — clic, saisie, sélection, téléversement. Valeurs plausibles, jamais `aaa` :
- texte : `[TEST] {entité} {AAAA-MM-JJ}-{NN}`
- e-mail : `ceglialaurent@gmail.com`
- nombres, dates, téléphones, adresses : valides et réalistes
- fichiers : générés dans `_e2e/fixtures/` (PNG 800×600, PDF 1 page, CSV 10 lignes)

**Avant de créer une donnée, repère le chemin de suppression de l'entité** (bouton « Supprimer », « Archiver », « Annuler »). Aucun n'est visible ? Tu crées **un seul** objet, tu l'inscris aussitôt dans `À NETTOYER` avec « aucun chemin de suppression constaté », et tu n'en crées pas un second dans cette entité. Cas réel sur LINK : deux réunions de test devenues non supprimables — pas de bouton, `DELETE /api/meetings/{id}` → **405** — et restées sur le compte du propriétaire.

**Vise par sélecteur, jamais par coordonnées.** `page.getByRole(...)`, `getByTitle`, `getByText` — jamais `page.mouse.click(x, y)`. Un clic en pixels rate sa cible **en silence**, et c'est l'application qui est accusée à la place de l'instrument. Cas réel : trois clics au centre exact d'un bouton (rectangle mesuré `[12, 71, 263, 40]`, clic à `143, 91`) n'ont rien produit sous fenêtre émulée ; le bouton allait être déclaré cassé, il fonctionnait parfaitement à l'échelle 1:1.

Il en découle une règle de verdict, valable quel que soit l'outil : **un élément qui « ne réagit pas » n'est pas un élément cassé tant que tu ne l'as pas atteint par un second chemin.** Avant tout `CASSÉ` ou `NON CÂBLÉ` sur un clic sans effet, refais-le autrement — autre sélecteur, `dispatchEvent`, appel direct du gestionnaire. Si le second chemin fonctionne, le défaut est dans ton instrument : tu l'écris en `DÉCISION` et tu ne consignes aucune anomalie applicative.

C'est le cas particulier d'une règle générale : **quand une mesure confirme ce que tu attendais — surtout un défaut —, vérifie-la par un second moyen avant de la consigner.**

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
