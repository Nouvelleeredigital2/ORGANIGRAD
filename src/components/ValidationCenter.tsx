import { X, Check, XCircle } from 'lucide-react';
import { useState } from 'react';
import type { HybridNode } from '../types/hybridNode';
import { Button } from '../design/ui';
import { cx } from '../design/cx';
import { ARCHETYPE } from '../design/tokens';
import { useEscapeClose } from '../hooks/useEscapeClose';
import { VoiceMicButton } from './VoiceMicButton';
import type { VoiceCapture } from '@apps2026/voice-client';

/**
 * Validation Center — refonte v2 (bundle Design System Apple-style).
 *
 * Format : panneau coulissant à droite (460px), overlay sombre flouté,
 * animation slide-in-right Apple emphatic. Liste des items à valider avec
 * glyphe d'archétype, métadonnées, actions Détails / Valider.
 *
 * Construit sur les classes `.dsm-vc-*` injectées par `design-system.css`.
 */

export interface ValidationItem {
    node: HybridNode;
    /** Description courte du livrable. */
    what: string;
    /** Détail technique (1 ligne). */
    detail?: string;
    /** Horodatage relatif lisible (« il y a 4 minutes »). */
    when?: string;
}

interface ValidationCenterProps {
    isOpen: boolean;
    items: ValidationItem[];
    onClose: () => void;
    /**
     * Renvoyer `false` (ou une promesse résolue à `false`) signale un échec :
     * le panneau reste ouvert et la saisie est conservée. Une décision humaine
     * ne doit jamais être perdue parce que l'appel distant a échoué.
     */
    onApprove: (node: HybridNode) => void | Promise<boolean>;
    onReject?: (node: HybridNode, feedback: string) => void | Promise<boolean>;
    onShowDetails?: (node: HybridNode) => void;
    /**
     * Mode d'exécution, pour que le pied de panneau dise la vérité :
     * en local rien n'est persisté, en distant un appel réel est émis.
     */
    mode?: 'local' | 'remote';
    /**
     * Base du proxy vocal de l'orchestrateur (ex. `${baseUrl}/voice/gateway`).
     * Absente → pas de bouton micro (mode local sans orchestrateur).
     */
    voiceProxyBasePath?: string;
    /** Injection de la capture micro pour les tests (jsdom n'a pas de micro). */
    voiceCapture?: VoiceCapture;
}

const GLYPH_CLASS: Record<HybridNode['type'], 'human' | 'ai' | 'mcp'> = {
    HUMAN: 'human',
    AGENT_IA: 'ai',
    SOFTWARE_MCP: 'mcp',
};

