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

/**
 * Régression E2E : trois pannes réelles se sont affichées « [object Object] »
 * parce que les erreurs de supabase-js sont des objets simples, jamais des `Error`.
 */
describe('describeError sur une erreur supabase-js', () => {
    it('rend le message au lieu de [object Object]', () => {
        const err = { message: 'mode invalide : append', code: '22023', details: null, hint: null };
        expect(describeError(err)).toBe('mode invalide : append (22023)');
    });

    it("ajoute l'indice, qui dit souvent quoi faire", () => {
        const err = {
            message: 'Could not find the function public.import_org_agents(...) in the schema cache',
            hint: 'Perhaps you meant to call public.import_org_agents(p_agents, p_mode)',
            code: 'PGRST202',
        };
        const texte = describeError(err);
        expect(texte).toContain('Could not find the function');
        expect(texte).toContain('Perhaps you meant');
        expect(texte).toContain('PGRST202');
    });

    it('couvre le cas du trigger BEFORE DELETE', () => {
        const err = {
            message: 'tuple to be updated was already modified by an operation triggered by the current command',
            hint: 'Consider using an AFTER trigger instead of a BEFORE trigger',
            code: '27000',
        };
        expect(describeError(err)).toContain('AFTER trigger');
    });

    it('se rabat sur details quand message est vide', () => {
        expect(describeError({ message: '   ', details: 'contrainte violée' })).toBe('contrainte violée');
    });

    it('accepte les formes error_description et error des réponses auth', () => {
        expect(describeError({ error_description: 'Invalid login credentials' })).toBe('Invalid login credentials');
        expect(describeError({ error: 'invalid_grant' })).toBe('invalid_grant');
    });

    it('ne régresse pas sur les Error, les chaînes et les valeurs sans message', () => {
        expect(describeError(new Error('classique'))).toBe('classique');
        expect(describeError('déjà une chaîne')).toBe('déjà une chaîne');
        expect(describeError(null)).toBe('null');
        expect(describeError({ statut: 500 })).toBe('[object Object]');
    });
});
