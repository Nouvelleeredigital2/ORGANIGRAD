# Organigrad — état réel de la production au 2026-09-06

Ce document **remplace** [`etat-production-2026-09-02.md`](etat-production-2026-09-02.md) sur
deux points devenus faux : la **machine** qui héberge la SPA, et le **chemin** du répertoire
servi. Le reste de ce document du 02/09 tient toujours.

Tout ce qui est affirmé ici a été **constaté** le 2026-09-06, jamais déduit du dépôt. Moyens :
`nslookup` sur le domaine public, `docker ps` et `docker inspect` en root sur les deux VPS,
`curl` depuis l'extérieur et depuis chaque machine, connecteur MCP Supabase `93ec54b8`
(identité confirmée par `get_project_url` → `xucmfdggetwxmpquqjvj`).

---

## 1. La correction la plus importante : la SPA a changé de machine

Le document du 02/09 situe la SPA sur **`srv1017182`** (`72.60.185.225`), conteneur monté
depuis `/home/deploy/organigrad-front/repo/dist`. **Ce n'est plus vrai.**

| | Ce que disait le 02/09 | **Constaté le 06/09** |
|---|---|---|
| Machine | `srv1017182` · `72.60.185.225` | **`srv1915630` · `195.35.2.84`** (production) |
| Conteneur | `organigrad-front` sur 1017182 | `organigrad-front` sur **1915630**, `Up`, `healthy`, `127.0.0.1:3075->80` |
| Montage | `/home/deploy/organigrad-front/repo/dist` | **`/opt/organigrad-front/dist`** → `/usr/share/nginx/html`, propriété **root** |
| Sur 1017182 | — | **le conteneur n'existe plus**, rien n'écoute sur 3075 |

`nslookup organigrad.nouvelleeredigital.fr` → **195.35.2.84**.

> ⚠️ **Le coût de cet écart, en vrai.** Le 2026-09-05, un déploiement a été fait sur
> `srv1017182` en se fiant au relevé du 02/09 : les fichiers sont partis dans un répertoire que
> plus aucun serveur ne lit. L'erreur n'a été vue qu'en interrogeant le **site public**, qui
> renvoyait encore l'ancien bundle. Vérifier la machine avant d'écrire, pas après.
>
> Reliquat à nettoyer sur `srv1017182`, sans effet mais sans usage :
> `/home/deploy/organigrad-front/repo/dist` (téléversement erroné),
> `/home/deploy/organigrad-front/repo/dist-avant-20260905` (son archive),
> `/tmp/orga-sonde-transfert.html`.

---

## 2. Ce qui est en ligne, et depuis quand

| | |
|---|---|
| URL | `https://organigrad.nouvelleeredigital.fr` → **200** |
| Bundle servi | `assets/index-CEzZZbxB.js`, **95 552 octets**, HTTP 200 depuis l'extérieur |
| Déployé le | 2026-09-06, par téléversement dans `/opt/organigrad-front/dist` |
| Archive du précédent | `/opt/organigrad-front/dist-avant-20260905` — 37 fichiers, bundle `index-wXHpLQFf.js` du 27/08 |

**Trois correctifs sont désormais en ligne**, vérifiés dans le bundle servi :

| Marqueur cherché | Ce qu'il prouve |
|---|---|
| `p_expected_updated_at` | le code appelle `import_org_agents` en **6 paramètres**, en accord avec la base |
| `rattachement_external_key` | l'import **transmet la hiérarchie** du fichier |
| `hint` | `describeError` lit les erreurs supabase-js au lieu d'afficher `[object Object]` |

---

## 3. La fenêtre de migration est refermée

Le §3 du document du 02/09 décrivait le risque d'un décalage entre la SPA servie et la
fonction `import_org_agents`. Ce décalage a **réellement eu lieu**, dans l'autre sens que celui
qu'il redoutait :

