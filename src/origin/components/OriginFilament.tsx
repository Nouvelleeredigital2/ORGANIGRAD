import React from 'react';
import type { OriginState } from '../types';

interface OriginFilamentProps {
  status: OriginState;
  className?: string;
}

export const OriginFilament: React.FC<OriginFilamentProps> = ({ status, className = '' }) => {
  // Détermination des classes utilitaires en fonction de l'état
  const getStatusClasses = () => {
    switch (status) {
      case 'loading':
        return 'w-1/3 bg-current opacity-60 animate-[origin-slide-x_1.5s_infinite_cubic-bezier(0.16,1,0.3,1)]';
      case 'success':
        return 'w-full bg-green-500/80 animate-[origin-pulse-glow_2s_infinite]';
      case 'error':
        return 'w-full bg-red-500/80 animate-[origin-pulse-glow_2s_infinite]';
      case 'warning':
        return 'w-full bg-orange-500/80 animate-[origin-pulse-glow_2s_infinite]';
      case 'idle':
      default:
        return 'w-0 opacity-0 transition-all duration-[var(--origin-slow)] ease-[var(--origin-ease)]';
    }
  };

  return (
    <div 
      className={`w-full absolute top-0 left-0 pointer-events-none ${className}`}
      style={{ height: 'var(--origin-line-height)' }}
    >
      <div className={`h-full rounded-full transition-all duration-[var(--origin-normal)] ${getStatusClasses()}`} />
    </div>
  );
};
