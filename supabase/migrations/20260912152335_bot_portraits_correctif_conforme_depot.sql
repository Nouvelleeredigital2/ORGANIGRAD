-- Correctif : remplace la contrainte posee par une paraphrase par la definition
-- exacte du depot (supabase/migrations/20260911143000_bot_portraits.sql,
-- sha256 f77b80ab2d12dcca64c9376f273751e8676514df0eb05ce95a4a8a21b8eb4a9d).
-- La table bot_profiles est vide : aucun enregistrement n'est revalide.
alter table public.bot_profiles drop constraint if exists bot_profiles_avatar_url_check;

-- Additive metadata only. Existing persona identities and prompts are preserved.
alter table public.bot_profiles add column if not exists avatar_url text;
do $$
begin
    if not exists (select 1 from pg_constraint
        where conrelid = 'public.bot_profiles'::regclass and conname = 'bot_profiles_avatar_url_check') then
        alter table public.bot_profiles add constraint bot_profiles_avatar_url_check
            check (avatar_url is null or (
                length(avatar_url) <= 2048
                and avatar_url ~ '^https://[^/@[:space:]]+([/?#][^[:space:]]*)?$'
            ));
    end if;
end;
$$;
