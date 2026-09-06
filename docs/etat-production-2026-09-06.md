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
> **Reliquats nettoyés le 2026-09-06** : `srv1017182` a été remise dans son état antérieur —
> le `dist/` d'origine restauré depuis son archive, l'archive supprimée du même geste, et
> `/tmp/orga-sonde-transfert.html` effacé. Aucune trace ajoutée sur cette machine.

---

## 2. Ce qui est en ligne, et depuis quand

| | |
|---|---|
| URL | `https://organigrad.nouvelleeredigital.fr` → **200** |
| Bundle servi | `assets/index-CBOIH-W8.js`, **95 704 octets**, HTTP 200 depuis l'extérieur |
| Déployé le | 2026-09-06, par `scripts/deploy-front.sh` (§2 bis) |
| Répertoire servi | **37 fichiers, 3,5 Mo** — exactement le contenu du build, depuis la synchronisation |
| Archives de retour arrière | `dist-avant-20260905` (bundle du 27/08) · `dist-avant-20260906` (bundle intermédiaire du 06/09) |

**Quatre correctifs sont désormais en ligne**, vérifiés dans le bundle servi :

| Marqueur cherché | Ce qu'il prouve |
|---|---|
| `p_expected_updated_at` | le code appelle `import_org_agents` en **6 paramètres**, en accord avec la base |
| `rattachement_external_key` | l'import **transmet la hiérarchie** du fichier |
| `hint` | `describeError` lit les erreurs supabase-js au lieu d'afficher `[object Object]` |
| mise à `null` de `rattachement_id` avant suppression | la **suppression en masse** ne bute plus sur le trigger `BEFORE DELETE` |

---

## 2 bis. Comment déployer, depuis le 2026-09-06

`bash scripts/deploy-front.sh` — à lancer depuis le dépôt, poste connecté au VPS.

Il remplace le `scp -r` employé jusque-là, qui **ajoutait sans jamais retirer** : trois
déploiements successifs avaient laissé trois bundles `index-*.js` dans le répertoire servi,
dont un seul référencé — **66 fichiers et 5,8 Mo** là où le build en produit **37 et 3,5 Mo**.
La synchronisation du 06/09 a ramené le répertoire à l'exact contenu du build.

Ce que le script fait, et pourquoi :

1. **contrôles locaux** — `dist/` présent, bundle référencé, et surtout **présence du marqueur
   `p_expected_updated_at`** : sans lui, on redéploierait un build antérieur à la migration du
   03/09, et l'import recasserait. C'est arrivé, trois jours durant ;
2. **archivage** de ce qui est servi, en `dist-avant-AAAAMMJJ` ;
3. **téléversement dans un répertoire de transit**, puis `rsync -a --delete-after` **côté
   serveur** — `rsync` n'existe pas sur le poste Windows, mais il est sur le VPS ;
4. **vérification depuis l'extérieur**, pas depuis la machine : le script échoue si le domaine
   public ne sert pas le bundle attendu.

> **Pourquoi la synchronisation se fait EN PLACE et non par échange de répertoires**, qui serait
> pourtant plus atomique : le conteneur monte `/opt/organigrad-front/dist` en **bind**.
> Remplacer le répertoire changerait son inode, le montage continuerait de pointer sur l'ancien,
> et nginx servirait indéfiniment la version précédente.

`--delete-after` plutôt que `--delete` : les anciens fichiers ne disparaissent qu'une fois les
nouveaux en place. Un navigateur ayant chargé l'ancien `index.html` peut encore réclamer son
bundle — il le trouvera jusqu'au déploiement suivant, pas au-delà.

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

Et un défaut trouvé le 2026-09-05, **corrigé le 06/09** :

- ~~La suppression en masse échoue dès qu'un organigramme a une hiérarchie.~~ Le trigger
  `org_agents_reparent_children` est un `BEFORE DELETE FOR EACH ROW` : sur une suppression de
  masse, il modifiait une ligne que la même commande supprimait → `27000`, et **rien n'était
  supprimé**. `clearWorkspace` coupe désormais les rattachements avant de supprimer, ce qui
  laisse le trigger sans enfant à réaffecter. Correction **côté application — le schéma et les
  triggers ne sont pas touchés**, et l'adoption par le grand-parent reste intacte pour les
  suppressions unitaires. Prouvé sur la base réelle dans les deux sens. Détail dans
  `_e2e/PROGRESS-ORGANIGRAD.md`, élément L-82.

---

## 6. Ce qui reste vraiment, par ordre

| # | Action | Qui |
|---|---|---|
| 1 | Poser `RESEND_API_KEY` + `EMAIL_FROM`, confirmer une réception | **toi** (dashboard) |
| 2 | Activer la protection des mots de passe compromis | **toi** (dashboard) |
| 3 | Retrouver ou redéployer l'orchestrateur, ou acter qu'il n'y en a pas (§4) — tant qu'il est absent, la SPA écrit en direct et stocke le prompt système en clair | à décider |
| 4 | Recette manuelle des 4 rôles, une fois un projet de test fourni | **toi** |
| 5 | Purger les archives `dist-avant-*` devenues inutiles | quand tu veux |

**Les quatre P1 corrigeables par le code sont corrigés, vérifiés et en ligne.** Ce qui reste ne
dépend plus du dépôt : deux réglages au tableau de bord Supabase, une décision sur
l'orchestrateur, et un projet de test pour la recette des rôles.
