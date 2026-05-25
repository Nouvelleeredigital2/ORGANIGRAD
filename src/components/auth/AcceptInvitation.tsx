import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Button, Surface } from '../../design/ui';

/**
 * AcceptInvitation — écran intercepteur quand l'URL contient `?invite=token`.
 *
 * Cas :
 *   - Non connecté → on stocke le token en localStorage et on redirige vers
 *     AuthScreen ; après login, le hook reprend le token et appelle l'RPC.
 *   - Connecté    → on demande confirmation puis on appelle
 *     `accept_workspace_invitation(token)`. Succès → on refresh la liste des
 *     workspaces et on bascule sur le nouveau.
 */

const PENDING_TOKEN_KEY = 'organigrad_pending_invite_token';

export function readPendingInviteToken(): string | null {
    // 1. URL ?invite=xxx
    const params = new URLSearchParams(window.location.search);
    const fromUrl = params.get('invite');
    if (fromUrl) {
        localStorage.setItem(PENDING_TOKEN_KEY, fromUrl);
        // Nettoie l'URL pour ne pas re-traiter le token après refresh
        const url = new URL(window.location.href);
        url.searchParams.delete('invite');
        window.history.replaceState({}, '', url.toString());
        return fromUrl;
    }
    // 2. localStorage (cas où le user vient juste de s'authentifier)
    return localStorage.getItem(PENDING_TOKEN_KEY);
}

export function clearPendingInviteToken() {
    localStorage.removeItem(PENDING_TOKEN_KEY);
}

interface AcceptInvitationProps {
    token: string;
    onAccepted: () => void;
    onSkip: () => void;
}

export function AcceptInvitation({ token, onAccepted, onSkip }: AcceptInvitationProps) {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [workspaceName, setWorkspaceName] = useState<string | null>(null);

    // Sondage initial : récupère le workspace de l'invitation pour l'afficher
    useEffect(() => {
        if (!supabase) return;
        let active = true;
        void supabase
            .from('workspace_invitations')
            .select('workspace_id, role, email, expires_at, workspaces(name)')
            .eq('token', token)
            .is('accepted_at', null)
            .is('revoked_at', null)
            .maybeSingle()
            .then(({ data, error: err }) => {
                if (!active) return;
                if (err) {
                    setError(err.message);
                    return;
                }
                const ws = (data as { workspaces?: { name?: string } } | null)?.workspaces;
                setWorkspaceName(ws?.name ?? null);
            });
        return () => {
            active = false;
        };
    }, [token]);

    const handleAccept = async () => {
        if (!supabase) return;
        setLoading(true);
        setError(null);
        const { error: err } = await supabase.rpc('accept_workspace_invitation', {
            p_token: token,
        });
        setLoading(false);
        if (err) {
            setError(err.message);
            return;
        }
        clearPendingInviteToken();
        onAccepted();
    };

    return (
        <div
            className="flex h-screen items-center justify-center p-4"
            style={{ background: 'var(--bg-page)' }}
        >
            <Surface className="w-full max-w-md p-8">
                <p className="eyebrow">Invitation</p>
                <h1 className="t-h2 mt-2">
                    Rejoindre{workspaceName ? ` ${workspaceName}` : ' le workspace'} ?
                </h1>
                <p className="t-body mt-3">
                    Tu as été invité à collaborer. En acceptant, tu pourras consulter et orchestrer les
                    nœuds hybrides de ce workspace selon le rôle qui t'est attribué.
                </p>
                {error && (
                    <p className="mt-3 text-[12px]" style={{ color: 'var(--system-red)' }}>
                        {error}
                    </p>
                )}
                <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                    <Button tone="slate" variant="ghost" onClick={onSkip} disabled={loading}>
                        Plus tard
                    </Button>
                    <Button tone="blue" onClick={handleAccept} disabled={loading}>
                        {loading ? 'Acceptation…' : 'Accepter l\'invitation'}
                    </Button>
                </div>
            </Surface>
        </div>
    );
}
