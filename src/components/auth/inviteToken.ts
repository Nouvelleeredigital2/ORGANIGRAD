/**
 * Gestion du token d'invitation (hors composant pour compatibilité Fast Refresh).
 */
const PENDING_TOKEN_KEY = 'organigrad_pending_invite_token';

export function readPendingInviteToken(): string | null {
    // 1. URL ?invite=xxx
    const params = new URLSearchParams(window.location.search);
    const fromUrl = params.get('invite');
    if (fromUrl) {
        localStorage.setItem(PENDING_TOKEN_KEY, fromUrl);
        // Nettoie l'URL pour ne pas re-traiter le token après refresh
        const url = new URL(window.location.href);
        url.searchParams.delete('invite');
        window.history.replaceState({}, '', url.toString());
        return fromUrl;
    }
    // 2. localStorage (cas où le user vient juste de s'authentifier)
    return localStorage.getItem(PENDING_TOKEN_KEY);
}

export function clearPendingInviteToken() {
    localStorage.removeItem(PENDING_TOKEN_KEY);
}
