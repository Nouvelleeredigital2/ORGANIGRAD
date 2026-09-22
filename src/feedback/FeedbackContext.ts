import { createContext, useContext } from 'react';

/**
 * Retour utilisateur unifié.
 *
 * Règle du projet : toute action asynchrone rend son succès ET son échec
 * observables. Ce module est le canal unique par lequel une vue signale l'issue
 * d'une action, pour éviter que chaque écran réinvente son bandeau (et en
 * oublie la moitié des cas).
 */

export type FeedbackTone = 'success' | 'warning' | 'error' | 'info';

export interface FeedbackMessage {
    id: string;
    tone: FeedbackTone;
    message: string;
    /** Millisecondes avant effacement automatique. 0 = persistant. */
    autoDismissMs: number;
}

export interface FeedbackOptions {
    autoDismissMs?: number;
}

export interface FeedbackApi {
    notify: (tone: FeedbackTone, message: string, opts?: FeedbackOptions) => string;
    success: (message: string, opts?: FeedbackOptions) => string;
    warning: (message: string, opts?: FeedbackOptions) => string;
    /** Un échec est toujours persistant : il doit être lu, pas entraperçu. */
    error: (message: string) => string;
    info: (message: string, opts?: FeedbackOptions) => string;
    dismiss: (id: string) => void;
    clear: () => void;
}

/** Durées par défaut. Les tons `warning` et `error` ne s'effacent pas seuls. */
export const DEFAULT_AUTO_DISMISS_MS: Record<FeedbackTone, number> = {
    success: 4000,
    info: 6000,
    warning: 0,
    error: 0,
};

/** Nombre de messages affichés simultanément — au-delà, les plus anciens sortent. */
export const MAX_VISIBLE_MESSAGES = 3;

export const FeedbackCtx = createContext<FeedbackApi | null>(null);

/**
 * Implémentation neutre utilisée hors d'un `<FeedbackProvider>` : tests qui
 * rendent une vue isolément, ou rendu partiel. Même parti pris que
 * `useWorkspaceContext` — renvoyer un contexte cohérent plutôt que jeter.
 */
const NOOP_API: FeedbackApi = {
    notify: () => '',
    success: () => '',
    warning: () => '',
    error: () => '',
    info: () => '',
    dismiss: () => {},
    clear: () => {},
};

export function useFeedback(): FeedbackApi {
    return useContext(FeedbackCtx) ?? NOOP_API;
}
