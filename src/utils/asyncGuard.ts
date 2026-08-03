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

/** Normalise une valeur levée (souvent `unknown`) en message lisible. */
export function describeError(err: unknown): string {
    if (err instanceof Error) return err.message;
    if (typeof err === 'string') return err;
    return String(err);
}

/** Convertit une valeur levée en `Error`, sans perdre l'information d'origine. */
export function toError(err: unknown): Error {
    return err instanceof Error ? err : new Error(describeError(err));
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
