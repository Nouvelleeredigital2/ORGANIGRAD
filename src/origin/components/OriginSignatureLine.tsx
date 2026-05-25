import React from 'react';

interface OriginSignatureLineProps {
  className?: string;
}

export const OriginSignatureLine: React.FC<OriginSignatureLineProps> = ({ className = '' }) => {
  return (
    <div 
      className={`w-full overflow-hidden relative ${className}`}
      style={{ height: 'var(--origin-line-height)' }}
    >
      {/* Ligne de base discrète héritant de la couleur parente via currentColor */}
      <div className="absolute inset-0 bg-current opacity-10" />
    </div>
  );
};
