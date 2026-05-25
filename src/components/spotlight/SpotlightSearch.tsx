import { Search, Command } from 'lucide-react';
import { useSpotlight } from '../../hooks/useSpotlight';
import { SpotlightPanel } from './SpotlightPanel';
import type { TreeNode } from '../../types/orgchart';
import type { SearchResultItem } from '../../utils/treeSearch';

interface SpotlightModuleProps {
    data: TreeNode[];
    onSelectAgent: (agentId: string, path: string[]) => void;
}

export const SpotlightSearch: React.FC<SpotlightModuleProps> = ({ data, onSelectAgent }) => {
    const { isOpen, onOpen, onClose } = useSpotlight();

    return (
        <div className="relative w-full max-w-xl mx-auto print:hidden">
            {/* The Trigger Input (looks like a search bar, acts like a button) */}
            <button
                onClick={onOpen}
                className="w-full flex items-center h-12 rounded-2xl bg-white/90 backdrop-blur-xl border border-slate-200 hover:border-blue-400 transition-all shadow-sm group"
            >
                <div className="flex items-center justify-center h-full w-14 text-slate-400 group-hover:text-blue-500 transition-colors">
                    <Search className="w-5 h-5" />
                </div>

                <span className="flex-1 text-left text-base text-slate-400 font-medium">
                    Rechercher un agent, un service...
                </span>

                <div className="flex items-center mr-4 gap-2">
                    <div className="hidden sm:flex items-center gap-1 px-2 py-1 rounded-md bg-slate-50 border border-slate-200 text-slate-400 text-[10px] font-bold group-hover:border-blue-200 group-hover:text-blue-500 transition-colors">
                        <Command className="w-3 h-3" />
                        <span>K</span>
                    </div>
                </div>
            </button>

            {/* The Modal Panel */}
            <SpotlightPanel
                isOpen={isOpen}
                onClose={onClose}
                data={data}
                onSelect={(result: SearchResultItem) => {
                    onSelectAgent(result.id, result.path);
                    onClose();
                }}
            />
        </div>
    );
};
