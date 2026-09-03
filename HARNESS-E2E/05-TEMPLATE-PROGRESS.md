# 05 — TEMPLATE — FICHIER D'ÉTAT

Fichier cible : `_e2e/PROGRESS-{APP}.md`
C'est la **source de vérité de l'avancement**. Il est mis à jour après chaque élément testé, jamais en lot. Il survit à la mort de la session ; le plan interne de l'agent, non.

---

```markdown
# E2E {APP} — campagne du {AAAA-MM-JJ}

Mode        : CORRECTION | CONSTAT
Branche     : {branche}
URL         : {url de 01-CONFIG}
Progression : 0/{N}
Dernière MAJ: {horodatage}

---

## P1 — Entrée publique ({route})
- [ ] Élément — description courte
- [ ] Élément

## P2 — Session authentifiée ({route})
- [ ] Élément

## P3 — Création de {entité principale} ({route})
- [ ] Champ « {nom} » — saisie et validation
- [ ] Bouton « Enregistrer »

## P4 — Consultation, recherche, filtres ({route})
- [ ] Élément

## P5 — Modification de la donnée de test ({route})
- [ ] Élément

## P6 — Générations ({route})
- [ ] Bouton « {génération} » — vérifier le fichier produit

## P7 — Suppression de la donnée de test ({route})
- [ ] Élément

## P8 — Écrans périphériques
- [ ] Élément

## P9 — Espace admin ({route})
- [ ] Élément

---

## À NETTOYER
Objets créés pendant la campagne, à supprimer manuellement par Laurent.
| Objet | Emplacement | Créé le |
|---|---|---|

## DÉCISIONS
Choix pris en autonomie face à une ambiguïté.
- DÉCISION : {choix} — {raison} — {route}

## BLOCAGES
Éléments non traitables, avec le motif.
- BLOQUÉ : {élément} — {motif} — {route}

## PAUSES D'AUTHENTIFICATION
- {horodatage} — pause demandée — reprise sur GO à {horodatage}
```

---

## FORMAT D'UNE LIGNE TRAITÉE

```
- [x] {élément} — {VERDICT} {sévérité} — {constat} — cause : {fichier:ligne} — {suite donnée}
```

Exemples :

```
- [x] Bouton « Enregistrer » — OK
- [x] Bouton « Générer le PDF » — CASSÉ P1 — 500 sur POST /api/pdf — cause : app/api/pdf/route.ts:42, `userId` non transmis — CORRIGÉ
- [x] Filtre « Statut » — DÉGRADÉ P2 — la sélection est perdue au rechargement — components/StatusFilter.tsx:31 — correctif proposé, non appliqué
- [x] Lien « Aide » — NON CÂBLÉ P2 — href="#" — components/Footer.tsx:14 — CORRIGÉ
- [x] Bouton « Supprimer le compte » — NON TESTÉ — ACTION INTERDITE
- [x] Export CSV — BLOQUÉ — chargement infini au-delà de 60 s — cause non identifiée — [À CONFIRMER]
```

**Verdicts**

| Verdict | Signification |
|---|---|
| `OK` | Fonctionne et produit le résultat attendu, vérifié à l'écran |
| `CASSÉ` | Erreur, absence de résultat, ou résultat faux |
| `DÉGRADÉ` | Fonctionne, mais mal : validation absente, retour visuel manquant, état non persisté |
| `NON CÂBLÉ` | Élément présent à l'écran, sans action réelle derrière |
| `BLOQUÉ` | N'a pas pu être testé pour une raison technique |
| `NON TESTÉ` | Écarté volontairement — action interdite ou hors périmètre |

**Sévérités**

| Niveau | Définition |
|---|---|
| `P0` | Application inutilisable, ou donnée exposée / perdue |
| `P1` | Fonction principale cassée, sans contournement |
| `P2` | Dégrade l'usage sans l'empêcher |
| `P3` | Cosmétique ou confort |
