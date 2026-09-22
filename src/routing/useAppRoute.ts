import { useCallback, useSyncExternalStore } from 'react';
import {
    DEFAULT_ROUTE,
    parseAppRoute,
    routesEqual,
    serializeAppRoute,
    type AppRoute,
} from './appUrl';

/**
 * Synchronisation de l'état de navigation avec l'URL, sans routeur tiers.
 *
 * L'application n'a qu'un seul aiguillage de vue et trois états orthogonaux :
 * une bibliothèque de routage imposerait de restructurer App.tsx et AppShell
 * pour un bénéfice nul, et ~20 ko gzip.
 *
 * `pushState` n'émet PAS d'événement `popstate` : on émet donc un événement
 * maison pour que tous les abonnés voient le changement.
 */

const NAVIGATION_EVENT = 'organigrad:navigate';

/** Snapshot mis en cache : `useSyncExternalStore` exige une valeur stable. */
let cachedSearch: string | null = null;
let cachedRoute: AppRoute = DEFAULT_ROUTE;

function getSnapshot(): AppRoute {
    if (typeof window === 'undefined') return DEFAULT_ROUTE;
    const search = window.location.search;
    if (search !== cachedSearch) {
        cachedSearch = search;
        cachedRoute = parseAppRoute(search);
    }
    return cachedRoute;
}

function subscribe(onChange: () => void): () => void {
    window.addEventListener('popstate', onChange);
    window.addEventListener(NAVIGATION_EVENT, onChange);
    return () => {
        window.removeEventListener('popstate', onChange);
        window.removeEventListener(NAVIGATION_EVENT, onChange);
    };
}

export function useAppRoute(): {
    route: AppRoute;
    navigate: (patch: Partial<AppRoute>, opts?: { replace?: boolean }) => void;
} {
    const route = useSyncExternalStore(subscribe, getSnapshot, () => DEFAULT_ROUTE);

    const navigate = useCallback(
        (patch: Partial<AppRoute>, opts?: { replace?: boolean }) => {
            const current = getSnapshot();
            const next = { ...current, ...patch };
            if (routesEqual(current, next)) return;

            const search = serializeAppRoute(next, window.location.search);
            const url = `${window.location.pathname}${search}${window.location.hash}`;

            if (opts?.replace) {
                window.history.replaceState(null, '', url);
            } else {
                window.history.pushState(null, '', url);
            }
            window.dispatchEvent(new Event(NAVIGATION_EVENT));
        },
        [],
    );

    return { route, navigate };
}
