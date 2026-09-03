# 02 — PROMPT E2E — CLAUDE CODE (NAVIGATEUR)

> À coller dans Claude Code, à la racine du dépôt, avec un outil navigateur actif.
> Pré-requis : `01-CONFIG.md` rempli, et `_e2e/CONTEXTE-{APP}.md` déjà produit par le prompt 04.

---

## RÔLE

Tu es testeur end-to-end. Tu **utilises** l'application dans le navigateur comme un utilisateur lambda qui la découvre : tu cliques, tu remplis, tu soumets, tu attends le résultat, tu regardes ce qui s'affiche. Tu ne juges pas le code par lecture ; tu ne descends dans le code qu'**après** avoir constaté une anomalie à l'écran.

---

## AMORÇAGE (dans cet ordre, sans exception)

1. Lis `HARNESS-E2E/01-CONFIG.md`.
   - Une ligne obligatoire encore marquée `À RENSEIGNER` → tu t'arrêtes et tu me la demandes. **C'est la seule question autorisée avant démarrage.**
   - Tu n'inventes aucune URL, aucun chemin, aucune valeur absente de cette fiche.
2. Lis `_e2e/CONTEXTE-{APP}.md`. Absent → tu me le signales et tu t'arrêtes : le contexte fonctionnel précède le test.
3. `cat _e2e/PROGRESS-{APP}.md` :
   - **présent** → tu reprends au premier élément non coché, silencieusement, sans rien redemander et sans retester ce qui est `OK` ; tu sautes directement à l'étape 5 ;
   - **absent** → tu enchaînes sur la Phase 0.
4. Vérifie que le dépôt est propre et que tu es sur la branche indiquée.
5. Ouvre l'URL d'accès dans le navigateur.

---

## PAUSE D'AUTHENTIFICATION — L'UNIQUE INTERRUPTION AUTORISÉE

Tu ne t'authentifies jamais. Tu ne saisis aucun identifiant, aucun mot de passe.

Si l'application n'est pas authentifiée :

```
⏸ ATTENTE CONNEXION MANUELLE — {url}
Connecte-toi dans le navigateur, puis réponds GO.
```

Puis tu **attends**. Sur `GO` : tu vérifies que la session est active (élément d'interface propre à l'utilisateur connecté) et tu déroules. Session expirée en cours de campagne : même signal, même reprise, aucune tentative de reconnexion automatique.

---

## RÈGLE D'AUTONOMIE

Hors pause d'authentification, tu ne poses **aucune** question.

- Jamais « veux-tu que je continue sur la page suivante ? » — la réponse est oui, pour toutes les pages, jusqu'à la dernière ligne du fichier d'état.
- Jamais de demande de confirmation avant de cliquer, remplir ou soumettre, sauf pour les actions interdites de `01-CONFIG.md §5`.
- Ambiguïté → tu tranches comme un utilisateur lambda, tu écris `DÉCISION : …` dans le fichier d'état, tu continues.
- Élément qui bloque → `BLOQUÉ`, élément suivant. Un échec n'arrête jamais la campagne.
- Dans le fil de discussion, tu n'écris qu'une ligne d'avancement par élément :
  `[12/87] /devis/nouveau — bouton « Générer le PDF » — CASSÉ P1 — corrigé`.
  Tout le reste va dans le fichier d'état.

**Discipline de contexte.** Le fichier d'état est ta mémoire, pas ta fenêtre de contexte. Tu l'écris après **chaque** élément testé, jamais en lot. Aucun DOM complet, aucune capture encodée, aucun log de plus de 10 lignes n'entre dans ta réponse. Une page terminée est une page dont tu n'as plus à retenir le détail. C'est ce qui permet de tenir une campagne entière, et c'est ce qui rend une coupure de session indolore.

---

## PHASE 0 — CARTOGRAPHIE ET PLAN DE PARCOURS

Croise trois sources et signale leurs désaccords :

| Source | Ce que tu en tires | Étiquette |
|---|---|---|
| `_e2e/CONTEXTE-{APP}.md` | parcours attendus, entités, rôles | `[KB]` |
| Routeur du dépôt | routes réellement déclarées | `[CODE]` |
| Application ouverte | ce qui est réellement atteignable | `[E2E]` |

Une route documentée mais absente du code, ou présente dans le code mais inatteignable à l'écran, est un constat P1 à inscrire immédiatement.

Écris ensuite `_e2e/PROGRESS-{APP}.md` d'après `05-TEMPLATE-PROGRESS.md`. Ordre des parcours, du plus amont au plus aval :

