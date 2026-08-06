import type { BrandIdentity, IndependentProject } from '../types/identityCore';

interface ContextEventInput {
    type: string;
    workspaceId: string | null;
    projectId?: string;
    identityId?: string;
    identityVersion?: number;
    sourceApp: string;
    targetApps?: string[];
    payload?: Record<string, unknown>;
}

const canonicalAppId = (name: string): string => {
    const known: Record<string, string> = {
        'NED IA': 'ned-ia',
        'Élite SEO': 'elite-seo',
        'Socialize EA': 'socialize-ea',
        'Vector Studio': 'vector-studio',
        'Virtual Production OS': 'virtual-production-os',
        'Atelier Orvion': 'atelier-orvion',
        'Memoria Player Studio': 'memoria-player-studio',
        'ExploraViva': 'exploraviva',
        'Organigrad': 'organigrad',
        'Mémoire Vive Connect': 'memoire-vive-connect',
    };
    return known[name] ?? name.trim().toLowerCase().replace(/\s+/g, '-');
};

/**
 * Publication best-effort vers NED IA Synapse.
 *
 * L’interface continue de fonctionner hors ligne si VITE_SYNAPSE_URL n’est
 * pas configurée. Les données riches restent dans Identity Core : le bus ne
 * reçoit que des références et des versions.
 */
async function publish(input: ContextEventInput): Promise<void> {
    const base = (import.meta.env.VITE_SYNAPSE_URL as string | undefined)?.replace(/\/$/, '');
    if (!base || !input.workspaceId) return;

    const event = {
        id: crypto.randomUUID(),
        type: input.type,
        version: '1.0',
        sourceApp: canonicalAppId(input.sourceApp),
        targetApps: input.targetApps?.map(canonicalAppId),
        workspaceId: input.workspaceId,
        projectId: input.projectId,
        brandId: input.identityId,
        correlationId: input.projectId ? `project-${input.projectId}` : `identity-${input.identityId}`,
        payload: {
            ...(input.payload ?? {}),
            dataPolicy: 'references-only',
        },
        status: 'pending',
        createdAt: new Date().toISOString(),
    };

    try {
        await fetch(`${base}/api/events`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(event),
            signal: AbortSignal.timeout(2000),
        });
    } catch {
        // Le bus est best-effort : une panne réseau ne doit pas perdre la saisie.
    }
}

export function publishProjectCreated(project: IndependentProject, workspaceId: string | null): void {
    void publish({
        type: 'project.created',
        sourceApp: project.ownerApp,
        targetApps: project.participatingApps,
        workspaceId,
        projectId: project.id,
        identityId: project.identityId ?? undefined,
        identityVersion: project.identityVersion ?? undefined,
        payload: {
            ownerApp: project.ownerApp,
            identityVersion: project.identityVersion,
            participatingApps: project.participatingApps,
        },
  });
}

export function publishProjectIdentityAttached(project: IndependentProject, workspaceId: string | null): void {
    if (!project.identityId || project.identityVersion === null) return;
    void publish({
        type: 'project.identity_attached',
        sourceApp: project.ownerApp,
        targetApps: project.participatingApps,
        workspaceId,
        projectId: project.id,
        identityId: project.identityId,
        identityVersion: project.identityVersion,
        payload: {
            identityId: project.identityId,
            identityVersion: project.identityVersion,
            ownerApp: project.ownerApp,
            participatingApps: project.participatingApps,
        },
    });
}

export function publishIdentityVersion(identity: BrandIdentity, workspaceId: string | null): void {
    void publish({
        type: 'identity.version_published',
        sourceApp: 'identity-core',
        targetApps: ['ned-ia-synapse'],
        workspaceId,
        identityId: identity.id,
        identityVersion: identity.version,
        payload: {
            identityId: identity.id,
            version: identity.version,
            brandName: identity.brandName,
        },
    });
}
