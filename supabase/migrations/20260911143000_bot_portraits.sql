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
