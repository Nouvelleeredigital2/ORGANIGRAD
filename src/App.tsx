import { useState, useRef, lazy, Suspense } from 'react';
import { AlertCircle, RefreshCw, MapPin, Settings } from 'lucide-react';
import { useOrgChartController } from './hooks/useOrgChartController';
import { SpotlightSearch } from './components/spotlight/SpotlightSearch';
import { ProfileModal } from './components/ProfileModal';
import { ProfileFiche } from './components/ProfileFiche';
import { ContactModal } from './components/ContactModal';
import { AppShell } from './components/layout/AppShell';
import { AcceptInvitation } from './components/auth/AcceptInvitation';
import { readPendingInviteToken, clearPendingInviteToken } from './components/auth/inviteToken';
import { useWorkspaceContext } from './contexts/WorkspaceContext';
import { Sidebar } from './components/layout/Sidebar';
import { Topbar } from './components/layout/Topbar';
import type { OrgChartRef } from './components/OrgChart';

// Code-splitting (Priorité 12) : les vues lourdes (recharts, orgchart zoom/pan,
// export PDF…) sont chargées à la demande, hors du bundle initial.
const DashboardView = lazy(() =>
    import('./components/views/DashboardView').then((m) => ({ default: m.DashboardView })),
);
const SettingsView = lazy(() =>
    import('./components/views/SettingsView').then((m) => ({ default: m.SettingsView })),
);
const OrchestrationView = lazy(() =>
    import('./components/views/OrchestrationView').then((m) => ({ default: m.OrchestrationView })),
);
const ApiKeysView = lazy(() =>
    import('./components/views/ApiKeysView').then((m) => ({ default: m.ApiKeysView })),
);
const MembersView = lazy(() =>
    import('./components/views/MembersView').then((m) => ({ default: m.MembersView })),
);
const PoleOrgChartView = lazy(() =>
    import('./components/pole/PoleOrgChartView').then((m) => ({ default: m.PoleOrgChartView })),
);
const PrintExportView = lazy(() =>
    import('./components/PrintExportView').then((m) => ({ default: m.PrintExportView })),
);
import type { Agent } from './types/agent';
import { countVisibleAgents } from './utils/dashboardStats';
import { OriginProvider, useOrigin, OriginLoader } from './origin';
import { useSession } from './hooks/useSession';
import { AuthScreen } from './components/auth/AuthScreen';
import { WorkspaceProvider } from './contexts/WorkspaceProvider';
import { isSupabaseConfigured } from './lib/supabase';
import { useFeedback } from './feedback/FeedbackContext';
import { FeedbackProvider } from './feedback/FeedbackProvider';
import { describeError } from './utils/asyncGuard';

