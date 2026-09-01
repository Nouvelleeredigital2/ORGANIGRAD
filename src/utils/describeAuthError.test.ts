import { describe, it, expect } from 'vitest';
import { describeSupabaseAuthError, describeWorkspaceRpcError } from './describeAuthError';

describe('describeSupabaseAuthError', () => {
    it('traduit un message GoTrue connu', () => {
        expect(describeSupabaseAuthError('Invalid login credentials')).toBe(
            'E-mail ou mot de passe incorrect.',
        );
    });

    it("habille un message inconnu SANS deviner de traduction, en conservant le detail", () => {
        const msg = describeSupabaseAuthError('Some new GoTrue error we never saw');
        expect(msg).toContain('Some new GoTrue error we never saw');
        expect(msg).not.toBe('Some new GoTrue error we never saw');
    });
});

describe('describeWorkspaceRpcError', () => {
    it('traduit les codes connus des RPC workspace', () => {
        expect(describeWorkspaceRpcError('email_mismatch')).toMatch(/autre adresse/i);
        expect(describeWorkspaceRpcError('invitation_not_found_or_expired')).toMatch(/expiré/i);
        expect(describeWorkspaceRpcError('invitation_already_pending')).toMatch(/attente/i);
        expect(describeWorkspaceRpcError('owner_role_not_invitable')).toMatch(/owner/i);
        expect(describeWorkspaceRpcError('forbidden')).toMatch(/droits/i);
        expect(describeWorkspaceRpcError('unauthenticated')).toMatch(/connecté/i);
    });

    it('habille un message PostgREST générique sans le masquer', () => {
        const msg = describeWorkspaceRpcError('duplicate key value violates unique constraint');
        expect(msg).toContain('duplicate key value violates unique constraint');
    });
});
