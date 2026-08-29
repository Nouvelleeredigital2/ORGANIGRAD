import { useMemo, useState } from 'react';
import type { HybridNode, NodeType } from '../types/hybridNode';
import { Button, FormField, Input, Select, Surface, Textarea } from '../design/ui';
import { cx } from '../design/cx';
import { ARCHETYPE, TEXT, TONE_CLASSES, Z } from '../design/tokens';

const GLYPH_ICON: Record<'disc' | 'aperture' | 'chiclet', string> = {
    disc: '◉',
    aperture: '◎',
    chiclet: '▪',
};
import { useEscapeClose } from '../hooks/useEscapeClose';
import { randomUuid } from '../utils/randomId';

/**
 * Éditeur de HybridNode — création ou édition. Construit sur les primitives
 * Organigrad (Input, Textarea, Select, FormField, Button, Surface).
 */

interface NodeEditorProps {
    isOpen: boolean;
    node?: HybridNode | null;
    /** Liste des nœuds disponibles comme parents. */
    availableNodes?: HybridNode[];
    onClose: () => void;
    /** Peut renvoyer une Promise : NodeEditor désactive alors le bouton
     * jusqu'à sa résolution (voir `isSaving` ci-dessous). */
    onSave: (node: HybridNode) => void | Promise<void>;
}

function emptyNode(type: NodeType = 'AGENT_IA'): HybridNode {
    return {
        id: randomUuid(),
        type,
        nom: '',
        roleTitre: '',
        parentID: null,
        gradeId: 'Expert',
        status: 'IDLE',
        skills: [],
    };
}

/**
 * Champ dont la valeur est chiffrée côté serveur : la SPA n'a pas la clé.
 *
 * On n'affiche donc aucun champ de saisie tant que l'utilisateur n'a pas
 * demandé un remplacement explicite — et tant qu'il ne l'a pas fait, la valeur
 * n'est pas envoyée au serveur, donc conservée.
 */
function EncryptedFieldNotice({ label, onReplace }: { label: string; onReplace: () => void }) {
    // Volontairement PAS dans un <FormField> : celui-ci enveloppe son contenu
    // dans un <label>, ce qui absorberait le nom accessible du bouton. Il n'y a
    // d'ailleurs aucun champ de saisie à étiqueter tant que rien n'est remplacé.
    return (
        <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-xs font-semibold text-slate-500">
                    Configuré (chiffré) · la valeur n'est pas lisible depuis le navigateur.
                </p>
                <Button tone="slate" variant="soft" size="sm" onClick={onReplace}>
                    Remplacer
                </Button>
            </div>
        </div>
    );
}

/** Champs chiffrables, pour typer l'état de remplacement. */
type SecretField = 'systemPrompt' | 'mcpConfig' | 'notificationChannels';

