/**
 * Formatage d'un horodatage en français relatif, et qualification de sa
 * fraîcheur.
 *
 * La fraîcheur n'est pas cosmétique. Une présence relevée par un import manuel
 * n'est vraie qu'à l'instant du relevé : afficher « en ligne » en vert sur une
 * observation vieille de trois jours, c'est présenter un cache comme l'état
 * courant — la faute que `ListResult.stale` évite déjà côté repository.
 */

const MINUTE = 60_000;
const HEURE = 60 * MINUTE;
const JOUR = 24 * HEURE;
const SEMAINE = 7 * JOUR;

/** Au-delà, une observation ponctuelle ne doit plus être présentée comme courante. */
export const SEUIL_FRAICHEUR_MS = HEURE;

/**
 * « il y a 5 min », « il y a 3 h », « il y a 2 j »… Renvoie `null` si la date
 * est inexploitable — l'appelant doit alors n'afficher aucune date plutôt
 * qu'un « Invalid Date ».
 */
export function formatRelatif(iso: string | undefined, maintenant: number = Date.now()): string | null {
    if (!iso) return null;
    const t = Date.parse(iso);
    if (Number.isNaN(t)) return null;

    const delta = maintenant - t;

    // Une date future (horloges désynchronisées) n'est pas « il y a » : on la
    // ramène à l'instant présent plutôt que d'afficher « il y a -3 min ».
    if (delta < MINUTE) return "à l'instant";
    if (delta < HEURE) return `il y a ${Math.floor(delta / MINUTE)} min`;
    if (delta < JOUR) return `il y a ${Math.floor(delta / HEURE)} h`;
    if (delta < SEMAINE) return `il y a ${Math.floor(delta / JOUR)} j`;

    const semaines = Math.floor(delta / SEMAINE);
    if (semaines < 5) return `il y a ${semaines} sem`;

    return new Date(t).toLocaleDateString('fr-FR', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
    });
}

/**
 * `true` si l'observation est assez récente pour être présentée comme l'état
 * courant. Une date absente ou illisible n'est JAMAIS fraîche.
 */
export function estFrais(
    iso: string | undefined,
    maintenant: number = Date.now(),
    seuilMs: number = SEUIL_FRAICHEUR_MS,
): boolean {
    if (!iso) return false;
    const t = Date.parse(iso);
    if (Number.isNaN(t)) return false;
    return maintenant - t < seuilMs;
}
