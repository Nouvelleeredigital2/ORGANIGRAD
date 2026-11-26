/**
 * Lien « Ouvrir le Centre de validation » envoyé dans les notifications
 * (Slack, bus Synapse). Le Centre de validation vit dans la vue Orchestration.
 *
 * Le format DOIT être celui que lit la SPA (`src/routing/appUrl.ts`) : `v` pour
 * la vue, `node` pour le nœud. L'ancien lien `?view=orchestration&nodeId=…`
 * n'était pas reconnu et retombait sur l'organigramme. La fonction Edge
 * `notify-email` porte une copie de cette règle (runtime Deno séparé).
 */
export function buildValidationLink(appUrl: string, nodeId: string): string {
    try {
        const url = new URL(appUrl);
        url.searchParams.set('v', 'orchestration');
        url.searchParams.set('node', nodeId);
        return url.toString();
    } catch {
        // APP_URL non absolue : on conserve le comportement historique de
        // simple concaténation, dans le bon format.
        return `${appUrl}?v=orchestration&node=${encodeURIComponent(nodeId)}`;
    }
}
