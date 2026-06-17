import { useCallback, useEffect, useMemo, useState } from 'react';
import { Copy, UserPlus, UserMinus, Mail, X as XIcon } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useSession } from '../../hooks/useSession';
import { useWorkspaceContext } from '../../contexts/WorkspaceContext';
import { Button, FormField, Input, Select, Surface } from '../../design/ui';
import { cx } from '../../design/cx';
import type { WorkspaceRole } from '../../types/supabase';

/**
 * MembersView — gestion des membres et invitations d'un workspace.
 *
 *   - Liste des membres actuels (depuis `workspace_members_view`)
 *   - Liste des invitations en attente
 *   - Formulaire d'invitation (owner/admin uniquement)
 *   - Lien d'invitation copiable, révocation
 *   - Changement de rôle (owner/admin uniquement, jamais l'owner)
 *   - Suppression d'un membre / quitter le workspace
 */

interface MemberRow {
    user_id: string;
    email: string | null;
    display_name: string | null;
    role: WorkspaceRole;
    created_at: string;
}

interface InvitationRow {
    id: string;
    email: string;
    role: WorkspaceRole;
    token: string;
    expires_at: string;
    created_at: string;
}

const ROLES: WorkspaceRole[] = ['admin', 'member', 'viewer'];

export function MembersView() {
    const { session } = useSession();
    const { activeId, activeWorkspace } = useWorkspaceContext();
    const userId = session?.user.id ?? null;
    const role = activeWorkspace?.role ?? 'viewer';
    const isAdmin = role === 'owner' || role === 'admin';

    const [members, setMembers] = useState<MemberRow[]>([]);
    const [invitations, setInvitations] = useState<InvitationRow[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [inviteEmail, setInviteEmail] = useState('');
    const [inviteRole, setInviteRole] = useState<WorkspaceRole>('member');
    const [creating, setCreating] = useState(false);
    const [revealed, setRevealed] = useState<{ url: string; email: string } | null>(null);

    const refresh = useCallback(async () => {
        if (!supabase || !activeId) return;
        setLoading(true);
        const [m, i] = await Promise.all([
            supabase
                .from('workspace_members_view')
                .select('*')
                .eq('workspace_id', activeId)
                .order('created_at', { ascending: true }),
            supabase
                .from('workspace_invitations')
                .select('id, email, role, token, expires_at, created_at')
                .eq('workspace_id', activeId)
                .is('accepted_at', null)
                .is('revoked_at', null)
                .gt('expires_at', new Date().toISOString())
                .order('created_at', { ascending: false }),
        ]);
        if (m.error) setError(m.error.message);
        if (i.error) setError(i.error.message);
        const filteredMembers: MemberRow[] = ((m.data ?? []) as Array<{
            user_id: string | null;
            email: string | null;
            display_name: string | null;
            role: WorkspaceRole | null;
            created_at: string | null;
        }>)
            .filter((r) => r.user_id && r.role && r.created_at)
            .map((r) => ({
                user_id: r.user_id!,
                email: r.email,
                display_name: r.display_name,
                role: r.role!,
                created_at: r.created_at!,
            }));
        setMembers(filteredMembers);
        setInvitations((i.data ?? []) as InvitationRow[]);
        setLoading(false);
    }, [activeId]);

    useEffect(() => {
        // Chargement initial déféré (les setState de refresh s'exécutent dans un
        // callback async, pas synchroniquement dans le corps de l'effet).
        let active = true;
        void Promise.resolve().then(() => {
            if (active) void refresh();
        });
        return () => {
            active = false;
        };
    }, [refresh]);

    const ownerId = useMemo(
        () => members.find((m) => m.role === 'owner')?.user_id ?? null,
        [members],
    );

    const buildInviteUrl = (token: string) =>
        `${window.location.origin}/?invite=${encodeURIComponent(token)}`;

    const handleInvite = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!supabase || !activeId) return;
        setCreating(true);
        setError(null);
        const { data, error: err } = await supabase.rpc('invite_workspace_member', {
            p_workspace_id: activeId,
            p_email: inviteEmail.trim(),
            p_role: inviteRole,
        });
        setCreating(false);
        if (err) {
            setError(err.message);
            return;
        }
        const row = Array.isArray(data) ? data[0] : data;
        if (row?.token) {
            setRevealed({ url: buildInviteUrl(row.token), email: inviteEmail.trim() });
        }
        setInviteEmail('');
        setInviteRole('member');
        await refresh();
    };

    const handleRevoke = async (id: string) => {
        if (!supabase) return;
        if (!confirm('Révoquer cette invitation ?')) return;
        const { error: err } = await supabase
            .from('workspace_invitations')
            .update({ revoked_at: new Date().toISOString() })
            .eq('id', id);
        if (err) setError(err.message);
        await refresh();
    };

    const handleChangeRole = async (memberId: string, next: WorkspaceRole) => {
        if (!supabase || !activeId) return;
        const { error: err } = await supabase
            .from('workspace_members')
            .update({ role: next })
            .eq('workspace_id', activeId)
            .eq('user_id', memberId);
        if (err) setError(err.message);
        await refresh();
    };

    const handleRemove = async (memberId: string) => {
        if (!supabase || !activeId) return;
        if (!confirm('Retirer ce membre du workspace ?')) return;
        const { error: err } = await supabase
            .from('workspace_members')
            .delete()
            .eq('workspace_id', activeId)
            .eq('user_id', memberId);
        if (err) setError(err.message);
        await refresh();
    };

    return (
        <div className="w-full overflow-y-auto px-12 py-12 pb-32">
            <div className="mx-auto max-w-4xl space-y-8">
                <header>
                    <p className="eyebrow">Workspace · {activeWorkspace?.name}</p>
                    <h1 className="t-h1 mt-2">Membres.</h1>
                    <p className="t-body mt-2 max-w-2xl">
                        Invite des collaborateurs, attribue-leur un rôle, ou retire l'accès. Les
                        invitations expirent automatiquement après 14 jours.
                    </p>
                </header>

                {revealed && (
                    <Surface
                        className="p-5"
                        style={{
                            background: 'rgba(0,113,227,0.04)',
                            boxShadow: 'inset 0 0 0 1px rgba(0,113,227,0.25)',
                        }}
                    >
                        <p
                            className="text-[11px] font-semibold uppercase"
                            style={{ color: 'var(--accent)', letterSpacing: '0.14em' }}
                        >
                            Invitation créée · {revealed.email}
                        </p>
                        <div className="mt-3 flex items-center gap-2">
                            <code
                                className="flex-1 truncate rounded-md px-3 py-2 font-mono text-[12px]"
                                style={{ background: 'var(--bg-page)', color: 'var(--fg-1)' }}
                            >
                                {revealed.url}
                            </code>
                            <button
                                type="button"
                                onClick={() => void navigator.clipboard.writeText(revealed.url)}
                                className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-medium text-white"
                                style={{ background: 'var(--accent)' }}
                            >
                                <Copy size={12} strokeWidth={1.8} />
                                Copier
                            </button>
                        </div>
                        <p className="mt-3 text-[12px]" style={{ color: 'var(--fg-3)' }}>
                            Envoie ce lien à {revealed.email}. L'invitation expire dans 14 jours.
                        </p>
                        <div className="mt-3">
                            <Button
                                tone="slate"
                                variant="ghost"
                                size="sm"
                                onClick={() => setRevealed(null)}
                            >
                                Fermer
                            </Button>
                        </div>
                    </Surface>
                )}

                {isAdmin && (
                    <Surface className="p-6">
                        <form onSubmit={handleInvite} className="flex flex-col gap-3 sm:flex-row sm:items-end">
                            <div className="flex-1">
                                <FormField label="Email">
                                    <Input
                                        type="email"
                                        required
                                        value={inviteEmail}
                                        onChange={(e) => setInviteEmail(e.target.value)}
                                        placeholder="alice@exemple.fr"
                                    />
                                </FormField>
                            </div>
                            <div className="w-full sm:w-40">
                                <FormField label="Rôle">
                                    <Select
                                        value={inviteRole}
                                        onChange={(e) => setInviteRole(e.target.value as WorkspaceRole)}
                                    >
                                        {ROLES.map((r) => (
                                            <option key={r} value={r}>
                                                {r}
                                            </option>
                                        ))}
                                    </Select>
                                </FormField>
                            </div>
                            <Button tone="blue" type="submit" disabled={creating || !inviteEmail.trim()}>
                                <UserPlus size={13} strokeWidth={1.6} />
                                Inviter
                            </Button>
                        </form>
                    </Surface>
                )}

                {error && (
                    <p className="text-[12px]" style={{ color: 'var(--system-red)' }}>
                        {error}
                    </p>
                )}

                <Surface className="overflow-hidden">
                    <div
                        className="px-5 py-3"
                        style={{ borderBottom: '1px solid var(--hairline)' }}
                    >
                        <p
                            className="text-[11px] font-semibold uppercase"
                            style={{ color: 'var(--fg-4)', letterSpacing: '0.14em' }}
                        >
                            Membres actifs · {members.length}
                        </p>
                    </div>
                    {loading && members.length === 0 ? (
                        <div className="p-8 text-center text-[13px]" style={{ color: 'var(--fg-3)' }}>
                            Chargement…
                        </div>
                    ) : members.length === 0 ? (
                        <div className="p-8 text-center text-[13px]" style={{ color: 'var(--fg-3)' }}>
                            Aucun membre.
                        </div>
                    ) : (
                        <ul>
                            {members.map((m) => {
                                const isSelf = m.user_id === userId;
                                const isOwner = m.user_id === ownerId;
                                const canModify = isAdmin && !isOwner;
                                return (
                                    <li
                                        key={m.user_id}
                                        className="flex items-center gap-4 px-5 py-4"
                                        style={{ borderBottom: '1px solid var(--hairline)' }}
                                    >
                                        <div
                                            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold"
                                            style={{
                                                background: 'var(--bg-secondary)',
                                                color: 'var(--fg-2)',
                                            }}
                                        >
                                            {(m.display_name || m.email || '?').slice(0, 1).toUpperCase()}
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <p
                                                className="truncate text-[14px] font-semibold"
                                                style={{ color: 'var(--fg-1)' }}
                                            >
                                                {m.display_name || m.email || m.user_id.slice(0, 8)}
                                                {isSelf && (
                                                    <span
                                                        className="ml-2 text-[10px] font-medium uppercase"
                                                        style={{
                                                            color: 'var(--fg-4)',
                                                            letterSpacing: '0.14em',
                                                        }}
                                                    >
                                                        (vous)
                                                    </span>
                                                )}
                                            </p>
                                            <p className="text-[12px]" style={{ color: 'var(--fg-3)' }}>
                                                {m.email ?? '—'}
                                            </p>
                                        </div>
                                        {canModify ? (
                                            <Select
                                                value={m.role}
                                                onChange={(e) =>
                                                    void handleChangeRole(
                                                        m.user_id,
                                                        e.target.value as WorkspaceRole,
                                                    )
                                                }
                                                className="w-32 text-[12px]"
                                            >
                                                {ROLES.map((r) => (
                                                    <option key={r} value={r}>
                                                        {r}
                                                    </option>
                                                ))}
                                            </Select>
                                        ) : (
                                            <span
                                                className={cx(
                                                    'rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase',
                                                )}
                                                style={{
                                                    background: isOwner
                                                        ? 'rgba(0,113,227,0.1)'
                                                        : 'var(--bg-secondary)',
                                                    color: isOwner ? 'var(--accent)' : 'var(--fg-3)',
                                                    letterSpacing: '0.14em',
                                                }}
                                            >
                                                {m.role}
                                            </span>
                                        )}
                                        {canModify && (
                                            <button
                                                type="button"
                                                onClick={() => void handleRemove(m.user_id)}
                                                className="inline-flex h-8 w-8 items-center justify-center rounded-full"
                                                style={{
                                                    color: 'var(--system-red)',
                                                    background: 'rgba(255,59,48,0.06)',
                                                }}
                                                title="Retirer du workspace"
                                            >
                                                <UserMinus size={14} strokeWidth={1.6} />
                                            </button>
                                        )}
                                        {isSelf && !isOwner && (
                                            <Button
                                                tone="slate"
                                                variant="soft"
                                                size="sm"
                                                onClick={() => void handleRemove(m.user_id)}
                                            >
                                                Quitter
                                            </Button>
                                        )}
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </Surface>

                <Surface className="overflow-hidden">
                    <div
                        className="px-5 py-3"
                        style={{ borderBottom: '1px solid var(--hairline)' }}
                    >
                        <p
                            className="text-[11px] font-semibold uppercase"
                            style={{ color: 'var(--fg-4)', letterSpacing: '0.14em' }}
                        >
                            Invitations en attente · {invitations.length}
                        </p>
                    </div>
                    {invitations.length === 0 ? (
                        <div className="p-8 text-center text-[13px]" style={{ color: 'var(--fg-3)' }}>
                            Aucune invitation en attente.
                        </div>
                    ) : (
                        <ul>
                            {invitations.map((inv) => (
                                <li
                                    key={inv.id}
                                    className="flex items-center gap-4 px-5 py-4"
                                    style={{ borderBottom: '1px solid var(--hairline)' }}
                                >
                                    <div
                                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
                                        style={{
                                            background: 'var(--bg-secondary)',
                                            color: 'var(--fg-3)',
                                        }}
                                    >
                                        <Mail size={15} strokeWidth={1.6} />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <p
                                            className="truncate text-[14px] font-semibold"
                                            style={{ color: 'var(--fg-1)' }}
                                        >
                                            {inv.email}
                                        </p>
                                        <p className="text-[12px]" style={{ color: 'var(--fg-3)' }}>
                                            Rôle {inv.role} · expire le{' '}
                                            {new Date(inv.expires_at).toLocaleDateString('fr-FR')}
                                        </p>
                                    </div>
                                    {isAdmin && (
                                        <>
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    void navigator.clipboard.writeText(
                                                        buildInviteUrl(inv.token),
                                                    )
                                                }
                                                className="inline-flex h-8 items-center gap-1 rounded-full px-3 text-[11px] font-medium"
                                                style={{
                                                    background: 'var(--bg-secondary)',
                                                    color: 'var(--fg-1)',
                                                }}
                                                title="Copier le lien d'invitation"
                                            >
                                                <Copy size={11} strokeWidth={1.8} />
                                                Lien
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => void handleRevoke(inv.id)}
                                                className="inline-flex h-8 w-8 items-center justify-center rounded-full"
                                                style={{
                                                    color: 'var(--system-red)',
                                                    background: 'rgba(255,59,48,0.06)',
                                                }}
                                                title="Révoquer"
                                            >
                                                <XIcon size={14} strokeWidth={1.6} />
                                            </button>
                                        </>
                                    )}
                                </li>
                            ))}
                        </ul>
                    )}
                </Surface>
            </div>
        </div>
    );
}
