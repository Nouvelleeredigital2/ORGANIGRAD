import { useCallback, useEffect, useMemo, useState } from 'react';
import { Bot, Link2, Loader2, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react';
import type { BotProfile } from '../../types/botProfile';
import { BOT_FAMILIES, BOT_FAMILY_LABEL, emptyBotProfile } from '../../types/botProfile';
import { BotEditor } from '../bots/BotEditor';
import { Button, Pill, Surface } from '../../design/ui';
import { useOrchestratorBridge } from '../../hooks/useOrchestratorBridge';
import { usePermissions } from '../../auth/usePermissions';
import { useFeedback } from '../../feedback/FeedbackContext';
import { messageErreurUtilisateur } from '../../utils/asyncGuard';
import { randomUuid } from '../../utils/randomId';
import type { BotBundle } from '../../services/orchestratorService';

/**
 * BotsView — création et paramétrage visuel des bots conversationnels Hermès.
 *
 * Un bot vit dans `bot_profiles` (source de vérité Organigrad). Il peut en
 * plus être représenté comme un nœud AGENT_IA dans l'organigramme (bouton
 * « Voir dans l'Orchestration ») — les deux restent des vues d'une même
 * identité, jamais deux copies divergentes du prompt (B3).
 *
 * Nécessite un orchestrateur connecté (Paramètres) : c'est lui qui compile et
 * sert les prompts, il n'y a pas de mode brouillon local pour les bots.
 */
export function BotsView() {
    const bridge = useOrchestratorBridge();
    const { can } = usePermissions();
    const feedback = useFeedback();
    const peutEcrire = can('bots:write');
    const peutSupprimer = peutEcrire && can('workspace:admin');
    const peutExporter = can('bots:export');

    const [bots, setBots] = useState<BotProfile[]>([]);
    const [loadState, setLoadState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
    const [loadError, setLoadError] = useState<string | null>(null);
    const [editorOpen, setEditorOpen] = useState(false);
    const [editingBot, setEditingBot] = useState<BotProfile | null>(null);
    const [busyId, setBusyId] = useState<string | null>(null);
    const [bundle, setBundle] = useState<BotBundle | null>(null);
    const [bundleOpen, setBundleOpen] = useState(false);
    const [bundleLoading, setBundleLoading] = useState(false);

    const client = bridge.client;

    const reload = useCallback(async () => {
        if (!client) return;
        setLoadState('loading');
        setLoadError(null);
        try {
            const list = await client.fetchBots();
            setBots(list);
            setLoadState('ready');
        } catch (err) {
            setLoadError(messageErreurUtilisateur(err));
            setLoadState('error');
        }
    }, [client]);

    useEffect(() => {
        if (client) void reload();
    }, [client, reload]);

    const byFamily = useMemo(() => {
        const groups = new Map<string, BotProfile[]>();
        for (const family of BOT_FAMILIES) groups.set(family, []);
        for (const bot of bots) groups.get(bot.family)?.push(bot);
        return groups;
    }, [bots]);

    const openCreate = () => {
        setEditingBot(null);
        setEditorOpen(true);
    };
    const openEdit = (bot: BotProfile) => {
        setEditingBot(bot);
        setEditorOpen(true);
    };

    const handleSave = async (draft: BotProfile) => {
        if (!client) return;
        try {
            await client.upsertBot({
                id: draft.id,
                updated_at: draft.updated_at,
                runtimeId: draft.runtimeId,
                fileName: draft.fileName,
                displayName: draft.displayName,
                family: draft.family,
                brand: draft.brand,
                network: draft.network,
                telegramUsername: draft.telegramUsername,
                mission: draft.mission,
                personality: draft.personality,
                research: draft.research,
                watch: draft.watch,
                deliverables: draft.deliverables,
                method: draft.method,
                limits: draft.limits,
                usefulContext: draft.usefulContext,
                sources: draft.sources,
                model: draft.model,
                enabled: draft.enabled,
            });
            setEditorOpen(false);
            feedback.success(editingBot ? 'Bot enregistré.' : 'Bot créé.');
            await reload();
        } catch (err) {
            feedback.error(`Enregistrement impossible : ${messageErreurUtilisateur(err)}`);
        }
    };

    const handleDelete = async (bot: BotProfile) => {
        if (!client) return;
        if (!confirm(`Supprimer le bot « ${bot.displayName} » ? Il ne sera plus synchronisé vers Hermès.`)) return;
        setBusyId(bot.id);
        try {
            await client.removeBot(bot.id);
            feedback.success('Bot supprimé.');
            await reload();
        } catch (err) {
            feedback.error(`Suppression impossible : ${messageErreurUtilisateur(err)}`);
        } finally {
            setBusyId(null);
        }
    };

    const handleLinkNode = async (bot: BotProfile) => {
        if (!client) return;
        setBusyId(bot.id);
        try {
            await client.linkBotNode(bot.id);
            feedback.success(`« ${bot.displayName} » est maintenant visible dans l'Orchestration.`);
        } catch (err) {
            feedback.error(`Impossible de le lier à l'organigramme : ${messageErreurUtilisateur(err)}`);
        } finally {
            setBusyId(null);
        }
    };

    const handleExport = async () => {
        if (!client) return;
        setBundleLoading(true);
        try {
            const result = await client.fetchBotBundle();
            setBundle(result);
            setBundleOpen(true);
        } catch (err) {
            feedback.error(`Export impossible : ${messageErreurUtilisateur(err)}`);
        } finally {
            setBundleLoading(false);
        }
    };

    if (bridge.connectionState === 'local') {
        return (
            <div className="w-full overflow-y-auto px-12 py-12">
                <div className="mx-auto max-w-2xl">
                    <p className="eyebrow">Bots</p>
                    <h1 className="t-h1 mt-2">Bots.</h1>
                    <Surface className="mt-6 p-6">
                        <p className="t-body">
                            Les bots ont besoin d'un orchestrateur connecté : c'est lui qui compile et sert
                            leur prompt système. Configure l'URL et la clé de l'orchestrateur dans{' '}
                            <strong>Paramètres</strong>, puis reviens ici.
                        </p>
                    </Surface>
                </div>
            </div>
        );
    }

    if (bridge.connectionState === 'connecting' || (loadState === 'loading' && bots.length === 0)) {
        return (
            <div className="flex h-full w-full items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
            </div>
        );
    }

    if (bridge.connectionState === 'failed' || bridge.connectionState === 'degraded') {
        return (
            <div className="w-full overflow-y-auto px-12 py-12">
                <div className="mx-auto max-w-2xl">
                    <p className="eyebrow">Bots</p>
                    <h1 className="t-h1 mt-2">Bots.</h1>
                    <Surface className="mt-6 p-6">
                        <p className="t-body" style={{ color: 'var(--system-red)' }}>
                            Orchestrateur injoignable. Vérifie sa connexion dans Paramètres, puis réessaie.
                        </p>
                        <Button tone="slate" variant="soft" size="sm" className="mt-3" onClick={() => void reload()}>
                            <RefreshCw size={13} strokeWidth={1.8} />
                            Réessayer
                        </Button>
                    </Surface>
                </div>
            </div>
        );
    }

    return (
        <div className="w-full overflow-y-auto px-12 py-12 pb-32">
            <div className="mx-auto max-w-5xl space-y-8">
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                        <p className="eyebrow">Chaîne éditoriale</p>
                        <h1 className="t-h1 mt-2">Bots.</h1>
                        <p className="t-body mt-2 max-w-2xl">
                            Veilleurs, rédacteurs, direction artistique et gardien de marque — chaque bot est
                            une fiche structurée dont le prompt système est compilé automatiquement. Modifier
                            une fiche ici ne change rien tant que le bot n'est pas synchronisé vers Hermès.
                        </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {peutExporter && (
                            <Button tone="slate" variant="soft" onClick={() => void handleExport()} disabled={bundleLoading}>
                                {bundleLoading ? <Loader2 size={14} className="animate-spin" strokeWidth={1.8} /> : <RefreshCw size={14} strokeWidth={1.8} />}
                                Paquet de synchronisation
                            </Button>
                        )}
                        {peutEcrire && (
                            <Button tone="blue" onClick={openCreate}>
                                <Plus size={14} strokeWidth={1.8} />
                                Nouveau bot
                            </Button>
                        )}
                    </div>
                </div>

                {loadError && (
                    <Surface className="p-4" style={{ boxShadow: 'inset 0 0 0 1px rgba(255,59,48,0.25)' }}>
                        <p className="text-[13px]" style={{ color: 'var(--system-red)' }}>{loadError}</p>
                    </Surface>
                )}

                {bots.length === 0 && loadState === 'ready' ? (
                    <Surface className="p-10 text-center">
                        <Bot className="mx-auto h-8 w-8 text-slate-300" strokeWidth={1.4} />
                        <p className="t-body mt-3">Aucun bot pour ce workspace.</p>
                        {peutEcrire && (
                            <Button tone="blue" className="mt-4" onClick={openCreate}>
                                <Plus size={14} strokeWidth={1.8} />
                                Créer le premier bot
                            </Button>
                        )}
                    </Surface>
                ) : (
                    BOT_FAMILIES.filter((f) => (byFamily.get(f) ?? []).length > 0).map((family) => (
                        <div key={family}>
                            <h2 className="t-h3 mb-3">{BOT_FAMILY_LABEL[family]}</h2>
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                {(byFamily.get(family) ?? []).map((bot) => (
                                    <Surface key={bot.id} className="flex flex-col gap-3 p-4">
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="min-w-0">
                                                <p className="truncate text-[15px] font-semibold" style={{ color: 'var(--fg-1)' }}>
                                                    {bot.displayName}
                                                </p>
                                                <p className="truncate text-[12px]" style={{ color: 'var(--fg-3)' }}>
                                                    {bot.brand ?? 'Selon le brief validé'}
                                                </p>
                                            </div>
                                            <Pill tone={bot.enabled ? 'green' : 'slate'}>
                                                {bot.enabled ? 'Actif' : 'Désactivé'}
                                            </Pill>
                                        </div>
                                        <p className="line-clamp-2 text-[12px]" style={{ color: 'var(--fg-3)' }}>
                                            {bot.mission || 'Mission non renseignée.'}
                                        </p>
                                        <div className="mt-auto flex items-center justify-between gap-2 pt-2">
                                            <code className="truncate text-[11px]" style={{ color: 'var(--fg-4)' }}>
                                                {bot.runtimeId}
                                            </code>
                                            <div className="flex shrink-0 gap-1">
                                                <button
                                                    type="button"
                                                    onClick={() => void handleLinkNode(bot)}
                                                    disabled={busyId === bot.id}
                                                    title="Voir dans l'Orchestration"
                                                    aria-label={`Voir ${bot.displayName} dans l'Orchestration`}
                                                    className="rounded-full p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-[var(--accent)] disabled:opacity-40"
                                                >
                                                    <Link2 size={14} strokeWidth={1.8} />
                                                </button>
                                                {peutEcrire && (
                                                    <>
                                                        <button
                                                            type="button"
                                                            onClick={() => openEdit(bot)}
                                                            title="Éditer"
                                                            aria-label={`Éditer ${bot.displayName}`}
                                                            className="rounded-full p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                                                        >
                                                            <Pencil size={14} strokeWidth={1.8} />
                                                        </button>
                                                        {peutSupprimer && <button
                                                            type="button"
                                                            onClick={() => void handleDelete(bot)}
                                                            disabled={busyId === bot.id}
                                                            title="Supprimer"
                                                            aria-label={`Supprimer ${bot.displayName}`}
                                                            className="rounded-full p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 disabled:opacity-40"
                                                        >
                                                            <Trash2 size={14} strokeWidth={1.8} />
                                                        </button>}
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    </Surface>
                                ))}
                            </div>
                        </div>
                    ))
                )}
            </div>

            <BotEditor
                isOpen={editorOpen}
                bot={editingBot ?? emptyBotProfile(randomUuid())}
                onClose={() => setEditorOpen(false)}
                onSave={handleSave}
            />

            {bundleOpen && bundle && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 px-4 py-6 backdrop-blur-sm"
                    role="dialog"
                    aria-modal="true"
                    onClick={() => setBundleOpen(false)}
                >
                    <Surface
                        variant="modal"
                        className="my-auto w-full max-w-2xl overflow-hidden"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <header className="border-b border-slate-100 p-6">
                            <p className="eyebrow">Synchronisation Hermès</p>
                            <h2 className="t-h2 mt-1">
                                {Object.keys(bundle.files).length} fichier{Object.keys(bundle.files).length > 1 ? 's' : ''} prêt
                                {Object.keys(bundle.files).length > 1 ? 's' : ''}
                            </h2>
                            <p className="t-body mt-2 text-[13px]">
                                Un fichier par bot actif, empreinte SHA-256 incluse. À installer dans{' '}
                                <code>/opt/data/pipeline/personas/</code> sur hermes-vps — sans redémarrer le
                                lecteur automatiquement.
                            </p>
                        </header>
                        <div className="max-h-[50vh] space-y-2 overflow-y-auto p-6">
                            {Object.entries(bundle.files).map(([fileName, file]) => (
                                <div key={fileName} className="rounded-lg border border-slate-200 p-3 text-[12px]">
                                    <p className="font-mono font-semibold">{fileName}</p>
                                    <p className="mt-0.5 text-slate-500">
                                        agent : {file.agent} · sha256 : {file.sha256.slice(0, 12)}…
                                    </p>
                                </div>
                            ))}
                        </div>
                        <footer className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50/60 p-6">
                            <Button tone="slate" variant="ghost" onClick={() => setBundleOpen(false)}>
                                Fermer
                            </Button>
                        </footer>
                    </Surface>
                </div>
            )}
        </div>
    );
}
