import { describe, it, expect } from 'vitest';
import {
    neutralizeCsvValue,
    sanitizeRowsForCsv,
    assertFileSize,
    assertDimensions,
    assertCellLengths,
    assertSheetCount,
    ImportLimitError,
    IMPORT_LIMITS,
} from './sheetSecurity';

describe('neutralizeCsvValue (anti-injection de formules)', () => {
    it('préfixe les cellules commençant par un déclencheur de formule', () => {
        expect(neutralizeCsvValue('=SUM(A1)')).toBe("'=SUM(A1)");
        expect(neutralizeCsvValue('+1+1')).toBe("'+1+1");
        expect(neutralizeCsvValue('-2+3')).toBe("'-2+3");
        expect(neutralizeCsvValue('@cmd')).toBe("'@cmd");
        expect(neutralizeCsvValue('\tTAB')).toBe("'\tTAB");
        expect(neutralizeCsvValue('\rCR')).toBe("'\rCR");
    });

    it('laisse passer le texte normal, les nombres et le vide', () => {
        expect(neutralizeCsvValue('DECROUY')).toBe('DECROUY');
        expect(neutralizeCsvValue(42)).toBe(42);
        expect(neutralizeCsvValue(-5)).toBe(-5); // un NOMBRE négatif n'est pas préfixé
        expect(neutralizeCsvValue('')).toBe('');
        expect(neutralizeCsvValue(null)).toBe(null);
    });

    it('sanitizeRowsForCsv neutralise toutes les cellules', () => {
        const rows = [{ nom: '=HYPERLINK("http://evil")', pole: 'RH' }];
        expect(sanitizeRowsForCsv(rows)).toEqual([{ nom: '\'=HYPERLINK("http://evil")', pole: 'RH' }]);
    });
});

describe('limites d\'import', () => {
    it('rejette un fichier trop volumineux', () => {
        expect(() => assertFileSize({ size: IMPORT_LIMITS.maxFileBytes + 1 })).toThrow(ImportLimitError);
        expect(() => assertFileSize({ size: 1000 })).not.toThrow();
    });

    it('rejette trop de feuilles', () => {
        expect(() => assertSheetCount(IMPORT_LIMITS.maxSheets + 1)).toThrow(ImportLimitError);
        expect(() => assertSheetCount(1)).not.toThrow();
    });

    it('rejette trop de lignes/colonnes', () => {
        expect(() => assertDimensions(IMPORT_LIMITS.maxRows + 1, 5)).toThrow(/lignes/);
        expect(() => assertDimensions(10, IMPORT_LIMITS.maxColumns + 1)).toThrow(/colonnes/);
        expect(() => assertDimensions(10, 10)).not.toThrow();
    });

    it('rejette une cellule trop longue', () => {
        const long = 'x'.repeat(IMPORT_LIMITS.maxCellLength + 1);
        expect(() => assertCellLengths([{ a: long }])).toThrow(ImportLimitError);
        expect(() => assertCellLengths([{ a: 'court' }])).not.toThrow();
    });
});
