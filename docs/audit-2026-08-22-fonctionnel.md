# Audit fonctionnel — Organigrad est-il fonctionnel à 100 % ?

**Date : 2026-08-22.** Branche `fix/workspace-role-null-bypass-and-perf` (PR #16,
19 commits, CI verte). Production : projet Supabase `xucmfdggetwxmpquqjvj`,
orchestrateur `orchestrator.srv1017182.hstgr.cloud`.

---

## Réponse

**Non.** Et l'écart ne se situe pas là où on l'attend : le **code** est en bon
état, c'est le **déployé** qui ne l'est pas.

| Plan | État |
|---|---|
| Qualité du code, tests, CI | **solide** — 581 tests verts, 5 jobs CI |
| Comportement vérifié en conditions réelles | **très faible** — l'essentiel n'a jamais été exécuté contre un vrai Supabase |
| Chaîne déployée | **incomplète** — deux briques sur trois manquent |

Dit autrement : rien ne prouve aujourd'hui qu'un utilisateur puisse se servir
d'Organigrad de bout en bout, parce que **l'application n'est pas accessible** et
que **les e-mails ne partent pas**.

---

## Ce qui a réellement été vérifié pour cet audit

Pas de déduction depuis le code seul : sondes réseau, exécution des suites,
lecture des documents de recette antérieurs.

| Vérification | Résultat |
|---|---|
| `npm run lint` / `typecheck` / `test` / `build` (SPA) | ✅ 247 tests, 43 fichiers |
| idem orchestrateur | ✅ 284 tests (62 sautés faute de base) |
| E2E hermétiques Playwright | ✅ 47 tests |
| Sécurité SQL sur PostgreSQL réel | ✅ 11 tests |
| `https://orchestrator.srv1017182.hstgr.cloud/` | **404** (hôte joignable) |
| `…/healthz` | **200 `{"ok":true}`** → l'orchestrateur **tourne et est sain** |
| `…/api/health` | **401** → routes applicatives protégées, comme prévu |
| `…supabase.co/functions/v1/notify-email` | **404** → **non déployée** |
| `https://organigrad.vercel.app` | **404** → **SPA non publiée** |

> **Deux conclusions hâtives corrigées en cours d'audit.** Mes premières sondes
> vers `/healthz` ont expiré (deux fois) et j'allais conclure que l'orchestrateur
> était mort, puis qu'un point de santé « pendait ». Réessayé : **200
> `{"ok":true}`**. C'était de l'instabilité réseau, pas un défaut.
> L'anomalie O-01 du 2026-08-05 est donc **levée**, et le grief sur `/healthz`
> retiré.
>
> Leçon appliquée aux deux constats rouges ci-dessous : ils ont été **reconfirmés
> trois fois chacun** avant d'être maintenus.

---

## 1. Ce qui est solide

- **Le socle de sécurité multi-tenant.** La faille de contournement `NULL` est
  corrigée, l'audit élargi n'a rien trouvé d'autre (8 fonctions
  `SECURITY DEFINER`, 16 policies RLS), et 11 tests négatifs tournent en CI
  contre un vrai PostgreSQL — vérifiés capables d'attraper la faille.
- **Le rendu et la manipulation de l'organigramme** : import CSV/XLSX, édition,
  suppression, recherche, tableau de bord, export PDF (fichier réellement
  produit et lisible, vérifié).
- **La robustesse d'interface** : URL manipulées, permissions par rôle,
  multi-onglets, erreurs réseau, session expirée. Tous couverts par des tests,
  la plupart ajoutés en corrigeant un défaut réel.
- **La discipline de vérification** : chaque correctif de ce chantier a été
  confronté au code d'avant pour confirmer que le test échouait bien sans lui.

## 2. Ce qui n'est pas fonctionnel — par gravité

### 🔴 B-1 · La SPA n'est pas publiée

`https://organigrad.vercel.app` répond **404**, et le relevé d'écosystème ne
liste qu'un seul domaine pour Organigrad : celui de l'orchestrateur. Il n'y a
donc **aucune interface accessible** à un utilisateur.

C'est le blocage numéro un : tout le reste est théorique tant qu'il tient.

### 🔴 B-2 · Aucun e-mail ne part

