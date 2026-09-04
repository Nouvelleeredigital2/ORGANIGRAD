# 01 — FICHE DE SESSION (GABARIT VIERGE)

Copier ce fichier sur `01-CONFIG.md` avant chaque nouvelle campagne.
Aucune valeur n'est pré-remplie par défaut : ce qui n'est pas connu est marqué `À RENSEIGNER`.
**Règle pour l'agent : si une ligne obligatoire porte encore `À RENSEIGNER`, tu t'arrêtes et tu me la demandes — c'est la seule question autorisée avant le démarrage.**

---

## 1. APPLICATION CIBLE

```
APPLICATION            : À RENSEIGNER
DÉPÔT LOCAL            : À RENSEIGNER
BRANCHE DE TRAVAIL     : À RENSEIGNER
URL D'ACCÈS            : À RENSEIGNER        # locale ou distante, telle qu'elle est réellement
COMMANDE DE DÉMARRAGE  : À RENSEIGNER        # ou "déjà lancée"
```

L'agent ne suppose **jamais** une URL. S'il en trouve une dans le dépôt ou la base de connaissance, il la propose, mais c'est cette fiche qui fait foi.

---

## 2. BASE DE CONNAISSANCE

```
RACINE                 : C:\Users\5070 Ti\Downloads\---APPLICATION-2026---
VUE D'ENSEMBLE         : À RENSEIGNER        # sous-dossier ou fichiers de niveau écosystème
DOSSIER DE L'APP       : À RENSEIGNER        # sous-dossier propre à l'application testée
```

Pour l'écosystème APPS-2026, la vue d'ensemble est `apps2026-hub\` (`ECOSYSTEM.md`,
`RESTE_A_FAIRE_APPS2026.md`, `ETAT_MISE_EN_LIGNE_VPS.md`, `docs\`, `plans\`), complétée par
les deux `CLAUDE.md` (racine et `Downloads\`).

Chemin Windows contenant espaces et tirets : toujours entre guillemets dans les commandes.
Accès en **lecture seule**. Aucun fichier de cette racine n'est modifié, déplacé ou supprimé.

---

## 3. AUTHENTIFICATION

```
COMPTE                 : ceglialaurent@gmail.com
QUI SE CONNECTE        : Laurent, manuellement, dans le navigateur
MOT DE PASSE           : jamais transmis, jamais saisi par l'agent
```

Déroulé imposé :
1. L'agent ouvre l'URL d'accès.
2. S'il n'est pas authentifié, il affiche exactement `⏸ ATTENTE CONNEXION MANUELLE — {url}` et attend.
3. Je me connecte moi-même, puis je réponds `GO`.
4. L'agent vérifie que la session est bien active, puis déroule sans plus jamais s'arrêter.
5. Si la session expire en cours de route : même signal, même reprise après `GO`. Aucune tentative de reconnexion automatique.

**Piège récurrent** : une application qui bascule en mode démo / mock quand ses variables
d'environnement manquent accorde souvent tous les droits d'office. Une campagne menée dans
ce mode ne teste ni l'authentification, ni les rôles, ni les RLS. Vérifier le mode réel dès
le premier écran, et l'écrire dans le fichier d'état.

---

## 4. PÉRIMÈTRE DE LA CAMPAGNE

```
MODE                   : À RENSEIGNER        # CONSTAT (diagnostic seul) | CORRECTION (diagnostic + correctifs P0/P1)
ESPACE ADMIN           : À RENSEIGNER        # OUI / NON / INCONNU
RÔLES À COUVRIR        : À RENSEIGNER
ROUTES EXCLUES         : À RENSEIGNER        # ou "aucune"
DURÉE MAX PAR ACTION   : 60 s                # attente d'une génération avant de conclure au blocage
```

---

## 5. INTERDICTIONS — COMPTE RÉEL

Non négociables, quelle que soit la configuration ci-dessus :

- Supprimer, archiver ou modifier une donnée **préexistante**, c'est-à-dire non créée par l'agent pendant la session.
- Tout paiement, achat, abonnement, saisie de moyen de paiement.
- Envoi d'e-mail, SMS ou notification vers un destinataire autre que `ceglialaurent@gmail.com`.
- Publication de contenu visible publiquement.
- Modification des paramètres de compte, de l'e-mail, du mot de passe ; suppression du compte.
- Saisie d'un mot de passe, d'une clé d'API ou d'une donnée bancaire dans un champ.
- Écriture, déplacement ou suppression dans la racine de la base de connaissance.

Face à l'une de ces actions : aller jusqu'à l'écran précédent, décrire ce qu'on y voit, marquer `NON TESTÉ — ACTION INTERDITE`, continuer.

**Si la fonction centrale de l'application tombe sous une de ces interdictions** (publier,
envoyer, facturer, diffuser), ne pas se contenter de la consigne générale : ajouter ici un
tableau action par action, disant ce qui est autorisé et où exactement l'agent s'arrête. Une
frontière écrite d'avance vaut mieux qu'un arbitrage improvisé devant le bouton.

> ⚠️ **La frontière ne tombe pas toujours sur un bouton.** « Décrire l'écran, s'arrêter au
> bouton » suppose qu'afficher ne fait rien — hypothèse tacite, et parfois fausse. Sur
> IA Studio Pro (2026-09-04), `ShareModal` **crée le lien de partage public à l'ouverture de la
> modale** : l'agent aurait publié un contenu en croyant seulement regarder un écran.
>
> Avant de classer un écran « consultable sans risque », **vérifier ce que son ouverture
> déclenche** : effet de bord au montage du composant, requête partie sans action de
> l'utilisateur, objet créé pour être affiché. En cas de doute, la frontière se pose **sur
> l'ouverture**, et l'écran est marqué `NON TESTÉ — ACTION INTERDITE`.

---

## 6. CONVENTION DE DONNÉES DE TEST

```
PRÉFIXE                : [TEST]
FORMAT                 : [TEST] {entité} {AAAA-MM-JJ}-{NN}
E-MAIL UTILISÉ         : ceglialaurent@gmail.com
FICHIERS TÉLÉVERSÉS    : générés localement dans _e2e/fixtures/
```

Tout objet créé est reporté dans la section `À NETTOYER` du fichier d'état, avec son emplacement, pour que je fasse le ménage moi-même.

**Règle de prudence — vérifier avant de créer.** Avant de poser une donnée dans une entité, l'agent constate qu'elle est supprimable depuis l'interface. Si elle ne l'est pas, il crée **un seul** objet, l'inscrit dans `À NETTOYER` avec la mention « aucun chemin de suppression constaté » et la manière de le nettoyer (base, console d'administration), puis passe à la suite. Une entité sans suppression est un constat en soi ; ce n'est pas une raison pour y accumuler des données de test.

---

## 7. ÉTIQUETAGE DES SOURCES

Toute affirmation produite par l'agent porte l'une de ces étiquettes :

| Étiquette | Signification |
|---|---|
| `[KB]` | Provient de la base de connaissance, avec nom de fichier |
| `[CODE]` | Vérifié dans le code source, avec `fichier:ligne` |
| `[E2E]` | Constaté à l'écran pendant le test — capture si l'outil sait l'écrire sur le disque, sinon la preuve citée qui la remplace : mesure DOM, statut réseau, ou texte exact affiché |
| `[À CONFIRMER]` | Hypothèse ou déduction non vérifiée |

Une affirmation sans étiquette est une erreur de méthode.
