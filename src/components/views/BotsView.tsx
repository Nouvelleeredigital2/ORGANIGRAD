import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Bot, Download, Link2, Loader2, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react';
import type { BotProfile } from '../../types/botProfile';
import { BotPortrait } from '../bots/BotPortrait';
import { BOT_FAMILIES, BOT_FAMILY_LABEL, emptyBotProfile } from '../../types/botProfile';
import { BotEditor } from '../bots/BotEditor';
import { ReviewedBotsImport } from '../bots/ReviewedBotsImport';
import { Button, Pill, Surface } from '../../design/ui';
import { useOrchestratorBridge } from '../../hooks/useOrchestratorBridge';
import { usePermissions } from '../../auth/usePermissions';
import { useFeedback } from '../../feedback/FeedbackContext';
import { messageErreurUtilisateur } from '../../utils/asyncGuard';
import { randomUuid } from '../../utils/randomId';
import type { BotBundle } from '../../services/orchestratorService';
import { activateBot, deactivateBot, fetchBotActivation, type BotActivationStatus } from '../../services/botActivationRepo';
import { buildBotBundle, fetchBotProfiles } from '../../services/botProfileRepo';
import { useWorkspaceContext } from '../../contexts/WorkspaceContext';

/**
 * BotsView — création et paramétrage visuel des bots conversationnels Hermès.
 *
 * Un bot vit dans `bot_profiles` (source de vérité Organigrad). Il peut en
 * plus être représenté comme un nœud AGENT_IA dans l'organigramme (bouton
 * « Voir dans l'Orchestration ») — les deux restent des vues d'une même
 * identité, jamais deux copies divergentes du prompt (B3).
 *
 * L'orchestrateur compile et sert les prompts. La revue et l'activation lisent
 * néanmoins directement les fiches RLS afin de rester disponibles en local.
 */