L'Edge Function `notify-email` répond **404** : elle n'est pas déployée. Toute la
chaîne de notification (validation humaine, alertes d'erreur) est **muette en
production**. Anomalie déjà relevée le 2026-08-05 sous le code O-02 ; toujours
vraie 17 jours plus tard.

Second piège au moment du déploiement : **sans `RESEND_API_KEY`, la fonction
répond `ok: true` sans rien envoyer**. Déployer ne suffira pas, il faudra
confirmer une réception.

### 🟠 B-3 · L'état réel de la base n'a jamais été vérifié

Le correctif de sécurité a été appliqué via un outil qui, depuis, ne répond plus
(`28P01`, anomalie O-05). **Personne n'a confirmé que la production porte la
version corrigée.** Le dépôt ne peut pas répondre à cette question ; les requêtes
sont prêtes (`security/verification-p0-2-supabase.md`, R1 et R4), elles prennent
cinq minutes.

Tant que ce point n'est pas levé, on ne sait pas si la faille est ouverte.

### 🟠 B-4 · Écrasement silencieux en écriture concurrente — ✅ **corrigé le 2026-08-22**

Deux personnes sur la même fiche : la seconde écrasait la première, **sans
erreur, sans trace, sans que personne l'apprenne**.

Politique retenue : **verrou optimiste** sur `updated_at` (option 2). Appliqué
aux trois chemins d'écriture — fiches et nœuds côté Supabase, et via
l'orchestrateur, dont l'API transporte désormais le jeton. Aucune migration.

Prouvé sur **PostgreSQL réel** (5 tests en CI) : la seconde écriture est refusée
et la première survit ; après rechargement le second auteur réapplique sa
modification ; une fiche supprimée entre-temps n'est pas ressuscitée.

Le verrou détecte, il ne fusionne pas — voir
`architecture/concurrence-ecritures.md` pour la limite assumée.

### 🟡 B-5 · Double envoi d'e-mail en concurrence — ✅ **corrigé le 2026-08-22**

`notify-email` faisait `SELECT` → **envoi** → `INSERT`. Deux invocations
concurrentes portant la même clé envoyaient deux e-mails ; l'index unique
n'intervenait qu'après l'envoi et son échec était avalé.

L'ordre est inversé : la clé est **réservée** (`status = 'pending'`) avant
l'envoi, et c'est la contrainte d'unicité qui arbitre. Aucune migration —
`pending` est déjà la valeur par défaut de la colonne et fait partie de sa
contrainte `CHECK`.

> **Pourquoi maintenant, alors que je refusais hier ?** Mon refus reposait sur
> « ne pas toucher un chemin d'envoi qui fonctionne sans pouvoir le tester ».
> L'audit vient d'établir que la fonction **n'est pas déployée** : il n'y a
> aucun chemin en fonctionnement à casser, et la version corrigée est celle qui
> sera déployée au jalon 2. Le risque a changé de camp.
>
> Reste vrai : **cette modification n'a pas été exécutée** (pas de Deno ici).
> Elle sera éprouvée au jalon 2, étape 3.

### 🟡 B-6 · Hygiène : trois fichiers d'environnement — ✅ **corrigé le 2026-08-22**

État constaté au moment de l'audit (modification non commitée) :

- **`.env.connected.example`** pointe désormais la **production**, alors que son
  propre en-tête dit « projet de TEST uniquement ». Or la suite connectée
  **crée et supprime** nœuds, invitations et clés API. Quiconque suit le runbook
  (`cp .env.connected.example .env.connected` puis `npm run test:e2e:connected`)
  ferait tourner ces 23 tests **sur la production**.
- **`.env.test`** contient une clé anon. Le mode hermétique tient encore (l'URL
  reste vide, et `isSupabaseConfigured` exige les deux), mais la protection ne
  tient plus qu'à un champ.
- **`.env.example`** : placeholder remplacé par la clé réelle.

La clé `anon` n'est pas un secret — elle est publiée dans le bundle. Le problème
n'est pas la fuite, c'est **la cible**. Le job CI « Hygiène » échouera d'ailleurs
sur ces fichiers (motif `eyJ…`).

### 🟢 B-7 · Points mineurs

- ~~`whatsappId` déclaré sans implémentation~~ — ✅ **retiré le 2026-08-22**.
  Le champ, son pilote no-op et l'indicateur du DTO public ont disparu ; le
  canal ne promet plus rien. La contrainte `CHECK` de `notifications.channel`
  accepte encore `'whatsapp'` : rien ne l'écrivait, et restreindre une
  contrainte en production sans nécessité serait un risque gratuit.
- Dérive de l'historique `supabase_migrations` (O-04) : comptabilité seulement,
  objets conformes.

## 3. Ce qui est inconnu — jamais exécuté

Ce n'est ni bon ni mauvais : c'est **non vérifié**, et il faut le compter comme
tel.

| Zone | Pourquoi |
|---|---|
| 23 tests E2E connectés | écrits, jamais lancés — aucun projet de test |
| Invitations de bout en bout | dernière vérification le 2026-08-05, avant plusieurs correctifs |
| Validation humaine (HITL) réelle | dépend de B-2 |
| Inscription, lien magique | demandent une vraie boîte mail |
| Recette manuelle des 4 rôles | 50 points écrits, jamais déroulés |
| Realtime à deux consommateurs | correctif jamais confronté au vrai client |

---

## 4. Que veut dire « fonctionnel à 100 % » ?

Sans critère, la question n'a pas de réponse vérifiable. Proposition — c'est
atteint quand **les six** conditions suivantes sont vraies :

1. un utilisateur atteint l'application par une URL publique et s'y connecte ;
2. les quatre rôles se comportent comme spécifié, constaté à la main ;
3. une validation humaine déclenche un e-mail **reçu** ;
4. l'orchestration fonctionne de bout en bout : nœud, exécution, attente,
   approbation, journal, SSE ;
5. les 23 tests connectés passent, en CI ;
6. aucun défaut connu n'est laissé sans décision explicite — un risque accepté
   et daté compte comme traité.

---

## 5. Plan pour y arriver

Quatre jalons. Chacun se termine par une vérification, pas par une intention.

### Jalon 1 — Lever le doute sur la sécurité *(toi, ~10 min)*

Exécuter **R1** et **R4** sur la production, m'envoyer les sorties.

- Si `✅` : la PR #16 est fusionnable, la faille est fermée.
- Si `🚨` : j'applique `20260812122608` seule et on revérifie.

Bloque : la fusion, et tout jugement sur la sécurité réelle.

### Jalon 2 — Rendre l'application accessible *(toi, ~1 h)*

1. **Publier la SPA.** Vercel ou le VPS. Renseigner `VITE_SUPABASE_URL` et
   `VITE_SUPABASE_ANON_KEY` à la construction, sinon l'application démarre en
   mode local et personne ne peut se connecter.
2. **Déployer `notify-email`** : `supabase functions deploy notify-email`, puis
   les secrets `RESEND_API_KEY` et `EMAIL_FROM`.
3. **Vérifier** : ouvrir l'URL, se connecter, déclencher une validation, **et
   confirmer la réception d'un e-mail** — pas un code HTTP.

Bloque : tout usage réel. C'est le jalon le plus lourd et le plus décisif.

### Jalon 3 — Prouver le comportement *(toi puis moi, ~2 h)*

1. Projet Supabase **de test** (runbook, §B2), `.env.connected` renseigné.
2. `npm run test:e2e:connected` — m'envoyer la sortie, succès **ou** échecs.
   Ces 23 tests n'ont jamais tourné : j'ajuste ce qui casse.
3. Dérouler la recette manuelle des 4 rôles (50 points), en priorité **1.13**
   (second e-mail HITL), **4.6** (`?edit=1` chez un viewer) et **5.x**
   (utilisateur extérieur) : les trois défauts corrigés ici, jamais confirmés en
   conditions réelles.
4. Brancher le job CI `connectee` avec les secrets.

Bloque : le passage de « les tests passent » à « ça marche ».

### Jalon 4 — Fermer les défauts connus *(décisions puis moi)*

| Décision attendue | Ce que je fais ensuite |
|---|---|
| Politique de concurrence (4 options) | j'implémente ; ma reco : verrou optimiste sur `updated_at`, sans migration |
| Idempotence `notify-email` : je livre non exécuté, ou tu testes après modification ? | je corrige l'ordre « réserver → envoyer → confirmer » |

### ✅ Immédiat — fait le 2026-08-22

Les trois `.env` versionnés sont revenus à leurs valeurs de gabarit
(`.env.example` : placeholder ; `.env.test` et `.env.connected.example` : vides).
Les vraies valeurs restent dans `.env.local`, gitignoré, qui les portait déjà —
le développement local n'a rien perdu. Copie de sauvegarde des versions
renseignées conservée hors dépôt.

Le contrôle « Hygiène » repasse, et le risque de lancer la suite connectée sur la
production est refermé.

---

## Résumé en une ligne

Le code est prêt et bien gardé ; **la chaîne déployée ne l'est pas**, et rien
n'a encore été prouvé en conditions réelles. Les jalons 1 et 2 sont l'essentiel :
sans eux, la question « fonctionnel à 100 % ? » reste sans objet.
