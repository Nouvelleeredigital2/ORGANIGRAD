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
   - **présent** → compare d'abord `IDENTIFIANT`, `BRANCHE`, `URL`, `MODE` et `COMMIT INITIAL`
     avec la fiche et l'état courant du dépôt. **Une divergence bloque la reprise** et doit
     être signalée : reprendre une campagne sur un autre commit ou une autre URL produit un
     fichier d'état qui mélange deux réalités. Si tout concorde, tu reprends au premier élément
     non coché, silencieusement, sans rien redemander et sans retester ce qui est `OK` ;
     tu sautes directement à l'étape 5 ;
   - **absent** → tu enchaînes sur la Phase 0.
4. Vérifie que le dépôt est propre et que tu es sur la branche indiquée.
5. Ouvre l'URL d'accès dans le navigateur, **puis vérifie que le panneau est visible** :

   ```js
   document.visibilityState   // doit valoir "visible"
   ```

   S'il vaut `hidden`, tu t'arrêtes et tu me demandes de rouvrir le panneau. C'est la **seconde** question autorisée avant démarrage, et la seule autre. Un panneau replié ne permet aucun constat valable (voir « Le panneau replié » dans la boucle par élément).

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

Une route documentée mais absente du code, ou présente dans le code mais inatteignable à l'écran, est d'abord un **ÉCART DE CARTOGRAPHIE**, à inscrire immédiatement. Classe-le `P1` **uniquement** s'il casse un parcours attendu et documenté ; sinon `P2`/`P3` selon l'impact constaté, ou `[À CONFIRMER]`. Tout classer `P1` d'office noie les vraies ruptures dans le bruit.

Écris ensuite `_e2e/PROGRESS-{APP}.md` d'après `05-TEMPLATE-PROGRESS.md`. **À sa création, renseigne un identifiant unique de campagne (`{APP}-{AAAA-MM-JJ}-{NN}`), le mode, la branche courante, l'URL de la fiche et le résultat de `git rev-parse HEAD` comme `COMMIT INITIAL`** — c'est ce qui rend une reprise vérifiable. Ordre des parcours, du plus amont au plus aval :

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
Inventorie les éléments interactifs visibles, et **produis une preuve de ce que tu vois**.

**Au premier élément de la campagne, établis ce que ton outil sait faire** — une fois, pas à chaque écran :

1. tente d'enregistrer une capture dans `_e2e/captures/{NN}-{route}-{element}.png` ;
2. vérifie que le fichier **existe et n'est pas vide** (`ls -l`). Une capture rendue dans le fil de discussion n'est pas une capture enregistrée : la plupart des outils navigateur retournent l'image dans la conversation **sans jamais l'écrire sur le disque**.

Puis inscris le résultat dans le fichier d'état, une seule fois, et tiens-t'en là :

```
MODE DE PREUVE : captures fichier    → _e2e/captures/ alimenté, chaque constat renvoie à son fichier
MODE DE PREUVE : preuves citées      → l'outil n'écrit pas sur le disque ; _e2e/captures/ restera vide
```

**En mode « preuves citées », un constat d'écran se démontre autrement — et cela reste opposable :**

- **mesure DOM** : la valeur qui prouve le défaut, relevée dans la page
  (`h2 rendu sur 9 px, ligne 263 px, bloc titre 47 px`) ;
- **relevé réseau** : méthode, URL, statut (`POST /api/gemini/quiz → 503`) ;
- **texte exact affiché**, entre guillemets, y compris les messages d'erreur ;
- **`fichier:ligne`** pour la cause, dès que tu la tiens.

Une mesure chiffrée qu'un tiers peut refaire vaut mieux qu'une capture que personne ne rouvre. Ce qui est proscrit, c'est l'affirmation nue : « le bouton est mal aligné » sans mesure, « l'écran est vide » sans relevé.

**Ne prétends jamais avoir enregistré une capture que tu n'as pas écrite**, et ne laisse pas entendre qu'un dossier vide contient des preuves. Si le mode est « preuves citées », le rapport final le dit dans sa section « ce qui n'a pas été testé, et pourquoi ».