export function BotsView() {
    const bridge = useOrchestratorBridge();
    const { activeId: workspaceId } = useWorkspaceContext();
    const { can } = usePermissions();
    const feedback = useFeedback();
    const peutEcrire = can('bots:write');
    const peutSupprimer = peutEcrire && can('workspace:admin');
    const peutActiver = peutEcrire && can('workspace:admin');
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
    const [activations, setActivations] = useState<Record<string, BotActivationStatus | undefined>>({});
    const [activationBusyId, setActivationBusyId] = useState<string | null>(null);
    const [reviewOpen, setReviewOpen] = useState(false);
    const [reviewLoading, setReviewLoading] = useState(false);
    const [reviewSelected, setReviewSelected] = useState<Set<string>>(new Set());
    const [reviewOutcomes, setReviewOutcomes] = useState<Record<string, { state: 'activated' | 'failed'; error?: string }>>({});
    const [reviewErrors, setReviewErrors] = useState<Record<string, string>>({});
    const [reviewRunning, setReviewRunning] = useState(false);

    const client = bridge.client;
    const activeClient = useRef(client);

    const reload = useCallback(async (showLoading = true) => {
        if (showLoading) setLoadState('loading');
        setLoadError(null);
        try {
            const list = client ? await client.fetchBots() : await fetchBotProfiles(workspaceId);
            if (activeClient.current !== client) return;
            setBots(list);
            setLoadState('ready');
        } catch (err) {
            if (activeClient.current !== client) return;
            setLoadError(messageErreurUtilisateur(err));
            setLoadState('error');
        }
    }, [client, workspaceId]);

    useEffect(() => {
        activeClient.current = client;
        void reload();
        return () => { activeClient.current = null; };
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
                avatarUrl: draft.avatarUrl,
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
        setBundleLoading(true);
        try {
            const result = client ? await client.fetchBotBundle() : buildBotBundle(bots);
            setBundle(result);
            setBundleOpen(true);
        } catch (err) {
            feedback.error(`Export impossible : ${messageErreurUtilisateur(err)}`);
        } finally {
            setBundleLoading(false);
        }
    };

    const handleInspectActivation = async (bot: BotProfile) => {
        setActivationBusyId(bot.id);
        try {
            const activation = await fetchBotActivation(bot.id);
            setActivations(previous => ({ ...previous, [bot.id]: activation }));
        } catch (err) {
            feedback.error(`Vérification impossible : ${messageErreurUtilisateur(err)}`);
        } finally {
            setActivationBusyId(null);
        }
    };

    /** Télécharge le paquet signé localement ; aucun transport vers Hermès ici. */
    const downloadBundle = () => {
        if (!bundle) return;
        const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `organigrad-personas-${new Date().toISOString().slice(0, 10)}.json`;
        link.click();
        URL.revokeObjectURL(url);
    };

    const handleActivate = async (bot: BotProfile) => {
        setActivationBusyId(bot.id);
        try {
            const result = await activateBot(bot.id);
            setActivations(previous => ({ ...previous, [bot.id]: result.verification ?? previous[bot.id] }));
            feedback.success(`« ${bot.displayName} » est activé.`);
            await reload(false);
        } catch (err) {
            feedback.error(`Activation impossible : ${messageErreurUtilisateur(err)}`);
        } finally {
            setActivationBusyId(null);
        }
    };

    const handleDeactivate = async (bot: BotProfile) => {
        const reason = window.prompt(`Pourquoi retirer « ${bot.displayName} » du service ?`);
        if (reason === null) return;
        setActivationBusyId(bot.id);
        try {
            await deactivateBot(bot.id, reason);
            setActivations(previous => ({ ...previous, [bot.id]: { ...previous[bot.id], enabled: false } as BotActivationStatus }));
            feedback.success(`« ${bot.displayName} » est repassé en brouillon.`);
            await reload(false);
        } catch (err) {
            feedback.error(`Désactivation impossible : ${messageErreurUtilisateur(err)}`);
        } finally {
            setActivationBusyId(null);
        }
    };

    const openActivationReview = async () => {
        const drafts = bots.filter(bot => !bot.enabled);
        setReviewOpen(true);
        setReviewLoading(true);
        setReviewOutcomes({});
        setReviewErrors({});
        const checks = await Promise.allSettled(drafts.map(async bot => [bot.id, await fetchBotActivation(bot.id)] as const));
        const statuses: Record<string, BotActivationStatus> = {};
        const errors: Record<string, string> = {};
        checks.forEach((check, index) => {
            const bot = drafts[index];
            if (!bot) return;
            if (check.status === 'fulfilled') statuses[bot.id] = check.value[1];
            else errors[bot.id] = messageErreurUtilisateur(check.reason);
        });
        setActivations(previous => ({ ...previous, ...statuses }));
        setReviewErrors(errors);
        setReviewSelected(new Set(drafts.filter(bot => statuses[bot.id]?.ready).map(bot => bot.id)));
        setReviewLoading(false);
    };

    const activateReviewedBots = async (ids = reviewSelected) => {
        const targets = bots.filter(bot => ids.has(bot.id) && !bot.enabled && activations[bot.id]?.ready);
        if (!targets.length) return;
        setReviewRunning(true);
        const outcomes: Record<string, { state: 'activated' | 'failed'; error?: string }> = {};
        for (const bot of targets) {
            try {
                const result = await activateBot(bot.id);
                outcomes[bot.id] = { state: 'activated' };
                setActivations(previous => ({ ...previous, [bot.id]: result.verification ?? previous[bot.id] }));
                setBots(previous => previous.map(item => item.id === bot.id ? { ...item, enabled: true } : item));
            } catch (err) {
                outcomes[bot.id] = { state: 'failed', error: messageErreurUtilisateur(err) };
            }
            setReviewOutcomes(previous => ({ ...previous, ...outcomes }));
        }
        setReviewRunning(false);
        if (Object.values(outcomes).some(outcome => outcome.state === 'failed')) {
            feedback.error('Certaines activations doivent être réessayées.');
        } else {
            feedback.success(`${targets.length} persona${targets.length > 1 ? 's sont' : ' est'} activé${targets.length > 1 ? 's' : ''}.`);
        }
        await reload(false);
    };

    const toggleReviewedBot = (botId: string) => {
        setReviewSelected(previous => {
            const next = new Set(previous);
            if (next.has(botId)) next.delete(botId); else next.add(botId);
            return next;
        });
    };

    if (loadState === 'loading' && bots.length === 0) {
        return (
            <div className="flex h-full w-full items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
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
                        {peutActiver && (
                            <Button tone="blue" variant="soft" onClick={() => void openActivationReview()}>
                                Revue d’activation
                            </Button>
                        )}
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

                {peutEcrire && client && loadState === 'ready' && <ReviewedBotsImport client={client} onComplete={() => reload(false)} />}

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
                                            <BotPortrait name={bot.displayName} url={bot.avatarUrl} />
                                            <div className="min-w-0">
                                                <p className="truncate text-[15px] font-semibold" style={{ color: 'var(--fg-1)' }}>
                                                    {bot.displayName}
                                                </p>
                                                <p className="truncate text-[12px]" style={{ color: 'var(--fg-3)' }}>
                                                    {bot.brand ?? 'Selon le brief validé'}
                                                </p>
                                            </div>
                                            <Pill tone={bot.enabled ? 'green' : 'slate'}>
                                                {bot.enabled ? 'Activé' : 'Brouillon'}
                                            </Pill>
                                        </div>
                                        <p className="line-clamp-2 text-[12px]" style={{ color: 'var(--fg-3)' }}>
                                            {bot.mission || 'Mission non renseignée.'}
                                        </p>
                                        {activations[bot.id] && (
                                            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-[12px]">
                                                <div className="flex items-center justify-between gap-2">
                                                    <strong style={{ color: activations[bot.id]?.ready ? 'var(--system-green)' : 'var(--system-orange)' }}>
                                                        {activations[bot.id]?.ready ? 'Prêt à activer' : 'À compléter'}
                                                    </strong>
                                                    <span className="text-slate-500">{activations[bot.id]?.checks.filter(check => check.passed).length}/{activations[bot.id]?.checks.length}</span>
                                                </div>
                                                <ul className="mt-2 space-y-1 text-slate-600">
                                                    {activations[bot.id]?.checks.map(check => <li key={check.code}>{check.passed ? '✓' : '•'} {check.label}</li>)}
                                                </ul>
                                                {peutActiver && !bot.enabled && activations[bot.id]?.ready && (
                                                    <Button tone="blue" size="sm" className="mt-3" onClick={() => void handleActivate(bot)} disabled={activationBusyId === bot.id} aria-label={`Activer ${bot.displayName}`}>
                                                        Activer
                                                    </Button>
                                                )}
                                                {peutActiver && bot.enabled && (
                                                    <Button tone="slate" variant="outline" size="sm" className="mt-3" onClick={() => void handleDeactivate(bot)} disabled={activationBusyId === bot.id} aria-label={`Désactiver ${bot.displayName}`}>
                                                        Désactiver
                                                    </Button>
                                                )}
                                            </div>
                                        )}
                                        <div className="mt-auto flex items-center justify-between gap-2 pt-2">
                                            <code className="truncate text-[11px]" style={{ color: 'var(--fg-4)' }}>
                                                {bot.runtimeId}
                                            </code>
                                            <div className="flex shrink-0 gap-1">
                                                <button
                                                    type="button"
                                                    onClick={() => void handleInspectActivation(bot)}
                                                    disabled={activationBusyId === bot.id}
                                                    title="Vérifier l’activation"
                                                    aria-label={`Vérifier ${bot.displayName}`}
                                                    className="rounded-full p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-[var(--accent)] disabled:opacity-40"
                                                >
                                                    {activationBusyId === bot.id ? <Loader2 className="animate-spin" size={14} strokeWidth={1.8} /> : <RefreshCw size={14} strokeWidth={1.8} />}
                                                </button>
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
                                <code>/opt/data/pipeline/personas/</code> sur l’instance Hermès explicitement
                                désignée pour LINK — sans redémarrer le lecteur automatiquement.
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
                            <Button tone="blue" variant="soft" onClick={downloadBundle}>
                                <Download size={14} strokeWidth={1.8} />
                                Télécharger le paquet
                            </Button>
                            <Button tone="slate" variant="ghost" onClick={() => setBundleOpen(false)}>
                                Fermer
                            </Button>
                        </footer>
                    </Surface>
                </div>
            )}

            {reviewOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 px-4 py-6 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="activation-review-title">
                    <Surface variant="modal" className="my-auto w-full max-w-2xl overflow-hidden">
                        <header className="border-b border-slate-100 p-6">
                            <p className="eyebrow">Validation humaine</p>
                            <h2 id="activation-review-title" className="t-h2 mt-1">Revue d’activation</h2>
                            <p className="t-body mt-2 text-[13px]">Chaque activation crée son propre reçu. Les profils bloqués ne peuvent pas être sélectionnés.</p>
                        </header>
                        <div className="max-h-[50vh] space-y-2 overflow-y-auto p-6">
                            {reviewLoading ? <p role="status">Vérification des profils…</p> : bots.filter(bot => !bot.enabled).map(bot => {
                                const status = activations[bot.id];
                                const outcome = reviewOutcomes[bot.id];
                                const verificationError = reviewErrors[bot.id];
                                const ready = Boolean(status?.ready) && !outcome;
                                return <label key={bot.id} className="flex items-center gap-3 rounded-xl border border-slate-200 px-3 py-3 text-sm">
                                    <input type="checkbox" checked={reviewSelected.has(bot.id)} disabled={!ready || reviewRunning} onChange={() => toggleReviewedBot(bot.id)} />
                                    <span className="min-w-0 flex-1"><strong>{bot.displayName}</strong><span className="ml-2 text-xs text-slate-500">{outcome?.state === 'activated' ? `${bot.displayName} — activé` : outcome?.state === 'failed' ? `Échec : ${outcome.error}` : verificationError ? `Vérification indisponible : ${verificationError}` : status?.ready ? 'Prêt à activer' : 'À compléter'}</span></span>
                                </label>;
                            })}
                            {!reviewLoading && (() => {
                                const readyCount = bots.filter(bot => !bot.enabled && activations[bot.id]?.ready && !reviewOutcomes[bot.id]).length;
                                const failedCount = Object.values(reviewOutcomes).filter(outcome => outcome.state === 'failed').length;
                                return <div className="pt-2 text-sm text-slate-600"><p>{readyCount} profil{readyCount > 1 ? 's' : ''} prêt{readyCount > 1 ? 's' : ''} à activer</p>{failedCount > 0 && <p className="mt-1 text-rose-600">{failedCount} activation{failedCount > 1 ? 's' : ''} à réessayer</p>}</div>;
                            })()}
                        </div>
                        <footer className="flex flex-wrap justify-end gap-2 border-t border-slate-100 bg-slate-50/60 p-6">
                            {Object.values(reviewOutcomes).some(outcome => outcome.state === 'failed') && <Button tone="blue" variant="outline" disabled={reviewRunning} onClick={() => void activateReviewedBots(new Set(Object.entries(reviewOutcomes).filter(([, outcome]) => outcome.state === 'failed').map(([id]) => id)))}>Réessayer les échecs</Button>}
                            <Button tone="slate" variant="ghost" disabled={reviewRunning} onClick={() => setReviewOpen(false)}>Fermer</Button>
                            <Button tone="blue" disabled={reviewLoading || reviewRunning || reviewSelected.size === 0} onClick={() => void activateReviewedBots()}>Activer les {reviewSelected.size} profils</Button>
                        </footer>
                    </Surface>
                </div>
            )}
        </div>
    );
}
