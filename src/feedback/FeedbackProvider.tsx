import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    DEFAULT_AUTO_DISMISS_MS,
    FeedbackCtx,
    MAX_VISIBLE_MESSAGES,
    type FeedbackApi,
    type FeedbackMessage,
    type FeedbackOptions,
    type FeedbackTone,
} from './FeedbackContext';
import { FeedbackBanner } from './FeedbackBanner';

let sequence = 0;
const nextId = (): string => `fb-${++sequence}`;

/**
 * Fournit le canal de retour utilisateur et rend la pile de messages.
 *
 * Monté au-dessus de `AuthGate` pour que l'écran d'authentification en bénéficie
 * aussi. Le rendu vit hors de `#exportable-org-chart` : sans quoi html2canvas
 * capturerait le bandeau dans le PDF exporté.
 */
export function FeedbackProvider({ children }: { children: React.ReactNode }) {
    const [messages, setMessages] = useState<FeedbackMessage[]>([]);
    // Un timer par message, pour pouvoir les annuler à la fermeture manuelle
    // comme au démontage (sinon un setState après démontage fuit).
    const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

    const dismiss = useCallback((id: string) => {
        const timer = timers.current.get(id);
        if (timer) {
            clearTimeout(timer);
            timers.current.delete(id);
        }
        setMessages((prev) => prev.filter((m) => m.id !== id));
    }, []);

    const clear = useCallback(() => {
        timers.current.forEach((timer) => clearTimeout(timer));
        timers.current.clear();
        setMessages([]);
    }, []);

    const notify = useCallback(
        (tone: FeedbackTone, message: string, opts?: FeedbackOptions): string => {
            const id = nextId();
            const autoDismissMs = opts?.autoDismissMs ?? DEFAULT_AUTO_DISMISS_MS[tone];

            setMessages((prev) => {
                // Les plus récents en tête ; au-delà de la limite, les plus
                // anciens sortent (et leurs timers sont nettoyés).
                const next = [{ id, tone, message, autoDismissMs }, ...prev];
                const dropped = next.slice(MAX_VISIBLE_MESSAGES);
                dropped.forEach((m) => {
                    const timer = timers.current.get(m.id);
                    if (timer) {
                        clearTimeout(timer);
                        timers.current.delete(m.id);
                    }
                });
                return next.slice(0, MAX_VISIBLE_MESSAGES);
            });

            if (autoDismissMs > 0) {
                timers.current.set(
                    id,
                    setTimeout(() => {
                        timers.current.delete(id);
                        setMessages((prev) => prev.filter((m) => m.id !== id));
                    }, autoDismissMs),
                );
            }

            return id;
        },
        [],
    );

    useEffect(() => {
        const pending = timers.current;
        return () => {
            pending.forEach((timer) => clearTimeout(timer));
            pending.clear();
        };
    }, []);

    const api = useMemo<FeedbackApi>(
        () => ({
            notify,
            success: (message, opts) => notify('success', message, opts),
            warning: (message, opts) => notify('warning', message, opts),
            error: (message) => notify('error', message),
            info: (message, opts) => notify('info', message, opts),
            dismiss,
            clear,
        }),
        [notify, dismiss, clear],
    );

    return (
        <FeedbackCtx.Provider value={api}>
            {children}
            <FeedbackBanner messages={messages} onDismiss={dismiss} />
        </FeedbackCtx.Provider>
    );
}
