/**
 * Traduction des erreurs d'authentification et des codes d'exception métier
 * des RPC workspace vers un message français exploitable.
 *
 * Amélioration #7 de l'audit du 2026-08-29 : ces écrans affichaient soit
 * l'anglais brut de Supabase Auth (« Invalid login credentials »), soit un
 * code d'exception PL/pgSQL nu (« email_mismatch »), incompréhensibles pour
 * un utilisateur non technique.
 *
 * Principe : ne JAMAIS inventer une traduction pour un message non vérifié.
 * Un message reconnu est traduit ; un message inconnu passe par un habillage
 * générique qui reste honnête (le détail technique n'est pas masqué, il est
 * simplement présenté comme tel) plutôt que de deviner un sens.
 */

/** Messages Supabase Auth (GoTrue) stables et documentés. */
const AUTH_ERROR_MESSAGES: Record<string, string> = {
    'Invalid login credentials': 'E-mail ou mot de passe incorrect.',
    'Email not confirmed': "Cette adresse n'a pas encore été confirmée — vérifie tes e-mails.",
    'User already registered': 'Un compte existe déjà avec cette adresse e-mail.',
    'Password should be at least 6 characters': 'Le mot de passe doit contenir au moins 6 caractères.',
    'Signup requires a valid password': 'Un mot de passe valide est requis pour créer un compte.',
    'Email rate limit exceeded': "Trop de tentatives avec cette adresse — réessaie dans quelques minutes.",
    'Token has expired or is invalid': 'Ce lien a expiré ou est invalide — recommence la demande.',
    'For security purposes, you can only request this after 60 seconds':
        'Pour des raisons de sécurité, attends 60 secondes avant de redemander un lien.',
};

/** Codes levés par nos propres fonctions RPC (`raise exception '<code>'`). */
const WORKSPACE_RPC_ERROR_MESSAGES: Record<string, string> = {
    forbidden: "Tu n'as pas les droits nécessaires pour cette action.",
    email_required: 'Une adresse e-mail est requise.',
    owner_role_not_invitable: "Le rôle « owner » ne peut pas être attribué par invitation.",
    invitation_already_pending: 'Une invitation est déjà en attente pour cette adresse.',
    unauthenticated: 'Tu dois être connecté pour effectuer cette action.',
    invitation_not_found_or_expired: "Cette invitation n'existe plus ou a expiré.",
    email_mismatch: "Cette invitation a été envoyée à une autre adresse e-mail que celle de ton compte.",
};

/**
 * Traduit une erreur Supabase Auth. Message inconnu ⇒ habillage générique qui
 * conserve le détail technique (visible, pas masqué) plutôt qu'une traduction
 * devinée.
 */
export function describeSupabaseAuthError(message: string): string {
    return AUTH_ERROR_MESSAGES[message] ?? `Connexion impossible (détail technique : ${message}).`;
}

/**
 * Traduit un code d'exception d'une RPC workspace (`invite_workspace_member`,
 * `accept_workspace_invitation`, `create_workspace_api_key`, …). Un message
 * qui n'est pas un code connu (ex. une erreur PostgREST générique) est rendu
 * tel quel, préfixé pour rester lisible.
 */
export function describeWorkspaceRpcError(message: string): string {
    return WORKSPACE_RPC_ERROR_MESSAGES[message] ?? `Une erreur est survenue : ${message}`;
}
