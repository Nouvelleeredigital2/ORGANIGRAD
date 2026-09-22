/**
 * Traduction des erreurs d'authentification Supabase.
 *
 * `AuthScreen` affichait `err.message` tel quel : « Invalid login credentials »,
 * « User already registered », « Password should be at least 6 characters ».
 * Exact, en anglais, et surtout muet sur ce qu'il faut faire — alors que ce sont
 * les tout premiers messages que voit un utilisateur, avant même d'entrer dans
 * l'application.
 *
 * Même principe que `messageErreurUtilisateur` (asyncGuard) : on reconnaît par
 * CODE quand Supabase en fournit un, et on ne retombe sur le texte qu'à défaut —
 * les libellés changent d'une version à l'autre.
 */

export interface ErreurAuth {
    code?: unknown;
    status?: unknown;
    message?: unknown;
}

/** Correspondances par `code` — stables, à privilégier. */
const PAR_CODE: Record<string, string> = {
    invalid_credentials: 'E-mail ou mot de passe incorrect.',
    email_not_confirmed:
        "Ce compte n'est pas encore confirmé. Ouvre le lien reçu par e-mail, puis reconnecte-toi.",
    user_already_exists: 'Un compte existe déjà avec cet e-mail. Connecte-toi plutôt.',
    weak_password: 'Mot de passe trop faible : au moins 8 caractères.',
    over_email_send_rate_limit:
        "Trop d'envois d'e-mails en peu de temps. Patiente quelques minutes avant de réessayer.",
    over_request_rate_limit:
        'Trop de tentatives en peu de temps. Patiente quelques minutes avant de réessayer.',
    validation_failed: 'Adresse e-mail invalide.',
    signup_disabled: "La création de compte est désactivée sur cette instance.",
};

/** Correspondances par texte — repli quand aucun code n'est fourni. */
const PAR_TEXTE: Array<[RegExp, string]> = [
    [/invalid login credentials/i, 'E-mail ou mot de passe incorrect.'],
    [/email not confirmed/i, "Ce compte n'est pas encore confirmé. Ouvre le lien reçu par e-mail, puis reconnecte-toi."],
    [/user already registered|already registered/i, 'Un compte existe déjà avec cet e-mail. Connecte-toi plutôt.'],
    [/password should be at least/i, 'Mot de passe trop faible : au moins 8 caractères.'],
    [/unable to validate email|invalid email/i, 'Adresse e-mail invalide.'],
    [/rate limit|too many requests/i, 'Trop de tentatives en peu de temps. Patiente quelques minutes avant de réessayer.'],
    [/signups not allowed|signup is disabled/i, "La création de compte est désactivée sur cette instance."],
    [/failed to fetch|network/i, 'Connexion au serveur impossible. Vérifie ta connexion puis réessaie.'],
];

/**
 * Message affiché à l'utilisateur pour une erreur d'authentification.
 *
 * Une erreur inconnue est renvoyée telle quelle plutôt que remplacée par un
 * message générique : « Une erreur est survenue » n'aide personne, et masquerait
 * une cause que le texte d'origine nomme peut-être correctement.
 */
export function messageErreurAuth(err: unknown): string {
    if (typeof err === 'string') return traduireTexte(err) ?? err;
    if (typeof err !== 'object' || err === null) return String(err);

    const e = err as ErreurAuth;
    if (typeof e.code === 'string' && PAR_CODE[e.code]) return PAR_CODE[e.code]!;

    const message = typeof e.message === 'string' ? e.message : String(err);
    return traduireTexte(message) ?? message;
}

function traduireTexte(message: string): string | null {
    for (const [motif, traduction] of PAR_TEXTE) {
        if (motif.test(message)) return traduction;
    }
    return null;
}
