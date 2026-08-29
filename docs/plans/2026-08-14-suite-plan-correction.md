# Suite du plan de correction — qui fait quoi

**État au 2026-08-14.** Branche `fix/workspace-role-null-bypass-and-perf`, PR #16,
CI verte sur 5 jobs (14 commits).

Tout ce qui était vérifiable sans accès connecté est fait. Ce document répartit
le reste entre **ce que je peux encore faire seul** et **ce qui ne peut venir que
de toi** — accès, comptes, boîte mail, ou décision produit.

---

## 1. Ce qui bloque, par ordre de rendement

| # | Action | Coût | Débloque |
|---|---|---|---|
| **B1** | Exécuter **R1 et R4** sur la production | ~5 min | **la fusion de la PR #16** |
| **B2** | Créer un projet **Supabase de staging** + remplir `.env.connected` | ~30 min | P0-5, P1-7, P1-9/10/11, recette 4 rôles |
| **B3** | Trancher la **politique de concurrence** | décision | P2-14 |
| **B4** | Vérifier le **déploiement de `notify-email`** + réception réelle | ~20 min | P1-8 |
| **B5** | Rétablir les droits du **MCP Supabase** (facultatif) | ? | m'évite de repasser par toi pour B1/B4 |

**B1 est de loin le plus rentable** : cinq minutes, et la PR peut être fusionnée.
Tout le reste peut attendre.

### B1 — Vérifier la base déployée (P0-2)

Coller R1 puis R4 de [`../security/verification-p0-2-supabase.md`](../security/verification-p0-2-supabase.md)
dans le SQL Editor du projet `xucmfdggetwxmpquqjvj`.

- **R1** dit si les deux RPC sont corrigées **en base**.
- **R4** le prouve en tentant réellement l'attaque (écrit puis annule ; le
  verdict s'affiche en rouge, c'est voulu).

Me renvoyer les deux sorties. Si `FAILLE` / `REUSSI` : j'applique la migration
`20260812122608` seule et on revérifie. Sinon : la PR est fusionnable.

> Le dépôt ne peut pas répondre à cette question. Toute la CI démontre que le
> code est correct ; aucune de ses vérifications ne dit si la faille est encore
> ouverte en production.

### B2 — Projet Supabase de staging

C'est ce qui débloque le plus de choses d'un coup. Il faut :

1. un projet Supabase **dédié aux tests** (jamais la production : les tests
   créent et suppriment des nœuds) ;
2. le schéma appliqué dessus — `supabase/schema/baseline_2026-08-03.sql` puis
   les migrations postérieures au 2026-08-03 (chemin vérifié, cf. R5) ;
3. **deux comptes de test** dans **deux workspaces distincts** — l'isolation A/B
   ne se teste pas avec un seul compte ;
4. une boîte mail réelle accessible pour les invitations et le magic link ;
5. `cp .env.connected.example .env.connected`, puis le remplir.

Ensuite `npm run test:e2e:connected` fait tourner ce qui existe déjà.

### B3 — Politique de concurrence

Quatre options dans [`../architecture/concurrence-ecritures.md`](../architecture/concurrence-ecritures.md).
Ma recommandation : **verrou optimiste sur `updated_at`** — seule option qui
supprime le caractère *silencieux* du problème sans migration, la colonne et son
trigger existant déjà. Dis-moi et j'implémente (voir A5).

### B4 — `notify-email`

[`../security/notify-email-audit.md`](../security/notify-email-audit.md) liste les
points à constater. Le piège principal : **sans `RESEND_API_KEY`, la fonction
répond `ok: true` sans envoyer d'e-mail.** Un appel HTTP réussi ne prouve donc
rien — il faut confirmer la réception.

---

## 2. Ce que je peux faire sans rien attendre

> **A1 à A4 sont faits** (commits `4ccf494`, `8f529fc`, `93d071f`). A5 et A6
> restent suspendus à une décision — voir B3 et la fin de cette section.

Par ordre de valeur.

### A1 ✅ — Suite connectée complète, prête à l'emploi (P1-7)

Écrire dès maintenant toute la suite `e2e-connected/`, sur le modèle de
`realtime-orchestration.spec.ts` : elle se saute proprement tant que
`.env.connected` est absent, et tourne dès qu'il existe.

