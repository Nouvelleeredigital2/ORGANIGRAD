import type {
    BrandIdentity,
    IdentityCoreState,
    IndependentProject,
} from '../types/identityCore';

const STORAGE_PREFIX = 'organigrad:identity-core:';
const EMPTY_STATE: IdentityCoreState = { identities: [], projects: [] };

const makeId = (prefix: string): string => {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
        return `${prefix}_${crypto.randomUUID()}`;
    }
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
};

const storageKey = (workspaceId: string | null): string =>
    `${STORAGE_PREFIX}${workspaceId || 'local'}`;

function read(workspaceId: string | null): IdentityCoreState {
    if (typeof window === 'undefined') return EMPTY_STATE;
    try {
        const raw = window.localStorage.getItem(storageKey(workspaceId));
        if (!raw) return EMPTY_STATE;
        const parsed = JSON.parse(raw) as Partial<IdentityCoreState>;
        return {
            identities: Array.isArray(parsed.identities) ? parsed.identities : [],
            projects: Array.isArray(parsed.projects) ? parsed.projects : [],
        };
    } catch {
        return EMPTY_STATE;
    }
}

function write(workspaceId: string | null, state: IdentityCoreState): void {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(storageKey(workspaceId), JSON.stringify(state));
    window.dispatchEvent(new CustomEvent('organigrad:identity-core-changed', {
        detail: { workspaceId },
    }));
}

export const identityCoreStore = {
    list(workspaceId: string | null): IdentityCoreState {
        return read(workspaceId);
    },

    createIdentity(
        workspaceId: string | null,
        input: Omit<BrandIdentity, 'id' | 'version' | 'status' | 'createdAt' | 'updatedAt'>,
    ): BrandIdentity {
        const now = new Date().toISOString();
        const identity: BrandIdentity = {
            ...input,
            id: makeId('identity'),
            version: 1,
            status: 'draft',
            createdAt: now,
            updatedAt: now,
        };
        const state = read(workspaceId);
        write(workspaceId, { ...state, identities: [identity, ...state.identities] });
        return identity;
    },

    publishIdentity(workspaceId: string | null, identityId: string): BrandIdentity | null {
        const state = read(workspaceId);
        const identity = state.identities.find((item) => item.id === identityId);
        if (!identity) return null;
        const updated: BrandIdentity = {
            ...identity,
            status: 'published',
            version: identity.version + 1,
            updatedAt: new Date().toISOString(),
        };
        write(workspaceId, {
            ...state,
            identities: state.identities.map((item) => item.id === identityId ? updated : item),
        });
        return updated;
    },

    createProject(
        workspaceId: string | null,
        input: Omit<IndependentProject, 'id' | 'createdAt' | 'updatedAt' | 'status'>,
    ): IndependentProject {
        const now = new Date().toISOString();
        const project: IndependentProject = {
            ...input,
            id: makeId('project'),
            status: 'draft',
            createdAt: now,
            updatedAt: now,
        };
        const state = read(workspaceId);
        write(workspaceId, { ...state, projects: [project, ...state.projects] });
        return project;
    },
};

