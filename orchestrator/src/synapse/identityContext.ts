/**
 * Événements APPS-2026 pour le rattachement contrôlé d'une identité à un
 * projet indépendant. Ces builders ne transportent jamais la charte complète
 * ni les fichiers riches : uniquement des références, versions et périmètres.
 */
import { createEvent, type SynapseEvent } from '@apps2026/contracts';

export interface IdentityContextRef {
    workspaceId: string;
    projectId: string;
    ownerApp: string;
    identityId?: string;
    identityVersion?: number;
    participatingApps?: string[];
}

const canonicalAppId = (name: string): string => {
    const known: Record<string, string> = {
        'NED IA': 'ned-ia',
        'NED IA Synapse': 'ned-ia-synapse',
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

export function buildProjectCreatedEvent(ref: IdentityContextRef): SynapseEvent {
    return createEvent({
        type: 'project.created',
        sourceApp: canonicalAppId(ref.ownerApp),
        targetApps: ['ned-ia-synapse', ...(ref.participatingApps ?? []).map(canonicalAppId)],
        workspaceId: ref.workspaceId,
        projectId: ref.projectId,
        ...(ref.identityId ? { brandId: ref.identityId } : {}),
        correlationId: `project-${ref.projectId}`,
        payload: {
            ownerApp: ref.ownerApp,
            identityId: ref.identityId,
            identityVersion: ref.identityVersion,
            participatingApps: ref.participatingApps ?? [],
            dataPolicy: 'references-only',
        },
    });
}

export function buildProjectIdentityAttachedEvent(ref: IdentityContextRef): SynapseEvent {
    if (!ref.identityId || ref.identityVersion === undefined) {
        throw new Error('identityId et identityVersion sont requis pour attacher une identité');
    }
    return createEvent({
        type: 'project.identity_attached',
        sourceApp: 'identity-core',
        targetApps: [ref.ownerApp, ...(ref.participatingApps ?? [])],
        workspaceId: ref.workspaceId,
        projectId: ref.projectId,
        brandId: ref.identityId,
        correlationId: `project-${ref.projectId}`,
        payload: {
            identityId: ref.identityId,
            identityVersion: ref.identityVersion,
            dataPolicy: 'references-only',
        },
    });
}

export function buildIdentityVersionPublishedEvent(input: {
    workspaceId: string;
    identityId: string;
    brandId?: string;
    version: number;
    targetApps?: string[];
}): SynapseEvent {
    return createEvent({
        type: 'identity.version_published',
        sourceApp: 'identity-core',
        targetApps: input.targetApps,
        workspaceId: input.workspaceId,
        ...(input.brandId ? { brandId: input.brandId } : {}),
        correlationId: `identity-${input.identityId}`,
        payload: {
            identityId: input.identityId,
            version: input.version,
            dataPolicy: 'references-only',
        },
    });
}
