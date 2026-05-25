import { useRef, useState } from 'react';

/**
 * Hook partagé pour l'import de fichier via `<input type="file">`.
 *
 * Centralise le pattern commun entre `Topbar` et `SettingsView` :
 * - ref sur l'input caché
 * - état `isImporting` et `importError`
 * - `triggerPick()` : ouvre le sélecteur natif
 * - `onFileChange` : handler `onChange` à brancher sur l'input
 *
 * @param onImport - callback async appelé avec le `File` sélectionné
 * @param onSuccess - callback optionnel après succès (ex. filament state)
 */
export function useFileImport(
    onImport: (file: File) => Promise<void>,
    onSuccess?: () => void,
) {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isImporting, setIsImporting] = useState(false);
    const [importError, setImportError] = useState<string | null>(null);

    const triggerPick = () => {
        setImportError(null);
        fileInputRef.current?.click();
    };

    const onFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        setIsImporting(true);
        setImportError(null);

        try {
            await onImport(file);
            onSuccess?.();
        } catch (err) {
            setImportError(err instanceof Error ? err.message : "Erreur lors de l'import.");
        } finally {
            setIsImporting(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    return { fileInputRef, isImporting, importError, triggerPick, onFileChange };
}
