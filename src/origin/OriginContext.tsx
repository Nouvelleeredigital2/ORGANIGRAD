import { createContext, useContext } from 'react';
import type { OriginContextType } from './types';

// Le composant `OriginProvider` vit dans OriginProvider.tsx pour que ce module
// n'exporte que le contexte + le hook (compatibilité React Fast Refresh).
export const OriginContext = createContext<OriginContextType | undefined>(undefined);

export const useOrigin = () => {
    const context = useContext(OriginContext);
    if (!context) {
        throw new Error('useOrigin must be used within an OriginProvider');
    }
    return context;
};
