import { X, UserCircle, Mail, User } from 'lucide-react';
import type { Agent } from '../types/agent';
import { useEscapeClose } from '../hooks/useEscapeClose';

/**
 * ProfileFiche — fiche agent plein écran modal (v2, bundle Apple-style).
 *
 * Différencié du `ProfileModal` legacy qui porte l'édition. Cette fiche est
 * en LECTURE SEULE : avatar 72 px, chips Pôle/Service/Grade, sections
 * Identité + Coordonnées, footer à trois actions.
 *
 * Surnames en CAPS (convention administrative française).
 * Email/téléphone affichés tels qu'ils existent sur l'agent — aucun fallback hardcodé.
 */

interface ProfileFicheProps {
    isOpen: boolean;
    agent: Agent | null;
    onClose: () => void;
    onContact?: (agent: Agent) => void;
    onLocate?: (agent: Agent) => void;
}

function Field({ label, value }: { label: string; value: string | number | null | undefined }) {
    return (
        <div className="field">
            <div className="k">{label}</div>
            <div className="v">{value || '—'}</div>
        </div>
    );
}

export function ProfileFiche({ isOpen, agent, onClose, onContact, onLocate }: ProfileFicheProps) {
    useEscapeClose(isOpen, onClose);
    if (!isOpen || !agent) return null;

    const email = agent.email || null;

    return (
        <div className="dsm-modal-overlay" role="dialog" aria-modal="true" onClick={onClose}>
            <div className="dsm-modal" onClick={(e) => e.stopPropagation()}>
                <div className="head">
                    <div className="avatar">
                        {agent.avatarUrl ? (
                            <img
                                src={agent.avatarUrl}
                                alt={agent.nom}
                                style={{
                                    width: '100%',
                                    height: '100%',
                                    borderRadius: '50%',
                                    objectFit: 'cover',
                                }}
                            />
                        ) : (
                            <User size={32} strokeWidth={1.5} />
                        )}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="name">
                            {agent.prenom} <span className="sn">{agent.nom}</span>
                        </div>
                        <div className="role">{agent.fonction}</div>
                        <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                            <span className="chip">{agent.pole || '—'}</span>
                            <span className="chip">{agent.service || '—'}</span>
                            {agent.gradeStyle && <span className="chip">{agent.gradeStyle}</span>}
                        </div>
                    </div>
                    <button className="close" onClick={onClose} aria-label="Fermer">
                        <X size={14} strokeWidth={1.8} />
                    </button>
                </div>

                <section style={{ marginBottom: 18 }}>
                    <div
                        className="k"
                        style={{
                            fontSize: 11,
                            fontWeight: 600,
                            color: 'var(--fg-4)',
                            textTransform: 'uppercase',
                            letterSpacing: '0.14em',
                            marginBottom: 10,
                        }}
                    >
                        Identité
                    </div>
                    <div className="grid">
                        <Field label="Pôle" value={agent.pole} />
                        <Field label="Service" value={agent.service} />
                        <Field label="Grade" value={agent.gradeStyle} />
                        <Field label="Type de temps" value={agent.typeTemps} />
                        <Field label="Titre" value={agent.titre} />
                        <Field label="NBI" value={agent.nbi ? `${agent.nbi} pts` : null} />
                    </div>
                </section>

                <section style={{ marginBottom: 18 }}>
                    <div
                        className="k"
                        style={{
                            fontSize: 11,
                            fontWeight: 600,
                            color: 'var(--fg-4)',
                            textTransform: 'uppercase',
                            letterSpacing: '0.14em',
                            marginBottom: 10,
                        }}
                    >
                        Coordonnées
                    </div>
                    <div className="grid">
                        <Field label="Email" value={email} />
                        <Field label="Téléphone" value={agent.phone} />
                    </div>
                </section>

                <div className="footer-row">
                    <button
                        type="button"
                        onClick={onClose}
                        className="inline-flex items-center justify-center rounded-full px-4 py-2 text-[13px] font-medium"
                        style={{ background: 'rgba(0,0,0,0.05)', color: 'var(--fg-1)' }}
                    >
                        Fermer
                    </button>
                    {onLocate && (
                        <button
                            type="button"
                            onClick={() => onLocate(agent)}
                            className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-[13px] font-medium"
                            style={{ background: 'rgba(0,0,0,0.05)', color: 'var(--fg-1)' }}
                        >
                            <UserCircle size={13} strokeWidth={1.6} />
                            Voir dans l'organigramme
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={() => onContact?.(agent)}
                        className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-[13px] font-medium text-white"
                        style={{ background: 'var(--accent)' }}
                    >
                        <Mail size={13} strokeWidth={1.6} />
                        Contacter
                    </button>
                </div>
            </div>
        </div>
    );
}