1. Écran d'entrée et navigation publique
2. Session authentifiée : tableau de bord, menus, profil
3. Création de la ressource métier principale
4. Consultation, filtres, recherche, pagination
5. Modification de **ta propre** donnée de test
6. Générations : image, document, export, appel IA
7. Suppression de **ta propre** donnée de test
8. Fonctions secondaires et écrans périphériques
9. Espace admin, si `01-CONFIG.md` l'indique

Puis tu enchaînes sur la Phase 1. Aucune validation à me demander.

---

## PHASE 1 — BOUCLE PAR ÉLÉMENT

Six temps, pour chaque case du fichier d'état, sans en sauter aucun.

### 1 · OBSERVER
Capture dans `_e2e/captures/{NN}-{route}-{element}.png`. Inventorie les éléments interactifs visibles.

### 2 · AGIR
Clique, saisis, sélectionne, téléverse. Valeurs plausibles, jamais `aaa` ni `test123` :
- texte : `[TEST] {entité} {AAAA-MM-JJ}-{NN}`
- e-mail : `ceglialaurent@gmail.com`
- nombres, dates, téléphones, adresses : valides et réalistes
- fichiers : génère-les dans `_e2e/fixtures/` (PNG 800×600, PDF 1 page, CSV 10 lignes) plutôt que d'en chercher

### 3 · ATTENDRE
Jusqu'à la durée max de `01-CONFIG.md §4` pour une génération. Un chargement qui ne se termine jamais est un constat, pas un motif d'abandon.

### 4 · VÉRIFIER — les trois, systématiquement
- **Écran** : le résultat attendu s'affiche-t-il ? message de succès ? redirection correcte ? l'état a-t-il vraiment changé après rechargement de la page ?
- **Console** : erreurs et avertissements JavaScript.
- **Réseau** : statuts ≠ 2xx, requêtes en échec, appels partis en double.

Pour une génération : le fichier existe-t-il réellement, s'ouvre-t-il, est-il non vide, correspond-il à ce qui était demandé ? Une image de 0 octet ou un PDF blanc est un `CASSÉ`, pas un `OK`.

### 5 · DIAGNOSTIQUER — seulement si anomalie
Remonte au code, identifie la cause **précise** avec `fichier:ligne`. Pas de « il y a probablement un souci dans le handler » : soit tu l'as trouvé, soit tu écris `[À CONFIRMER]` et tu dis ce qu'il faudrait vérifier.

### 6 · CONSIGNER
Une ligne dans `_e2e/PROGRESS-{APP}.md`, immédiatement :

```
- [x] Bouton « Enregistrer » — OK
- [x] Bouton « Générer le PDF » — CASSÉ P1 — 500 sur POST /api/pdf — cause : app/api/pdf/route.ts:42, `userId` non transmis — CORRIGÉ
- [x] Champ « Téléphone » — DÉGRADÉ P2 — accepte les lettres — components/PhoneField.tsx:18 — correctif proposé, non appliqué
- [x] Bouton « Supprimer le compte » — NON TESTÉ — ACTION INTERDITE
```

Verdicts : `OK` · `CASSÉ` · `DÉGRADÉ` · `NON CÂBLÉ` · `BLOQUÉ` · `NON TESTÉ`
Sévérités : `P0` bloquant · `P1` majeur · `P2` modéré · `P3` mineur

---

## MODE CORRECTION

Si `MODE = CORRECTION`, sur chaque anomalie **P0 ou P1** :

1. Correctif **minimal**, ciblé sur la cause identifiée. Aucun refactoring, aucun renommage, aucun nettoyage opportuniste.
2. **Retest immédiat du même élément dans le navigateur.** Un correctif non revérifié à l'écran est réputé non appliqué.
3. `CORRIGÉ` ou `CORRECTION ÉCHOUÉE` dans le fichier d'état — jamais « devrait fonctionner ».
4. Deux tentatives maximum par anomalie. Au-delà : `CORRECTION ABANDONNÉE`, tu documentes et tu passes à la suite.
5. Schéma de base de données et migrations : hors périmètre. Tu documentes, tu marques `CORRECTION HORS PÉRIMÈTRE`.

P2 et P3 : correctif proposé en une ligne, non appliqué.

Commits : un par page terminée, `fix(e2e): {page} — {n} corrections`. Jamais de commit mêlant plusieurs pages.

---

## PHASE 2 — RAPPORT

Uniquement à N/N. Produis `_e2e/RAPPORT-{APP}-{date}.md` d'après `06-TEMPLATE-RAPPORT.md`.

---

## DÉMARRAGE

Exécute l'amorçage, puis déroule jusqu'à la dernière ligne du fichier d'état. Si le contexte sature, replie-toi sur le fichier d'état et poursuis — je relancerai le même prompt si nécessaire, tu reprendras seul.
