#!/usr/bin/env node
/**
 * Compare l'inventaire de schéma d'un projet Supabase à la référence du dépôt.
 *
 * Répond à la question de P2-16 : quels objets existent en base sans exister
 * dans le dépôt ? La dérive Git ↔ production ne se voit qu'au moment de monter
 * une préproduction ou de restaurer après incident — trop tard.
 *
 * Usage :
 *   1. exécuter la requête R6 de docs/security/verification-p0-2-supabase.md
 *      dans le SQL Editor, puis « Download CSV » ;
 *   2. node scripts/diff-schema.mjs <export.csv> [reference.csv]
 *
 * Référence par défaut : docs/security/inventaire-schema-reference.csv, relevé
 * sur une réplique locale du schéma versionné (baseline + migrations).
 *
 * Code de sortie : 0 si les deux inventaires coïncident, 1 sinon — utilisable
 * tel quel dans un contrôle automatisé.
 */

import { readFileSync, existsSync } from 'node:fs';

const REFERENCE_PAR_DEFAUT = 'docs/security/inventaire-schema-reference.csv';

const [, , cheminExport, cheminReference = REFERENCE_PAR_DEFAUT] = process.argv;

if (!cheminExport) {
    console.error(
        'usage : node scripts/diff-schema.mjs <export-prod.csv> [reference.csv]\n' +
            "\nL'export s'obtient avec la requête R6 de " +
            'docs/security/verification-p0-2-supabase.md (bouton « Download CSV »).',
    );
    process.exit(2);
}

for (const chemin of [cheminExport, cheminReference]) {
    if (!existsSync(chemin)) {
        console.error(`fichier introuvable : ${chemin}`);
        process.exit(2);
    }
}

/**
 * Analyse un CSV à deux colonnes `genre,objet`.
 *
 * Analyseur minimal mais pas naïf : le SQL Editor entoure de guillemets toute
 * valeur contenant une virgule — les policies en contiennent (`table :: nom`),
 * et un `split(',')` direct les couperait en deux.
 */
function lireInventaire(chemin) {
    const lignes = readFileSync(chemin, 'utf8').split(/\r?\n/).filter((l) => l.trim());
    const entrees = new Set();

    for (const [index, ligne] of lignes.entries()) {
        const champs = decouper(ligne);
        if (champs.length < 2) continue;
        const [genre, objet] = champs;
        // Ignore un éventuel en-tête, quel que soit son libellé exact.
        if (index === 0 && /genre/i.test(genre) && /objet|name/i.test(objet)) continue;
        entrees.add(`${genre.trim()}\t${objet.trim()}`);
    }
    return entrees;
}

function decouper(ligne) {
    const champs = [];
    let courant = '';
    let entreGuillemets = false;

    for (let i = 0; i < ligne.length; i++) {
        const c = ligne[i];
        if (c === '"') {
            // `""` à l'intérieur d'un champ cité = un guillemet littéral.
            if (entreGuillemets && ligne[i + 1] === '"') {
                courant += '"';
                i++;
            } else {
                entreGuillemets = !entreGuillemets;
            }
        } else if (c === ',' && !entreGuillemets) {
            champs.push(courant);
            courant = '';
        } else {
            courant += c;
        }
    }
    champs.push(courant);
    return champs;
}

const production = lireInventaire(cheminExport);
const reference = lireInventaire(cheminReference);

const enTropEnProd = [...production].filter((e) => !reference.has(e)).sort();
const absentsDeProd = [...reference].filter((e) => !production.has(e)).sort();

const formater = (entrees) =>
    entrees.map((e) => {
        const [genre, objet] = e.split('\t');
        return `    ${genre.padEnd(9)} ${objet}`;
    });

console.log(`référence  : ${cheminReference} (${reference.size} objets)`);
console.log(`production : ${cheminExport} (${production.size} objets)\n`);

if (enTropEnProd.length) {
    console.log(`🚨 ${enTropEnProd.length} objet(s) EN BASE, ABSENT(S) DU DÉPÔT`);
    console.log('   La dérive à rapatrier : ces objets ont été créés hors migration.');
    console.log(formater(enTropEnProd).join('\n'), '\n');
}

if (absentsDeProd.length) {
    console.log(`⬜ ${absentsDeProd.length} objet(s) DANS LE DÉPÔT, ABSENT(S) DE LA BASE`);
    console.log('   Soit du code mort, soit une migration jamais appliquée.');
    console.log(formater(absentsDeProd).join('\n'), '\n');
}

if (!enTropEnProd.length && !absentsDeProd.length) {
    console.log('✓ Les deux inventaires coïncident — aucune dérive.');
    process.exit(0);
}

console.log(
    'Rappel : ne pas rejouer une migration destructive pour réparer\n' +
        "l'historique. Écrire une migration de réconciliation, et reporter le\n" +
        'changement dans supabase/schema/baseline_*.sql (cf. supabase/migrations/README.md).',
);
process.exit(1);
