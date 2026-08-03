/**
 * Préférences locales de l'application.
 *
 * Ne contient plus que l'URL de la source CSV. Les surcharges et suppressions
 * d'agents vivaient ici sous des clés GLOBALES, non qualifiées par workspace ni
 * par source : une suppression enregistrée sur un fichier s'appliquait à un
 * autre dès que les identifiants se recoupaient, faisant disparaître un agent
 * en silence. Elles sont remplacées par `agentRepo` / `agentStore`, cloisonnés
 * par workspace et par source.
 */

const STORAGE_KEYS = {
    CSV_URL: 'orgchart_csv_url',
    // Clés héritées, purgées au chargement (voir ci-dessous).
    LEGACY_DELETED_IDS: 'orgchart_deleted_ids',
    LEGACY_AGENT_OVERRIDES: 'orgchart_agent_overrides',
    LEGACY_DARK_MODE: 'orgchart_dark_mode',
};

// Nettoyage one-shot des clés héritées. Elles ne sont PAS reprises : leurs
// identifiants dépendaient de la position des lignes dans le fichier, donc rien
// ne permet de savoir à quel agent — ni à quelle source — ils se rapportaient.
// Les rejouer à l'aveugle rejouerait précisément le défaut qu'on supprime.
try {
    localStorage.removeItem(STORAGE_KEYS.LEGACY_DARK_MODE);
    localStorage.removeItem(STORAGE_KEYS.LEGACY_DELETED_IDS);
    localStorage.removeItem(STORAGE_KEYS.LEGACY_AGENT_OVERRIDES);
} catch {
    /* SSR / sandbox : ignore */
}

export const storageService = {
    getCsvUrl: (): string => {
        return localStorage.getItem(STORAGE_KEYS.CSV_URL) || '';
    },
    setCsvUrl: (url: string): void => {
        localStorage.setItem(STORAGE_KEYS.CSV_URL, url);
    },

    clearAll: (): void => {
        Object.values(STORAGE_KEYS).forEach((key) => localStorage.removeItem(key));
    },
};
