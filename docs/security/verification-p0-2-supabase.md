# P0-2 — Vérifier la base réellement déployée

Requêtes à exécuter dans le **SQL Editor** du dashboard Supabase, projet
`xucmfdggetwxmpquqjvj`. À faire **avant** toute nouvelle migration.

Le MCP Supabase répond `You do not have permission to perform this action` sur
`execute_sql` : la vérification ne peut pas être automatisée pour l'instant,
d'où ce document.

Chaque requête rend un **verdict** en clair — rien à interpréter à l'œil nu.
Toutes sont en lecture seule, **sauf la R4** qui écrit puis annule (voir sa
section : l'annulation est garantie, pas laissée à l'opérateur).

Ces requêtes ont été mises au point et validées sur une réplique locale du
schéma (`baseline_2026-08-03.sql` + migrations postérieures) sur PostgreSQL 16,
dans les deux états : avec et sans le correctif.

---

## R1 — Les deux RPC vulnérables sont-elles corrigées ?

C'est la question centrale : le correctif `20260812122608` est-il réellement en
place dans la base, ou seulement dans Git ?

```sql
select
    p.proname as fonction,
    case
        when pg_get_functiondef(p.oid) ilike '%coalesce(public.workspace_role_of%'
          or pg_get_functiondef(p.oid) ilike '%coalesce(workspace_role_of%'
            then '✅ CORRIGE — comparaison sure au NULL'
        when pg_get_functiondef(p.oid) ~* 'workspace_role_of\s*\([^)]*\)\s*(::[a-z_]+\s*)?not\s+in'
            then '🚨 FAILLE — NOT IN sans COALESCE, un non-membre passe'
        else '⚠️ A LIRE — forme inattendue, coller la definition ci-dessous'
    end as verdict,
    md5(pg_get_functiondef(p.oid)) as empreinte
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('create_workspace_api_key', 'invite_workspace_member')
order by p.proname;
```

**Attendu** : deux lignes, toutes deux `✅ CORRIGE`.

La colonne `empreinte` ne sert pas à comparer avec Git — la production peut
porter des écarts légitimes (schéma `extensions`, scopes par défaut). Elle sert
de **témoin dans le temps** : relever les deux valeurs à ce passage, les
consigner, et vérifier aux passages suivants qu'elles n'ont pas bougé sans
migration correspondante.

| Date | `create_workspace_api_key` | `invite_workspace_member` |
|---|---|---|
| _à remplir au 1ᵉʳ passage_ | | |

**Si `🚨 FAILLE`** : ne pas rejouer la migration à l'aveugle, appliquer
seulement `supabase/migrations/20260812122608_fix_workspace_role_of_null_bypass.sql`,
puis relancer R1 et R4.

---

## R2 — Le même motif ailleurs ?

Le plan demande de vérifier **les autres** RPC administratives. Cette requête ne
cherche pas deux noms connus : elle balaie toutes les fonctions
`SECURITY DEFINER` de `public` à la recherche d'une comparaison **négative** sur
un rôle — la forme qui rend `NULL` inoffensif et laisse passer un non-membre.

```sql
select
    p.proname as fonction,
    case
        when pg_get_functiondef(p.oid) ilike '%coalesce(%workspace_role_of%'
            then '✅ borne par COALESCE'
        else '🚨 A INSPECTER — comparaison negative sans COALESCE'
    end as verdict,
    substring(pg_get_functiondef(p.oid) from '(?i).{0,80}(not\s+in|<>|!=).{0,80}') as extrait
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.prosecdef
  and pg_get_functiondef(p.oid) ~* '(workspace_role_of|has_workspace_role|is_workspace_member)'
  and pg_get_functiondef(p.oid) ~* '(not\s+in|<>|!=)'
order by 2 desc, 1;
```

**Attendu** : uniquement les deux fonctions de R1, en `✅`. Toute autre ligne est
une découverte à traiter.

Sur la réplique locale, le dépôt compte 8 fonctions `SECURITY DEFINER` et seules
ces deux-là utilisent une comparaison négative. Si la prod en renvoie
davantage, c'est qu'elle porte des fonctions absentes de Git → voir R6.

