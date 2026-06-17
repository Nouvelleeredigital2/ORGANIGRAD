import { useCallback, useEffect, useState } from 'react';
import { Copy, Key as KeyIcon, Trash2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useWorkspaceContext } from '../../contexts/WorkspaceContext';
import { Button, FormField, Input, Surface } from '../../design/ui';
import { cx } from '../../design/cx';

/**
 * ApiKeysView — gestion des clés API par workspace.
 *
 * Création : appel RPC `create_workspace_api_key` qui renvoie le raw_key
 * (affiché UNE SEULE FOIS dans une bannière, copiable). Le hash seul est
 * stocké en DB. Révocation = update revoked_at = now(). Pas de delete (audit).
 */

interface ApiKeyRow {
    id: string;
    name: string;
    key_prefix: string;
    created_at: string;
    last_used_at: string | null;
    revoked_at: string | null;
}

export function ApiKeysView() {
    const { activeId, activeWorkspace } = useWorkspaceContext();
    const [keys, setKeys] = useState<ApiKeyRow[]>([]);
    const [loading, setLoading] = useState(false);
    const [newKeyName, setNewKeyName] = useState('');
    const [creating, setCreating] = useState(false);
    const [revealedKey, setRevealedKey] = useState<{ raw: string; name: string } | null>(null);
    const [error, setError] = useState<string | null>(null);

    const isAdmin = activeWorkspace?.role === 'owner' || activeWorkspace?.role === 'admin';

    const refresh = useCallback(async () => {
        if (!supabase || !activeId) {
            setKeys([]);
            return;
        }
        setLoading(true);
        const { data, error: err } = await supabase
            .from('workspace_api_keys')
            .select('id, name, key_prefix, created_at, last_used_at, revoked_at')
            .eq('workspace_id', activeId)
            .order('created_at', { ascending: false });
        if (err) setError(err.message);
        else setKeys(data ?? []);
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

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!supabase || !activeId || !newKeyName.trim()) return;
        setCreating(true);
        setError(null);
        const { data, error: err } = await supabase.rpc('create_workspace_api_key', {
            p_workspace_id: activeId,
            p_name: newKeyName.trim(),
        });
        setCreating(false);
        if (err) {
            setError(err.message);
            return;
        }
        const row = Array.isArray(data) ? data[0] : data;
        if (row?.raw_key) {
            setRevealedKey({ raw: row.raw_key, name: newKeyName.trim() });
        }
        setNewKeyName('');
        await refresh();
    };

    const handleRevoke = async (id: string) => {
        if (!supabase || !confirm('Révoquer cette clé ? Les agents qui l\'utilisent seront déconnectés.')) {
            return;
        }
        const { error: err } = await supabase
            .from('workspace_api_keys')
            .update({ revoked_at: new Date().toISOString() })
            .eq('id', id);
        if (err) setError(err.message);
        await refresh();
    };

    return (
        <div className="w-full overflow-y-auto px-12 py-12 pb-32">
            <div className="mx-auto max-w-4xl space-y-8">
                <div>
                    <p className="eyebrow">Workspace · {activeWorkspace?.name}</p>
                    <h1 className="t-h1 mt-2">Clés API.</h1>
                    <p className="t-body mt-2 max-w-2xl">
                        Une clé d'API authentifie un agent ou un service externe auprès de l'orchestrateur
                        Organigrad. Le token complet n'est affiché qu'une seule fois à la création — copie-le
                        immédiatement.
                    </p>
                </div>

                {revealedKey && (
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
                            Nouvelle clé · {revealedKey.name}
                        </p>
                        <div className="mt-3 flex items-center gap-2">
                            <code
                                className="flex-1 truncate rounded-md px-3 py-2 font-mono text-[12px]"
                                style={{ background: 'var(--bg-page)', color: 'var(--fg-1)' }}
                            >
                                {revealedKey.raw}
                            </code>
                            <button
                                type="button"
                                onClick={() => void navigator.clipboard.writeText(revealedKey.raw)}
                                className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-medium text-white"
                                style={{ background: 'var(--accent)' }}
                            >
                                <Copy size={12} strokeWidth={1.8} />
                                Copier
                            </button>
                        </div>
                        <p className="mt-3 text-[12px]" style={{ color: 'var(--fg-3)' }}>
                            Stocke-la dans le coffre de ton agent. Une fois cette bannière fermée, tu ne
                            pourras plus la récupérer.
                        </p>
                        <div className="mt-3">
                            <Button
                                tone="slate"
                                variant="ghost"
                                size="sm"
                                onClick={() => setRevealedKey(null)}
                            >
                                J'ai copié la clé
                            </Button>
                        </div>
                    </Surface>
                )}

                {isAdmin && (
                    <Surface className="p-6">
                        <form onSubmit={handleCreate} className="flex flex-col gap-3 sm:flex-row sm:items-end">
                            <div className="flex-1">
                                <FormField label="Nom de la clé">
                                    <Input
                                        value={newKeyName}
                                        onChange={(e) => setNewKeyName(e.target.value)}
                                        placeholder="Production agent · Rédacteur"
                                        required
                                    />
                                </FormField>
                            </div>
                            <Button tone="blue" type="submit" disabled={creating || !newKeyName.trim()}>
                                <KeyIcon size={13} strokeWidth={1.6} />
                                Créer la clé
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
                    {loading && keys.length === 0 ? (
                        <div className="p-8 text-center text-[13px]" style={{ color: 'var(--fg-3)' }}>
                            Chargement…
                        </div>
                    ) : keys.length === 0 ? (
                        <div className="p-8 text-center text-[13px]" style={{ color: 'var(--fg-3)' }}>
                            Aucune clé pour ce workspace.
                        </div>
                    ) : (
                        <ul>
                            {keys.map((k) => (
                                <li
                                    key={k.id}
                                    className={cx(
                                        'flex items-center gap-4 px-5 py-4',
                                        k.revoked_at && 'opacity-60',
                                    )}
                                    style={{ borderBottom: '1px solid var(--hairline)' }}
                                >
                                    <div
                                        className="flex h-9 w-9 items-center justify-center rounded-[10px]"
                                        style={{
                                            background: 'var(--bg-secondary)',
                                            color: 'var(--fg-3)',
                                        }}
                                    >
                                        <KeyIcon size={16} strokeWidth={1.6} />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <p
                                            className="truncate text-[14px] font-semibold"
                                            style={{ color: 'var(--fg-1)' }}
                                        >
                                            {k.name}
                                        </p>
                                        <p
                                            className="font-mono text-[11px]"
                                            style={{ color: 'var(--fg-4)' }}
                                        >
                                            {k.key_prefix}… ·{' '}
                                            {new Date(k.created_at).toLocaleDateString('fr-FR')}
                                            {k.last_used_at &&
                                                ` · utilisée le ${new Date(k.last_used_at).toLocaleDateString('fr-FR')}`}
                                        </p>
                                    </div>
                                    {k.revoked_at ? (
                                        <span
                                            className="rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase"
                                            style={{
                                                background: 'var(--bg-secondary)',
                                                color: 'var(--fg-4)',
                                                letterSpacing: '0.14em',
                                            }}
                                        >
                                            Révoquée
                                        </span>
                                    ) : isAdmin ? (
                                        <button
                                            type="button"
                                            onClick={() => void handleRevoke(k.id)}
                                            className="inline-flex h-8 w-8 items-center justify-center rounded-full"
                                            style={{
                                                color: 'var(--system-red)',
                                                background: 'rgba(255,59,48,0.06)',
                                            }}
                                            title="Révoquer"
                                        >
                                            <Trash2 size={14} strokeWidth={1.6} />
                                        </button>
                                    ) : null}
                                </li>
                            ))}
                        </ul>
                    )}
                </Surface>
            </div>
        </div>
    );
}
