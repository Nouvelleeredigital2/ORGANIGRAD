import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

// jsdom n'implémente pas ResizeObserver (utilisé par MCPAnchorsOverlay, etc.).
// Polyfill minimal pour que les composants montent sans planter en test.
if (!('ResizeObserver' in globalThis)) {
    class ResizeObserverStub {
        observe() {}
        unobserve() {}
        disconnect() {}
    }
    (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = ResizeObserverStub;
}

// ── Hermétisme réseau (Priorité 8) ───────────────────────────────────────────
// Tout appel réseau NON mocké échoue immédiatement. Les tests qui ont besoin du
// réseau doivent injecter un `fetchImpl`/`eventSourceImpl` ou stubber explicitement
// (vi.stubGlobal), jamais contacter un service réel (Slack, Supabase, MCP…).
const blockedFetch = () =>
    Promise.reject(
        new Error(
            '[hermetic] Appel réseau non mocké dans un test. Injecte un fetchImpl ou mocke fetch.',
        ),
    );

beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(blockedFetch));
    // EventSource n'existe pas en jsdom : on fournit un stub qui échoue si utilisé
    // sans injection explicite.
    vi.stubGlobal(
        'EventSource',
        class {
            constructor() {
                throw new Error('[hermetic] EventSource non mocké — injecte eventSourceImpl.');
            }
        },
    );
});

afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
});
