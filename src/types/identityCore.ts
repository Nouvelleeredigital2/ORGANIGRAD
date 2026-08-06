/**
 * Identité de référence et projets indépendants d'APPS-2026.
 *
 * Identity Core possède l'identité (marque, ton, style, règles). Les projets
 * restent possédés par l'application métier qui les crée et ne conservent
 * qu'un lien versionné vers l'identité utilisée.
 */
export type IdentityStatus = 'draft' | 'published';
export type ProjectStatus = 'draft' | 'active' | 'paused' | 'completed';

export interface BrandIdentity {
    id: string;
    companyName: string;
    brandName: string;
    positioning: string;
    tone: string;
    visualStyle: string;
    externalCommunication: string;
    version: number;
    status: IdentityStatus;
    createdAt: string;
    updatedAt: string;
}

export interface IndependentProject {
    id: string;
    name: string;
    description: string;
    ownerApp: string;
    identityId: string | null;
    identityVersion: number | null;
    participatingApps: string[];
    status: ProjectStatus;
    createdAt: string;
    updatedAt: string;
}

export interface IdentityCoreState {
    identities: BrandIdentity[];
    projects: IndependentProject[];
}

export const PROJECT_APPLICATIONS = [
    'NED IA',
    'Élite SEO',
    'Socialize EA',
    'Vector Studio',
    'Virtual Production OS',
    'Atelier Orvion',
    'Memoria Player Studio',
    'ExploraViva',
    'Organigrad',
    'Mémoire Vive Connect',
] as const;

