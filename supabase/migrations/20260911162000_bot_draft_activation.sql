-- Until a real dependency-verification flow exists, new bots remain drafts.
-- Existing enabled profiles are not rewritten or deactivated by this migration.
alter table public.bot_profiles alter column enabled set default false;

create or replace function public.guard_bot_activation() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
    if TG_OP = 'INSERT' then
        NEW.enabled := false;
    elsif NEW.enabled = true and OLD.enabled = false then
        raise exception 'activation_requires_verification' using errcode = '23514';
    end if;
    return NEW;
end;
$$;

drop trigger if exists bot_profiles_activation_guard on public.bot_profiles;
create trigger bot_profiles_activation_guard
    before insert or update on public.bot_profiles
    for each row execute function public.guard_bot_activation();
