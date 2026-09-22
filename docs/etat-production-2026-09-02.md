# Organigrad — état réel de la production au 2026-09-02

Ce document **remplace** la partie « état public » et « actions restantes » de
[`reste-a-faire-production-2026-09-01.md`](reste-a-faire-production-2026-09-01.md),
qui repose sur une prémisse fausse (voir §1). Tout ce qui est affirmé ici a été
**constaté** sur la production le 2026-09-02, jamais déduit du dépôt.

Moyens utilisés : connecteur MCP Supabase `93ec54b8` (identité confirmée par
`get_project_url` → `xucmfdggetwxmpquqjvj`), sondes HTTP, terminal root sur
`srv1017182`.

---

## 1. La correction la plus importante : il n'y a plus de Vercel

Le document du 01/09 classe en **P0** « publier la SPA » parce que
`organigrad.vercel.app` renvoie 404. **Ce P0 n'existe pas.** Vercel a été
supprimé de l'infrastructure les 21-22/08 ; l'URL est morte par construction.

La SPA est en ligne sur le VPS :

| | |
|---|---|
| URL | `https://organigrad.nouvelleeredigital.fr` → **200** |
| Machine | VM 1017182 (`72.60.185.225`), enregistrement DNS `organigrad` |
| Service | conteneur `organigrad-front`, `nginx:alpine`, `127.0.0.1:3075` |
| Configuration | le bundle porte l'URL Supabase et la clé anon — **pas** de mode local |

Toute action « Vercel » du plan du 01/09 est donc sans objet. Ne pas la rejouer.

---

## 2. Ce qui est réglé et vérifié

| Sujet | Preuve |
|---|---|
| Orchestrateur joignable | `GET /healthz` → `200 {"ok":true}` |
| **CORS** | l'origine de la SPA obtient `Access-Control-Allow-Origin` ; une origine quelconque ne l'obtient pas (donc pas de joker) |
| **`APP_URL`** | pointe le domaine vivant — les liens des e-mails ne mènent plus à un 404 |
| **Faille P0-2** | R1/R2/R3 conformes et **R4 refuse réellement** un non-membre (`forbidden`) |
| **`notify-email`** | déployée, `ACTIVE`, `verify_jwt` — répond 401 au lieu de 404 |
| RLS | active sur les **10** tables, avec policies ; `workspace_members_view` en `security_invoker`, donc elle hérite de la RLS au lieu de la contourner |
| Idempotence e-mail | index unique **partiel** `notifications_idempotency_uniq` présent en base |

### Migration appliquée le 2026-09-02

`20260902100000_wrap_auth_email_in_invitation_policy` — advisor
`auth_rls_initplan`. La policy `inv read by email` réévaluait `auth.email()`
**à chaque ligne**. La migration `20260812122625` ne l'avait pas attrapée : c'est
un balayage générique dont le motif ne couvre que `auth.uid|jwt|role`.
Appliquée en base **et** versionnée, pour ne pas créer de dérive.

---

## 3. Le seul écart de schéma restant — et son ordre d'exécution

`import_org_agents` existe en production **en 5 paramètres**. La migration
`20260901090000_import_org_agents_optimistic_lock.sql` la remplace par une
version à 6 paramètres qui refuse un import périmé.

**Elle n'est pas appliquée, et l'appliquer seule casserait l'import.**

La SPA servie aujourd'hui ne contient pas `p_expected_updated_at` (vérifié dans
le bundle `assets/index-wXHpLQFf.js`) : elle appelle avec 5 arguments. Or le 6ᵉ
paramètre a une valeur par défaut, donc l'appel **résout quand même** vers la
nouvelle fonction — et tombe alors sur `import périmé` (`40001`) dès que la
source contient déjà des fiches.

> Il n'existe pas d'ordre sans fenêtre. Garder les deux surcharges serait pire :
> un appel à 5 arguments nommés deviendrait ambigu pour PostgreSQL
> (`function is not unique`). Il faut donc une coupure franche, et la faire
> courte.

**Séquence à respecter :**

