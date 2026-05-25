import { useLayoutEffect, useRef, useState } from 'react';
import type { HybridNode } from '../types/hybridNode';

/**
 * MCP Anchors (KB §3.B) — câbles transverses entre nœuds liés via `mcpConfig.connectedTo`.
 *
 * Lit la position DOM des nœuds (via `data-node-id`) à l'intérieur du conteneur
 * passé en ref, puis trace une courbe Bézier ambrée entre chaque paire connectée.
 * Réagit aux resize via ResizeObserver.
 */

interface MCPAnchorsOverlayProps {
    containerRef: React.RefObject<HTMLElement | null>;
    nodes: HybridNode[];
}

interface Edge {
    fromId: string;
    toId: string;
}

interface Segment {
    key: string;
    d: string;
}

function buildEdges(nodes: HybridNode[]): Edge[] {
    const edges: Edge[] = [];
    const knownIds = new Set(nodes.map((n) => n.id));
    nodes.forEach((n) => {
        n.mcpConfig?.connectedTo.forEach((toId) => {
            if (toId !== n.id && knownIds.has(toId)) {
                edges.push({ fromId: n.id, toId });
            }
        });
    });
    return edges;
}

export function MCPAnchorsOverlay({ containerRef, nodes }: MCPAnchorsOverlayProps) {
    const svgRef = useRef<SVGSVGElement>(null);
    const [segments, setSegments] = useState<Segment[]>([]);
    const [size, setSize] = useState({ w: 0, h: 0 });

    useLayoutEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const compute = () => {
            const rect = container.getBoundingClientRect();
            setSize({ w: rect.width, h: rect.height });

            const positions = new Map<string, { x: number; y: number }>();
            container.querySelectorAll<HTMLElement>('[data-node-id]').forEach((el) => {
                const id = el.dataset.nodeId!;
                const r = el.getBoundingClientRect();
                positions.set(id, {
                    x: r.left - rect.left + r.width / 2,
                    y: r.top - rect.top + r.height / 2,
                });
            });

            const next = buildEdges(nodes)
                .map<Segment | null>(({ fromId, toId }) => {
                    const a = positions.get(fromId);
                    const b = positions.get(toId);
                    if (!a || !b) return null;
                    const midY = (a.y + b.y) / 2;
                    const d = `M ${a.x} ${a.y} C ${a.x} ${midY}, ${b.x} ${midY}, ${b.x} ${b.y}`;
                    return { key: `${fromId}→${toId}`, d };
                })
                .filter((s): s is Segment => s !== null);

            setSegments(next);
        };

        compute();

        const ro = new ResizeObserver(compute);
        ro.observe(container);
        window.addEventListener('resize', compute);
        return () => {
            ro.disconnect();
            window.removeEventListener('resize', compute);
        };
    }, [containerRef, nodes]);

    if (segments.length === 0) return null;

    return (
        <svg
            ref={svgRef}
            className="pointer-events-none absolute inset-0"
            width={size.w}
            height={size.h}
            aria-hidden
        >
            <defs>
                <marker
                    id="mcp-anchor-arrow"
                    viewBox="0 0 10 10"
                    refX="8"
                    refY="5"
                    markerWidth="6"
                    markerHeight="6"
                    orient="auto-start-reverse"
                >
                    <path d="M 0 0 L 10 5 L 0 10 z" fill="#f59e0b" />
                </marker>
            </defs>
            {segments.map((s) => (
                <path
                    key={s.key}
                    d={s.d}
                    fill="none"
                    stroke="#f59e0b"
                    strokeOpacity={0.55}
                    strokeWidth={1.5}
                    strokeDasharray="4 4"
                    markerEnd="url(#mcp-anchor-arrow)"
                />
            ))}
        </svg>
    );
}
