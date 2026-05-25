import React from 'react';
import type { GlassVariant } from '../types';

interface OriginGlassProps {
    variant?: GlassVariant;
    className?: string;
    children: React.ReactNode;
}

export const OriginGlass: React.FC<OriginGlassProps> = ({ 
    variant = 'panel', 
    className = '', 
    children 
}) => {
    const isElevated = variant === 'elevated';
    
    return (
        <div className={`
            origin-glass
            ${isElevated ? 'shadow-glass-lg' : 'shadow-glass'}
            ${className}
        `.trim()}>
            {/* Grain Overlay */}
            <div className="absolute inset-0 grain-bg opacity-[0.03] pointer-events-none mix-blend-overlay" />
            
            <div className="relative z-10 w-full h-full flex flex-col">
                {children}
            </div>
        </div>
    );
};
