import { describe, it, expect } from 'vitest';
import {
    describeError,
    estErreurDeSession,
    messageErreurUtilisateur,
    MESSAGE_SESSION_EXPIREE,
} from './asyncGuard';

/**
 * P1-11 — session expirée.
 *
 * Les chemins d'écriture restauraient déjà l'état antérieur et laissaient le
 * formulaire ouvert : aucun faux succès, saisie conservée. Ce qui manquait,
 * c'est le MESSAGE — l'utilisateur lisait « Modification non enregistrée :
 * JWT expired », exact mais inexploitable, et muet sur la seule chose à faire :
 * se reconnecter.
 */
describe('estErreurDeSession', () => {
    /** Formes réellement renvoyées par les trois couches concernées. */
    const sessionsExpirees: Array<[string, unknown]> = [
        ['PostgREST — JWT expiré', { code: 'PGRST301', message: 'JWT expired' }],
        ['PostgREST — message seul', { message: 'JWT expired' }],
        ['Auth Supabase — 401', { status: 401, message: 'Unauthorized' }],
        ['Auth Supabase — refresh absent', { code: 'refresh_token_not_found', message: 'x' }],
        ['Auth Supabase — refresh invalide', { message: 'Invalid Refresh Token: Already Used' }],
        ['Auth Supabase — session absente', { message: 'Session not found' }],
        ['Orchestrateur — 401', { name: 'OrchestratorClientError', status: 401, code: 'HTTP_401' }],
    ];

    for (const [libelle, err] of sessionsExpirees) {
        it(`reconnaît : ${libelle}`, () => {
            expect(estErreurDeSession(err)).toBe(true);
        });
    }

    /**
     * Contre-épreuve indispensable : si tout était pris pour une session
     * expirée, le message inviterait à se reconnecter alors que le problème est
     * ailleurs — et masquerait la vraie cause.
     */
    const autresErreurs: Array<[string, unknown]> = [
        ['permission refusée (RLS)', { code: '42501', message: 'permission denied for table' }],
        ['refus applicatif', { message: 'forbidden' }],
        ['orchestrateur en 500', { status: 500, code: 'HTTP_500' }],
        ['orchestrateur en 403', { status: 403, code: 'HTTP_403' }],
        ['transition illégale', { status: 409, code: 'ILLEGAL_TRANSITION' }],
        ['panne réseau', new TypeError('Failed to fetch')],
        ['erreur ordinaire', new Error('boum')],
        ['chaîne nue', 'boum'],
        ['null', null],
        ['undefined', undefined],
    ];

    for (const [libelle, err] of autresErreurs) {
        it(`ne confond pas : ${libelle}`, () => {
            expect(estErreurDeSession(err)).toBe(false);
        });
    }
});

describe('messageErreurUtilisateur', () => {
    it('remplace le jargon par une consigne exploitable', () => {
        const message = messageErreurUtilisateur({ code: 'PGRST301', message: 'JWT expired' });
        expect(message).toBe(MESSAGE_SESSION_EXPIREE);
        expect(message).not.toContain('JWT');
        // La saisie est effectivement conservée (rollback + formulaire ouvert) :
        // le message doit le dire, sinon l'utilisateur croit avoir tout perdu.
        expect(message).toMatch(/saisie est conservée/i);
    });

    it('laisse intactes les autres erreurs', () => {
        expect(messageErreurUtilisateur(new Error('Trop de lignes : 30000'))).toBe(
            'Trop de lignes : 30000',
        );
        expect(messageErreurUtilisateur('forbidden')).toBe('forbidden');
    });

    it('describeError reste le message technique, pour les journaux', () => {
        // Les deux fonctions ne doivent pas fusionner : perdre « JWT expired »
        // dans les journaux rendrait le diagnostic plus difficile.
        expect(describeError(new Error('JWT expired'))).toBe('JWT expired');
    });
});
