#!/usr/bin/env node
/**
 * Porte `npm audit` — remplace `npm audit --audit-level=high || true`.
 *
 * Le `|| true` rendait l'étape décorative : elle affichait les vulnérabilités
 * et passait quoi qu'il arrive, indéfiniment. À l'inverse, un `npm audit`
 * bloquant sur une vulnérabilité SANS correctif publié (cas de `xlsx`) rendrait
 * la CI rouge en permanence, donc ignorée — le même résultat, en plus bruyant.
 *
 * Cette porte tranche : chaque vulnérabilité `high`/`critical` doit être soit
 * corrigée, soit ACCEPTÉE EXPLICITEMENT ci-dessous, avec une raison et une DATE
 * DE REVUE. Une acceptation périmée fait échouer la CI : le risque est reporté,
 * jamais oublié. Une acceptation devenue inutile la fait échouer aussi, pour que
 * le registre ne se remplisse pas de lignes mortes.
 *
 * Le détail humain est dans docs/security/dependances.md.
 *
 * Usage : node scripts/audit-gate.mjs [chemin-du-paquet ...]   (défaut : . et orchestrator)
 */

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

/** Seuils traités comme bloquants. */
const BLOQUANTS = new Set(['high', 'critical']);

/**
 * Risques acceptés, par nom de paquet.
 *
 * `revoir` : date (AAAA-MM-JJ) au-delà de laquelle la CI échoue tant que
 * l'entrée n'est pas réexaminée — soit corrigée, soit re-datée en connaissance
 * de cause.
 *
 * `paquet` : à quel paquet du dépôt l'acceptation se rapporte. La détection
 * d'entrée obsolète ne s'applique qu'aux paquets réellement audités par
 * l'invocation en cours — sinon auditer l'orchestrateur seul signalerait à tort
 * l'acceptation d'une dépendance du frontend.
 */
const ACCEPTES = {
    xlsx: {
        paquet: '.',
        avis: ['GHSA-4r6h-8v6p-xvw6', 'GHSA-5pgg-2g8v-p4x9'],
        raison:
            "Prototype pollution (<0.19.3) et ReDoS (<0.20.2). Les versions corrigées " +
            "ne sont PAS publiées sur npm — la dernière y est 0.18.5 ; SheetJS ne " +
            "distribue plus que via son propre CDN. Aucun `npm audit fix` ne peut " +
            "résoudre cette entrée. Atténuations en place : import dynamique (chunk " +
            "hors bundle initial, chargé au seul import XLSX), lecture défensive " +
            "(cellFormula/cellHTML/bookVBA désactivés, sheetRows borné) et bornes " +
            "taille/feuilles/lignes/colonnes/cellules côté sheetSecurity.ts.",
        revoir: '2026-11-14',
    },
};

const paquets = process.argv.slice(2);
const cibles = paquets.length ? paquets : ['.', 'orchestrator'];
/** Normalise `./x`, `x/` → `x` pour comparer aux `paquet` du registre. */
const normaliser = (p) => p.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/$/, '') || '.';
const ciblesNormalisees = new Set(cibles.map(normaliser));

/** `npm audit` sort en code ≠ 0 dès qu'il trouve quelque chose : on lit stdout quand même. */
function auditer(cwd) {
    try {
        return JSON.parse(execFileSync('npm', ['audit', '--json'], {
            cwd, encoding: 'utf8', shell: process.platform === 'win32',
        }));
    } catch (err) {
        if (err.stdout) return JSON.parse(err.stdout);
        throw err;
    }
}

const aujourdhui = new Date().toISOString().slice(0, 10);
const echecs = [];
const utilisees = new Set();

for (const cible of cibles) {
    if (!existsSync(join(cible, 'package.json'))) {
        echecs.push(`${cible} : package.json introuvable`);
        continue;
    }
    const rapport = auditer(cible);
    const vulns = Object.entries(rapport.vulnerabilities ?? {})
        .filter(([, v]) => BLOQUANTS.has(v.severity));
    const echecsAvant = echecs.length;

    for (const [nom, v] of vulns) {
        const accepte = ACCEPTES[nom];
        if (!accepte) {
            const correctif = v.fixAvailable ? 'CORRECTIF DISPONIBLE' : 'pas de correctif publié';
            echecs.push(
                `${cible} : ${nom} (${v.severity}) non traité — ${correctif}.\n` +
                `      Corriger (npm audit fix), ou ajouter une acceptation datée ` +
                `dans scripts/audit-gate.mjs + docs/security/dependances.md.`,
            );
            continue;
        }
        utilisees.add(nom);
        if (accepte.revoir < aujourdhui) {
            echecs.push(
                `${cible} : acceptation de ${nom} PÉRIMÉE (à revoir le ${accepte.revoir}).\n` +
                `      Réexaminer le risque, puis corriger ou re-dater explicitement.`,
            );
        } else {
            console.log(`~ ${cible} : ${nom} (${v.severity}) — risque accepté jusqu'au ${accepte.revoir}`);
        }
    }
    if (echecs.length === echecsAvant) {
        console.log(`✓ ${cible} : ${vulns.length} vulnérabilité(s) high/critical, toutes traitées ou acceptées`);
    }
}

// Une acceptation qui ne correspond plus à rien doit disparaître du registre,
// sinon elle couvrira un jour une vulnérabilité qu'on n'a jamais examinée.
for (const [nom, accepte] of Object.entries(ACCEPTES)) {
    if (!ciblesNormalisees.has(normaliser(accepte.paquet ?? '.'))) continue;
    if (!utilisees.has(nom)) {
        echecs.push(
            `acceptation obsolète : ${nom} n'apparaît plus dans npm audit.\n` +
            `      Retirer l'entrée de scripts/audit-gate.mjs et de docs/security/dependances.md.`,
        );
    }
}

if (echecs.length) {
    console.error('\n✗ Porte npm audit — échec :\n');
    for (const e of echecs) console.error(`  - ${e}`);
    process.exit(1);
}
console.log('\n✓ Porte npm audit franchie.');
