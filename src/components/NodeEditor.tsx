import { useEffect, useMemo, useState } from 'react';
import type { HybridNode, NodeType } from '../types/hybridNode';
import { Button, FormField, Input, Select, Surface, Textarea, cx } from '../design/ui';
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
    onSave: (node: HybridNode) => void;
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

export function NodeEditor({ isOpen, node, availableNodes = [], onClose, onSave }: NodeEditorProps) {
    const parentOptions: HybridNode[] = useMemo(() => availableNodes, [availableNodes]);
    const [draft, setDraft] = useState<HybridNode>(() => node ?? emptyNode());
    const [skillsInput, setSkillsInput] = useState<string>((node?.skills ?? []).join(', '));

    useEffect(() => {
        if (isOpen) {
            setDraft(node ?? emptyNode());
            setSkillsInput((node?.skills ?? []).join(', '));
        }
    }, [isOpen, node]);

    useEscapeClose(isOpen, onClose);

    const archetype = useMemo(() => ARCHETYPE[draft.type], [draft.type]);
    const tone = TONE_CLASSES[archetype.tone];

    if (!isOpen) return null;

    const update = <K extends keyof HybridNode>(key: K, value: HybridNode[K]) =>
        setDraft((d) => ({ ...d, [key]: value }));

    const parseSkills = (raw: string) =>
        raw
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean);

    const isValidUrl = (url: string) => {
        try { new URL(url); return true; } catch { return false; }
    };

    const handleSave = () => {
        const finalNode: HybridNode = { ...draft, skills: parseSkills(skillsInput) };
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
        onSave(finalNode);
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

                    {draft.type === 'AGENT_IA' && (
                        <FormField label="Prompt système" hint="Visible au survol de la carte">
                            <Textarea
                                value={draft.systemPrompt ?? ''}
                                onChange={(e) => update('systemPrompt', e.target.value)}
                                rows={3}
                                placeholder="Tu es un expert en…"
                            />
                        </FormField>
                    )}

                    {draft.type === 'SOFTWARE_MCP' && (
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
                    )}

                    {draft.type === 'HUMAN' && (
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
                        onClick={handleSave}
                        disabled={!draft.nom.trim() || !draft.roleTitre.trim()}
                    >
                        {node ? 'Enregistrer' : 'Créer'}
                    </Button>
                </footer>
            </Surface>
        </div>
    );
}
