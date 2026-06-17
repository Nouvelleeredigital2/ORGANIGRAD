import React from 'react';

interface AppShellProps {
    sidebar: React.ReactNode;
    header: React.ReactNode;
    subHeader?: React.ReactNode;
    children: React.ReactNode;
}

export const AppShell: React.FC<AppShellProps> = ({ sidebar, header, subHeader, children }) => {
    return (
        <div className="flex h-[100dvh] text-slate-900 selection:bg-sky-100 overflow-hidden relative">
            <div className="absolute inset-0 pointer-events-none z-0">
                <div className="absolute inset-0 opacity-[0.012] grain-bg"></div>
                <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-white/90 to-transparent"></div>
            </div>

            {sidebar}

            <div className="flex-1 flex flex-col overflow-hidden relative z-10">
                {header}
                {subHeader}

                <main className="flex-1 relative overflow-hidden bg-transparent">
                    {children}
                </main>
            </div>
        </div>
    );
};
