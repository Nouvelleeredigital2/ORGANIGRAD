/**
 * LEGACY RH model — conservé temporairement le temps de migrer
 * intégralement le pipeline CSV (import Google Sheets → pôles → arbre → recherche)
 * vers le nouveau modèle `HybridNode`.
 *
 * Tout nouveau code DOIT cibler `HybridNode` (cf. `./hybridNode.ts`).
 * Utiliser `agentToHybridNode()` pour adapter une fiche legacy.
 */

export type GradeStyle = 'Direction' | 'Responsable' | 'Expert' | 'Agent' | 'Support';
export type TempsType = string;

/** Origine d'une fiche agent. Voir `sourceRef` pour la source précise. */
export type AgentSourceKind = 'import' | 'remote_csv' | 'manual';

export interface Agent {
    id: string;
    nom: string;
    prenom: string;
    fonction: string;
    titre: string;
    service: string;
    pole: string;
    rattachementId: string | null;
    gradeStyle: GradeStyle;
    typeTemps: TempsType;
    nbi?: string;
    avatarUrl?: string;
    email?: string;
    phone?: string;

    // ── Provenance ──────────────────────────────────────────────────────────
    // Le triplet (sourceKind, sourceRef, externalKey) identifie une fiche de
    // façon stable et CLOISONNÉE par source. Sans lui, les identifiants d'un
    // fichier A et d'un fichier B pouvaient entrer en collision : un agent
    // supprimé dans A disparaissait silencieusement de B.
    /** Clé métier stable (nom|prénom|fonction), indépendante de l'ordre des lignes. */
    /**
     * Jeton de version — `org_agents.updated_at` tel que chargé.
     *
     * Sert de garde optimiste à l'enregistrement : la mise à jour ne s'applique
     * que si la ligne n'a pas bougé depuis. Absent sur une fiche jamais
     * persistée (création, ou source CSV en mode local).
     */
    updatedAt?: string;
    externalKey?: string;
    sourceKind?: AgentSourceKind;
    /** Nom de fichier importé, URL CSV normalisée, ou '' en saisie manuelle. */
    sourceRef?: string;
}
