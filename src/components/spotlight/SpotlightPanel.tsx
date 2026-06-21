import { useState, useEffect, useRef, useMemo } from 'react';
import { Search, X, User } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { TreeNode } from '../../types/orgchart';
import { searchTree, type SearchResultItem } from '../../utils/treeSearch';

interface SpotlightPanelProps {
    isOpen: boolean;
    onClose: () => void;
    data: TreeNode[];
    onSelect: (result: SearchResultItem) => void;
}

export const SpotlightPanel: React.FC<SpotlightPanelProps> = ({ isOpen, onClose, data, onSelect }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedIndex, setSelectedIndex] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLDivElement>(null);

    // Reset state on open
    const [prevIsOpen, setPrevIsOpen] = useState(isOpen);
    if (isOpen !== prevIsOpen) {
        setPrevIsOpen(isOpen);
        if (isOpen) {
            setSearchTerm('');
            setSelectedIndex(0);
        }
    }

    // Auto-focus on open
    useEffect(() => {
        if (isOpen) {
            setTimeout(() => inputRef.current?.focus(), 100);
        }
    }, [isOpen]);

    // Handle Search Derived State
    const results = useMemo(() => {
        if (!searchTerm.trim()) return [];
        return searchTree(data, searchTerm).slice(0, 10);
    }, [searchTerm, data]);

    // Keyboard Navigation
    useEffect(() => {
        if (!isOpen) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            if (results.length === 0) return;

            if (e.key === 'ArrowDown') {
                e.preventDefault();
                setSelectedIndex(prev => (prev < results.length - 1 ? prev + 1 : prev));
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setSelectedIndex(prev => (prev > 0 ? prev - 1 : prev));
            } else if (e.key === 'Enter') {
                e.preventDefault();
                const item = results[selectedIndex];
                if (item) onSelect(item);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, results, selectedIndex, onSelect]);

    // Scroll selected item into view
    useEffect(() => {
        if (listRef.current) {
            const selectedElement = listRef.current.children[selectedIndex] as HTMLElement;
            if (selectedElement) {
                selectedElement.scrollIntoView({ block: 'nearest' });
            }
        }
    }, [selectedIndex]);

    const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setSearchTerm(e.target.value);
        setSelectedIndex(0);
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] px-4">
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
                    />

                    {/* Modal */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: -20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: -20 }}
                        className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[70vh]"
                    >
                        {/* Input Area */}
                        <div className="flex items-center px-4 h-16 border-b border-slate-100 bg-white">
                            <Search className="w-6 h-6 text-blue-500 mr-3" />
                            <input
                                ref={inputRef}
                                className="flex-1 bg-transparent text-lg text-slate-800 outline-none placeholder:text-slate-400 font-medium"
                                placeholder="Rechercher..."
                                value={searchTerm}
                                onChange={handleSearchChange}
                            />
                            <button
                                onClick={onClose}
                                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Results Area */}
                        {searchTerm.trim() && (
                            <div className="overflow-y-auto no-scrollbar py-2" ref={listRef}>
                                {results.length > 0 ? (
                                    results.map((result, index) => (
                                        <button
                                            key={result.id}
                                            onClick={() => onSelect(result)}
                                            onMouseEnter={() => setSelectedIndex(index)}
                                            className={`w-full flex items-center px-4 py-3 mx-2 my-1 rounded-xl transition-colors text-left ${index === selectedIndex
                                                ? 'bg-blue-50 border border-blue-100'
                                                : 'hover:bg-slate-50 border border-transparent'
                                                }`}
                                            style={{ width: 'calc(100% - 1rem)' }}
                                        >
                                            <div className={`w-10 h-10 rounded-full flex items-center justify-center mr-4 ${index === selectedIndex ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-500'
                                                }`}>
                                                <User className="w-5 h-5" />
                                            </div>
                                            <div className="flex-1 overflow-hidden">
                                                <div className="flex items-center justify-between">
                                                    <p className="text-sm font-bold text-slate-800 truncate">
                                                        {result.prenom} {result.nom}
                                                    </p>
                                                    {result.pole && (
                                                        <span className="text-[10px] uppercase tracking-wider font-bold text-slate-400 bg-slate-100 px-2 py-1 rounded-md">
                                                            {result.pole}
                                                        </span>
                                                    )}
                                                </div>
                                                <p className="text-xs text-slate-500 truncate mt-0.5">
                                                    {result.fonction} {result.service ? `• ${result.service}` : ''}
                                                </p>
                                            </div>
                                            {index === selectedIndex && (
                                                <div className="ml-4 text-xs font-bold text-blue-500 hidden sm:block">
                                                    ↵ Entrée
                                                </div>
                                            )}
                                        </button>
                                    ))
                                ) : (
                                    <div className="px-8 py-12 text-center">
                                        <p className="text-sm font-medium text-slate-500 mb-1">Aucun résultat trouvé pour "{searchTerm}"</p>
                                        <p className="text-xs text-slate-400">Vérifiez l'orthographe ou essayez un autre terme.</p>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Default State / Empty */}
                        {!searchTerm.trim() && (
                            <div className="px-8 py-10 bg-slate-50/50 text-center">
                                <p className="text-[11px] font-black uppercase tracking-[0.1em] text-slate-400 mb-2">Astuces de recherche</p>
                                <p className="text-xs text-slate-500 mb-1">Cherchez par nom, prénom, fonction ou service.</p>
                                <p className="text-xs text-slate-500">Utilisez les flèches <span className="bg-white border rounded px-1 mx-0.5 shadow-sm">↑</span><span className="bg-white border rounded px-1 mx-0.5 shadow-sm">↓</span> pour naviguer.</p>
                            </div>
                        )}
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
};
