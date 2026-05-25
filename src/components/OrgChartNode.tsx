import { useState, useEffect } from 'react';
import type { TreeNode } from '../types/orgchart';
import type { Agent } from '../types/agent';
import { ConnectorSVG } from './ConnectorSVG';
import { AgentCard } from './AgentCard';
import HybridNodeCard from './HybridNodeCard';
import { agentToHybridNode } from '../utils/agentToHybridNode';
import { motion, AnimatePresence } from 'framer-motion';

interface OrgChartNodeProps {
    node: TreeNode;
    isPdfMode?: boolean;
    isEditMode: boolean;
    highlightedId?: string | null;
    highlightedPath?: Set<string>;
    onDelete?: (id: string) => void;
    onProfileClick?: (agent: Agent) => void;
    onContactClick?: (agent: Agent) => void;
    /**
     * Phase 3 — bascule dirigée : rend les nœuds via `HybridNodeCard`
     * (modèle d'orchestration hybride) plutôt que l'`AgentCard` RH legacy.
     */
    useHybridCard?: boolean;
}

export const OrgChartNode: React.FC<OrgChartNodeProps> = ({
    node,
    isPdfMode = false,
    isEditMode = false,
    highlightedId = null,
    highlightedPath = new Set(),
    onDelete,
    onProfileClick,
    onContactClick,
    useHybridCard = false,
}) => {
    const [isExpanded, setIsExpanded] = useState(true);
    const hasChildren = node.children && node.children.length > 0;

    useEffect(() => {
        if (highlightedPath.has(node.id)) {
            setIsExpanded(true);
        }
    }, [highlightedPath, node.id]);

    const showChildren = (isExpanded || isPdfMode) && hasChildren;
    const isHighlighted = highlightedId === node.id;

    return (
        <div className="flex flex-col items-center">
            <div className="relative z-10 mb-14">
                {useHybridCard ? (
                    <HybridNodeCard
                        node={agentToHybridNode(node)}
                        hasChildren={hasChildren}
                        isExpanded={isExpanded}
                        onToggleExpand={() => setIsExpanded(!isExpanded)}
                        isHighlighted={isHighlighted}
                        totalInBranch={node.totalAgentsInBranch}
                        isEditMode={isEditMode}
                        onOpen={() => onProfileClick?.(node)}
                        onContact={() => onContactClick?.(node)}
                        onDelete={onDelete ? () => onDelete(node.id) : undefined}
                    />
                ) : (
                    <AgentCard
                        agent={node}
                        hasChildren={hasChildren}
                        isExpanded={isExpanded}
                        onToggleExpand={() => setIsExpanded(!isExpanded)}
                        isHighlighted={isHighlighted}
                        totalInBranch={node.totalAgentsInBranch}
                        onDelete={onDelete ? () => onDelete(node.id) : undefined}
                        onProfileClick={onProfileClick}
                        onContactClick={onContactClick}
                        isEditMode={isEditMode}
                    />
                )}
            </div>

            <AnimatePresence>
                {showChildren && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="relative flex w-full flex-col items-center"
                    >
                        <ConnectorSVG
                            childrenCount={node.children!.length}
                            childStatuses={
                                useHybridCard
                                    ? node.children!.map((c) => agentToHybridNode(c).status)
                                    : undefined
                            }
                        />

                        <div className="relative flex w-full flex-row items-start justify-center gap-14">
                            {node.children!.map((child) => (
                                <div key={child.id} className="relative flex flex-col items-center">
                                    <OrgChartNode
                                        node={child}
                                        isPdfMode={isPdfMode}
                                        isEditMode={isEditMode}
                                        highlightedId={highlightedId}
                                        highlightedPath={highlightedPath}
                                        onDelete={onDelete}
                                        onProfileClick={onProfileClick}
                                        onContactClick={onContactClick}
                                        useHybridCard={useHybridCard}
                                    />
                                </div>
                            ))}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};
