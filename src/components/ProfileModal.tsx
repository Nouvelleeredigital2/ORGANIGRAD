import React from 'react';
import { BaseModal } from './BaseModal';
import type { Agent } from '../types/agent';
import { User, Building, MapPin, Clock, Award, CheckCircle2, Mail, Phone } from 'lucide-react';

interface ProfileModalProps {
    isOpen: boolean;
    onClose: () => void;
    agent: Agent | null;
    isEditMode?: boolean;
    onSave?: (id: string, updates: Partial<Agent>) => void;
}

export const ProfileModal: React.FC<ProfileModalProps> = ({ isOpen, onClose, agent, isEditMode = false, onSave }) => {
    const [formData, setFormData] = React.useState<Partial<Agent>>({});
    const fileInputRef = React.useRef<HTMLInputElement>(null);

    const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            setFormData((prev) => ({ ...prev, avatarUrl: ev.target?.result as string }));
        };
        reader.readAsDataURL(file);
    };

    React.useEffect(() => {
        if (agent) setFormData(agent);
    }, [agent]);

    if (!agent) return null;

    const handleSave = () => {
        if (!onSave || !agent.id) return;
        if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
            alert('Adresse email invalide.');
            return;
        }
        onSave(agent.id, formData);
        onClose();
    };

    const renderField = (label: string, value: string | number | undefined, key: keyof Agent, Icon: React.ElementType) => {
        return (
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 flex items-center gap-3">
                <Icon className="w-5 h-5 text-slate-400" />
                <div className="flex-1">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">{label}</p>
                    {isEditMode ? (
                        <input
                            type="text"
                            value={formData[key] as string || ''}
                            onChange={(e) => setFormData({ ...formData, [key]: e.target.value })}
                            className="w-full bg-transparent border-b border-blue-500/30 focus:border-blue-500 outline-none text-sm font-bold text-slate-700 py-0.5"
                        />
                    ) : (
                        <p className="text-sm font-bold text-slate-700">{value || 'N/A'}</p>
                    )}
                </div>
            </div>
        );
    };

    return (
        <BaseModal isOpen={isOpen} onClose={onClose} title={isEditMode ? "Modifier l'Agent" : "Profil de l'Agent"}>
            <div className="flex flex-col md:flex-row gap-8">
                {/* Photo & Basic Info */}
                <div className="flex flex-col items-center flex-shrink-0">
                    <div
                        className="w-32 h-32 rounded-full border-4 border-slate-50 shadow-xl overflow-hidden mb-4 relative group"
                        onClick={isEditMode ? () => fileInputRef.current?.click() : undefined}
                        style={isEditMode ? { cursor: 'pointer' } : undefined}
                    >
                        {(isEditMode ? formData.avatarUrl : agent.avatarUrl) ? (
                            <img src={isEditMode ? (formData.avatarUrl as string) : agent.avatarUrl} alt={agent.nom} className="w-full h-full object-cover" />
                        ) : (
                            <div className="w-full h-full bg-slate-100 flex items-center justify-center text-slate-300">
                                <User className="w-16 h-16" />
                            </div>
                        )}
                        {isEditMode && (
                            <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                <p className="text-[8px] text-white font-black uppercase">Changer</p>
                            </div>
                        )}
                    </div>
                    {isEditMode && (
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={handleAvatarChange}
                        />
                    )}
                    <div className="px-4 py-1.5 rounded-full bg-blue-600 text-white text-[10px] font-black uppercase tracking-widest shadow-lg shadow-blue-200">
                        {agent.gradeStyle}
                    </div>
                </div>

                {/* Details */}
                <div className="flex-1 space-y-6">
                    <div>
                        {isEditMode ? (
                            <div className="flex gap-2">
                                <input
                                    placeholder="Prénom"
                                    className="text-2xl font-black text-slate-900 tracking-tighter bg-transparent border-b border-blue-500/30 outline-none w-1/2"
                                    value={formData.prenom || ''}
                                    onChange={(e) => setFormData({ ...formData, prenom: e.target.value })}
                                />
                                <input
                                    placeholder="Nom"
                                    className="text-2xl font-black text-slate-900 tracking-tighter bg-transparent border-b border-blue-500/30 outline-none w-1/2 uppercase"
                                    value={formData.nom || ''}
                                    onChange={(e) => setFormData({ ...formData, nom: e.target.value })}
                                />
                            </div>
                        ) : (
                            <h3 className="text-3xl font-black text-slate-900 tracking-tighter leading-none mb-1">
                                {agent.prenom} <span className="uppercase">{agent.nom}</span>
                            </h3>
                        )}
                        {isEditMode ? (
                            <input
                                placeholder="Fonction"
                                className="text-lg font-bold text-blue-600 uppercase tracking-tight bg-transparent border-b border-blue-500/30 outline-none w-full mt-2"
                                value={formData.fonction || ''}
                                onChange={(e) => setFormData({ ...formData, fonction: e.target.value })}
                            />
                        ) : (
                            <p className="text-lg font-bold text-blue-600 uppercase tracking-tight">
                                {agent.fonction}
                            </p>
                        )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {renderField('Pôle', formData.pole, 'pole', Building)}
                        {renderField('Service', formData.service, 'service', MapPin)}
                        {renderField('Temps de travail', formData.typeTemps, 'typeTemps', Clock)}
                        {renderField('NBI', formData.nbi?.toString(), 'nbi', Award)}
                        {renderField('Email', formData.email, 'email', Mail)}
                        {renderField('Téléphone', formData.phone, 'phone', Phone)}
                    </div>

                    {isEditMode ? (
                        <div className="flex gap-3 pt-4">
                            <button
                                onClick={handleSave}
                                className="flex-1 h-12 bg-blue-600 text-white font-black uppercase tracking-widest text-xs rounded-2xl shadow-xl shadow-blue-200 hover:bg-blue-700 transition-all"
                            >
                                Enregistrer
                            </button>
                            <button
                                onClick={onClose}
                                className="flex-1 h-12 bg-slate-100 text-slate-500 font-black uppercase tracking-widest text-xs rounded-2xl hover:bg-slate-200 transition-all"
                            >
                                Annuler
                            </button>
                        </div>
                    ) : (
                        <div className="p-6 rounded-3xl bg-blue-50 border border-blue-100">
                            <div className="flex items-start gap-4">
                                <div className="mt-1">
                                    <CheckCircle2 className="w-5 h-5 text-blue-600" />
                                </div>
                                <div>
                                    <h4 className="text-sm font-black text-blue-900 uppercase tracking-widest mb-2">Statut de l'Agent</h4>
                                    <p className="text-xs text-blue-700 leading-relaxed font-medium">
                                        Agent actif. Ce profil est synchronisé avec la source de données configurée (CSV local ou URL distante).
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </BaseModal>
    );
};
