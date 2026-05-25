import { FileText } from 'lucide-react';
import type { Agent } from '../types/agent';
import type { TreeNode } from '../types/orgchart';
import { useEscapeClose } from '../hooks/useEscapeClose';

/**
 * PrintExportView — aperçu A3 paysage avant export PDF (bundle v2).
 *
 * Overlay sombre flouté, page A3 (1120 × 792) avec :
 *   - en-tête : marque Organigrad + libellé pôle + date + comptage
 *   - corps : organigramme imprimable (hairlines, plus de chrome)
 *   - colonne Annuaire à droite (liste alphabétique)
 *   - pied : "Document généré automatiquement · 1 / 1"
 *   - toolbar HORS de la page : Fermer + Télécharger PDF
 */

interface PrintExportViewProps {
    isOpen: boolean;
    poleLabel?: string;
    tree: TreeNode[];
    agents: Agent[];
    onClose: () => void;
    onDownload?: () => void;
}

function PrintNode({ node, isRoot = false }: { node: TreeNode; isRoot?: boolean }) {
    const isDirection = node.gradeStyle === 'Direction';
    const isVacant = !node.nom && !node.prenom; // heuristique simple
    const hasChildren = !!node.children && node.children.length > 0;
    return (
        <div className="pp-branch">
            <div
                className={[
                    'pp-card',
                    isDirection ? 'dir' : '',
                    isVacant ? 'vacant' : '',
                ]
                    .filter(Boolean)
                    .join(' ')}
            >
                {!isVacant && node.gradeStyle && (
                    <div className="pp-grade">{node.gradeStyle}</div>
                )}
                <div className="pp-name">
                    {isVacant ? (
                        'Poste à pourvoir'
                    ) : (
                        <>
                            {node.prenom} <span className="sn">{node.nom}</span>
                        </>
                    )}
                </div>
                {node.fonction && <div className="pp-fonction">{node.fonction}</div>}
                {!isDirection && node.service && (
                    <div className="pp-service">{node.service}</div>
                )}
            </div>
            {hasChildren && (
                <div className="pp-children">
                    {node.children!.map((c) => (
                        <PrintNode key={c.id} node={c} />
                    ))}
                </div>
            )}
            {!isRoot && null}
        </div>
    );
}

export function PrintExportView({
    isOpen,
    poleLabel,
    tree,
    agents,
    onClose,
    onDownload,
}: PrintExportViewProps) {
    useEscapeClose(isOpen, onClose);
    if (!isOpen) return null;

    const today = new Date().toLocaleDateString('fr-FR', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
    });
    const flat = agents.filter((a) => a.nom || a.prenom);
    const services = new Set(flat.map((a) => a.service).filter(Boolean));

    return (
        <div
            className="dsm-print-overlay"
            role="dialog"
            aria-modal="true"
            onClick={onClose}
        >
            <div className="dsm-print-stage" onClick={(e) => e.stopPropagation()}>
                {/* Toolbar flottante HORS de la page */}
                <div className="dsm-print-toolbar">
                    <div className="pt-label">
                        <div className="pt-eyebrow">Aperçu export</div>
                        <div className="pt-title">
                            {poleLabel ? `${poleLabel} · A3 paysage` : 'A3 paysage'}
                        </div>
                    </div>
                    <div className="toolbar-actions">
                        <button
                            type="button"
                            onClick={onClose}
                            className="inline-flex items-center justify-center rounded-full px-4 py-2 text-[13px] font-medium text-white"
                            style={{ background: 'rgba(255,255,255,0.18)' }}
                        >
                            Fermer
                        </button>
                        <button
                            type="button"
                            onClick={onDownload}
                            className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-[13px] font-medium text-white"
                            style={{ background: 'var(--accent)' }}
                        >
                            <FileText size={13} strokeWidth={1.6} />
                            Télécharger le PDF
                        </button>
                    </div>
                </div>

                {/* Page A3 réelle */}
                <div className="dsm-print-page">
                    <header className="pp-head">
                        <div className="pp-brand">
                            <div className="pp-mark">O</div>
                            <div>
                                <div className="pp-product">Organigrad</div>
                                <div className="pp-city">Organisation</div>
                            </div>
                        </div>
                        <div className="pp-meta">
                            <div className="pp-pole-label">Pôle / Direction</div>
                            <div className="pp-pole">{poleLabel || 'Toutes les directions'}</div>
                            <div className="pp-stamp">
                                <span>Généré le {today}</span>
                                <span className="pp-dot" />
                                <span>
                                    {flat.length} agents · {services.size} services
                                </span>
                            </div>
                        </div>
                    </header>

                    <main className="pp-body">
                        {tree.length === 0 ? (
                            <div
                                style={{
                                    height: '100%',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    color: 'var(--fg-4)',
                                    fontSize: 13,
                                }}
                            >
                                Aucun nœud à imprimer pour ce pôle.
                            </div>
                        ) : (
                            tree.map((root) => (
                                <div key={root.id} className="pp-tree">
                                    <PrintNode node={root} isRoot />
                                </div>
                            ))
                        )}
                    </main>

                    <aside className="pp-index">
                        <div className="pp-index-eyebrow">Annuaire</div>
                        <div className="pp-index-list">
                            {flat.map((a) => (
                                <div key={a.id} className="pp-index-row">
                                    <span className="pp-index-name">
                                        {a.prenom} <b>{a.nom}</b>
                                    </span>
                                    <span className="pp-index-role">{a.fonction}</span>
                                </div>
                            ))}
                        </div>
                    </aside>

                    <footer className="pp-foot">
                        <span>Document généré automatiquement · ne pas modifier</span>
                        <span>1 / 1</span>
                    </footer>
                </div>
            </div>
        </div>
    );
}
