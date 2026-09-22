import { BaseModal } from '../BaseModal';
import { Button } from '../../design/ui';
import type { ImportPreview } from '../../services/importService';

/**
 * Prévisualisation avant import.
 *
 * `previewImport` / `commitImport` existaient déjà (déduplication, lignes
 * invalides) mais aucune interface ne les appelait : le chemin réel appliquait
 * le fichier directement, sans déduplication ni rapport ni confirmation.
 *
 * Instance UNIQUE, montée dans App.tsx : `handleImportFile` est passé à la fois
 * à la Topbar et aux Paramètres, deux montages donneraient deux modales
 * concurrentes.
 */

export interface ImportPreviewModalProps {
    isOpen: boolean;
    fileName: string | null;
    preview: ImportPreview | null;
    /** Cible d'écriture affichée en clair (workspace ou session locale). */
    targetLabel: string;
    /** `false` ⇒ rôle en lecture seule : la confirmation est refusée. */
    canWrite: boolean;
    mode: 'merge' | 'replace';
    onModeChange: (mode: 'merge' | 'replace') => void;
    allowInvalid: boolean;
    onAllowInvalidChange: (value: boolean) => void;
    isCommitting: boolean;
    commitError: string | null;
    onConfirm: () => void;
    onCancel: () => void;
}

/** Au-delà, on tronque : une liste de 3 000 lignes n'aide personne. */
const MAX_LIGNES_AFFICHEES = 50;

function ListeTronquee({ titre, lignes }: { titre: string; lignes: string[] }) {
    if (lignes.length === 0) return null;
    const visibles = lignes.slice(0, MAX_LIGNES_AFFICHEES);
    const reste = lignes.length - visibles.length;

    return (
        <div>
            <p className="mb-1 text-[11px] font-black uppercase tracking-widest text-slate-400">
                {titre} · {lignes.length}
            </p>
            <ul className="max-h-32 overflow-y-auto rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
                {visibles.map((l) => (
                    <li key={l} className="truncate">
                        {l}
                    </li>
                ))}
                {reste > 0 && <li className="mt-1 text-slate-400">… et {reste} autre(s).</li>}
            </ul>
        </div>
    );
}

export function ImportPreviewModal({
    isOpen,
    fileName,
    preview,
    targetLabel,
    canWrite,
    mode,
    onModeChange,
    allowInvalid,
    onAllowInvalidChange,
    isCommitting,
    commitError,
    onConfirm,
    onCancel,
}: ImportPreviewModalProps) {
    if (!preview) return null;

    const { totals } = preview;
    const bloqueParInvalides = totals.invalid > 0 && !allowInvalid;
    const rienAImporter = totals.valid === 0;

    return (
        <BaseModal isOpen={isOpen} onClose={onCancel} title="Prévisualisation de l'import">
            <div className="space-y-5">
                <div>
                    <p className="text-sm font-bold text-slate-900">{fileName ?? 'Fichier'}</p>
                    <p className="text-xs text-slate-500">Destination : {targetLabel}</p>
                </div>

                <div className="grid grid-cols-4 gap-2">
                    {[
                        { label: 'Lignes', value: totals.rows, tone: 'text-slate-900' },
                        { label: 'Valides', value: totals.valid, tone: 'text-emerald-600' },
                        { label: 'Invalides', value: totals.invalid, tone: 'text-red-600' },
                        { label: 'Doublons', value: totals.duplicates, tone: 'text-orange-600' },
                    ].map((c) => (
                        <div key={c.label} className="rounded-xl bg-slate-50 p-3 text-center">
                            <p className={`text-lg font-black ${c.tone}`}>{c.value}</p>
                            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                                {c.label}
                            </p>
                        </div>
                    ))}
                </div>

                <ListeTronquee
                    titre="Lignes invalides"
                    lignes={preview.invalid.map((i) => `Ligne ${i.row} — ${i.reason}`)}
                />
                <ListeTronquee
                    titre="Doublons ignorés"
                    lignes={preview.duplicates.map((d) => `Ligne ${d.row} — ${d.key}`)}
                />

                <fieldset className="space-y-2">
                    <legend className="mb-1 text-[11px] font-black uppercase tracking-widest text-slate-400">
                        Mode d'import
                    </legend>
                    <label className="flex items-start gap-2 text-sm text-slate-700">
                        <input
                            type="radio"
                            name="import-mode"
                            checked={mode === 'merge'}
                            onChange={() => onModeChange('merge')}
                            className="mt-1"
                        />
                        <span>
                            <strong>Compléter</strong> — ajoute et met à jour, sans rien retirer.
                        </span>
                    </label>
                    <label className="flex items-start gap-2 text-sm text-slate-700">
                        <input
                            type="radio"
                            name="import-mode"
                            checked={mode === 'replace'}
                            onChange={() => onModeChange('replace')}
                            className="mt-1"
                        />
                        <span>
                            <strong>Remplacer</strong> — retire aussi les fiches de ce même fichier
                            absentes de cette version. Les fiches issues d'une autre source ne sont
                            pas touchées.
                        </span>
                    </label>
                </fieldset>

                {totals.invalid > 0 && (
                    <label className="flex items-start gap-2 text-sm text-slate-700">
                        <input
                            type="checkbox"
                            checked={allowInvalid}
                            onChange={(e) => onAllowInvalidChange(e.target.checked)}
                            className="mt-1"
                        />
                        <span>
                            Importer malgré les {totals.invalid} ligne(s) invalide(s) — elles seront
                            ignorées.
                        </span>
                    </label>
                )}

                {!canWrite && (
                    <p className="rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 text-xs font-bold text-orange-700">
                        Ton rôle ne permet pas d'écrire dans cet organigramme.
                    </p>
                )}

                {commitError && (
                    <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-bold text-red-600">
                        {commitError}
                    </p>
                )}

                <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:justify-end sm:gap-3">
                    <Button tone="slate" variant="ghost" onClick={onCancel} disabled={isCommitting}>
                        Annuler
                    </Button>
                    <Button
                        tone="blue"
                        onClick={onConfirm}
                        disabled={isCommitting || !canWrite || bloqueParInvalides || rienAImporter}
                    >
                        {isCommitting
                            ? 'Import en cours…'
                            : `Importer ${totals.valid} fiche${totals.valid > 1 ? 's' : ''}`}
                    </Button>
                </div>
            </div>
        </BaseModal>
    );
}
