/**
 * Verrou optimiste — détection des écritures concurrentes.
 *
 * Politique retenue le 2026-08-22 (option 2 de
 * `docs/architecture/concurrence-ecritures.md`).
 *
 * Auparavant, deux personnes modifiant la même fiche s'écrasaient l'une
 * l'autre : la seconde écriture réécrivait toutes les colonnes, **sans erreur,
 * sans trace, et sans que l'auteur de la première l'apprenne jamais**.
 *
 * Le principe : la mise à jour ne s'applique que si la ligne n'a pas bougé
 * depuis son chargement. Le jeton de version est `updated_at`, déjà maintenu par
 * un trigger sur `org_agents` et `hybrid_nodes` — d'où l'absence de migration.
 * Zéro ligne affectée ⇒ quelqu'un est passé avant ⇒ on refuse au lieu d'écraser.
 *
 * Ce que cela fait : supprimer la perte SILENCIEUSE.
 * Ce que cela ne fait pas : fusionner. L'utilisateur doit recharger et
 * réappliquer sa modification — d'où l'importance de ne pas vider son
 * formulaire (les appelants conservent la saisie).
 */

export const MESSAGE_CONFLIT =
    'Cette fiche a été modifiée par quelqu’un d’autre pendant ton édition. ' +
    'Recharge pour voir la version à jour, puis réapplique ta modification — ' +
    'ta saisie est conservée.';

export class ConflitDeVersionError extends Error {
    /** Identifiant de l'enregistrement concerné, pour cibler un rechargement. */
    readonly recordId: string;

    constructor(recordId: string) {
        super(MESSAGE_CONFLIT);
        this.name = 'ConflitDeVersionError';
        this.recordId = recordId;
    }
}

export function estConflitDeVersion(err: unknown): err is ConflitDeVersionError {
    return err instanceof ConflitDeVersionError;
}
