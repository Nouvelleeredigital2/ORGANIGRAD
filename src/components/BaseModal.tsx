import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { OriginGlass } from '../origin';
import { useEscapeClose } from '../hooks/useEscapeClose';

interface BaseModalProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    children: React.ReactNode;
}

export const BaseModal: React.FC<BaseModalProps> = ({ isOpen, onClose, title, children }) => {
    // Fermeture sur Escape via le hook partagé
    useEscapeClose(isOpen, onClose);

    // Scroll-lock du body quand le modal est ouvert
    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
        }
        return () => {
            document.body.style.overflow = '';
        };
    }, [isOpen]);

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 print:hidden">
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="absolute inset-0 bg-slate-900/40 backdrop-blur-md"
                    />

                    {/* Modal Content */}
                    <OriginGlass
                        variant="elevated"
                        className="relative w-full max-w-2xl max-h-[90vh] flex flex-col rounded-[2.5rem] border border-white shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-300"
                    >
                        {/* Header */}
                        <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between">
                            <h2 className="text-xl font-black tracking-tight text-slate-900 uppercase">
                                {title}
                            </h2>
                            <button
                                onClick={onClose}
                                className="p-2 rounded-xl hover:bg-slate-100 text-slate-400 transition-all"
                            >
                                <X className="w-6 h-6" />
                            </button>
                        </div>

                        {/* Body */}
                        <div className="p-8 max-h-[80vh] overflow-y-auto custom-scrollbar">
                            {children}
                        </div>
                    </OriginGlass>
                </div>
            )}
        </AnimatePresence>
    );
};