1. construire la SPA depuis `master` (`npm ci && npm run build`) ;
2. téléverser `dist/` dans le répertoire servi par `organigrad-front` ;
3. appliquer `20260901090000` ;
4. recharger la SPA et tester **un import réel**.

Le répertoire servi n'a pas encore été relevé. `organigrad-front` utilise
l'image `nginx:alpine` **nue** — donc les fichiers sont montés depuis l'hôte, pas
cuits dans une image. La commande qui le donne, en root sur `srv1017182` :

```bash
docker inspect organigrad-front --format '{{range .Mounts}}{{.Source}} -> {{.Destination}}{{"\n"}}{{end}}'
```

---

## 4. Ce qui demande un accès que le connecteur MCP n'a pas

### 4.1 Les e-mails ne partent toujours pas

`notify-email` est déployée mais **sans `RESEND_API_KEY` elle répond `ok: true`
sans rien envoyer**. Le déploiement a donc rendu la panne *silencieuse* au lieu
de la supprimer — c'est un recul tant que la clé n'est pas posée.

Dashboard Supabase → **Edge Functions → Secrets** :

```
RESEND_API_KEY = (resend.com → API Keys)
EMAIL_FROM     = Organigrad <no-reply@nouvelleeredigital.fr>
```

⚠️ **Ne pas laisser `EMAIL_FROM` vide.** La valeur par défaut du code est
`no-reply@organigrad.app`, or ce domaine ne fait pas partie des domaines
possédés : Resend refuserait l'envoi.

Le compte Resend existe déjà — la zone DNS de `nouvelleeredigital.fr` porte le
DKIM `resend._domainkey` et le SPF du sous-domaine `send`, et deux autres
applications maison s'en servent.

**Contrôle de clôture** : déclencher **deux fois** la même occurrence HITL. Un
seul e-mail doit arriver, et le second appel doit répondre
`{ ok: true, deduped: true }`.

### 4.2 Protection des mots de passe compromis — désactivée

Advisor `auth_leaked_password_protection`. Supabase peut refuser les mots de
passe présents dans les fuites connues (HaveIBeenPwned) ; l'option est **off**.

Dashboard → **Authentication → Policies / Password** → activer.

---

## 5. Advisors : ce qui est accepté, et pourquoi

Tout signalement n'est pas un défaut. Ce qui suit est **délibéré** :

- **6 × `SECURITY DEFINER` exécutables par `authenticated`**
  (`workspace_role_of`, `is_workspace_member`, `has_workspace_role`,
  `create_workspace_api_key`, `invite_workspace_member`,
  `accept_workspace_invitation`). Ce sont les primitives d'autorisation : elles
  *doivent* être appelables, et elles vérifient l'appartenance elles-mêmes.
  R4 le prouve — un non-membre reçoit `forbidden`.
- **`multiple_permissive_policies` sur `workspace_invitations`** : deux façons
  légitimes de voir une invitation (l'administrateur du workspace, et la
  personne invitée). Les fusionner compliquerait la règle pour un gain nul à
  cette échelle.
- **`unused_index` (22 entrées, niveau INFO)** : conséquence attendue d'une base
  peu sollicitée, pas d'un défaut. À ne pas purger avant d'avoir un vrai trafic —
  ces index existent pour les requêtes que l'usage réel produira.

---

## 6. Ce qui reste vraiment, par ordre

| # | Action | Qui |
|---|---|---|
| 1 | Poser `RESEND_API_KEY` + `EMAIL_FROM`, confirmer une réception | **toi** (dashboard) |
| 2 | Activer la protection des mots de passe compromis | **toi** (dashboard) |
| 3 | Relever le point de montage de `organigrad-front` | toi ou moi (terminal) |
| 4 | Reconstruire et téléverser la SPA, **puis** appliquer `20260901090000` | à deux |
| 5 | Recette manuelle des 4 rôles | **toi** — voir `plans/2026-08-14-recette-manuelle-4-roles.md` |
| 6 | Tests connectés sur un projet Supabase **de test** | moi, une fois le projet fourni |

Les points 1, 2 et 5 sont les seuls qui demandent réellement une personne.
