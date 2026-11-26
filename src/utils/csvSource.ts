export interface CsvSourceInfo {
    inputUrl: string;
    effectiveUrl: string;
    isRemote: boolean;
    label: string;
    helperText: string;
}

export const resolveCsvSource = (inputUrl?: string): CsvSourceInfo => {
    const normalizedInput = inputUrl?.trim() ?? '';

    if (!normalizedInput) {
        return {
            inputUrl: '',
            effectiveUrl: '/data.csv',
            isRemote: false,
            label: 'Jeu local embarqué',
            helperText: "Aucune URL distante configurée. L'application utilise le CSV local intégré.",
        };
    }

    return {
        inputUrl: normalizedInput,
        effectiveUrl: normalizedInput,
        isRemote: /^https?:\/\//i.test(normalizedInput),
        label: 'Source distante',
        helperText: "CSV distant configuré. La synchronisation utilise l'URL fournie.",
    };
};
