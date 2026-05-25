import React, { createContext, useContext, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { OriginState, ThemeMode, OriginContextType } from './types';
import { OriginFilament } from './components/OriginFilament';
import { OriginSignatureLine } from './components/OriginSignatureLine';
import { OriginModule } from './components/OriginModule';

const OriginContext = createContext<OriginContextType | undefined>(undefined);

export const OriginProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [filamentState, setFilamentState] = useState<OriginState>('idle');
    const [theme, setTheme] = useState<ThemeMode>('system');
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    // Organigrad utilise exclusivement le thème clair (glass / gradients).
    // La classe `.dark` ne doit jamais être appliquée — on la retire au montage
    // et on ignore la préférence OS pour éviter de casser les styles visuels.
    useEffect(() => {
        document.documentElement.classList.remove('dark');
    }, [theme]);

    return (
        <OriginContext.Provider value={{ filamentState, setFilamentState, theme, setTheme }}>
            {children}
            
            {/* 🛸 Origin System : Global Overlay Layer (Portal to Body for Max Z-Index) */}
            {mounted && createPortal(
                <div className="fixed inset-0 pointer-events-none z-[99999]" aria-hidden="true" id="origin-global-layer">
                    {/* Floating Marker (Top Left) */}
                    <div className="absolute top-6 left-6 pointer-events-auto">
                        <OriginModule className="shadow-glass-lg" />
                    </div>
                    
                    {/* Activity Filament (Top Screen) */}
                    <div className="absolute top-0 left-0 right-0">
                        <OriginSignatureLine />
                        <OriginFilament status={filamentState} />
                    </div>
                </div>,
                document.body
            )}
        </OriginContext.Provider>
    );
};

export const useOrigin = () => {
    const context = useContext(OriginContext);
    if (!context) {
        throw new Error('useOrigin must be used within an OriginProvider');
    }
    return context;
};
