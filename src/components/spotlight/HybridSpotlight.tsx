import { useMemo, useState } from 'react';
import type { HybridNode, NodeType } from '../../types/hybridNode';

/**
 * Spotlight hybride (KB §3.A) — recherche globale dans la flotte de HybridNodes.
 * Indexe : nom, rôle, skills, type, statut. Filtre rapide par type via chips.
 */

interface HybridSpotlightProps {
    nodes: HybridNode[];
    onSelect: (node: HybridNode) => void;
    placeholder?: string;
}

const TYPE_FILTERS: Array<{ key: NodeType | 'ALL'; label: string }> = [
    { key: 'ALL', label: 'Tous' },
    { key: 'HUMAN', label: '👤 Humain' },
    { key: 'AGENT_IA', label: '🧠 IA' },
    { key: 'SOFTWARE_MCP', label: '⚙️ MCP' },
];

function score(node: HybridNode, q: string): number {
    if (!q) return 1;
    const lc = q.toLowerCase();
    let s = 0;
    if (node.nom.toLowerCase().includes(lc)) s += 5;
    if (node.roleTitre.toLowerCase().includes(lc)) s += 3;
    if (node.skills?.some((sk) => sk.toLowerCase().includes(lc))) s += 4;
    if (node.id.toLowerCase().includes(lc)) s += 1;
    return s;
}

export function HybridSpotlight({ nodes, onSelect, placeholder = 'Rechercher un nœud, un skill…' }: HybridSpotlightProps) {
    const [query, setQuery] = useState('');
    const [filter, setFilter] = useState<NodeType | 'ALL'>('ALL');

    const results = useMemo(() => {
        const filtered = filter === 'ALL' ? nodes : nodes.filter((n) => n.type === filter);
        const ranked = filtered
            .map((n) => ({ n, s: score(n, query) }))
            .filter(({ s }) => s > 0)
            .sort((a, b) => b.s - a.s)
            .slice(0, 8);
        return ranked.map(({ n }) => n);
    }, [nodes, query, filter]);

    return (
        <div className="w-full lg:max-w-xl">
            <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white/80 px-4 py-2 shadow-sm backdrop-blur">
                <span className="text-slate-400" aria-hidden>
                    🔎
                </span>
                <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={placeholder}
                    className="flex-1 bg-transparent text-sm text-slate-900 placeholder:text-slate-400 outline-none"
                />
            </div>

            <div className="mt-2 flex flex-wrap gap-1.5">
                {TYPE_FILTERS.map((f) => (
                    <button
                        key={f.key}
                        type="button"
                        onClick={() => setFilter(f.key)}
                        className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold transition ${
                            filter === f.key
                                ? 'bg-slate-900 text-white'
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                    >
                        {f.label}
                    </button>
                ))}
            </div>

            {(query || filter !== 'ALL') && (
                <ul className="mt-2 max-h-64 overflow-y-auto rounded-2xl border border-slate-100 bg-white shadow-lg">
                    {results.length === 0 ? (
                        <li className="px-4 py-3 text-sm text-slate-500">Aucun résultat.</li>
                    ) : (
                        results.map((n) => (
                            <li key={n.id}>
                                <button
                                    type="button"
                                    onClick={() => onSelect(n)}
                                    className="w-full px-4 py-2.5 text-left transition hover:bg-slate-50"
                                >
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="truncate text-sm font-semibold text-slate-900">{n.nom}</span>
                                        <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                            {n.type === 'HUMAN' ? 'HUMAIN' : n.type === 'AGENT_IA' ? 'IA' : 'MCP'}
                                        </span>
                                    </div>
                                    <p className="truncate text-xs text-slate-500">{n.roleTitre}</p>
                                    {n.skills && n.skills.length > 0 && (
                                        <div className="mt-1 flex flex-wrap gap-1">
                                            {n.skills.slice(0, 4).map((sk) => (
                                                <span
                                                    key={sk}
                                                    className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600"
                                                >
                                                    {sk}
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                </button>
                            </li>
                        ))
                    )}
                </ul>
            )}
        </div>
    );
}
