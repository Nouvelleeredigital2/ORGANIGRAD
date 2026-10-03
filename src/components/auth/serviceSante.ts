/**
 * Sonde de disponibilité du service d'authentification.
 *
 * Le 03/10/2026, le projet Supabase a cessé de résoudre : l'écran de connexion
 * s'affichait normalement et l'utilisateur ne découvrait la panne qu'après avoir
 * saisi ses identifiants. On interroge `/auth/v1/health` dès l'affichage pour
 * prévenir AVANT la saisie.
 *
 * La sonde n'est qu'un avertissement : elle ne bloque jamais le formulaire, une
 * sonde qui se trompe ne doit pas empêcher de se connecter.
 */

const DELAI_MS = 5000;

/** `true` si le service répond (ou si l'on ne peut pas le sonder). */
export async function sonderServiceAuth(): Promise<boolean> {
    const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
    const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
    if (!url || !key || typeof fetch !== 'function') return true;

    try {
        const reponse = await fetch(`${url.replace(/\/+$/, '')}/auth/v1/health`, {
            headers: { apikey: key },
            signal: AbortSignal.timeout(DELAI_MS),
        });
        // Un 4xx prouve que le service répond : seule une réponse serveur 5xx,
        // ou l'absence de réponse, signale une indisponibilité.
        return reponse.status < 500;
    } catch {
        return false;
    }
}
