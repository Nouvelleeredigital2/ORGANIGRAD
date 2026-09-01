# Mode d'emploi — les quatre actions qui me bloquent

À suivre pas à pas, dans l'ordre. Chaque étape dit **ce qu'on attend** et **ce
qu'il faut me renvoyer**.

Répartition d'ensemble : [`2026-08-14-suite-plan-correction.md`](2026-08-14-suite-plan-correction.md).

---

# B1 — Vérifier la base de production (≈ 5 min)

C'est le seul point qui bloque la fusion de la PR #16.

### 1. Ouvrir le SQL Editor

<https://supabase.com/dashboard/project/xucmfdggetwxmpquqjvj/sql/new>

### 2. Coller **R1**

Le bloc SQL de la section « R1 » de
[`../security/verification-p0-2-supabase.md`](../security/verification-p0-2-supabase.md).
Exécuter (`Ctrl+Entrée`).

**Attendu** : deux lignes, `create_workspace_api_key` et
`invite_workspace_member`, toutes deux en `✅ CORRIGE`.

### 3. Coller **R4** dans un nouvel onglet de requête

**Le résultat s'affiche en ROUGE, comme une erreur.** C'est voulu : le bloc se
termine par une exception pour garantir l'annulation de ce qu'il a écrit. Lire
le message, pas sa couleur.

**Attendu** : `create_workspace_api_key : ✅ refuse (forbidden)` et
`invite_workspace_member : ✅ refuse (forbidden)`.

Si le message dit `⚠️ NON TESTABLE`, c'est qu'il n'existe qu'un seul
utilisateur ou qu'un seul workspace en base : passe B2 d'abord, puis reviens.

### 4. Me renvoyer les deux sorties

- Les deux `✅` partout → **la PR est fusionnable**, je te le confirme.
- Un seul `🚨` → la faille est **ouverte en production**. Je te donne la
  migration à appliquer seule, puis on relance R1 et R4.

### 5. Pendant que tu y es (facultatif, 2 min)

R5 et R6 de la même page. R6 se télécharge en CSV (bouton *Download CSV*), et
je le passe dans `node scripts/diff-schema.mjs` pour lister la dérive
Git ↔ production.

---

# B2 — Projet Supabase de test (≈ 30 min)

Débloque les 22 tests connectés, donc P0-5, P1-7 et une partie de P1-9/10/11.

> ⚠️ **Un projet neuf, jamais la production.** Les tests créent et suppriment
> des nœuds, des invitations et des clés API.

### 1. Créer le projet

Dashboard Supabase → **New project**. Nom libre (`organigrad-test`), mot de passe
base de données au choix, région la plus proche.

### 2. Relever les identifiants

**Project Settings → API** :

- `Project URL` → ce sera `VITE_SUPABASE_URL`
- `anon` `public` → ce sera `VITE_SUPABASE_ANON_KEY`

> La clé `service_role` n'est **pas** utilisée ici. Si tu la copies par erreur,
> les tests tourneraient en contournant la RLS — donc en ne testant plus rien.

### 3. Appliquer le schéma

SQL Editor → coller **tout** `supabase/schema/baseline_2026-08-03.sql` →
exécuter. Puis, **dans cet ordre**, chacune de ces migrations :

```
supabase/migrations/20260803120000_org_agents.sql
supabase/migrations/20260803120100_org_agents_rls.sql
supabase/migrations/20260803120200_org_agents_import_rpc.sql
supabase/migrations/20260803120300_rls_execute_grants.sql
supabase/migrations/20260805150000_fix_invite_workspace_member_ambiguous_expires_at.sql
supabase/migrations/20260805150100_fix_accept_workspace_invitation_ambiguous_workspace_id.sql
supabase/migrations/20260805150200_fix_inv_read_by_email_no_auth_users.sql
supabase/migrations/20260811090000_hybrid_nodes_external_source.sql
supabase/migrations/20260812122608_fix_workspace_role_of_null_bypass.sql
supabase/migrations/20260812122625_optimize_rls_wrap_auth_calls.sql
supabase/migrations/20260812122635_add_missing_foreign_key_indexes.sql
```

> Les migrations **antérieures** au 2026-08-03 ne sont pas rejouables : le
> baseline les contient déjà (cf. `supabase/migrations/README.md`). J'ai vérifié
> ce chemin sur PostgreSQL 16, il passe de bout en bout.

Contrôle : recoller **R1** — les deux fonctions doivent sortir en `✅ CORRIGE`.

### 4. Créer les comptes

**Authentication → Users → Add user → Create new user.**

**Coche « Auto Confirm User »** pour chacun. Sans ça, la connexion échoue en
`email_not_confirmed` et tous les tests échouent pour cette seule raison.

| Compte | E-mail suggéré | Rôle dans les tests |
|---|---|---|
| A | `e2e-a@exemple.test` | compte principal |
| B | `e2e-b@exemple.test` | **isolation** — doit être dans un AUTRE workspace |
| Viewer | `e2e-viewer@exemple.test` | lecture seule dans le workspace de A |

Note les mots de passe, ils ne sont plus affichés ensuite.

Un trigger crée automatiquement, pour chaque compte, un **profil, un workspace
personnel et son adhésion `owner`**. A et B sont donc déjà isolés l'un de
l'autre : rien à faire de plus pour eux.

### 5. Rattacher le viewer au workspace de A

SQL Editor :