### 2 · AGIR
**Si le panneau navigateur n'a pas le focus, les clics par coordonnées n'aboutissent pas** — le
bouton paraît mort alors qu'il fonctionne. Vérifié le 2026-09-04 : le même « Continuer » ne
répondait à aucun clic par coordonnées et marchait par appel DOM. Dans ce cas, **agis par le
DOM** et n'émets **aucun verdict qui dépende du rendu** (mise en page, mesure visuelle,
« chargement infini »). Un défaut d'outil ne se consigne jamais comme un défaut d'application.

Clique, saisis, sélectionne, téléverse. Valeurs plausibles, jamais `aaa` ni `test123` :
- texte : `[TEST] {entité} {AAAA-MM-JJ}-{NN}`
- e-mail : `ceglialaurent@gmail.com`
- nombres, dates, téléphones, adresses : valides et réalistes
- fichiers : génère-les dans `_e2e/fixtures/` (PNG 800×600, PDF 1 page, CSV 10 lignes) plutôt que d'en chercher

**Avant de créer une donnée dans une entité, repère son chemin de suppression.** Regarde l'écran de liste et la fiche de l'objet : y a-t-il un bouton « Supprimer », « Archiver », « Annuler » ? Si aucun n'est visible, tu crées **un seul** objet, tu le notes immédiatement dans `À NETTOYER` avec la mention « aucun chemin de suppression constaté », et tu **n'en crées pas un second** dans la même entité.

