export type OriginState = 'idle' | 'loading' | 'success' | 'warning' | 'error';
export type GlassVariant = 'soft' | 'panel' | 'elevated' | 'overlay';
export type ThemeMode = 'light' | 'dark' | 'system';

export interface OriginContextType {
    filamentState: OriginState;
    setFilamentState: (state: OriginState) => void;
    theme: ThemeMode;
    setTheme: (theme: ThemeMode) => void;
}
