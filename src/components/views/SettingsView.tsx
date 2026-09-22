import React, { useState } from 'react';
import { Save, RefreshCw, Upload, RotateCcw, Workflow, Server, Bot } from 'lucide-react';
import type { CsvSourceInfo } from '../../utils/csvSource';
import { hybridNodeStore } from '../../services/hybridNodeStore';
import { useOrchestratorConfig } from '../../hooks/useOrchestratorConfig';
import { useFileImport } from '../../hooks/useFileImport';
import { useWorkspaceContext } from '../../contexts/WorkspaceContext';
import { useFeedback } from '../../feedback/FeedbackContext';
import { usePermissions } from '../../auth/usePermissions';
import { supabase } from '../../lib/supabase';
import { messageErreurUtilisateur } from '../../utils/asyncGuard';
import { OrchestratorClient } from '../../services/orchestratorService';

interface SettingsViewProps {
    csvUrl: string;
    applyCsvUrl: (url: string) => void;
    loading: boolean;
    handleResetData: () => void;
    sourceInfo: CsvSourceInfo;
    handleImportFile: (file: File) => Promise<void>;
    /** Erreur de chargement de la source — l'écran d'erreur global est masqué
     *  sur cette vue, sans quoi elle serait invisible ici. */
    sourceError: string | null;
    retrySource: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
    csvUrl,
    applyCsvUrl,
    loading,
    handleResetData,
    sourceInfo,
    handleImportFile,
    sourceError,
    retrySource,
}) => {
    const { activeId: workspaceId } = useWorkspaceContext();
    const { isAdmin } = usePermissions();
    const [tempUrl, setTempUrl] = useState(csvUrl);

    const {
        fileInputRef: importFileRef,
        isImporting,
        importError,
        onFileChange,
    } = useFileImport(handleImportFile);

    // --- Configuration orchestrateur ---
    const orchestrator = useOrchestratorConfig();
    const [orchUrl, setOrchUrl] = useState(orchestrator.config.baseUrl);
    const [orchKey, setOrchKey] = useState(orchestrator.config.apiKey);
    const [orchSaved, setOrchSaved] = useState(false);
    const [orchChecking, setOrchChecking] = useState(false);
    const feedback = useFeedback();

    // Les champs etaient initialises une seule fois : apres une mise a jour de
    // la config dans un autre onglet (evenement `storage`), « Enregistrer »
    // reecrivait la valeur perimee. Resynchronisation pendant le rendu.
    const [syncedConfig, setSyncedConfig] = useState(orchestrator.config);
    if (syncedConfig !== orchestrator.config) {
        setSyncedConfig(orchestrator.config);
        setOrchUrl(orchestrator.config.baseUrl);
        setOrchKey(orchestrator.config.apiKey);
    }

    /**
     * Enregistre ET verifie la joignabilite. Auparavant, « Configuration
     * enregistree » s'affichait sans le moindre appel : une URL ou une cle
     * totalement fausses produisaient le meme message vert.
     */
    const handleSaveOrchestrator = async () => {
        const baseUrl = orchUrl.trim();
        const apiKey = orchKey.trim();

        if (!orchestrator.save({ baseUrl, apiKey })) {
            feedback.error(
                "Configuration non enregistrée : le stockage local est indisponible (navigation privée ou quota).",
            );
            return;
        }

        setOrchSaved(true);
        setOrchChecking(true);
        const joignable = await new OrchestratorClient({ baseUrl, apiKey }).isReachable();
        setOrchChecking(false);

        if (joignable) {
            feedback.success('Configuration enregistrée · orchestrateur joignable.');
        } else {
            feedback.warning(
                "Configuration enregistrée · orchestrateur injoignable — vérifie l'URL et la clé.",
            );
        }
    };

    // --- Import des bots Hermes/LINK (AGENT_IA, référence par id — pas de copie) ---
    const [linkImporting, setLinkImporting] = useState(false);

    const handleImportLinkAgents = async () => {
        const baseUrl = orchestrator.config.baseUrl.trim();
        const apiKey = orchestrator.config.apiKey.trim();
        if (!baseUrl) {
            feedback.error("Configure d'abord la connexion orchestrateur ci-dessus.");
            return;
        }
        setLinkImporting(true);
        try {
            const getUserAuth = async () => {
                if (!supabase || !workspaceId) return null;
                const { data } = await supabase.auth.getSession();
                const token = data.session?.access_token;
                return token ? { token, workspaceId } : null;
            };
            const client = new OrchestratorClient({ baseUrl, apiKey, getUserAuth });
            const result = await client.importLinkAgents();
            feedback.success(
                `Import LINK : ${result.created} bot(s) créé(s), ${result.updated} mis à jour` +
                    (result.skipped ? `, ${result.skipped} désactivé(s) ignoré(s)` : '') +
                    '.',
            );
        } catch (err) {
            feedback.error(`Import LINK échoué : ${messageErreurUtilisateur(err)}`);
        } finally {
            setLinkImporting(false);
        }
    };

    const handleSaveUrl = () => {
        if (tempUrl.trim()) {
            try { new URL(tempUrl.trim()); } catch {
                // `alert()` natif remplacé par le canal feedback commun — audit P3.
                feedback.error('URL invalide. Veuillez saisir une URL complète (ex. https://…).');
                return;
            }
        }
        applyCsvUrl(tempUrl.trim());
    };


    return (
        <div className="w-full h-full overflow-y-auto no-scrollbar p-4 pt-16 sm:p-6 lg:p-10 lg:pt-10 pb-32">
            <div className="max-w-4xl mx-auto space-y-12">
                <div className="mb-10">
                    <p className="eyebrow">Source &amp; données</p>
                    <h1 className="t-display mt-2" style={{ fontSize: 'clamp(32px, 5vw, 48px)' }}>
                        Paramètres.
                    </h1>
                    <p className="t-body mt-2">Source de données et réinitialisation des modifications locales.</p>
                </div>

                <section className="bg-white/82 backdrop-blur-xl p-8 rounded-[2rem] border border-white shadow-[0_18px_50px_rgba(148,163,184,0.14)]">
                    <h3 className="text-xl font-black text-slate-900 mb-6 tracking-tight flex items-center gap-3">
                        <Upload className="w-6 h-6 text-sky-700" />
                        Import local
                    </h3>
                    <div className="space-y-4 max-w-2xl">
                        <div className="rounded-2xl border border-slate-200/80 bg-slate-50/90 px-4 py-3">
                            <p className="text-xs font-black uppercase tracking-widest text-slate-400 mb-1">Source active</p>
                            <p className="text-sm font-bold text-slate-900">{sourceInfo.label}</p>
                            <p className="text-xs text-slate-500 mt-1">{sourceInfo.helperText}</p>
                        </div>

                        <label className="block">
                            <span className="block text-sm font-bold text-slate-700 mb-3">Choisir un fichier local (.csv, .xlsx, .xls)</span>
                            <input
                                ref={importFileRef}
                                type="file"
                                accept=".csv,.xlsx,.xls"
                                onChange={onFileChange}
                                disabled={isImporting}
                                className="block w-full text-sm text-slate-600 file:mr-4 file:rounded-xl file:border-0 file:bg-slate-900 file:px-4 file:py-3 file:text-sm file:font-bold file:text-white hover:file:bg-slate-800 disabled:opacity-50"
                            />
                        </label>

                        {importError && (
                            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
                                {importError}
                            </div>
                        )}

                    </div>
                </section>

                <section className="bg-white/82 backdrop-blur-xl p-8 rounded-[2rem] border border-white shadow-[0_18px_50px_rgba(148,163,184,0.14)]">
                    <h3 className="text-xl font-black text-slate-900 mb-6 tracking-tight flex items-center gap-3">
                        <RefreshCw className="w-6 h-6 text-sky-700" />
                        Source distante
                    </h3>
                    <div className="space-y-4 max-w-2xl">
                        <label className="block text-sm font-bold text-slate-700">URL du fichier CSV distant (optionnelle)</label>
                        <input
                            type="text"
                            value={tempUrl}
                            onChange={(event) => setTempUrl(event.target.value)}
                            className="w-full px-5 py-4 bg-slate-50/90 border border-slate-200 rounded-2xl text-sm focus:ring-4 focus:ring-sky-500/20 transition-all outline-none text-slate-700"
                            placeholder="https://.../organigramme.csv"
                        />
                        <button
                            onClick={handleSaveUrl}
                            disabled={loading || tempUrl === csvUrl}
                            className="flex items-center gap-2 px-6 py-3 bg-slate-900 text-white font-bold rounded-xl shadow-[0_16px_34px_rgba(15,23,42,0.18)] hover:bg-slate-800 transition-all disabled:opacity-50"
                        >
                            <Save className="w-4 h-4" />
                            Utiliser la source distante
                        </button>

                        {/* L'écran d'erreur global est masqué sur cette vue (sinon
                            elle serait inatteignable en cas d'échec de chargement) :
                            l'erreur doit donc être rendue ici. */}
                        {sourceError && (
                            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3">
                                <p className="text-sm font-bold text-red-600">{sourceError}</p>
                                <p className="mt-1 text-xs text-red-400">
                                    La source configurée n'a pas pu être chargée. Corrige l'URL ou importe
                                    un fichier local.
                                </p>
                                <button
                                    onClick={retrySource}
                                    className="mt-3 flex items-center gap-2 rounded-xl border border-red-200 bg-white px-4 py-2 text-[11px] font-black uppercase tracking-widest text-red-600 transition-all hover:bg-red-50"
                                >
                                    <RefreshCw className="h-3.5 w-3.5" />
                                    Réessayer
                                </button>
                            </div>
                        )}
                    </div>
                </section>

                <section className="bg-white/82 backdrop-blur-xl p-8 rounded-[2rem] border border-white shadow-[0_18px_50px_rgba(148,163,184,0.14)]">
                    <h3 className="text-xl font-black text-slate-900 mb-6 tracking-tight flex items-center gap-3">
                        <Server className="w-6 h-6 text-sky-600" />
                        Orchestrateur · Connexion
                    </h3>
                    <p className="text-slate-600 mb-6 max-w-xl text-sm">
                        Le service orchestrateur héberge le moteur de transitions et les filaments
                        live. Fournis son URL et une clé API de workspace (gérée dans la vue Clés API)
                        pour le brancher depuis cette SPA.
                    </p>
                    <div className="space-y-3 max-w-xl">
                        <label className="block text-sm font-bold text-slate-700">URL de l'API</label>
                        <input
                            type="text"
                            value={orchUrl}
                            onChange={(e) => {
                                setOrchUrl(e.target.value);
                                setOrchSaved(false);
                            }}
                            placeholder="http://localhost:3001/api"
                            className="w-full px-5 py-4 bg-slate-50/90 border border-slate-200 rounded-2xl text-sm focus:ring-4 focus:ring-sky-500/20 transition-all outline-none text-slate-700"
                        />
                        <label className="block text-sm font-bold text-slate-700 mt-2">Clé API workspace</label>
                        <input
                            type="password"
                            value={orchKey}
                            onChange={(e) => {
                                setOrchKey(e.target.value);
                                setOrchSaved(false);
                            }}
                            placeholder="ok_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                            className="w-full px-5 py-4 bg-slate-50/90 border border-slate-200 rounded-2xl text-sm font-mono focus:ring-4 focus:ring-sky-500/20 transition-all outline-none text-slate-700"
                            autoComplete="off"
                        />
                        <div className="flex flex-wrap items-center gap-3 pt-2">
                            <button
                                onClick={() => void handleSaveOrchestrator()}
                                disabled={!orchUrl.trim() || !orchKey.trim() || orchChecking}
                                className="flex items-center gap-2 px-6 py-3 bg-slate-900 text-white font-bold rounded-xl shadow-[0_16px_34px_rgba(15,23,42,0.18)] hover:bg-slate-800 transition-all disabled:opacity-50"
                            >
                                <Save className="w-4 h-4" />
                                Enregistrer la connexion
                            </button>
                            {orchestrator.isConfigured && (
                                <button
                                    onClick={() => {
                                        if (orchestrator.clear()) {
                                            feedback.success('Orchestrateur déconnecté.');
                                        } else {
                                            feedback.error(
                                                'Déconnexion incomplète : le stockage local est indisponible.',
                                            );
                                        }
                                        setOrchUrl('');
                                        setOrchKey('');
                                        setOrchSaved(false);
                                    }}
                                    className="flex items-center gap-2 px-5 py-3 bg-slate-50 text-slate-700 font-bold rounded-xl border border-slate-200 hover:bg-slate-100 transition-all"
                                >
                                    Déconnecter
                                </button>
                            )}
                            {orchSaved && (
                                <span className="text-sm font-medium text-emerald-700">
                                    Configuration enregistrée.
                                    {orchChecking ? ' Vérification…' : ''}
                                </span>
                            )}
                        </div>
                    </div>
                </section>

                {isAdmin && (
                    <section className="bg-white/82 backdrop-blur-xl p-8 rounded-[2rem] border border-white shadow-[0_18px_50px_rgba(148,163,184,0.14)]">
                        <h3 className="text-xl font-black text-slate-900 mb-6 tracking-tight flex items-center gap-3">
                            <Bot className="w-6 h-6 text-violet-600" />
                            Bots Hermes · LINK
                        </h3>
                        <p className="text-slate-600 mb-6 max-w-xl text-sm">
                            Importe les bots/personas actifs de LINK (veille, rédaction, design…)
                            comme des nœuds Agent IA dans l'organigramme. Référence seulement — le
                            prompt et les capacités restent dans LINK, jamais copiés ici.
                            Ré-exécutable à tout moment : les bots déjà importés sont mis à jour,
                            pas dupliqués.
                        </p>
                        <button
                            onClick={() => void handleImportLinkAgents()}
                            disabled={linkImporting || !orchestrator.isConfigured}
                            className="flex items-center gap-2 px-6 py-3 bg-violet-600 text-white font-bold rounded-xl shadow-[0_16px_34px_rgba(124,58,237,0.18)] hover:bg-violet-700 transition-all disabled:opacity-50"
                        >
                            <Bot className="w-4 h-4" />
                            {linkImporting ? 'Import en cours…' : 'Importer depuis LINK'}
                        </button>
                        {!orchestrator.isConfigured && (
                            <p className="text-xs text-slate-500 mt-3">
                                Enregistre d'abord la connexion orchestrateur ci-dessus.
                            </p>
                        )}
                    </section>
                )}

                <section className="bg-white/82 backdrop-blur-xl p-8 rounded-[2rem] border border-white shadow-[0_18px_50px_rgba(148,163,184,0.14)]">
                    <h3 className="text-xl font-black text-slate-900 mb-6 tracking-tight flex items-center gap-3">
                        <Workflow className="w-6 h-6 text-emerald-600" />
                        Orchestration · Nœuds Hybrides
                    </h3>
                    <p className="text-slate-600 mb-6 max-w-xl text-sm">
                        Les nœuds créés via l'éditeur sont mis en cache localement
                        (clé <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">organigrad_hybrid_nodes_v1</code>).
                        Vider ce cache force un rechargement depuis le serveur : les nœuds
                        enregistrés côté serveur réapparaîtront, ce n'est pas une suppression.
                    </p>
                    <button
                        onClick={() => {
                            if (confirm('Vider le cache local des nœuds et recharger ?')) {
                                hybridNodeStore.reset(workspaceId);
                                window.location.reload();
                            }
                        }}
                        className="flex items-center gap-2 px-6 py-3 bg-emerald-50 text-emerald-700 font-bold rounded-xl border border-emerald-200 hover:bg-emerald-100 transition-all"
                    >
                        <RotateCcw className="w-4 h-4" />
                        Vider le cache local
                    </button>
                </section>

                <section className="bg-red-50/72 backdrop-blur-xl p-8 rounded-[2rem] border border-red-100 shadow-[0_18px_50px_rgba(248,113,113,0.10)]">
                    <h3 className="text-xl font-black text-red-600 mb-6 tracking-tight">Zone de Danger</h3>
                    <p className="text-slate-600 mb-6 max-w-xl">
                        Si vous avez effectue des modifications locales et souhaitez purger ces changements pour revenir aux donnees de la source active, utilisez le bouton ci-dessous.
                    </p>
                    <button
                        onClick={handleResetData}
                        className="flex items-center gap-2 px-6 py-3 bg-white text-red-600 font-black uppercase tracking-widest text-xs rounded-xl border border-red-200 shadow-lg shadow-red-200/20 hover:bg-red-50 transition-all"
                    >
                        <RefreshCw className="w-4 h-4" />
                        Reinitialiser les donnees locales
                    </button>
                </section>
            </div>
        </div>
    );
};
