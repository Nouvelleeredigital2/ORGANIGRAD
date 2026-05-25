import React from 'react';
import type { NodeStatus } from '../types/hybridNode';
import { STATUS } from '../design/tokens';

/**
 * Filaments d'État (KB §3.C) — tire ses couleurs et animations des tokens.
 */

interface ConnectorSVGProps {
    childrenCount: number;
    childStatuses?: NodeStatus[];
}

const STROKE_WIDTH: Record<NodeStatus, number> = {
    IDLE: 1,
    EXECUTING: 1.5,
    CONTROL_PENDING_IA: 1.5,
    WAITING_HUMAN_APPROVAL: 2,
    ERROR: 1.5,
};

export const ConnectorSVG: React.FC<ConnectorSVGProps> = ({ childrenCount, childStatuses }) => {
    if (childrenCount === 0) return null;

    return (
        <div className="absolute top-0 left-0 w-full h-12 pointer-events-none -mt-12 overflow-visible">
            <svg className="w-full h-full" viewBox="0 0 100 48" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
                {Array.from({ length: childrenCount }).map((_, index) => {
                    const step = 100 / childrenCount;
                    const startX = 50;
                    const endX = index * step + step / 2;
                    const status = childStatuses?.[index] ?? 'IDLE';
                    const token = STATUS[status];
                    const sw = STROKE_WIDTH[status];
                    const d = `M ${startX} 0 C ${startX} 20, ${endX} 20, ${endX} 48`;

                    return (
                        <g key={index}>
                            <path
                                d={d}
                                fill="none"
                                stroke={token.svg}
                                strokeWidth={sw}
                                strokeLinecap="round"
                                strokeDasharray={token.dasharray}
                                opacity={token.pulse ? 0.45 : 1}
                            />
                            {token.pulse && (
                                <path
                                    d={d}
                                    fill="none"
                                    stroke={token.svg}
                                    strokeWidth={sw + 0.5}
                                    strokeLinecap="round"
                                    strokeDasharray="2 14"
                                >
                                    <animate
                                        attributeName="stroke-dashoffset"
                                        from="0"
                                        to="-16"
                                        dur="1.4s"
                                        repeatCount="indefinite"
                                    />
                                </path>
                            )}
                            {token.icon === 'lock' && (
                                <g transform={`translate(${endX - 3}, 22)`}>
                                    <rect x="0.5" y="3" width="5" height="4" rx="0.8" fill="none" stroke={token.svg} strokeWidth="0.6" />
                                    <path d="M 1.7 3 V 1.8 a 1.3 1.3 0 0 1 2.6 0 V 3" fill="none" stroke={token.svg} strokeWidth="0.6" />
                                </g>
                            )}
                        </g>
                    );
                })}
            </svg>
        </div>
    );
};
