import React, { useState } from 'react';
import { Save, RefreshCw, Upload, RotateCcw, Workflow, Server } from 'lucide-react';
import type { CsvSourceInfo } from '../../utils/csvSource';
import { hybridNodeStore } from '../../services/hybridNodeStore';
import { useOrchestratorConfig } from '../../hooks/useOrchestratorConfig';
import { useFileImport } from '../../hooks/useFileImport';
import { useWorkspaceContext } from '../../contexts/WorkspaceContext';

interface SettingsViewProps {
    csvUrl: string;
    applyCsvUrl: (url: string) => void;
    loading: boolean;
    handleResetData: () => void;
    sourceInfo: CsvSourceInfo;
    handleImportFile: (file: File) => Promise<void>;
    clearImportedSource: () => void;
    isImportedSourceActive: boolean;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
    csvUrl,
    applyCsvUrl,
    loading,
    handleResetData,
    sourceInfo,
    handleImportFile,
    clearImportedSource,
    isImportedSourceActive,
}) => {
    const { activeId: workspaceId } = useWorkspaceContext();
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

    const handleSaveUrl = () => {
        if (tempUrl.trim()) {
            try { new URL(tempUrl.trim()); } catch {
                alert('URL invalide. Veuillez saisir une URL complète (ex. https://…).');
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

                        {isImportedSourceActive && (
                            <button
                                onClick={clearImportedSource}
                                className="flex items-center gap-2 px-5 py-3 bg-slate-100 text-slate-700 font-bold rounded-xl hover:bg-slate-200 transition-all"
                            >
                                <RotateCcw className="w-4 h-4" />
                                Revenir a la source standard
                            </button>
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
                                onClick={() => {
                                    orchestrator.save({ baseUrl: orchUrl.trim(), apiKey: orchKey.trim() });
                                    setOrchSaved(true);
                                }}
                                disabled={!orchUrl.trim() || !orchKey.trim()}
                                className="flex items-center gap-2 px-6 py-3 bg-slate-900 text-white font-bold rounded-xl shadow-[0_16px_34px_rgba(15,23,42,0.18)] hover:bg-slate-800 transition-all disabled:opacity-50"
                            >
                                <Save className="w-4 h-4" />
                                Enregistrer la connexion
                            </button>
                            {orchestrator.isConfigured && (
                                <button
                                    onClick={() => {
                                        orchestrator.clear();
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
                                <span className="text-sm font-medium text-emerald-700">Configuration enregistrée.</span>
                            )}
                        </div>
                    </div>
                </section>

                <section className="bg-white/82 backdrop-blur-xl p-8 rounded-[2rem] border border-white shadow-[0_18px_50px_rgba(148,163,184,0.14)]">
                    <h3 className="text-xl font-black text-slate-900 mb-6 tracking-tight flex items-center gap-3">
                        <Workflow className="w-6 h-6 text-emerald-600" />
                        Orchestration · Nœuds Hybrides
                    </h3>
                    <p className="text-slate-600 mb-6 max-w-xl text-sm">
                        Les agents IA et serveurs MCP créés via l'éditeur sont persistés en local
                        (clé <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">organigrad_hybrid_nodes_v1</code>).
                        Réinitialiser supprime tous les nœuds locaux et ramène l'app à l'état vierge.
                    </p>
                    <button
                        onClick={() => {
                            if (confirm('Supprimer tous les nœuds hybrides créés localement ?')) {
                                hybridNodeStore.reset(workspaceId);
                                window.location.reload();
                            }
                        }}
                        className="flex items-center gap-2 px-6 py-3 bg-emerald-50 text-emerald-700 font-bold rounded-xl border border-emerald-200 hover:bg-emerald-100 transition-all"
                    >
                        <RotateCcw className="w-4 h-4" />
                        Vider les nœuds hybrides
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
