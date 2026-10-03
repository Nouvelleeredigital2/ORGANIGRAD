import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    MESSAGE_HORS_LIGNE,
    MESSAGE_SERVICE_INDISPONIBLE,
    estIndisponibiliteService,
    messageErreurAuth,
} from './authErrors';

/**
 * ORGANIGRAD-1 (recette du 03/10/2026) : une panne du service ne doit jamais
 * être présentée comme un problème de connexion de l'utilisateur, ni comme un
 * refus d'identifiants.
 */

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('estIndisponibiliteService', () => {
    it.each([
        ['AuthRetryableFetchError', { name: 'AuthRetryableFetchError', message: '{}' }],
        ['status 0', { status: 0, message: '' }],
        ['502', { status: 502, message: 'Bad Gateway' }],
        ['503', { status: 503, message: 'Service Unavailable' }],
        ['504', { status: 504, message: 'Gateway Timeout' }],
        ['TypeError Chrome', new TypeError('Failed to fetch')],
        ['TypeError Firefox', new TypeError('NetworkError when attempting to fetch resource.')],
        ['TypeError Safari', new TypeError('Load failed')],
        ['DNS', 'net::ERR_NAME_NOT_RESOLVED'],
    ])('reconnaît %s', (_, err) => {
        expect(estIndisponibiliteService(err)).toBe(true);
    });

    it.each([
        ['identifiants refusés', { code: 'invalid_credentials', status: 400, message: 'Invalid login credentials' }],
        ['500 qui nomme sa cause', { status: 500, message: 'Database error querying schema' }],
        ['limite de débit', { status: 429, message: 'Too many requests' }],
        ['null', null],
    ])('ne confond pas %s avec une panne', (_, err) => {
        expect(estIndisponibiliteService(err)).toBe(false);
    });
});

describe('messageErreurAuth', () => {
    it('panne du service : message d’indisponibilité, sans accuser le réseau de l’utilisateur', () => {
        const message = messageErreurAuth(new TypeError('Failed to fetch'));
        expect(message).toBe(MESSAGE_SERVICE_INDISPONIBLE);
        expect(message).not.toMatch(/ta connexion/i);
    });

    it('navigateur hors ligne : le seul cas où l’on renvoie vers la connexion Internet', () => {
        vi.stubGlobal('navigator', { onLine: false });
        expect(messageErreurAuth({ name: 'AuthRetryableFetchError', status: 0 })).toBe(MESSAGE_HORS_LIGNE);
    });

    it('identifiants refusés : message distinct de la panne', () => {
        expect(messageErreurAuth({ code: 'invalid_credentials', message: 'Invalid login credentials' })).toBe(
            'E-mail ou mot de passe incorrect.',
        );
    });
});
