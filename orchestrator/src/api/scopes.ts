/**
 * Modèle d'autorisation par scopes (Priorité 2).
 *
 * Une clé API technique authentifie un AGENT ou un service externe. Elle ne doit
 * JAMAIS pouvoir contourner la validation humaine : les scopes `human:approve`,
 * `human:reject`, `node:reset` et `workspace:admin` lui sont refusés par défaut
 * (cf. RPC create_workspace_api_key qui rejette ces scopes).
 *
 * L'enforcement est centralisé ici : chaque route déclare le scope requis, et
 * `assertScope` lève une `MissingScopeError` (→ 403) si la clé ne le porte pas.
 */

export const SCOPES = {
    graphRead: 'graph:read',
    nodeRead: 'node:read',
    nodeRun: 'node:run',
    executionRead: 'execution:read',
    humanApprove: 'human:approve',
    humanReject: 'human:reject',
    nodeReset: 'node:reset',
    workspaceAdmin: 'workspace:admin',
} as const;

export type Scope = (typeof SCOPES)[keyof typeof SCOPES];

export const ALL_SCOPES: readonly Scope[] = Object.values(SCOPES);

/** Scopes accordés par défaut à une clé technique (aucune action humaine). */
export const DEFAULT_API_KEY_SCOPES: readonly Scope[] = [
    SCOPES.graphRead,
    SCOPES.nodeRead,
    SCOPES.nodeRun,
    SCOPES.executionRead,
];

/** Scopes qui exigent une validation humaine — interdits aux clés techniques. */
export const HUMAN_SCOPES: readonly Scope[] = [
    SCOPES.humanApprove,
    SCOPES.humanReject,
    SCOPES.nodeReset,
    SCOPES.workspaceAdmin,
];

export class MissingScopeError extends Error {
    constructor(public readonly required: Scope) {
        super(`Scope requis manquant : ${required}`);
        this.name = 'MissingScopeError';
    }
}

/** Vérifie que `granted` contient `required`, sinon lève `MissingScopeError`. */
export function assertScope(granted: readonly string[] | undefined, required: Scope): void {
    if (!granted || !granted.includes(required)) {
        throw new MissingScopeError(required);
    }
}

export function hasScope(granted: readonly string[] | undefined, required: Scope): boolean {
    return Boolean(granted && granted.includes(required));
}
