import { describe, it, expect, beforeEach } from 'vitest';
import { readPendingInviteToken, clearPendingInviteToken } from './inviteToken';

/**
 * P1-10 — « conserver un éventuel `invite` en attente ».
 *
 * Un invité clique `…/?invite=xxx`, arrive sur l'écran de connexion, demande un
 * lien magique, quitte l'application pour ouvrir sa boîte mail, puis revient par
 * une URL qui ne porte plus le jeton. Si celui-ci n'a pas survécu à ce
 * parcours, il ne rejoint jamais le workspace auquel il était invité.
 */

/** Simule l'arrivée sur une URL donnée. */
function allerA(url: string) {
    window.history.replaceState({}, '', url);
}

beforeEach(() => {
    localStorage.clear();
    allerA('/');
});

describe('readPendingInviteToken', () => {
    it('lit le jeton depuis l’URL et le met de côté', () => {
        allerA('/?invite=inv_abc123');
        expect(readPendingInviteToken()).toBe('inv_abc123');
    });

    it('nettoie l’URL pour ne pas retraiter le jeton au rechargement', () => {
        allerA('/?invite=inv_abc123');
        readPendingInviteToken();
        expect(window.location.search).not.toContain('invite');
    });

    it('préserve les autres paramètres en nettoyant', () => {
        // La route de l'application vit dans la query string : effacer `v` ou
        // `pole` en retirant `invite` ferait sauter la vue courante.
        allerA('/?v=orchestration&invite=inv_abc123&pole=TECHNIQUE');
        readPendingInviteToken();
        expect(window.location.search).toContain('v=orchestration');
        expect(window.location.search).toContain('pole=TECHNIQUE');
        expect(window.location.search).not.toContain('invite');
    });

    it('survit à un retour SANS le jeton dans l’URL — le parcours du lien magique', () => {
        allerA('/?invite=inv_abc123');
        expect(readPendingInviteToken()).toBe('inv_abc123');

        // L'utilisateur revient depuis sa boîte mail, sur une URL sans `invite`.
        allerA('/');
        expect(readPendingInviteToken()).toBe('inv_abc123');
    });

    it('renvoie null quand il n’y a rien', () => {
        expect(readPendingInviteToken()).toBeNull();
    });

    it('un jeton vide n’écrase pas celui déjà en attente', () => {
        allerA('/?invite=inv_abc123');
        readPendingInviteToken();
        allerA('/?invite=');
        expect(readPendingInviteToken()).toBe('inv_abc123');
    });

    it('un nouveau jeton remplace l’ancien', () => {
        allerA('/?invite=inv_premier');
        readPendingInviteToken();
        allerA('/?invite=inv_second');
        expect(readPendingInviteToken()).toBe('inv_second');
    });
});

describe('clearPendingInviteToken', () => {
    it('oublie le jeton une fois l’invitation traitée', () => {
        allerA('/?invite=inv_abc123');
        readPendingInviteToken();
        clearPendingInviteToken();
        allerA('/');
        expect(readPendingInviteToken()).toBeNull();
    });
});