export function ValidationCenter({
    isOpen,
    items,
    onClose,
    onApprove,
    onReject,
    onShowDetails,
    mode = 'local',
    voiceProxyBasePath,
    voiceCapture,
}: ValidationCenterProps) {
    const [rejectingId, setRejectingId] = useState<string | null>(null);
    const [rejectFeedback, setRejectFeedback] = useState('');
    const [pendingId, setPendingId] = useState<string | null>(null);

    useEscapeClose(isOpen, onClose);
    if (!isOpen) return null;

    const handleRejectConfirm = async (node: HybridNode) => {
        if (pendingId === node.id) return;
        const fb = rejectFeedback.trim();
        if (!fb) return;
        setPendingId(node.id);
        const outcome = await onReject?.(node, fb);
        setPendingId(null);
        // On ne vide le motif QUE si le rejet a abouti — sinon l'utilisateur
        // devrait le ressaisir alors que rien n'a été enregistré.
        if (outcome === false) return;
        setRejectingId(null);
        setRejectFeedback('');
    };

    const handleApprove = async (node: HybridNode) => {
        setPendingId(node.id);
        await onApprove(node);
        setPendingId(null);
    };

    const count = items.length;
    const headline =
        count === 0
            ? 'Aucune décision en attente'
            : count === 1
              ? '1 décision vous attend'
              : `${count} décisions vous attendent`;

    return (
        <div className="dsm-vc-overlay" role="dialog" aria-modal="true" onClick={onClose}>
            <div className="dsm-vc-panel" onClick={(e) => e.stopPropagation()}>
                <header className="dsm-vc-head">
                    <div>
                        <div className="dsm-vc-eyebrow">Centre de validation</div>
                        <h2 className="dsm-vc-title">{headline}</h2>
                    </div>
                    <button className="dsm-vc-close" onClick={onClose} aria-label="Fermer">
                        <X size={14} strokeWidth={1.8} />
                    </button>
                </header>

                <div className="dsm-vc-list">
                    {count === 0 ? (
                        <div
                            style={{
                                padding: '40px 16px',
                                textAlign: 'center',
                                color: 'var(--fg-4)',
                                fontSize: 13,
                            }}
                        >
                            Lance la chaîne d'orchestration pour générer une demande de validation.
                        </div>
                    ) : (
                        items.map((it) => {
                            const archetype = ARCHETYPE[it.node.type];
                            return (
                                <div key={it.node.id} className="dsm-vc-item">
                                    <div className={cx('dsm-vc-glyph', GLYPH_CLASS[it.node.type])} />
                                    <div className="dsm-vc-body">
                                        <div className="dsm-vc-who">
                                            {archetype.label} · {it.node.nom}
                                        </div>
                                        <div className="dsm-vc-what">{it.what}</div>
                                        {it.detail && <div className="dsm-vc-detail">{it.detail}</div>}
                                        {it.when && <div className="dsm-vc-when">{it.when}</div>}
                                    </div>
                                    <div className="dsm-vc-actions">
                                        {onShowDetails && (
                                            <Button
                                                tone="slate"
                                                variant="soft"
                                                size="sm"
                                                onClick={() => onShowDetails(it.node)}
                                            >
                                                Détails
                                            </Button>
                                        )}
                                        <Button
                                            tone="blue"
                                            size="sm"
                                            disabled={pendingId === it.node.id}
                                            onClick={() => void handleApprove(it.node)}
                                        >
                                            <Check size={12} strokeWidth={2} />{' '}
                                            {pendingId === it.node.id ? 'Envoi…' : 'Valider'}
                                        </Button>
                                        {onReject && rejectingId !== it.node.id && (
                                            <button
                                                onClick={() => {
                                                    setRejectingId(it.node.id);
                                                    setRejectFeedback('');
                                                }}
                                                style={{
                                                    background: 'transparent',
                                                    border: 'none',
                                                    color: 'var(--system-red)',
                                                    fontSize: 11,
                                                    fontWeight: 500,
                                                    cursor: 'pointer',
                                                    padding: '4px 8px',
                                                }}
                                            >
                                                Rejeter
                                            </button>
                                        )}
                                    </div>
                                    {onReject && rejectingId === it.node.id && (
                                        <div style={{ display: 'flex', gap: 6, marginTop: 8, alignItems: 'center' }}>
                                            <input
                                                autoFocus
                                                value={rejectFeedback}
                                                onChange={(e) => setRejectFeedback(e.target.value)}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter') void handleRejectConfirm(it.node);
                                                    if (e.key === 'Escape') { setRejectingId(null); setRejectFeedback(''); }
                                                }}
                                                placeholder="Motif du rejet…"
                                                style={{
                                                    flex: 1,
                                                    fontSize: 11,
                                                    padding: '5px 10px',
                                                    borderRadius: 8,
                                                    border: '1px solid var(--system-red)',
                                                    outline: 'none',
                                                    background: 'var(--bg-1)',
                                                    color: 'var(--fg-1)',
                                                }}
                                            />
                                            {voiceProxyBasePath && (
                                                <VoiceMicButton
                                                    proxyBasePath={voiceProxyBasePath}
                                                    capture={voiceCapture}
                                                />
                                            )}
                                            <button
                                                onClick={() => void handleRejectConfirm(it.node)}
                                                disabled={!rejectFeedback.trim() || pendingId === it.node.id}
                                                style={{
                                                    background: 'var(--system-red)',
                                                    color: '#fff',
                                                    border: 'none',
                                                    borderRadius: 8,
                                                    padding: '5px 10px',
                                                    fontSize: 11,
                                                    fontWeight: 600,
                                                    cursor: rejectFeedback.trim() && pendingId !== it.node.id ? 'pointer' : 'not-allowed',
                                                    opacity: rejectFeedback.trim() && pendingId !== it.node.id ? 1 : 0.5,
                                                }}
                                            >
                                                <XCircle size={12} style={{ display: 'inline', marginRight: 4 }} />
                                                Confirmer
                                            </button>
                                            <button
                                                onClick={() => { setRejectingId(null); setRejectFeedback(''); }}
                                                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--fg-3)', fontSize: 11 }}
                                            >
                                                Annuler
                                            </button>
                                        </div>
                                    )}
                                </div>
                            );
                        })
                    )}
                </div>

                <p className="dsm-vc-foot">
                    {mode === 'remote'
                        ? "Les décisions sont transmises à l'orchestrateur."
                        : 'Mode local · les décisions ne sont pas persistées et seront perdues au rechargement.'}
                </p>
            </div>
        </div>
    );
}
