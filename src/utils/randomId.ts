/**
 * Génère un UUID v4 RFC 4122 compatible avec la colonne `uuid` de Postgres.
 *
 * Utilise `crypto.randomUUID()` quand disponible (navigateurs modernes, Node 19+).
 * Fallback manuel pour les vieux runtimes (jamais utilisé en prod, garde-fou).
 */
export function randomUuid(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    // Fallback RFC 4122 v4 minimaliste — basé sur crypto.getRandomValues si dispo
    const bytes = new Uint8Array(16);
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
        crypto.getRandomValues(bytes);
    } else {
        for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
    }
    bytes[6] = (bytes[6]! & 0x0f) | 0x40; // version 4
    bytes[8] = (bytes[8]! & 0x3f) | 0x80; // variant 10
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0'));
    return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex
        .slice(6, 8)
        .join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10, 16).join('')}`;
}
