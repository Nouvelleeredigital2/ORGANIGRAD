import React, { useState } from 'react';
import { BaseModal } from './BaseModal';
import type { Agent } from '../types/agent';
import { Mail, Phone, MapPin, Globe, MessageSquare } from 'lucide-react';

interface ContactModalProps {
    isOpen: boolean;
    onClose: () => void;
    agent: Agent | null;
    isEditMode?: boolean;
    onSave?: (id: string, updates: Partial<Agent>) => void;
}

export const ContactModal: React.FC<ContactModalProps> = ({ isOpen, onClose, agent, isEditMode = false, onSave }) => {
    const [draftsByAgentId, setDraftsByAgentId] = useState<Record<string, Partial<Agent>>>({});

    if (!agent) return null;

    const initialFormData: Partial<Agent> = {
        email: agent.email,
        phone: agent.phone,
        service: agent.service,
    };

    const formData = draftsByAgentId[agent.id] ?? initialFormData;

    const updateDraft = (updates: Partial<Agent>) => {
        setDraftsByAgentId((current) => ({
            ...current,
            [agent.id]: {
                ...formData,
                ...updates,
            },
        }));
    };

    const handleSave = () => {
        if (onSave && agent.id) {
            onSave(agent.id, formData);
            setDraftsByAgentId((current) => {
                const next = { ...current };
                delete next[agent.id];
                return next;
            });
            onClose();
        }
    };

    const emailDisplay = agent.email?.trim() || 'Non renseigne';
    const phoneDisplay = agent.phone?.trim() || 'Non renseigne';
    const officeDisplay = agent.service?.trim() || 'Non renseigne';

    return (
        <BaseModal isOpen={isOpen} onClose={onClose} title={isEditMode ? 'Modifier le Contact' : 'Contact & Reseau'}>
            <div className="space-y-8">
                <div className="flex items-center gap-4 rounded-2xl border border-slate-100 bg-slate-50 p-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-600 text-white shadow-lg shadow-blue-200">
                        <MessageSquare className="h-6 w-6" />
                    </div>
                    <div>
                        <p className="mb-0.5 text-[10px] font-black uppercase tracking-widest text-slate-400">Contact Direct</p>
                        <p className="text-sm font-bold text-slate-700">Prendre contact avec {agent.prenom} {agent.nom}</p>
                    </div>
                </div>

                <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                    {isEditMode ? (
                        <div className="rounded-3xl border border-blue-200 bg-blue-50 p-6">
                            <Mail className="mb-4 h-8 w-8 text-blue-600" />
                            <h4 className="mb-2 text-xs font-black uppercase tracking-widest text-blue-600">Courriel Professionnel</h4>
                            <input
                                type="email"
                                value={formData.email || ''}
                                onChange={(e) => updateDraft({ email: e.target.value })}
                                placeholder="prenom.nom@organisation.fr"
                                className="w-full border-b border-blue-500/30 bg-transparent py-1 text-sm font-bold text-slate-700 outline-none focus:border-blue-500"
                            />
                        </div>
                    ) : (
                        emailDisplay === 'Non renseigne' ? (
                            <div className="rounded-3xl border border-slate-200 bg-white p-6">
                                <Mail className="mb-4 h-8 w-8 text-blue-600" />
                                <h4 className="mb-1 text-xs font-black uppercase tracking-widest text-slate-400">Courriel Professionnel</h4>
                                <p className="truncate text-sm font-bold text-slate-900">{emailDisplay}</p>
                            </div>
                        ) : (
                            <a
                                href={`mailto:${emailDisplay}`}
                                className="group rounded-3xl border border-slate-200 bg-white p-6 transition-all duration-300 hover:border-blue-500 hover:shadow-xl hover:shadow-blue-200/50"
                            >
                                <Mail className="mb-4 h-8 w-8 text-blue-600 transition-transform group-hover:scale-110" />
                                <h4 className="mb-1 text-xs font-black uppercase tracking-widest text-slate-400 transition-colors group-hover:text-blue-600">Courriel Professionnel</h4>
                                <p className="truncate text-sm font-bold text-slate-900">{emailDisplay}</p>
                            </a>
                        )
                    )}

                    {isEditMode ? (
                        <div className="rounded-3xl border border-blue-200 bg-blue-50 p-6">
                            <Phone className="mb-4 h-8 w-8 text-blue-600" />
                            <h4 className="mb-2 text-xs font-black uppercase tracking-widest text-blue-600">Telephone Direct</h4>
                            <input
                                type="text"
                                value={formData.phone || ''}
                                onChange={(e) => updateDraft({ phone: e.target.value })}
                                placeholder="Numéro de téléphone"
                                className="w-full border-b border-blue-500/30 bg-transparent py-1 text-sm font-bold text-slate-700 outline-none focus:border-blue-500"
                            />
                        </div>
                    ) : (
                        <div className="rounded-3xl border border-slate-200 bg-white p-6">
                            <Phone className="mb-4 h-8 w-8 text-blue-600" />
                            <h4 className="mb-1 text-xs font-black uppercase tracking-widest text-slate-400">Telephone Direct</h4>
                            <p className="text-sm font-bold text-slate-900">{phoneDisplay}</p>
                        </div>
                    )}

                    {isEditMode ? (
                        <div className="rounded-3xl border border-blue-200 bg-blue-50 p-6">
                            <MapPin className="mb-4 h-8 w-8 text-blue-600" />
                            <h4 className="mb-2 text-xs font-black uppercase tracking-widest text-blue-600">Lieu de travail</h4>
                            <input
                                type="text"
                                value={formData.service || ''}
                                onChange={(e) => updateDraft({ service: e.target.value })}
                                placeholder="Hotel de Ville"
                                className="w-full border-b border-blue-500/30 bg-transparent py-1 text-sm font-bold text-slate-700 outline-none focus:border-blue-500"
                            />
                        </div>
                    ) : (
                        <div className="rounded-3xl border border-slate-200 bg-white p-6">
                            <MapPin className="mb-4 h-8 w-8 text-slate-400" />
                            <h4 className="mb-1 text-xs font-black uppercase tracking-widest text-slate-400">Lieu de travail</h4>
                            <p className="text-sm font-bold leading-tight text-slate-900">{officeDisplay}</p>
                        </div>
                    )}

                    <div className="rounded-3xl border border-slate-200 bg-white p-6">
                        <Globe className="mb-4 h-8 w-8 text-slate-400" />
                        <h4 className="mb-1 text-xs font-black uppercase tracking-widest text-slate-400">Pôle</h4>
                        <p className="text-sm font-bold text-slate-900">{agent.pole?.trim() || 'Non renseigné'}</p>
                    </div>
                </div>

                {isEditMode ? (
                    <div className="flex gap-3 pt-4">
                        <button
                            onClick={handleSave}
                            className="h-12 flex-1 rounded-2xl bg-blue-600 text-xs font-black uppercase tracking-widest text-white shadow-xl shadow-blue-200 transition-all hover:bg-blue-700"
                        >
                            Enregistrer
                        </button>
                        <button
                            onClick={onClose}
                            className="h-12 flex-1 rounded-2xl bg-slate-100 text-xs font-black uppercase tracking-widest text-slate-500 transition-all hover:bg-slate-200"
                        >
                            Annuler
                        </button>
                    </div>
                ) : (
                    <div className="group relative overflow-hidden rounded-[2rem] bg-slate-900 p-6 text-white shadow-2xl">
                        <div className="absolute right-0 top-0 h-32 w-32 bg-blue-600 opacity-20 blur-[60px] transition-opacity group-hover:opacity-40"></div>
                        <p className="mb-3 text-[10px] font-black uppercase tracking-[0.3em] text-blue-400">Securite & Confidentialite</p>
                        <p className="text-xs font-medium leading-relaxed text-slate-300">
                            Les informations de contact sont reservees a un usage interne professionnel. Toute utilisation abusive est strictement interdite.
                        </p>
                    </div>
                )}
            </div>
        </BaseModal>
    );
};