export function NodeEditor({ isOpen, node, availableNodes = [], onClose, onSave }: NodeEditorProps) {
    const parentOptions: HybridNode[] = useMemo(() => availableNodes, [availableNodes]);
    const [draft, setDraft] = useState<HybridNode>(() => node ?? emptyNode());
    const [skillsInput, setSkillsInput] = useState<string>((node?.skills ?? []).join(', '));
    // Champs chiffrés que l'utilisateur a choisi de remplacer. Tant qu'un champ
    // n'y figure pas, sa valeur n'est pas envoyée et le serveur la conserve.
    const [replacing, setReplacing] = useState<Partial<Record<SecretField, boolean>>>({});
    // Anti double-soumission : le bouton n'était pas désactivé pendant l'appel
    // async d'`onSave` — un double-clic déclenchait deux upserts. Audit P2.
    const [isSaving, setIsSaving] = useState(false);

    // Réinitialise le brouillon quand la modale s'ouvre sur un nœud différent —
    // ajustement d'état PENDANT le rendu (pattern React recommandé) plutôt qu'un
    // setState synchrone dans un effet.
    const editorKey = isOpen ? (node?.id ?? '__new__') : '__closed__';
    const [syncedKey, setSyncedKey] = useState(editorKey);
    if (editorKey !== syncedKey) {
        setSyncedKey(editorKey);
        if (isOpen) {
            setDraft(node ?? emptyNode());
            setSkillsInput((node?.skills ?? []).join(', '));
            setReplacing({});
            setIsSaving(false);
        }
    }

    useEscapeClose(isOpen, onClose);

    const archetype = useMemo(() => ARCHETYPE[draft.type], [draft.type]);
    const tone = TONE_CLASSES[archetype.tone];

    if (!isOpen) return null;

    const update = <K extends keyof HybridNode>(key: K, value: HybridNode[K]) =>
        setDraft((d) => ({ ...d, [key]: value }));

    /** Champ chiffré côté serveur ET non encore remplacé : on ne le montre pas. */
    const isSecret = (field: SecretField): boolean =>
        Boolean(draft.encrypted?.[field]) && !replacing[field];

    const startReplacing = (field: SecretField) => setReplacing((r) => ({ ...r, [field]: true }));

    const parseSkills = (raw: string) =>
        raw
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean);

    const isValidUrl = (url: string) => {
        try { new URL(url); return true; } catch { return false; }
    };

    const handleSave = async () => {
        if (isSaving) return; // re-entrance : un clic déjà en vol
        // Un champ remplacé cesse d'être « chiffré non lisible » : on retire son
        // drapeau pour que la nouvelle valeur soit bien transmise. Les autres
        // gardent le leur, donc restent omis de la charge — et conservés.
        const encrypted = { ...(draft.encrypted ?? {}) };
        (Object.keys(replacing) as SecretField[]).forEach((field) => {
            if (replacing[field]) delete encrypted[field];
        });
        const stillEncrypted = Object.keys(encrypted).length > 0;

        const finalNode: HybridNode = {
            ...draft,
            skills: parseSkills(skillsInput),
            ...(stillEncrypted ? { encrypted } : { encrypted: undefined }),
        };
        if (!finalNode.nom.trim() || !finalNode.roleTitre.trim()) return;
        // Validation URLs
        const mcpUrl = finalNode.mcpConfig?.serverUrl;
        if (mcpUrl && !isValidUrl(mcpUrl)) {
            alert('URL du serveur MCP invalide.');
            return;
        }
        const slackUrl = finalNode.notificationChannels?.slackWebhook;
        if (slackUrl && !isValidUrl(slackUrl)) {
            alert('URL du webhook Slack invalide.');
            return;
        }
        setIsSaving(true);
        try {
            await onSave(finalNode);
        } finally {
            // Si `onSave` a fermé la modale (succès), `isOpen` est déjà false
            // au prochain rendu et ce setState n'a plus d'effet visible ; s'il
            // a échoué, l'éditeur reste ouvert et redevient utilisable.
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
                className="w-full max-w-xl overflow-hidden my-auto"
                onClick={(e) => e.stopPropagation()}
            >
                <header
                    className={cx(
                        'flex items-start justify-between gap-4 p-6 border-b',
                        tone.soft,
                        tone.border,
                    )}
                >
                    <div className="min-w-0">
                        <p className={cx(TEXT.kicker, tone.text)}>
                            {node ? 'Édition' : 'Création'} · {archetype.label}
                        </p>
                        <h2 className={cx('mt-1 truncate', TEXT.h2)}>
                            {draft.nom || 'Nouveau nœud'}
                        </h2>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-full p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                        aria-label="Fermer"
                    >
                        ×
                    </button>
                </header>

                <div className="space-y-4 p-6">
                    <FormField label="Archétype">
                        <div className="grid grid-cols-3 gap-2">
                            {(['HUMAN', 'AGENT_IA', 'SOFTWARE_MCP'] as NodeType[]).map((t) => {
                                const a = ARCHETYPE[t];
                                const c = TONE_CLASSES[a.tone];
                                const active = draft.type === t;
                                return (
                                    <button
                                        key={t}
                                        type="button"
                                        disabled={Boolean(node)}
                                        onClick={() => update('type', t)}
                                        className={cx(
                                            'flex flex-col items-center rounded-xl border px-2 py-3 transition',
                                            active
                                                ? cx(c.soft, c.border, c.text)
                                                : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50',
                                            node && 'opacity-60 cursor-not-allowed',
                                        )}
                                    >
                                        <span className="text-lg" aria-hidden>
                                            {GLYPH_ICON[a.glyph]}
                                        </span>
                                        <span className="text-[10px] font-semibold uppercase tracking-wider">
                                            {a.label.split(' · ')[0]}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    </FormField>

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <FormField label="Nom">
                            <Input
                                value={draft.nom}
                                onChange={(e) => update('nom', e.target.value)}
                                placeholder="Rédacteur Campagne"
                            />
                        </FormField>
                        <FormField label="Rôle">
                            <Input
                                value={draft.roleTitre}
                                onChange={(e) => update('roleTitre', e.target.value)}
                                placeholder="Génère textes & visuels"
                            />
                        </FormField>
                    </div>

                    <FormField label="Parent (rattachement)" hint="Détermine la hiérarchie d'orchestration">
                        <Select
                            value={draft.parentID ?? ''}
                            onChange={(e) => update('parentID', e.target.value || null)}
                        >
                            <option value="">— Racine —</option>
                            {parentOptions
                                .filter((n) => n.id !== draft.id)
                                .map((n) => (
                                    <option key={n.id} value={n.id}>
                                        {n.nom || n.roleTitre || n.id}
                                    </option>
                                ))}
                        </Select>
                    </FormField>

                    {(draft.type === 'AGENT_IA' || draft.type === 'SOFTWARE_MCP') && (
                        <FormField label="Skills (séparés par virgule)">
                            <Input
                                value={skillsInput}
                                onChange={(e) => setSkillsInput(e.target.value)}
                                placeholder="rag, web-search, image-gen"
                            />
                        </FormField>
                    )}

                    {draft.type === 'AGENT_IA' &&
                        (isSecret('systemPrompt') ? (
                            <EncryptedFieldNotice
                                label="Prompt système"
                                onReplace={() => startReplacing('systemPrompt')}
                            />
                        ) : (
                            <FormField
                                label="Prompt système"
                                hint={
                                    replacing.systemPrompt
                                        ? 'La valeur saisie remplacera définitivement la précédente'
                                        : 'Visible au survol de la carte'
                                }
                            >
                                <Textarea
                                    value={draft.systemPrompt ?? ''}
                                    onChange={(e) => update('systemPrompt', e.target.value)}
                                    rows={3}
                                    placeholder="Tu es un expert en…"
                                />
                            </FormField>
                        ))}

                    {draft.type === 'SOFTWARE_MCP' &&
                        (isSecret('mcpConfig') ? (
                            <EncryptedFieldNotice
                                label="URL du serveur MCP"
                                onReplace={() => startReplacing('mcpConfig')}
                            />
                        ) : (
                            <FormField label="URL du serveur MCP">
                                <Input
                                    value={draft.mcpConfig?.serverUrl ?? ''}
                                    onChange={(e) =>
                                        update('mcpConfig', {
                                            serverUrl: e.target.value,
                                            connectedTo: draft.mcpConfig?.connectedTo ?? [],
                                        })
                                    }
                                    placeholder="mcp://brand-guard.local"
                                />
                            </FormField>
                        ))}

                    {draft.type === 'HUMAN' && isSecret('notificationChannels') && (
                        <EncryptedFieldNotice
                            label="Canaux de notification"
                            onReplace={() => startReplacing('notificationChannels')}
                        />
                    )}

                    {draft.type === 'HUMAN' && !isSecret('notificationChannels') && (
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                            <FormField label="Email (HITL)">
                                <Input
                                    type="email"
                                    value={draft.notificationChannels?.email ?? ''}
                                    onChange={(e) =>
                                        update('notificationChannels', {
                                            ...(draft.notificationChannels ?? {}),
                                            email: e.target.value,
                                        })
                                    }
                                    placeholder="alice@example.com"
                                />
                            </FormField>
                            <FormField label="Webhook Slack">
                                <Input
                                    value={draft.notificationChannels?.slackWebhook ?? ''}
                                    onChange={(e) =>
                                        update('notificationChannels', {
                                            ...(draft.notificationChannels ?? {}),
                                            slackWebhook: e.target.value,
                                        })
                                    }
                                    placeholder="https://hooks.slack.com/…"
                                />
                            </FormField>
                        </div>
                    )}
                </div>

                <footer className="flex flex-col-reverse gap-2 border-t border-slate-100 bg-slate-50/60 p-6 sm:flex-row sm:items-center sm:justify-end sm:gap-3">
                    <Button tone="slate" variant="ghost" onClick={onClose}>
                        Annuler
                    </Button>
                    <Button
                        tone={archetype.tone}
                        onClick={() => void handleSave()}
                        disabled={isSaving || !draft.nom.trim() || !draft.roleTitre.trim()}
                    >
                        {isSaving ? 'Enregistrement…' : node ? 'Enregistrer' : 'Créer'}
                    </Button>
                </footer>
            </Surface>
        </div>
    );
}
