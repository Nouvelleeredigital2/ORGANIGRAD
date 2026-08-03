import { useCallback, useEffect, useRef, useState } from 'react';
import { copyToClipboard } from '../utils/clipboard';
import { useFeedback } from '../feedback/FeedbackContext';

/**
 * Copie avec retour visible.
 *
 * Le cas qui justifie ce hook : une clé API n'est affichée qu'une fois. Si la
 * copie échoue en silence et que l'utilisateur ferme la bannière, la valeur est
 * perdue définitivement. Le message d'échec dit donc quoi faire à la place.
 */
export function useCopyToClipboard(): {
    copy: (text: string, label: string, key?: string) => Promise<boolean>;
    /** Identifiant du dernier élément copié, pour un état « Copié ✓ » transitoire. */
    copiedKey: string | null;
} {
    const feedback = useFeedback();
    const [copiedKey, setCopiedKey] = useState<string | null>(null);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(
        () => () => {
            if (timer.current) clearTimeout(timer.current);
        },
        [],
    );

    const copy = useCallback(
        async (text: string, label: string, key?: string): Promise<boolean> => {
            const result = await copyToClipboard(text);

            if (!result.ok) {
                feedback.error(
                    `${label} — copie impossible${result.error ? ` (${result.error})` : ''}. Sélectionne le texte et copie-le manuellement.`,
                );
                return false;
            }

            feedback.success(`${label} copié.`);
            setCopiedKey(key ?? label);
            if (timer.current) clearTimeout(timer.current);
            timer.current = setTimeout(() => setCopiedKey(null), 2000);
            return true;
        },
        [feedback],
    );

    return { copy, copiedKey };
}
