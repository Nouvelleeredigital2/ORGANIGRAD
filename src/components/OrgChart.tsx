import { useRef, useImperativeHandle, forwardRef } from 'react';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import type { ReactZoomPanPinchContentRef } from 'react-zoom-pan-pinch';
import type { TreeNode } from '../types/orgchart';
import type { Agent } from '../types/agent';
import { OrgChartNode } from './OrgChartNode';
import { Maximize, ZoomIn, ZoomOut } from 'lucide-react';

interface OrgChartProps {
    data: TreeNode[];
    isPdfMode: boolean;
    isEditMode: boolean;
    onToggleEditMode: () => void;
    highlightedId: string | null;
    highlightedPath: Set<string>;
    onDeleteAgent?: (id: string) => void;
    onProfileClick?: (agent: Agent) => void;
    onContactClick?: (agent: Agent) => void;
    useHybridCard?: boolean;
}

export interface OrgChartRef {
    resetTransform: () => void;
}

export const OrgChart = forwardRef<OrgChartRef, OrgChartProps>(({
    data,
    isPdfMode,
    isEditMode,
    onToggleEditMode,
    highlightedId,
    highlightedPath,
    onDeleteAgent,
    onProfileClick,
    onContactClick,
    useHybridCard = false,
}, ref) => {
    const transformRef = useRef<ReactZoomPanPinchContentRef>(null);

    useImperativeHandle(ref, () => ({
        resetTransform: () => {
            if (transformRef.current) {
                transformRef.current.resetTransform();
            }
        }
    }));

    if (!data || data.length === 0) {
        return (
            <div className="flex h-96 w-full items-center justify-center rounded-2xl border border-slate-200 bg-white font-medium text-slate-500 shadow-sm">
                Aucune donnee a afficher.
            </div>
        );
    }

    if (isPdfMode) {
        return (
            <div className="print-mode flex min-w-max flex-col items-center justify-start bg-transparent p-10">
                {data.map(root => (
                    <OrgChartNode
                        key={root.id}
                        node={root}
                        isEditMode={false}
                        highlightedId={highlightedId}
                        highlightedPath={highlightedPath}
                        onDelete={onDeleteAgent}
                        onProfileClick={onProfileClick}
                        onContactClick={onContactClick}
                        useHybridCard={useHybridCard}
                    />
                ))}
            </div>
        );
    }

    return (
        <div className="dot-grid-bg relative h-full w-full overflow-hidden rounded-[2rem] border border-white/70 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.96),_rgba(244,247,251,0.96)_42%,_rgba(235,241,247,0.98)_100%)] shadow-[0_30px_90px_rgba(148,163,184,0.12)]">
            <TransformWrapper
                ref={transformRef}
                initialScale={1}
                minScale={0.1}
                maxScale={4}
                centerOnInit={true}
                limitToBounds={false}
                wheel={{ step: 0.1 }}
            >
                {({ zoomIn, zoomOut, resetTransform }) => (
                    <>
                        <div className="absolute bottom-8 right-8 z-50 flex flex-col gap-2 print:hidden">
                            <button
                                onClick={() => zoomIn()}
                                className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/80 bg-white/92 text-slate-600 shadow-[0_16px_40px_rgba(148,163,184,0.18)] backdrop-blur-xl transition-all hover:-translate-y-0.5 hover:bg-white"
                                title="Zoom Avant"
                            >
                                <ZoomIn className="h-5 w-5" />
                            </button>
                            <button
                                onClick={() => zoomOut()}
                                className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/80 bg-white/92 text-slate-600 shadow-[0_16px_40px_rgba(148,163,184,0.18)] backdrop-blur-xl transition-all hover:-translate-y-0.5 hover:bg-white"
                                title="Zoom Arriere"
                            >
                                <ZoomOut className="h-5 w-5" />
                            </button>
                            <div className="my-1 h-px w-full bg-slate-200/80"></div>
                            <button
                                onClick={() => resetTransform()}
                                className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/80 bg-white/92 text-slate-600 shadow-[0_16px_40px_rgba(148,163,184,0.18)] backdrop-blur-xl transition-all hover:-translate-y-0.5 hover:bg-white"
                                title="Reinitialiser la vue"
                            >
                                <Maximize className="h-5 w-5" />
                            </button>
                        </div>

                        <div className="pointer-events-none absolute bottom-8 left-1/2 z-50 -translate-x-1/2 print:hidden">
                            <div className="pointer-events-auto flex items-center gap-5 rounded-full border border-white/80 bg-white/88 px-5 py-2.5 text-slate-600 shadow-[0_18px_50px_rgba(148,163,184,0.2)] backdrop-blur-xl">
                                <div
                                    className={`flex cursor-pointer items-center gap-2 transition-opacity ${!isEditMode ? 'opacity-100' : 'opacity-40 hover:opacity-100'}`}
                                    onClick={() => isEditMode && onToggleEditMode()}
                                >
                                    {!isEditMode && <div className="h-2 w-2 rounded-full bg-sky-500"></div>}
                                    <span className="text-[11px] font-extrabold uppercase tracking-[0.24em]">Navigation</span>
                                </div>
                                <div className="h-4 w-px bg-slate-200"></div>
                                <div
                                    className={`flex cursor-pointer items-center gap-2 transition-opacity ${isEditMode ? 'opacity-100' : 'opacity-40 hover:opacity-100'}`}
                                    onClick={() => !isEditMode && onToggleEditMode()}
                                >
                                    {isEditMode && <div className="h-2 w-2 rounded-full bg-amber-500"></div>}
                                    <span className={`text-[11px] font-extrabold uppercase tracking-[0.24em] ${isEditMode ? 'text-amber-600' : ''}`}>Edition</span>
                                </div>
                            </div>
                        </div>

                        <TransformComponent wrapperStyle={{ width: '100%', height: '100%' }}>
                            <div className="flex min-w-max cursor-grab flex-col items-center justify-start px-36 py-28 active:cursor-grabbing">
                                {data.map(root => (
                                    <OrgChartNode
                                        key={root.id}
                                        node={root}
                                        isEditMode={isEditMode}
                                        highlightedId={highlightedId}
                                        highlightedPath={highlightedPath}
                                        onDelete={onDeleteAgent}
                                        onProfileClick={onProfileClick}
                                        onContactClick={onContactClick}
                                        useHybridCard={useHybridCard}
                                    />
                                ))}
                            </div>
                        </TransformComponent>
                    </>
                )}
            </TransformWrapper>
        </div>
    );
});

OrgChart.displayName = 'OrgChart';
