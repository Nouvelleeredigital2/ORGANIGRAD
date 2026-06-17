import React from 'react';
import type { GlassVariant } from '../types';

interface OriginGlassProps extends React.HTMLAttributes<HTMLDivElement> {
    variant?: GlassVariant;
    children: React.ReactNode;
}

export const OriginGlass = React.forwardRef<HTMLDivElement, OriginGlassProps>(
    ({ variant = 'panel', className = '', children, ...rest }, ref) => {
        const isElevated = variant === 'elevated';

        return (
            <div
                ref={ref}
                className={`origin-glass ${isElevated ? 'shadow-glass-lg' : 'shadow-glass'} ${className}`.trim()}
                {...rest}
            >
                {/* Grain Overlay */}
                <div className="absolute inset-0 grain-bg opacity-[0.03] pointer-events-none mix-blend-overlay" />

                <div className="relative z-10 w-full h-full flex flex-col">{children}</div>
            </div>
        );
    },
);
OriginGlass.displayName = 'OriginGlass';
