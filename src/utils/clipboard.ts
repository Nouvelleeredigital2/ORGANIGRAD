/**
 * Copie presse-papiers avec résultat observable.
 *
 * `navigator.clipboard.writeText` échoue silencieusement dans plusieurs cas
 * courants : contexte non sécurisé (http), iframe sans permission, refus de
 * l'utilisateur. Or l'appelant type est « copier une clé API affichée une seule
 * fois » : un échec muet fait perdre définitivement la valeur.
 *
 * Cette fonction ne lève jamais et renvoie toujours un résultat à examiner.
 */

export interface CopyResult {
    ok: boolean;
    error?: string;
}

/**
 * Repli pour les contextes non sécurisés, où `navigator.clipboard` est absent.
 * `document.execCommand('copy')` y reste disponible ; c'est déprécié, mais c'est
 * la seule voie et l'alternative est la perte de la valeur.
 */
function legacyCopy(text: string): CopyResult {
    if (typeof document === 'undefined') {
        return { ok: false, error: 'Presse-papiers indisponible hors navigateur.' };
    }

    const area = document.createElement('textarea');
    area.value = text;
    // Hors flux et hors écran : ne doit ni déplacer la page ni clignoter.
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.top = '-9999px';
    area.style.opacity = '0';
    document.body.appendChild(area);

    try {
        area.select();
        const ok = document.execCommand('copy');
        return ok ? { ok: true } : { ok: false, error: 'La copie a été refusée par le navigateur.' };
    } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
    } finally {
        document.body.removeChild(area);
    }
}

/** Copie `text` dans le presse-papiers. Ne lève jamais. */
export async function copyToClipboard(text: string): Promise<CopyResult> {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        try {
            await navigator.clipboard.writeText(text);
            return { ok: true };
        } catch {
            // Permission refusée ou contexte non sécurisé : on tente le repli
            // plutôt que d'abandonner — c'est souvent lui qui aboutit en http.
            return legacyCopy(text);
        }
    }

    return legacyCopy(text);
}
