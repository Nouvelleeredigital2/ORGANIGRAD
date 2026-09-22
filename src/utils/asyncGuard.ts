/**
 * Garde asynchrone — convention de gestion d'erreur du projet.
 *
 * Trois règles, appliquées partout où une action utilisateur déclenche un appel
 * réseau ou une écriture :
 *
 *  1. Aucun `void promise` sans `.catch` — un rejet non géré est invisible pour
 *     l'utilisateur et ne laisse qu'une ligne de console.
 *  2. Une action asynchrone ne referme JAMAIS son interface avant le succès.
 *     Fermer un panneau puis échouer fait croire à une réussite.
 *  3. Aucun `catch {}` vide — soit on remonte l'erreur, soit on renvoie un
 *     résultat explicite que l'appelant doit examiner.
 *
 * `attempt` matérialise le résultat au lieu de lever : l'appelant ne peut pas
 * oublier le cas d'échec, il doit lire `ok`.
 */

export type Outcome<T> = { ok: true; value: T } | { ok: false; error: Error };

/** Champs d'erreur que portent PostgREST et supabase-js, qui ne lèvent pas d'`Error`. */
interface ErreurPortee {
    message?: unknown;
    hint?: unknown;
    code?: unknown;
    details?: unknown;
    error_description?: unknown;
    error?: unknown;
}

const texteNonVide = (valeur: unknown): string | null => {
    if (typeof valeur !== 'string') return null;
    const t = valeur.trim();
    return t.length > 0 ? t : null;
};

/**
 * Normalise une valeur levée (souvent `unknown`) en message lisible.
 *
 * **Pourquoi ce n'est pas qu'un `String(err)`.** Les erreurs de supabase-js et de
 * PostgREST sont des **objets simples**, jamais des instances d'`Error` : elles
 * portent `message`, `code`, `details` et parfois `hint`. Le repli `String(err)`
 * les rendait toutes en `"[object Object]"` — un message vide de sens, affiché tel
 * quel à l'utilisateur.
 *
 * Trois pannes réelles ont été masquées par ce seul repli, chacune ayant coûté un
 * diagnostic complet alors que la réponse contenait déjà la réponse :
 *
 *  - un import refusé faute de migration : `PGRST202`, avec un `hint` qui donnait la
 *    signature attendue ;
 *  - une suppression en masse refusée : `27000`, avec un `hint` désignant le trigger ;
 *  - un mode d'import invalide : `22023`, message explicite.
 *
 * On concatène donc le message et l'indice — l'indice de PostgREST dit souvent quoi
 * faire — et on ajoute le code entre parenthèses, qui est ce qu'un utilisateur peut
 * recopier dans un signalement.
 */
export function describeError(err: unknown): string {
    if (err instanceof Error) return err.message;
    if (typeof err === 'string') return err;

    if (err && typeof err === 'object') {
        const e = err as ErreurPortee;

        const message = texteNonVide(e.message)
            ?? texteNonVide(e.error_description)
            ?? texteNonVide(e.error)
            ?? texteNonVide(e.details);

        if (message) {
            const indice = texteNonVide(e.hint);
            const code = texteNonVide(e.code);
            return [
                message,
                indice ? ` — ${indice}` : '',
                code ? ` (${code})` : '',
            ].join('');
        }
    }

    return String(err);
}

/** Convertit une valeur levée en `Error`, sans perdre l'information d'origine. */
export function toError(err: unknown): Error {
    return err instanceof Error ? err : new Error(describeError(err));
}

/**
 * Message affiché à l'utilisateur lorsqu'une session a expiré.
 *
 * Précise que la saisie est conservée : les chemins d'écriture restaurent
 * l'état antérieur et laissent le formulaire ouvert, mais l'utilisateur ne peut
 * pas le deviner au moment où l'échec s'affiche.
 */
export const MESSAGE_SESSION_EXPIREE =
    'Ta session a expiré. Reconnecte-toi, puis réessaie — ta saisie est conservée.';

/**
 * Reconnaît une erreur due à une session expirée ou invalidée.
 *
 * Trois familles, selon la couche qui répond :
 *   - PostgREST : `PGRST301` (JWT expiré) ;
 *   - Auth Supabase : 401, jeton de rafraîchissement absent ou périmé ;
 *   - orchestrateur : `OrchestratorClientError` en 401.
 *
 * La détection porte sur le code ou le statut quand ils existent, et ne
 * retombe sur le texte qu'à défaut : les libellés changent d'une version à
 * l'autre.
 */
export function estErreurDeSession(err: unknown): boolean {
    if (typeof err !== 'object' || err === null) return false;
    const e = err as { code?: unknown; status?: unknown; message?: unknown; name?: unknown };

    if (e.code === 'PGRST301' || e.code === 'refresh_token_not_found') return true;
    if (e.status === 401) return true;

    const message = typeof e.message === 'string' ? e.message.toLowerCase() : '';
    return (
        message.includes('jwt expired') ||
        message.includes('invalid refresh token') ||
        message.includes('refresh token not found') ||
        message.includes('session not found')
    );
}

/**
 * Message d'erreur DESTINÉ À L'UTILISATEUR.
 *
 * Une session expirée remontait telle quelle : « Modification non enregistrée :
 * JWT expired ». Techniquement exact, inexploitable — et surtout muet sur la
 * seule chose à faire, se reconnecter. `describeError` reste le message
 * technique brut, utilisé pour les journaux et les erreurs rejouées.
 */
export function messageErreurUtilisateur(err: unknown): string {
    return estErreurDeSession(err) ? MESSAGE_SESSION_EXPIREE : describeError(err);
}

/**
 * Exécute `fn` et matérialise son issue. Ne lève jamais.
 *
 * Couvre aussi les fonctions qui lèvent de façon synchrone avant de produire
 * leur promesse (erreur de validation en tête de fonction, par exemple).
 */
export async function attempt<T>(fn: () => Promise<T> | T): Promise<Outcome<T>> {
    try {
        return { ok: true, value: await fn() };
    } catch (err) {
        return { ok: false, error: toError(err) };
    }
}