Couverture visée, celle de ton point 7 : authentification (connexion,
déconnexion, rôle, session expirée), isolation A/B, les quatre rôles, CRUD des
agents et persistance après rechargement, invitations (création, acceptation,
mauvaise adresse, expiration, révocation, doublon, workspace étranger), clés API
(création, révélation unique, usage, révocation, expirée, workspace étranger,
scopes interdits), orchestration (nœud, run, attente humaine, approve, reject,
reset, SSE, deux onglets).

**Intérêt** : transforme « bloqué » en « une commande à lancer ». Le jour où B2
est fait, tu ne m'attends pas.

**Limite honnête** : je ne pourrai pas l'exécuter. Les sélecteurs seront relevés
dans le code, comme pour la suite Realtime, mais le premier passage connecté
demandera sûrement des ajustements.

### A2 ✅ — Job CI pour la suite connectée

Un job `workflow_dispatch` (déclenchement manuel) lisant des secrets GitHub, pour
que la suite connectée puisse tourner en CI sans jamais s'exécuter par accident
sur les PR ordinaires. Tu n'auras qu'à renseigner les secrets.

### A3 ✅ — Inscription et magic link, moitié client (P1-9/10)

Même découpage que pour la session expirée : la **réception** d'un lien demande
une boîte mail, mais la **réaction** de l'écran d'authentification est locale.
Testable maintenant : e-mail invalide, mot de passe trop court, compte déjà
existant, message d'erreur affiché, état de chargement, bascule
connexion/inscription/magic link, conservation d'un `?invite=` en attente.

C'est ce que demande explicitement ton point 9 (« vérifier les messages
d'erreur, les comptes déjà existants, les mots de passe invalides, un email
invalide »).

### A4 ✅ — Automatiser le diff de schéma (P2-16)

Un script qui compare l'export CSV de R6 à
`../security/inventaire-schema-reference.csv` et produit directement la liste des
objets présents en production mais absents du dépôt. Aujourd'hui c'est une
commande `diff` à lancer à la main et à interpréter.

### A5 — Verrou optimiste — **après B3**

Si tu retiens l'option 2 : `update … where id = ? and updated_at = <valeur
chargée>`, sur les deux chemins d'écriture, plus le traitement du conflit dans
l'interface (message, rechargement, préservation de la saisie). Les tests de
caractérisation existants échoueront alors — c'est prévu, ils seront réécrits en
tests de conformité.

### A6 — Idempotence de `notify-email` — **sous condition**

La correction (réserver la clé d'idempotence *avant* d'envoyer) est spécifiée
dans l'audit. Je ne l'ai pas appliquée faute de pouvoir exécuter ou déployer du
Deno. Deux façons d'avancer : soit tu peux tester la fonction après
modification, soit tu acceptes explicitement une modification non exécutée. Sans
l'un des deux, je préfère laisser le défaut documenté — il suppose deux
invocations réellement concurrentes.

---

## 3. Ordre proposé

```
Toi : B1  ──────────────► fusion PR #16 possible
Moi : A1, A3, A4 en parallèle (rien à attendre)

Toi : B2  ──────────────► je fais tourner A1, j'ajuste les sélecteurs
Toi : B3  ──────────────► je fais A5
Toi : B4  ──────────────► P1-8 clos, ou A6 selon ta réponse

Puis : recette manuelle 4 rôles (ton point 20) — à deux
```

---

## 4. Ce qui restera non vérifiable autrement que par toi

Même avec tout ce qui précède, certains points du plan exigent un humain devant
l'écran, et je ne peux ni les simuler ni les certifier :

- la **réception effective** d'un e-mail HITL et d'un magic link ;
- la **recette manuelle des quatre rôles** (point 20) ;
- le comportement en **production réelle** après déploiement.

Les scénarios pas à pas de cette recette sont écrits :
[recette manuelle 4 rôles](2026-08-14-recette-manuelle-4-roles.md) — 50 points de
contrôle, owner / admin / member / viewer / extérieur, plus une section
transversale (multi-onglets, réseau coupé, session expirée, concurrence).

Le mode d'emploi des quatre actions bloquantes est dans le
[runbook mainteneur](2026-08-14-runbook-mainteneur.md).
