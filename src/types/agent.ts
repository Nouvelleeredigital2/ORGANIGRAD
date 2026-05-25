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
}
