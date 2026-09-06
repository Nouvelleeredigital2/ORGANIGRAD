import type { AppView } from '../hooks/useOrgChartController';

/**
 * Sérialisation de l'état de navigation dans l'URL.
 *
 * Choix d'une QUERY STRING plutôt que de segments de chemin : le flux
 * d'invitation lit déjà `?invite=` puis nettoie l'URL via `history.replaceState`
 * (cf. components/auth/inviteToken.ts), et les liens d'invitation sont
 * construits sous la forme `${origin}/?invite=…`. Un routage par chemin entrerait
 * en collision avec ce flux.
 *
 * Corollaire non négociable : `serializeAppRoute` PRÉSERVE tout paramètre
 * inconnu. Perdre `?invite=` empêcherait un invité de rejoindre son workspace.
 */

const VIEWS: readonly AppView[] = [
    'orgchart',
    'dashboard',
    'orchestration',
    'identity-core',
    'members',
    'api-keys',
    'settings',
];

export interface AppRoute {
    view: AppView;
    poleKey: string | null;
    agentId: string | null;
    nodeId: string | null;
    editMode: boolean;
}

export const DEFAULT_ROUTE: AppRoute = {
    view: 'orgchart',
    poleKey: null,
    agentId: null,
    nodeId: null,
    editMode: false,
};

/** Clés gérées par le routeur — les autres sont conservées telles quelles. */
const OWNED_KEYS = ['v', 'pole', 'agent', 'node', 'edit'] as const;

const isView = (value: string): value is AppView => (VIEWS as readonly string[]).includes(value);

/**
 * Lit une route depuis une query string. Tolérant par construction : une vue
 * inconnue retombe sur `orgchart` plutôt que de casser l'affichage. Ne lève jamais.
 */
export function parseAppRoute(search: string): AppRoute {
    const params = new URLSearchParams(search);
    const view = params.get('v');

    return {
        view: view && isView(view) ? view : DEFAULT_ROUTE.view,
        poleKey: params.get('pole') || null,
        agentId: params.get('agent') || null,
        nodeId: params.get('node') || null,
        editMode: params.get('edit') === '1',
    };
}

/**
 * Produit la query string correspondant à `route`, en repartant de `currentSearch`
 * pour ne perdre aucun paramètre étranger (`invite`, campagnes, etc.).
 */
export function serializeAppRoute(route: AppRoute, currentSearch: string): string {
    const params = new URLSearchParams(currentSearch);
    OWNED_KEYS.forEach((key) => params.delete(key));

    // La vue par défaut n'est pas écrite : `/` reste une URL propre.
    if (route.view !== DEFAULT_ROUTE.view) params.set('v', route.view);
    if (route.poleKey) params.set('pole', route.poleKey);
    if (route.agentId) params.set('agent', route.agentId);
    if (route.nodeId) params.set('node', route.nodeId);
    if (route.editMode) params.set('edit', '1');

    const query = params.toString();
    return query ? `?${query}` : '';
}

export function routesEqual(a: AppRoute, b: AppRoute): boolean {
    return (
        a.view === b.view &&
        a.poleKey === b.poleKey &&
        a.agentId === b.agentId &&
        a.nodeId === b.nodeId &&
        a.editMode === b.editMode
    );
}
