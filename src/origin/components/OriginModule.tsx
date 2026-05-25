import React from 'react';

interface OriginModuleProps {
  children?: React.ReactNode;
  className?: string;
}

export const OriginModule: React.FC<OriginModuleProps> = ({ children, className = '' }) => {
  return (
    <div 
      className={`flex items-center justify-center shrink-0 origin-glass origin-motion overflow-hidden ${className}`}
      style={{
        width: 'var(--origin-module-size)',
        height: 'var(--origin-module-size)',
        borderRadius: 'var(--origin-radius-soft)'
      }}
      aria-hidden="true"
    >
      {/* Slot prêt à accueillir un monogramme SVG ou un avatar discret */}
      {children || (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" className="opacity-80">
          <path d="M12 2L2 22h20L12 2z" opacity="0.8"/>
        </svg>
      )}
    </div>
  );
};
