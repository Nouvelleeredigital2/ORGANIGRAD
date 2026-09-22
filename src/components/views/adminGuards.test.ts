import { describe, expect, it } from 'vitest';
import {
    canAdminManageMember,
    canLoadApiKeys,
    mayReplaceUncopiedKey,
} from './adminGuards';

describe('admin UI guards', () => {
    it('ne propose pas à un admin de se retirer comme un autre membre', () => {
        expect(canAdminManageMember({ isAdmin: true, isOwner: false, isSelf: true })).toBe(false);
        expect(canAdminManageMember({ isAdmin: true, isOwner: false, isSelf: false })).toBe(true);
    });

    it('ne charge pas les clés API pour un rôle sans droit de lecture', () => {
        expect(canLoadApiKeys(false)).toBe(false);
        expect(canLoadApiKeys(true)).toBe(true);
    });

    it('demande confirmation avant de remplacer un secret non copié', () => {
        expect(mayReplaceUncopiedKey(true, false)).toBe(false);
        expect(mayReplaceUncopiedKey(true, true)).toBe(true);
        expect(mayReplaceUncopiedKey(false, false)).toBe(true);
    });
});