1. **2026-09-03** — la migration `20260901090000` est appliquée (connecteur MCP), la fonction
   passe à 6 paramètres. Vérifié : signature, `pg_advisory_xact_lock` présent, `execute`
   réservé à `authenticated`/`service_role`, une seule signature en base.
2. **Du 03/09 au 06/09** — la production sert encore le bundle du 27/08, à 5 paramètres :
   **l'import y est cassé** pendant trois jours, avec `PGRST202` affiché `[object Object]`.
3. **2026-09-06** — le bundle est téléversé. Code et base sont enfin d'accord.

Ce que cet épisode confirme : la phrase du 02/09, « il n'existe pas d'ordre sans fenêtre »,
était juste. Ce qui manquait, c'était de **fermer la fenêtre le jour même**.

---

## 4. L'orchestrateur ne tourne nulle part

Constaté le 06/09 : **aucun conteneur d'orchestrateur** sur `srv1915630` ni sur `srv1017182`
(`docker ps | grep -iE 'organi|orchestr'`), rien sur `127.0.0.1:3001`, et aucune réponse sur
les noms publics essayés (`orchestrator.organigrad…`, `api.organigrad…`, `organigrad-api…`).

Le document du 02/09 annonçait « Orchestrateur joignable, `GET /healthz` → 200 ». **Ce n'est
plus le cas**, ou l'URL a changé — `[À CONFIRMER]`, je n'ai pas retrouvé le point d'entrée.

Conséquence directe, la même que celle décrite par la campagne E2E : sans orchestrateur
configuré, la SPA **écrit directement en base** et y stocke le prompt système **en clair**, sans
avertissement à l'écran. Les transitions d'orchestration, elles, sont simulées et non persistées.

Ce qui tourne sur `srv1915630`, pour mémoire : `organigrad-front`, `synapse-backend`
(`10.99.0.1:4400` et `127.0.0.1:4400`), `synapse-front` (`127.0.0.1:3070`).

---

## 5. Ce qui reste, et qui n'a pas bougé depuis le 02/09

- **Les e-mails ne partent toujours pas** — `notify-email` répond `ok: true` sans rien envoyer
  tant que `RESEND_API_KEY` et `EMAIL_FROM` ne sont pas posées au tableau de bord Supabase.
- **La protection des mots de passe compromis** reste désactivée.
- **La recette manuelle des 4 rôles** reste à faire : elle suppose un projet Supabase **de
  test**, qui n'existe pas. La campagne E2E n'a couvert que le rôle `owner`.

Et un défaut nouveau, trouvé le 2026-09-05 :

- **La suppression en masse échoue dès qu'un organigramme a une hiérarchie.** Le trigger
  `org_agents_reparent_children` est un `BEFORE DELETE FOR EACH ROW` ; quand une seule
  instruction supprime un parent et ses enfants, il modifie une ligne que la commande est en
  train de supprimer → `27000`. `clearWorkspace` fait exactement cela. Supprimer feuille par
  feuille fonctionne. Correctif : passer le trigger en `AFTER DELETE`, ou supprimer des
  feuilles vers la racine. Détail dans `_e2e/PROGRESS-ORGANIGRAD.md`, élément L-82.

---

## 6. Ce qui reste vraiment, par ordre

| # | Action | Qui |
|---|---|---|
| 1 | Poser `RESEND_API_KEY` + `EMAIL_FROM`, confirmer une réception | **toi** (dashboard) |
| 2 | Activer la protection des mots de passe compromis | **toi** (dashboard) |
| 3 | Corriger L-82 (trigger `AFTER DELETE` ou ordre de suppression) | à décider |
| 4 | Retrouver ou redéployer l'orchestrateur, ou acter qu'il n'y en a pas | à décider |
| 5 | Nettoyer les reliquats sur `srv1017182` (§1) | quand tu veux |
| 6 | Recette manuelle des 4 rôles, une fois un projet de test fourni | **toi** |