```sql
-- 1. Relever les identifiants
select u.id as user_id, u.email, w.id as workspace_id, w.name
  from auth.users u
  left join public.workspaces w on w.owner_id = u.id
 order by u.email;
```

Puis, en remplaçant les deux valeurs :

```sql
-- 2. Le viewer rejoint le workspace de A, en lecture seule
insert into public.workspace_members (workspace_id, user_id, role)
values ('<WORKSPACE_ID_DE_A>', '<USER_ID_DU_VIEWER>', 'viewer');

-- 3. IMPORTANT — retirer son workspace personnel
--    Sans ça, l'application le connecte sur SON workspace, où il est owner,
--    et le test « le viewer n'a aucune commande d'administration » vérifie
--    alors le contraire de ce qu'il croit vérifier.
delete from public.workspaces where owner_id = '<USER_ID_DU_VIEWER>';
```

Contrôle :

```sql
select u.email, w.name, m.role
  from public.workspace_members m
  join auth.users u on u.id = m.user_id
  join public.workspaces w on w.id = m.workspace_id
 order by u.email;
```

**Attendu** : A `owner` dans son workspace, B `owner` dans **un autre**, le
viewer `viewer` dans celui de A **et nulle part ailleurs**.

### 6. Renseigner `.env.connected`

```bash
cp .env.connected.example .env.connected
```

Remplir `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, puis les trois paires
e-mail / mot de passe. Laisser les `WORKSPACE_ID` vides : ils sont déduits.

### 7. Lancer

```bash
npm run test:e2e:connected
```

**Ce que je te demande de me renvoyer** : la sortie complète, succès **ou**
échecs. Ces 22 tests n'ont jamais tourné — j'ai relevé les sélecteurs dans le
code, mais le premier passage en révélera sûrement d'inexacts. C'est attendu,
et c'est ce que je corrige ensuite.

### 8. Facultatif — la même suite en CI

**Settings → Secrets and variables → Actions → New repository secret**, un par
ligne :

```
E2E_SUPABASE_URL, E2E_SUPABASE_ANON_KEY,
E2E_EMAIL, E2E_PASSWORD,
E2E_EMAIL_B, E2E_PASSWORD_B,
E2E_EMAIL_VIEWER, E2E_PASSWORD_VIEWER
```

Puis **Actions → CI → Run workflow**. Le job `E2E connectée` ne part que sur ce
déclenchement manuel, jamais sur une PR.

---

# B3 — Politique de concurrence (décision, pas manipulation)

Aujourd'hui, deux personnes qui modifient la même fiche : **la seconde écrase la
première, sans erreur, sans trace, et sans que personne l'apprenne**. Prouvé sur
PostgreSQL réel.

Le détail et les quatre options :
[`../architecture/concurrence-ecritures.md`](../architecture/concurrence-ecritures.md).

Ma recommandation : **verrou optimiste sur `updated_at`**. C'est la seule option
qui supprime le caractère *silencieux* pour un coût contenu, et elle ne demande
**aucune migration** — la colonne et son trigger existent déjà.

Réponds-moi juste par le numéro d'option, j'implémente.

---

# B4 — `notify-email` (≈ 20 min)

### 1. La fonction est-elle déployée ?

Dashboard → **Edge Functions**. Chercher `notify-email`, noter sa date de
déploiement.

### 2. Les variables sont-elles là ?

**Edge Functions → notify-email → Secrets** (ou Settings → Edge Functions).
Vérifier `RESEND_API_KEY` et `EMAIL_FROM`.

> ⚠️ **Le piège principal.** Sans `RESEND_API_KEY`, la fonction bascule en
> « envoi simulé » : elle répond `ok: true` **sans envoyer aucun e-mail**. Tout
> paraît fonctionner de bout en bout. C'est exactement pourquoi il faut
> confirmer la réception, jamais se fier au code HTTP.

### 3. Test réel

Déclencher une validation humaine (HITL) sur un nœud dont
`notification_channels.email` pointe une boîte que tu peux ouvrir, et
**confirmer la réception**.

### 4. Le cas que je viens de corriger

Refuser la validation, relancer le nœud, le remettre en attente : **un second
e-mail doit arriver**. Avant mon correctif, la clé d'idempotence ignorait
l'occurrence et le second envoi était supprimé — le nœud ne prévenait plus
personne. Ce correctif n'a jamais été vérifié de bout en bout.

### 5. À me renvoyer

Déployée oui/non, variables présentes oui/non, e-mail reçu oui/non, second
e-mail reçu oui/non.

Reste aussi à trancher **A6** : la fonction peut envoyer un doublon si deux
invocations concurrentes portent la même clé (`SELECT` → envoi → `INSERT`).
Correction spécifiée dans [`../security/notify-email-audit.md`](../security/notify-email-audit.md),
non appliquée : sans Deno je ne peux ni l'exécuter ni la déployer. Dis-moi si tu
peux tester la fonction après modification, ou si tu acceptes une modification
non exécutée.

---

# Récapitulatif de ce que j'attends

| | Réponse attendue |
|---|---|
| **B1** | sorties de R1 et R4 |
| **B2** | sortie de `npm run test:e2e:connected` |
| **B3** | un numéro d'option |
| **B4** | quatre oui/non + ta réponse sur A6 |

Rien ne dépend de l'ordre sauf B1, qui débloque la fusion à lui seul.
