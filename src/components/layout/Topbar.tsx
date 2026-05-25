import React from 'react';
import { CloudDownload, FileText, Upload, Loader2, AlertCircle } from 'lucide-react';
import { OriginGlass, useOrigin } from '../../origin';
import { useFileImport } from '../../hooks/useFileImport';

interface TopbarProps {
    handleExportCSV: () => void;
    handleExportPDF: () => void;
    handleImportFile: (file: File) => Promise<void>;
    loading: boolean;
    isExporting: boolean;
    spotlightInput: React.ReactNode;
}

export const Topbar: React.FC<TopbarProps> = ({
    handleExportCSV,
    handleExportPDF,
    handleImportFile,
    loading,
    isExporting,
    spotlightInput,
}) => {
    const { setFilamentState } = useOrigin();

    const { fileInputRef, isImporting, importError, triggerPick, onFileChange } = useFileImport(
        async (file) => {
            setFilamentState('loading');
            await handleImportFile(file);
        },
        () => {
            setFilamentState('success');
            setTimeout(() => setFilamentState('idle'), 3000);
        },
    );

    return (
        <OriginGlass 
            variant="panel" 
            className="h-24 flex items-center justify-between px-8 border-b border-white/70 z-30 print:hidden relative"
        >
            <div className="flex items-center gap-6">
                <div className="w-10 h-10 shrink-0" />
                <div className="flex flex-col">
                    <h1 className="text-sm font-black text-slate-900 uppercase tracking-tighter leading-none">
                        Organigrad
                    </h1>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                        Plateforme d'orchestration
                    </p>
                </div>
            </div>

            <div className="flex-1 px-12">{spotlightInput}</div>

            <div className="flex items-center gap-3">
                {importError && (
                    <div className="absolute top-[100%] right-8 mt-2 bg-red-50 text-red-600 text-xs font-bold px-4 py-2 rounded-xl shadow-lg border border-red-100 flex items-center gap-2">
                        <AlertCircle className="w-4 h-4" />
                        {importError}
                    </div>
                )}
                <input
                    type="file"
                    accept=".csv,.xlsx,.xls"
                    className="hidden"
                    ref={fileInputRef}
                    onChange={onFileChange}
                />
                <button
                    className="origin-button flex items-center gap-2 text-xs font-extrabold uppercase tracking-widest"
                    onClick={triggerPick}
                    disabled={loading || isImporting}
                    title="Importer un fichier (CSV, XLS, XLSX)"
                >
                    {isImporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                    Importer
                </button>
                <div className="w-px h-8 bg-slate-200/60 mx-1"></div>
                <button
                    className="origin-button flex items-center gap-2 text-xs font-extrabold uppercase tracking-widest"
                    onClick={handleExportCSV}
                    disabled={loading || isImporting}
                    title="Exporter les donnees modifiees au format CSV"
                >
                    <CloudDownload className="w-4 h-4" />
                    Export CSV
                </button>
                <button
                    className="origin-button-primary flex items-center gap-2 text-xs font-extrabold uppercase tracking-widest"
                    onClick={handleExportPDF}
                    disabled={isExporting || loading || isImporting}
                >
                    <FileText className="w-4 h-4" />
                    Export PDF
                </button>
            </div>
            
        </OriginGlass>
    );
};
