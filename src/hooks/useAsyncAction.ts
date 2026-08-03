import { useCallback, useEffect, useRef, useState } from 'react';
import { attempt, type Outcome } from '../utils/asyncGuard';
import { useFeedback } from '../feedback/FeedbackContext';

type MessageFor<T> = string | ((value: T) => string);

export interface AsyncActionMessages<T> {
    /** Omis = aucun message de succès (l'effet est déjà visible à l'écran). */
    success?: MessageFor<T>;
    /** Omis = message par défaut construit à partir de l'erreur. */
    error?: string | ((err: Error) => string);
}

/**
 * Exécute une action asynchrone en rendant son issue observable.
 *
 * L'appelant reçoit un `Outcome` : il ne peut pas fermer son panneau « au cas
 * où », il doit tester `ok`. C'est ce qui applique la règle « une action
 * asynchrone ne referme jamais son interface avant le succès ».
 */
export function useAsyncAction(): {
    pending: boolean;
    run: <T>(fn: () => Promise<T> | T, messages?: AsyncActionMessages<T>) => Promise<Outcome<T>>;
} {
    const feedback = useFeedback();
    const [pending, setPending] = useState(false);
    // Le composant peut être démonté pendant l'appel (fermeture de modale) :
    // on évite alors un setState sur un composant disparu.
    const mounted = useRef(true);
    useEffect(() => {
        mounted.current = true;
        return () => {
            mounted.current = false;
        };
    }, []);

    const run = useCallback(
        async <T,>(fn: () => Promise<T> | T, messages?: AsyncActionMessages<T>): Promise<Outcome<T>> => {
            setPending(true);
            const outcome = await attempt(fn);
            if (mounted.current) setPending(false);

            if (outcome.ok) {
                const text =
                    typeof messages?.success === 'function'
                        ? messages.success(outcome.value)
                        : messages?.success;
                if (text) feedback.success(text);
            } else {
                const text =
                    typeof messages?.error === 'function'
                        ? messages.error(outcome.error)
                        : (messages?.error ?? `Action échouée : ${outcome.error.message}`);
                feedback.error(text);
            }

            return outcome;
        },
        [feedback],
    );

    return { pending, run };
}