---

## R3 — Les policies RLS sont-elles sûres au NULL ?

Une policy qui refuse par `NOT IN` / `<>` souffrirait du même défaut : `NULL`
n'y déclenche pas le refus attendu.

```sql
select
    tablename, policyname, cmd,
    '🚨 comparaison negative dans une policy' as verdict,
    coalesce(qual, '') || ' | ' || coalesce(with_check, '') as expression
from pg_policies
where schemaname = 'public'
  and (coalesce(qual, '') || coalesce(with_check, '')) ~* '(not\s+in|<>|!=)'
order by tablename, policyname;
```

**Attendu : aucune ligne.** Les policies doivent comparer positivement
(`= any (array[...])`, `= 'owner'`), forme sous laquelle `NULL` donne `NULL`,
que la RLS traite comme un refus.

---

## R4 — Preuve comportementale (écrit puis annule)

R1 lit du texte ; R4 tente réellement l'attaque. C'est la seule requête qui
prouve le comportement plutôt que la forme.

**Sûreté** : tout se passe dans un bloc `DO`, donc dans une seule instruction
atomique, et le bloc se **termine toujours par une exception**. Une instruction
qui échoue est intégralement annulée par PostgreSQL : rien de ce qui a pu être
inséré ne subsiste, quel que soit le réglage d'auto-commit de l'éditeur.
L'annulation ne dépend donc pas de l'opérateur.

**Le résultat s'affiche comme une erreur SQL** : c'est voulu — c'est le prix de
l'annulation garantie. Lire le message, pas le fait qu'il soit rouge.

```sql
do $$
declare
    v_ws      uuid;
    v_uid     uuid;
    v_cle     text := 'refus';
    v_inv     text := 'refus';
begin
    -- Un utilisateur réel qui n'est PAS membre d'un workspace réel.
    -- (Un UUID inventé ne conviendrait pas : la FK created_by → auth.users
    --  ferait échouer l'insertion pour une raison sans rapport, et on
    --  conclurait à tort au refus.)
    select w.id, u.id into v_ws, v_uid
      from public.workspaces w
      cross join auth.users u
     where not exists (
        select 1 from public.workspace_members m
         where m.workspace_id = w.id and m.user_id = u.id)
     limit 1;

    if v_ws is null then
        raise exception E'\n\n⚠️  NON TESTABLE : aucun couple (utilisateur, workspace) sans lien.\n'
            'Creer un second compte, ou un second workspace, puis relancer.\n';
    end if;

    -- On endosse cet utilisateur : auth.uid() lit ce reglage.
    perform set_config('request.jwt.claim.sub', v_uid::text, true);

    begin
        perform * from public.create_workspace_api_key(v_ws, 'verification-p0-2');
        v_cle := '🚨 REUSSI — un non-membre a cree une cle API';
    exception when others then
        v_cle := '✅ refuse (' || sqlerrm || ')';
    end;

    begin
        perform * from public.invite_workspace_member(v_ws, 'verification-p0-2@invalid');
        v_inv := '🚨 REUSSI — un non-membre a invite dans ce workspace';
    exception when others then
        v_inv := '✅ refuse (' || sqlerrm || ')';
    end;

    -- Exception finale : porte le verdict ET garantit l'annulation.
    raise exception E'\n\n===== VERDICT P0-2 =====\n'
        'workspace teste : %\n'
        'utilisateur non membre : %\n'
        'create_workspace_api_key : %\n'
        'invite_workspace_member  : %\n'
        '(transaction annulee — aucune cle ni invitation creee)\n',
        v_ws, v_uid, v_cle, v_inv;
end $$;
```

**Attendu** : les deux lignes en `✅ refuse (forbidden)`.

Tout `🚨 REUSSI` signifie que la faille est **ouverte en production** : la
corriger avant toute autre chose.

---

## R5 — Historique des migrations : Git ↔ base