function AppContent() {
    const { setFilamentState } = useOrigin();
    // Canal de retour unifié : un export ne se conclut jamais en « succès »
    // silencieux, chaque échec reste affiché jusqu'à lecture.
    const feedback = useFeedback();
    const {
        loading,
        error,
        refresh,
        csvUrl,
        sourceInfo,
        applyCsvUrl,
        rawAgents,
        viewTree,
        availablePoles,
        poleStats,
        highlightedSearch,
        setHighlightedSearch,
        isEditMode,
        setIsEditMode,
        handleDeleteAgent,
        handleUpdateAgent,
        handleResetData,
        activeView,
        setActiveView,
        handleImportFile,
        clearImportedSource,
        selectedPoleKey,
        setSelectedPoleKey,
        selectedPole,
        poleDirectory,
        focusAgentPole,
        locateAgent,
        isImportedSourceActive,
    } = useOrgChartController();

    const [isExporting, setIsExporting] = useState(false);
    const [isPdfMode, setIsPdfMode] = useState(false);
    const [printPreviewOpen, setPrintPreviewOpen] = useState(false);
    const [useHybridCard, setUseHybridCard] = useState(false);
    const [activeModal, setActiveModal] = useState<{ type: 'profile' | 'contact'; agent: Agent } | null>(null);
    const orgChartRef = useRef<OrgChartRef>(null);

    /**
     * Export PDF — depuis la topbar, on ouvre d'abord l'aperçu A3 (PrintExportView).
     * L'utilisateur valide via le bouton "Télécharger" → on lance l'export réel.
     */
    const handleExportPDF = async (): Promise<void> => {
        setPrintPreviewOpen(true);
    };

    const handleConfirmExport = async (): Promise<void> => {
        setPrintPreviewOpen(false);
        setIsExporting(true);
        setIsPdfMode(true);
        setFilamentState('loading');

        await new Promise((resolve) => setTimeout(resolve, 800));

        const { exportToPdf } = await import('./services/exportPdf');
        const poleLabel = selectedPole?.pole;

        let failure: unknown = null;
        try {
            await exportToPdf(orgChartRef, { poleLabel });
        } catch (err) {
            failure = err;
            console.error('[export]', err);
        }

        setIsPdfMode(false);
        setIsExporting(false);

        // Le succès n'est affiché que si l'export a réellement abouti (ORG-003).
        if (failure) {
            feedback.error(
                `Export PDF échoué${poleLabel ? ` — ${poleLabel}` : ''} : ${describeError(failure)}. Aucun fichier n'a été téléchargé.`,
            );
            setFilamentState('error');
        } else {
            feedback.success(`Export PDF terminé${poleLabel ? ` — ${poleLabel}` : ''}.`);
            setFilamentState('success');
        }

        setTimeout(() => setFilamentState('idle'), 3000);
    };

    const handleBatchExport = async () => {
        if (poleDirectory.length === 0) return;

        const previousPoleKey = selectedPoleKey;
        setIsExporting(true);
        setIsPdfMode(true);
        setFilamentState('loading');
        setActiveView('orgchart');

        const { exportToPdf } = await import('./services/exportPdf');

        const failedPoles: string[] = [];

        for (const pole of poleDirectory) {
            setSelectedPoleKey(pole.key);
            // Laisser le temps au DOM de se mettre à jour
            await new Promise((resolve) => setTimeout(resolve, 1200));
            try {
                await exportToPdf(orgChartRef, { poleLabel: pole.pole });
            } catch (err) {
                failedPoles.push(pole.pole);
                console.error('[batch export]', pole.pole, err);
            }
        }

        if (previousPoleKey) {
            setSelectedPoleKey(previousPoleKey);
        }

        setIsPdfMode(false);
        setIsExporting(false);

        // Bilan explicite : un lot partiel ne doit jamais passer pour complet (ORG-004).
        const total = poleDirectory.length;
        const exported = total - failedPoles.length;

        if (failedPoles.length === 0) {
            feedback.success(
                `Export par lots terminé : ${total} pôle${total > 1 ? 's' : ''} exporté${total > 1 ? 's' : ''}.`,
            );
            setFilamentState('success');
        } else if (exported === 0) {
            feedback.error(`Export par lots échoué : aucun des ${total} pôles n'a été exporté.`);
            setFilamentState('error');
        } else {
            feedback.warning(
                `Export par lots incomplet : ${exported}/${total} pôles exportés. Échecs : ${failedPoles.join(', ')}.`,
            );
            setFilamentState('warning');
        }

        setTimeout(() => setFilamentState('idle'), 3000);
    };

    const handleExportCSV = async () => {
        const { exportToCsv } = await import('./services/csvService');
        if (activeView === 'orgchart' && selectedPole) {
            exportToCsv(selectedPole.agents);
            return;
        }
        exportToCsv(rawAgents);
    };

    return (
        <>
            <AppShell
                sidebar={
                    <Sidebar
                        activeView={activeView}
                        setActiveView={setActiveView}
                        loading={loading}
                        handleBatchExport={handleBatchExport}
                        isExporting={isExporting}
                        sourceInfo={sourceInfo}
                        poleDirectory={poleDirectory}
                        selectedPoleKey={selectedPoleKey}
                        setSelectedPoleKey={setSelectedPoleKey}
                        batchExportLabel="Export par lots A3 (tous les poles)"
                    />
                }
                header={
                    <Topbar
                        handleExportCSV={handleExportCSV}
                        handleExportPDF={handleExportPDF}
                        loading={loading}
                        isExporting={isExporting}
                        spotlightInput={
                            <SpotlightSearch
                                data={viewTree}
                                onSelectAgent={(id, path) => {
                                    focusAgentPole(id);
                                    setHighlightedSearch({ id, path: new Set(path) });
                                }}
                            />
                        }
                        handleImportFile={handleImportFile}
                    />
                }
            >
                {loading ? (
                    <OriginLoader />
                ) : error && activeView !== 'settings' ? (
                    /* L'écran d'erreur reste une impasse tant qu'il n'offre pas de sortie :
                       on propose donc un nouvel essai et l'accès aux Paramètres, seule vue
                       encore utile sans données (changement de source / import). (ORG-005) */
                    <div className="absolute inset-0 flex flex-col items-center justify-center z-50">
                        <div className="p-10 rounded-3xl bg-red-50 border border-red-100 flex flex-col items-center text-red-500 shadow-xl">
                            <AlertCircle className="w-16 h-16 mb-6" />
                            <p className="text-lg font-black tracking-tight">{error}</p>
                            <p className="mt-3 max-w-sm text-center text-xs font-bold text-red-400">
                                La source de données n'a pas pu être chargée.
                            </p>
                            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                                <button
                                    onClick={() => void refresh()}
                                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-red-500 text-white text-[10px] font-black uppercase tracking-widest hover:bg-red-600 transition-all shadow-lg shadow-red-200/50"
                                >
                                    <RefreshCw className="w-3.5 h-3.5" />
                                    Réessayer
                                </button>
                                <button
                                    onClick={() => setActiveView('settings')}
                                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white text-red-500 text-[10px] font-black uppercase tracking-widest border border-red-200 hover:bg-red-50 transition-all"
                                >
                                    <Settings className="w-3.5 h-3.5" />
                                    Changer de source
                                </button>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div
                        id="exportable-org-chart"
                        className={`w-full h-full flex flex-col ${isPdfMode ? 'bg-slate-50 overflow-auto' : ''}`}
                    >
                        <Suspense fallback={<OriginLoader />}>
                        {activeView === 'dashboard' ? (
                            <DashboardView
                                rawAgents={rawAgents || []}
                                totalAgents={countVisibleAgents(viewTree)}
                                avgNbi={poleStats?.avgNbi || 0}
                                availablePoles={availablePoles}
                                loading={loading}
                            />
                        ) : activeView === 'orchestration' ? (
                            <OrchestrationView rawAgents={rawAgents || []} />
                        ) : activeView === 'members' ? (
                            <MembersView />
                        ) : activeView === 'api-keys' ? (
                            <ApiKeysView />
                        ) : activeView === 'settings' ? (
                            <SettingsView
                                csvUrl={csvUrl}
                                applyCsvUrl={applyCsvUrl}
                                loading={loading}
                                handleResetData={handleResetData}
                                sourceInfo={sourceInfo}
                                handleImportFile={handleImportFile}
                                clearImportedSource={clearImportedSource}
                                isImportedSourceActive={isImportedSourceActive}
                                sourceError={error}
                                retrySource={() => void refresh()}
                            />
                        ) : (
                            <PoleOrgChartView
                                selectedPole={selectedPole}
                                orgChartRef={orgChartRef}
                                isPdfMode={isPdfMode}
                                isEditMode={isEditMode}
                                onToggleEditMode={() => setIsEditMode(!isEditMode)}
                                highlightedId={highlightedSearch.id}
                                highlightedPath={highlightedSearch.path}
                                onDeleteAgent={handleDeleteAgent}
                                onProfileClick={(agent) => setActiveModal({ type: 'profile', agent })}
                                onContactClick={(agent) => setActiveModal({ type: 'contact', agent })}
                                useHybridCard={useHybridCard}
                                onToggleHybridCard={() => setUseHybridCard((v) => !v)}
                            />
                        )}
                        </Suspense>

                        {!isPdfMode && activeView === 'orgchart' && (
                            <div className="absolute top-4 right-4 z-40 print:hidden">
                                <button
                                    onClick={handleResetData}
                                    className="flex items-center gap-2 px-4 py-2 bg-white/80 backdrop-blur-md rounded-xl text-[10px] font-black uppercase tracking-widest text-red-500 border border-red-100 hover:bg-red-50 transition-all shadow-lg shadow-slate-200/20"
                                    title="Reinitialiser toutes les modifications"
                                >
                                    <RefreshCw className="w-3.5 h-3.5" />
                                    Reset
                                </button>
                            </div>
                        )}

                        {isPdfMode && selectedPole && (
                            <div className="w-full mt-8 pt-8 border-t border-slate-200 flex justify-between items-center px-10 pb-10">
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white">
                                        <MapPin className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <p className="text-xs font-black tracking-tighter text-slate-800 uppercase">{selectedPole.pole}</p>
                                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Pole / Direction</p>
                                    </div>
                                </div>

                                <div className="text-right">
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">
                                        Genere automatiquement le {new Date().toLocaleDateString('fr-FR')}
                                    </p>
                                    <p className="text-[8px] font-medium text-slate-300 mt-1 uppercase">
                                        Organigramme de pole
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </AppShell>

            {/* Mode lecture → fiche v2 (avatar 72, chips, sections, 3 actions footer)
                Mode édition → modal legacy avec formulaire */}
            {isEditMode ? (
                <ProfileModal
                    isOpen={activeModal?.type === 'profile'}
                    onClose={() => setActiveModal(null)}
                    agent={activeModal?.agent || null}
                    isEditMode={isEditMode}
                    onSave={handleUpdateAgent}
                />
            ) : (
                <ProfileFiche
                    isOpen={activeModal?.type === 'profile'}
                    agent={activeModal?.agent || null}
                    onClose={() => setActiveModal(null)}
                    onContact={(agent) => setActiveModal({ type: 'contact', agent })}
                    onLocate={(agent) => {
                        // Bascule sur le pôle de l'agent, déplie la branche et le
                        // met en évidence — puis referme la fiche (ORG-001).
                        locateAgent(agent.id);
                        setActiveModal(null);
                    }}
                />
            )}
            <ContactModal
                isOpen={activeModal?.type === 'contact'}
                onClose={() => setActiveModal(null)}
                agent={activeModal?.agent || null}
                isEditMode={isEditMode}
                onSave={handleUpdateAgent}
            />

            <Suspense fallback={null}>
                <PrintExportView
                    isOpen={printPreviewOpen}
                    poleLabel={selectedPole?.pole}
                    tree={selectedPole?.tree ?? []}
                    agents={selectedPole?.agents ?? rawAgents}
                    onClose={() => setPrintPreviewOpen(false)}
                    onDownload={handleConfirmExport}
                />
            </Suspense>
        </>
    );
}

function PostAuthGate({ children }: { children: React.ReactNode }) {
    const { refresh, setActive } = useWorkspaceContext();
    const [pendingToken, setPendingToken] = useState<string | null>(() => readPendingInviteToken());

    if (pendingToken) {
        return (
            <AcceptInvitation
                token={pendingToken}
                onAccepted={async () => {
                    setPendingToken(null);
                    clearPendingInviteToken();
                    const updated = await refresh();
                    // Basculer automatiquement vers le premier workspace disponible
                    // (le workspace accepté sera en tête de liste après refresh)
                    if (updated?.[0]?.id) setActive(updated[0].id);
                }}
                onSkip={() => {
                    setPendingToken(null);
                    clearPendingInviteToken();
                }}
            />
        );
    }
    return <>{children}</>;
}

function AuthGate({ children }: { children: React.ReactNode }) {
    const { session, loading } = useSession();
    // Mode offline / dev sans Supabase : on saute l'auth et le repo bascule en localStorage.
    if (!isSupabaseConfigured) return <>{children}</>;
    if (loading) return <OriginLoader />;
    if (!session) return <AuthScreen />;
    return (
        <WorkspaceProvider>
            <PostAuthGate>{children}</PostAuthGate>
        </WorkspaceProvider>
    );
}

function App() {
    return (
        <OriginProvider>
            {/* Au-dessus d'AuthGate : l'écran d'authentification doit lui aussi
                pouvoir signaler ses échecs. */}
            <FeedbackProvider>
                <AuthGate>
                    <AppContent />
                </AuthGate>
            </FeedbackProvider>
        </OriginProvider>
    );
}

export default App;
