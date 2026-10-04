-- Liaison opaque entre un ProjectRef Synapse et le projet OrganiGrad portant
-- exactement le meme UUID. Les donnees metier restent dans OrganiGrad.

create table if not exists public.synapse_project_links (
    project_id uuid primary key,
    workspace_id uuid not null,
    synapse_workspace_id text not null check (length(synapse_workspace_id) between 1 and 160),
    idempotency_key text not null unique check (length(idempotency_key) between 1 and 500),
    -- Référence de reçu : elle doit survivre à une suppression ultérieure du compte.
    created_by uuid not null,
    created_at timestamptz not null default now(),
    foreign key (workspace_id, project_id)
        references public.projects(workspace_id, id) on delete cascade
);

-- Une ligne existe pour chaque droit demande par Synapse. membership_created
-- distingue une adhesion preexistante d'une adhesion ajoutee par le pont : un
-- retrait ne doit jamais supprimer un membre qui appartenait deja a l'espace.
create table if not exists public.synapse_project_grants (
    project_id uuid not null references public.synapse_project_links(project_id) on delete cascade,
    workspace_id uuid not null references public.workspaces(id) on delete cascade,
    user_id uuid not null references auth.users(id) on delete cascade,
    membership_created boolean not null,
    created_at timestamptz not null default now(),
    primary key (project_id, user_id)
);

create index if not exists synapse_project_grants_membership_idx
    on public.synapse_project_grants(workspace_id, user_id);

alter table public.synapse_project_links enable row level security;
alter table public.synapse_project_grants enable row level security;
revoke all on public.synapse_project_links, public.synapse_project_grants
    from public, anon, authenticated;

comment on table public.synapse_project_links is
    'References et recus techniques Synapse ; aucun contenu metier.';
comment on column public.synapse_project_grants.membership_created is
    'True seulement si le pont Synapse a cree l adhesion workspace correspondante.';
