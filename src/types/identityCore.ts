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

/**
 * Applications concernées par le passeport de projet 2026.
 *
 * La sélection ne duplique jamais la charte : elle ne transporte que les
 * références versionnées Identity Core rattachées au projet.
 */
export const PROJECT_APPLICATIONS = [
    'NED IA',
    'Identity Core',
    'Mémoire Vive Connect',
    'Biblio-Tech-RAG',
    'Organigrad',
    'Hermes',
    'LINK',
    'Élite SEO',
    'Atelier Orvion',
    'Neo Cortex Digital',
    'Virtual Production OS',
    'Vector Studio',
    'Podcast IA',
    'MindFlow',
    'Socialize EA',
    'AgentdeTestUX',
] as const;

