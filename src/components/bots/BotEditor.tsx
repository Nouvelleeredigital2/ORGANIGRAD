import { useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { BotFamily, BotProfile, BotSource } from '../../types/botProfile';
import {
    BOT_FAMILIES,
    BOT_FAMILY_LABEL,
    BOT_NETWORKS,
    BOT_NETWORK_LABEL,
    emptyBotProfile,
    validateBotProfile,
} from '../../types/botProfile';
import { compileBotPrompt } from '../../bots/compileBotPrompt';
import { Button, FormField, Input, Select, Surface, Textarea } from '../../design/ui';
import { cx } from '../../design/cx';
import { TEXT, Z } from '../../design/tokens';
import { useEscapeClose } from '../../hooks/useEscapeClose';
import { randomUuid } from '../../utils/randomId';
import { BotPortrait } from './BotPortrait';

interface BotEditorProps {
    isOpen: boolean;
    bot?: BotProfile | null;
    onClose: () => void;
    /** Peut renvoyer une Promise : le bouton se désactive jusqu'à sa résolution. */
    onSave: (bot: BotProfile) => void | Promise<void>;
}

/**
 * Éditeur visuel d'un bot conversationnel Hermès.
 *
 * Chaque champ correspond à une section du prompt système compilé — voir
 * l'aperçu en pied de formulaire. Aucun champ ne fait office de « prompt
 * libre » : la structure existe précisément pour empêcher qu'un socle commun
 * verbeux masque la spécialité, le défaut mesuré dans le lot du 11/09/2026.
 */
export function BotEditor({ isOpen, bot, onClose, onSave }: BotEditorProps) {
    const [draft, setDraft] = useState<BotProfile>(() => bot ?? emptyBotProfile(randomUuid()));
    const [sourceDraft, setSourceDraft] = useState<BotSource>({ label: '', url: '', note: '' });
    const [isSaving, setIsSaving] = useState(false);
    const [showErrors, setShowErrors] = useState(false);

    // Réinitialise le brouillon quand la modale s'ouvre sur un bot différent —
    // ajustement d'état pendant le rendu, même motif que NodeEditor.
    const editorKey = isOpen ? (bot?.id ?? '__new__') : '__closed__';
    const [syncedKey, setSyncedKey] = useState(editorKey);
    if (editorKey !== syncedKey) {
        setSyncedKey(editorKey);
        if (isOpen) {
            setDraft(bot ?? emptyBotProfile(randomUuid()));
            setSourceDraft({ label: '', url: '', note: '' });
            setIsSaving(false);
            setShowErrors(false);
        }
    }

    useEscapeClose(isOpen, onClose);

    const errors = useMemo(() => validateBotProfile(draft), [draft]);
    const preview = useMemo(() => compileBotPrompt(draft), [draft]);

    if (!isOpen) return null;

    const update = <K extends keyof BotProfile>(key: K, value: BotProfile[K]) =>
        setDraft((d) => ({ ...d, [key]: value }));

    const addSource = () => {
        if (!sourceDraft.label.trim() || !sourceDraft.url.trim()) return;
        update('sources', [...draft.sources, { ...sourceDraft }]);
        setSourceDraft({ label: '', url: '', note: '' });
    };
    const removeSource = (index: number) => update('sources', draft.sources.filter((_, i) => i !== index));

    const handleFamilyChange = (family: BotFamily) => {
        setDraft((d) => ({ ...d, family, network: family === 'redacteur' ? (d.network ?? 'instagram') : null }));
    };

    const handleSave = async () => {
        if (isSaving) return;
        if (errors.length > 0) {
            setShowErrors(true);
            return;
        }
        setIsSaving(true);
        try {
            await onSave(draft);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div
            className={cx(
                'fixed inset-0 flex items-center justify-center bg-slate-900/30 px-4 py-6 backdrop-blur-sm',
                Z.modal,
                'overflow-y-auto',
            )}
            role="dialog"
            aria-modal="true"
            onClick={onClose}
        >
            <Surface
                variant="modal"
                className="my-auto w-full max-w-3xl overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                <header className="flex items-start justify-between gap-4 border-b border-slate-100 bg-[var(--accent-tint)] p-6">
                    <div className="min-w-0">
                        <p className={cx(TEXT.kicker)} style={{ color: 'var(--accent)' }}>
                            {bot ? 'Édition du bot' : 'Nouveau bot'} · {BOT_FAMILY_LABEL[draft.family]}
                        </p>
                        <h2 className={cx('mt-1 truncate', TEXT.h2)}>{draft.displayName || 'Sans nom'}</h2>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-full p-1 text-slate-400 transition hover:bg-white hover:text-slate-600"
                        aria-label="Fermer"
                    >
                        ×
                    </button>
                </header>

                <div className="max-h-[70vh] space-y-6 overflow-y-auto p-6">
                    {/* Identité ------------------------------------------------ */}
                    <div className="flex items-center gap-4">
                        <BotPortrait name={draft.displayName} url={draft.avatarUrl} />
                        <FormField label="URL du portrait" hint="Lien HTTPS vers une image existante. Le téléversement sera disponible ultérieurement.">
                            <Input aria-label="URL du portrait" type="url" maxLength={2048} value={draft.avatarUrl ?? ''} onChange={(e) => update('avatarUrl', e.target.value || null)} placeholder="https://…" />
                        </FormField>
                    </div>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <FormField label="Famille">
                            <Select value={draft.family} onChange={(e) => handleFamilyChange(e.target.value as BotFamily)}>
                                {BOT_FAMILIES.map((f) => (
                                    <option key={f} value={f}>
                                        {BOT_FAMILY_LABEL[f]}
                                    </option>
                                ))}
                            </Select>
                        </FormField>
                        <FormField label="Nom affiché">
                            <Input
                                value={draft.displayName}
                                onChange={(e) => update('displayName', e.target.value)}
                                placeholder="Anita"
                            />
                        </FormField>
                    </div>

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <FormField
                            label="Identifiant runtime"
                            hint="Minuscules, chiffres, points, tirets — clé du registre Telegram."
                        >
                            <Input
                                value={draft.runtimeId}
                                onChange={(e) => update('runtimeId', e.target.value.trim())}
                                placeholder="anita.instagram.bot"
                            />
                        </FormField>
                        <FormField label="Nom de fichier" hint="Fichier lu par le lecteur Hermès (.txt).">
                            <Input
                                value={draft.fileName}
                                onChange={(e) => update('fileName', e.target.value.trim())}
                                placeholder="anita.instagram.bot.txt"
                            />
                        </FormField>
                    </div>

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                        {draft.family === 'redacteur' && (
                            <FormField label="Réseau">
                                <Select value={draft.network ?? ''} onChange={(e) => update('network', e.target.value)}>
                                    {BOT_NETWORKS.map((n) => (
                                        <option key={n} value={n}>
                                            {BOT_NETWORK_LABEL[n]}
                                        </option>
                                    ))}
                                </Select>
                            </FormField>
                        )}
                        <FormField label="Marque" hint="Laisser vide si « selon le brief validé ».">
                            <Input
                                value={draft.brand ?? ''}
                                onChange={(e) => update('brand', e.target.value || null)}
                                placeholder="Nature & Tech"
                            />
                        </FormField>
                        <FormField label="Nom Telegram" hint="Sans @ — informatif seulement.">
                            <Input
                                value={draft.telegramUsername ?? ''}
                                onChange={(e) => update('telegramUsername', e.target.value || null)}
                                placeholder="anita_instagram_bot"
                            />
                        </FormField>
                    </div>

                    {/* Spécialité ---------------------------------------------- */}
                    <FormField label="Mission" hint="Ce que ce bot fait, en deux ou trois phrases.">
                        <Textarea
                            value={draft.mission}
                            onChange={(e) => update('mission', e.target.value)}
                            rows={2}
                            placeholder="Adapter un sujet validé à Instagram sans déformer le fond établi par les veilleurs."
                        />
                    </FormField>

                    <FormField label="Personnalité">
                        <Textarea
                            value={draft.personality}
                            onChange={(e) => update('personality', e.target.value)}
                            rows={2}
                        />
                    </FormField>

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <FormField label="Recherche" hint="Comment ce bot vérifie une affirmation.">
                            <Textarea value={draft.research} onChange={(e) => update('research', e.target.value)} rows={3} />
                        </FormField>
                        <FormField label="Veille" hint="Fréquence, périmètre, ce que couvre un bilan.">
                            <Textarea value={draft.watch} onChange={(e) => update('watch', e.target.value)} rows={3} />
                        </FormField>
                    </div>

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <FormField label="Livrables">
                            <Textarea
                                value={draft.deliverables}
                                onChange={(e) => update('deliverables', e.target.value)}
                                rows={3}
                            />
                        </FormField>
                        <FormField label="Méthode" hint="La procédure concrète, pas seulement des interdictions.">
                            <Textarea value={draft.method} onChange={(e) => update('method', e.target.value)} rows={3} />
                        </FormField>
                    </div>

                    <FormField label="Limites" hint="Ce que ce bot ne fait jamais.">
                        <Textarea value={draft.limits} onChange={(e) => update('limits', e.target.value)} rows={2} />
                    </FormField>

                    <FormField label="Contexte utile" hint="Informations à ne jamais redemander si déjà connues.">
                        <Textarea
                            value={draft.usefulContext}
                            onChange={(e) => update('usefulContext', e.target.value)}
                            rows={2}
                        />
                    </FormField>

                    {/* Sources --------------------------------------------------- */}
                    <FormField label="Sources de référence" hint="Pages consultables, jamais une preuve de consultation du jour.">
                        <div className="space-y-2">
                            {draft.sources.map((s, i) => (
                                <div
                                    key={`${s.url}-${i}`}
                                    className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[12px]"
                                >
                                    <span className="min-w-0 flex-1 truncate font-medium text-slate-700">{s.label}</span>
                                    <a
                                        href={s.url}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="min-w-0 flex-1 truncate text-[var(--accent)]"
                                    >
                                        {s.url}
                                    </a>
                                    <button
                                        type="button"
                                        onClick={() => removeSource(i)}
                                        aria-label={`Retirer la source ${s.label}`}
                                        className="shrink-0 rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-rose-600"
                                    >
                                        <Trash2 size={14} strokeWidth={1.6} />
                                    </button>
                                </div>
                            ))}
                            <div className="flex flex-col gap-2 sm:flex-row">
                                <Input
                                    value={sourceDraft.label}
                                    onChange={(e) => setSourceDraft((s) => ({ ...s, label: e.target.value }))}
                                    placeholder="Libellé (PubMed)"
                                    className="sm:w-1/3"
                                />
                                <Input
                                    value={sourceDraft.url}
                                    onChange={(e) => setSourceDraft((s) => ({ ...s, url: e.target.value }))}
                                    placeholder="https://…"
                                    className="sm:flex-1"
                                />
                                <Button tone="slate" variant="soft" size="sm" onClick={addSource} type="button">
                                    <Plus size={13} strokeWidth={1.8} />
                                    Ajouter
                                </Button>
                            </div>
                        </div>
                    </FormField>

                    {/* Modèle ------------------------------------------------- */}
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                        <FormField label="Fournisseur">
                            <Input
                                value={draft.model.provider ?? ''}
                                onChange={(e) => update('model', { ...draft.model, provider: e.target.value })}
                                placeholder="ollama-cloud"
                            />
                        </FormField>
                        <FormField label="Modèle">
                            <Input
                                value={draft.model.model ?? ''}
                                onChange={(e) => update('model', { ...draft.model, model: e.target.value })}
                                placeholder="gpt-oss:120b"
                            />
                        </FormField>
                        <FormField label="Température" hint="Basse pour un livrable de production.">
                            <Input
                                type="number"
                                min={0}
                                max={2}
                                step={0.1}
                                value={draft.model.temperature ?? ''}
                                onChange={(e) =>
                                    update('model', {
                                        ...draft.model,
                                        temperature: e.target.value === '' ? undefined : Number(e.target.value),
                                    })
                                }
                            />
                        </FormField>
                    </div>

                    <p className="text-[13px] text-slate-700">
                        {draft.enabled
                            ? 'Bot existant activé — les connexions et le déploiement sont vérifiés séparément.'
                            : 'Brouillon — activation en attente de vérification des connexions et des dépendances.'}
                    </p>

                    {/* Aperçu du prompt compilé -------------------------------- */}
                    <FormField
                        label="Aperçu du prompt compilé"
                        hint={`${preview.length.toLocaleString('fr-FR')} caractères — le texte réel est recalculé par le serveur à l'enregistrement.`}
                    >
                        <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-[11px] leading-relaxed text-slate-600">
                            {preview}
                        </pre>
                    </FormField>

                    {showErrors && errors.length > 0 && (
                        <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-[12px] text-rose-700">
                            <p className="font-semibold">Corrige avant d’enregistrer :</p>
                            <ul className="mt-1 list-disc space-y-0.5 pl-4">
                                {errors.map((e) => (
                                    <li key={e}>{e}</li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>

                <footer className="flex flex-col-reverse gap-2 border-t border-slate-100 bg-slate-50/60 p-6 sm:flex-row sm:items-center sm:justify-end sm:gap-3">
                    <Button tone="slate" variant="ghost" onClick={onClose} type="button">
                        Annuler
                    </Button>
                    <Button tone="blue" onClick={() => void handleSave()} disabled={isSaving} type="button">
                        {isSaving ? 'Enregistrement…' : bot ? 'Enregistrer' : 'Créer le bot'}
                    </Button>
                </footer>
            </Surface>
        </div>
    );
}