```sql
with git(version, nom) as (values
    ('20260617120000', 'init_schema'),
    ('20260617130000', 'rls'),
    ('20260617140000', 'notifications_idempotency'),
    ('20260618000000', 'reconcile_p2_p5_api_key_scopes_and_idempotency'),
    ('20260618130000', 'audit_log'),
    ('20260621120000', 'lock_node_status_client_writes'),
    ('20260622120000', 'parent_same_workspace'),
    ('20260803120000', 'org_agents'),
    ('20260803120100', 'org_agents_rls'),
    ('20260803120200', 'org_agents_import_rpc'),
    ('20260803120300', 'rls_execute_grants'),
    ('20260805150000', 'fix_invite_workspace_member_ambiguous_expires_at'),
    ('20260805150100', 'fix_accept_workspace_invitation_ambiguous_workspace_id'),
    ('20260805150200', 'fix_inv_read_by_email_no_auth_users'),
    ('20260811090000', 'hybrid_nodes_external_source'),
    ('20260812122608', 'fix_workspace_role_of_null_bypass'),
    ('20260812122625', 'optimize_rls_wrap_auth_calls'),
    ('20260812122635', 'add_missing_foreign_key_indexes')
)
select
    coalesce(g.version, b.version) as version,
    coalesce(g.nom, b.name)        as nom,
    case
        when b.version is null then '⬜ dans Git, PAS appliquee en base'
        when g.version is null then '🚨 appliquee en base, ABSENTE de Git'
        else '✅ des deux cotes'
    end as etat
from git g
full outer join supabase_migrations.schema_migrations b on b.version = g.version
order by 1;
```

**Forme attendue**, telle que mesurée sur la réplique locale : les **7**
migrations antérieures au 2026-08-03 en `⬜`, les **11** postérieures en `✅`.

**Lecture.** `⬜` n'est pas forcément une anomalie : les migrations antérieures
au 2026-08-03 ne sont pas rejouables et le provisionnement passe par
`supabase/schema/baseline_2026-08-03.sql` (cf. `supabase/migrations/README.md`).
Ce qui compte :

- **`20260812122608` doit être `✅`** — c'est le correctif de sécurité ;
- tout **`🚨`** est une migration appliquée hors dépôt, à rapatrier dans Git.

Si la requête échoue sur `supabase_migrations.schema_migrations` (schéma
inaccessible depuis le rôle du SQL Editor), c'est en soi une information : le
suivi des migrations n'est pas lisible, le remonter avec le message d'erreur.

---

## R6 — Inventaire à comparer hors ligne

Le reste de la synchronisation Git ↔ base (objets créés hors dépôt) se compare
mieux hors ligne, contre la réplique locale du schéma versionné.

```sql
select 'table'    as genre, tablename  as objet from pg_tables    where schemaname = 'public'
union all
select 'vue',                viewname            from pg_views     where schemaname = 'public'
union all
select 'fonction',           p.proname || case when p.prosecdef then ' [definer]' else '' end
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'
union all
select 'type',               t.typname
  from pg_type t join pg_namespace n on n.oid = t.typnamespace
 where n.nspname = 'public' and t.typtype = 'e'
union all
select 'policy',             tablename || ' :: ' || policyname from pg_policies where schemaname = 'public'
order by 1, 2;
```

Exporter le résultat en CSV (bouton *Download CSV* du SQL Editor), puis :

```bash
node scripts/diff-schema.mjs export-prod.csv
```

Le script compare à `inventaire-schema-reference.csv`, dans ce même dossier :
**54 objets** relevés sur la réplique locale du schéma versionné. Il distingue
les objets **présents en base et absents du dépôt** (la dérive à rapatrier) de
ceux **présents dans le dépôt et absents de la base** (code mort, ou migration
jamais appliquée), et sort en code 1 dès qu'il trouve un écart — utilisable tel
quel dans un contrôle automatisé.

> Un `diff` de shell ne convient pas ici : le SQL Editor entoure de guillemets
> toute valeur contenant une virgule, ce que font les noms de policies
> (`table :: nom`). Le script gère ce cas.

---

## Ce qu'on note après coup

Consigner dans `docs/security/` : date, verdicts R1→R5, et pour chaque
divergence R5/R6 soit la migration de réconciliation créée, soit la raison
explicite de la laisser. Sans cette trace, l'écart se reforme sans se voir — ce
qui est précisément ce que P0-2 cherche à arrêter.