Le cas est arrivé sur LINK : deux réunions de test créées, puis découverte qu'il n'existe ni bouton de suppression ni route — `DELETE /api/meetings/{id}` répond **405**. Les deux objets sont restés sur le compte réel, nettoyables uniquement en base. Une entité qui ne se supprime pas est en soi un constat à consigner (`NON CÂBLÉ` ou absence conforme à la doc, selon ce qu'annonce la base) ; ce n'est pas une raison pour lui laisser des déchets.

**Vise par référence d'élément, jamais par coordonnées.** Un clic en pixels est le moyen le plus sûr de produire un **faux constat** : il rate sa cible en silence, et l'application est accusée à la place de l'instrument.

Le cas est arrivé, il a coûté cher : sous **fenêtre émulée** — un viewport de 1440 × 900 réduit pour tenir dans le panneau —, trois clics successifs au centre exact d'un bouton (mesuré : `rect [12, 71, 263, 40]`, clic à `143, 91`) n'ont **rien** produit. Le bouton allait être déclaré cassé. Un `click()` programmatique sur le **même** bouton a créé le document attendu ; l'émulation retirée, le clic normal a fonctionné du premier coup.

Trois règles qui en découlent :

1. **Pas d'émulation de fenêtre pendant la campagne.** Travaille à l'échelle 1:1. Réserve l'émulation au seul parcours responsive, en fin de campagne, et **remets l'échelle normale ensuite** — un viewport émulé laissé en place fausse tout ce qui suit.

2. **Clique par `ref` / sélecteur.** Si l'outil n'accepte que des coordonnées, relis d'abord le rectangle de l'élément dans la page et vérifie après coup que l'action a eu lieu.

3. **Un élément qui « ne réagit pas » n'est pas un élément cassé tant que tu ne l'as pas atteint autrement.** Avant tout verdict `CASSÉ` ou `NON CÂBLÉ` sur un clic sans effet, refais-le par un second chemin — référence, sélecteur, ou déclenchement programmatique. Si le second chemin marche, le défaut est dans ton instrument : tu l'écris en `DÉCISION` dans le fichier d'état, et tu ne consignes aucune anomalie applicative.

C'est le cas particulier d'une règle générale : **quand une mesure confirme ce que tu attendais — surtout un défaut —, vérifie-la par un second moyen avant de la consigner.**

**Le panneau replié — le même piège, en pire.** Un viewport émulé rate sa cible ; un panneau **caché** fige tout rendu. Le navigateur bride les onglets invisibles : le flux de rendu ne se termine pas, et chaque écran reste indéfiniment sur son repli de chargement. Le symptôme produit est parfaitement crédible — « chargement infini » — et il **survit au redémarrage du serveur, au rechargement matériel et à l'ouverture d'un onglet neuf**.

C'est arrivé, et six routes ont été déclarées `CASSÉ P1` à tort. Ce qui aurait dû alerter : un écran avait rendu correctement au premier chargement, puis avait cessé de rendre **sans qu'une ligne de code change**. Trois hypothèses ont été écartées par la mesure — service worker, session expirée, politique de sécurité de contenu — avant que quiconque pense à vérifier si la fenêtre était ouverte.

Deux règles :

- **Vérifie `document.visibilityState` avant de consigner tout « chargement infini », toute « page vide », tout « écran qui ne répond pas ».** À `hidden`, tu n'as pas un constat : tu n'as pas d'instrument. Tu t'arrêtes, tu demandes la réouverture du panneau, tu ne consignes rien.
- **Un serveur qui répond `200` vite face à un client qui n'affiche rien désigne le client.** Avant d'accuser l'application, relis le journal du serveur : s'il sert la route sans erreur, cherche le défaut de ton côté.

**Deux autres instruments qui mentent, rencontrés sur la même campagne.**

- **`document.body.innerText` n'est pas une preuve d'écran.** Sur un écran d'export **entièrement rendu** — titre, progression, six formats visibles à la capture et présents dans l'arbre d'accessibilité —, `innerText` valait `"Chargement…"`, onze caractères. Le contenu vivait dans des conteneurs que `innerText` ne traverse pas. **L'arbre d'accessibilité (`read_page`) et la capture font foi ; `innerText` sert d'indice, jamais de verdict.** C'est cette mesure qui avait fabriqué six faux `CASSÉ P1`.
- **Une boîte de dialogue native est invisible à un agent.** `window.confirm`, `window.alert`, `window.prompt` sont rejetés en silence par la plupart des outils de pilotage : la fonction retourne `false`, le gestionnaire s'arrête net, et l'élément paraît **`NON CÂBLÉ`**. Une suppression de projet parfaitement fonctionnelle a été prise pour un bouton mort — deux clics, aucun effet, aucune requête. Avant de conclure, **cherche `confirm(` dans le gestionnaire** ; si tu en trouves un, neutralise-le pour la durée du test (`window.confirm = () => true`), consigne-le en `DÉCISION`, et **ne consigne aucune anomalie applicative**. Le texte de la question, lui, est un constat à citer : il prouve que la confirmation existe.

### 3 · ATTENDRE
Jusqu'à la durée max de `01-CONFIG.md §4` pour une génération. Un chargement qui ne se termine jamais est un constat, pas un motif d'abandon.

### 4 · VÉRIFIER — les trois, systématiquement
- **Écran** : le résultat attendu s'affiche-t-il ? message de succès ? redirection correcte ? l'état a-t-il vraiment changé après rechargement de la page ?
- **Console** : erreurs et avertissements JavaScript.
- **Réseau** : statuts ≠ 2xx, requêtes en échec, appels partis en double.

Pour une génération : le fichier existe-t-il réellement, s'ouvre-t-il, est-il non vide, correspond-il à ce qui était demandé ? Une image de 0 octet ou un PDF blanc est un `CASSÉ`, pas un `OK`.

### 5 · DIAGNOSTIQUER — seulement si anomalie
**Avant toute hypothèse sur une configuration ou un identifiant, lis le journal du service
concerné.** Le 2026-09-03, un `FATAL: authentification par mot de passe échouée` a envoyé le
diagnostic sur un mot de passe pendant trois manœuvres ; la ligne suivante du journal disait
`DÉTAIL : le rôle « atelier » n'existe pas`. Le message générique désignait un symptôme, le
journal donnait la cause. **Un correctif d'identifiants proposé sans avoir lu le journal est
une hypothèse déguisée en solution.**

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
