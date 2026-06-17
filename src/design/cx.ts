/**
 * Helper de concaténation de classes CSS conditionnelles.
 * Dans un module dédié (hors du barrel de composants `ui.tsx`) pour la
 * compatibilité React Fast Refresh.
 */
export function cx(...parts: Array<string | false | null | undefined>): string {
    return parts.filter(Boolean).join(' ');
}
