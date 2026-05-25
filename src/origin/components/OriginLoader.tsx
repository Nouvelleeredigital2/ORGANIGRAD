import React from 'react';

interface OriginLoaderProps {
  label?: string;
  fullScreen?: boolean;
}

export const OriginLoader: React.FC<OriginLoaderProps> = ({ 
  label = "Chargement système...", 
  fullScreen = false 
}) => {
  const containerClasses = fullScreen 
    ? "fixed inset-0 z-50 flex flex-col items-center justify-center bg-white/50 backdrop-blur-sm" 
    : "w-full flex flex-col items-center justify-center py-12";

  return (
    <div className={containerClasses}>
      <div 
        className="origin-glass origin-motion flex items-center justify-center overflow-hidden mb-6"
        style={{ width: 'var(--origin-module-size)', height: 'var(--origin-module-size)', borderRadius: 'var(--origin-radius-soft)' }}
      >
         <div className="w-2 h-2 rounded-full bg-current animate-[origin-pulse-glow_1s_infinite]" />
      </div>
      
      <div className="w-48 relative overflow-hidden rounded-full" style={{ height: 'var(--origin-line-height)' }}>
        <div className="absolute inset-0 bg-current opacity-10" />
        <div className="h-full w-1/3 bg-current rounded-full animate-[origin-slide-x_1.5s_infinite_cubic-bezier(0.16,1,0.3,1)]" />
      </div>
      
      {label && (
        <span className="mt-4 text-xs font-medium tracking-wide uppercase opacity-50">
          {label}
        </span>
      )}
    </div>
  );
};
