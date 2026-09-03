# 04 — PROMPT DOCUMENTATION — BASE DE CONNAISSANCE APPLICATION-2026

> Trois phases. **A et B avant la campagne E2E** (elles produisent le contexte dont le test a besoin), **C après** (elle documente l'existant réel).
> Racine de la base : `C:\Users\5070 Ti\Downloads\---APPLICATION-2026---` — chemin à guillemeter systématiquement (espaces + tirets).
> **Lecture seule absolue.** Aucun fichier de cette racine n'est modifié, déplacé, renommé ou supprimé. Toute production va dans `_e2e/` du dépôt de l'application.

---

## ÉTIQUETAGE OBLIGATOIRE

| Étiquette | Signification |
|---|---|
| `[KB]` | Base de connaissance, avec nom de fichier source |
| `[CODE]` | Code source, avec `fichier:ligne` |
| `[E2E]` | Constaté à l'écran pendant la campagne, avec capture |
| `[À CONFIRMER]` | Hypothèse ou déduction non vérifiée |

Aucune affirmation sans étiquette. Aucune invention : un document que tu n'as pas ouvert n'existe pas, une fonctionnalité que tu n'as pas lue n'est pas documentée.

---

# PHASE A — INVENTAIRE DE LA BASE DE CONNAISSANCE

Objectif : savoir ce qu'il y a dans la racine avant d'en tirer quoi que ce soit.

1. Parcours récursif de la racine, **borné**. Pour chaque document exploitable : chemin, titre, date de dernière modification, taille, format.

   **Le balayage sans borne ne termine pas.** La racine porte 119 entrées de premier niveau et plus de 1 300 fichiers `.md` sur les trois premiers niveaux ; `_BACKUP_GIT_home-profile-2026-08-04/` pèse à lui seul 13 Go. Un `find` complet dépasse les deux minutes sans aboutir et sature la fenêtre de contexte avant d'avoir produit la moindre ligne d'inventaire.

   Exclusions obligatoires, jamais négociables :

   ```
   node_modules  .git  dist  build  .next  out  venv  .venv  __pycache__  coverage
   _BACKUP_GIT_*        archives git en lecture seule, rien d'unique n'y subsiste
   *-backups            copies datées, pas la source de vérité
   .worktrees  .claude/worktrees   copies périmées : l'audit du 24/06 s'y est déjà trompé
   ```

   Profondeur : **3 niveaux** pour le balayage initial. Tu ne descends plus bas que dans le dossier de l'application testée et dans le dossier de vue d'ensemble désignés par `01-CONFIG.md §2`.

   Un document trouvé dans un chemin exclu **n'entre pas** dans l'inventaire, même s'il paraît pertinent. S'il te semble indispensable, tu l'inscris dans « Documents obsolètes » avec la mention `[À CONFIRMER] — hors périmètre de balayage`.

2. Classement en deux ensembles :
   - **Vue d'ensemble** — ce qui concerne l'écosystème APPLICATION-2026 dans son entier : architecture globale, conventions transverses, socle technique partagé, décisions structurantes, nomenclature, relations entre applications.
   - **Spécifique application** — ce qui ne concerne qu'une application donnée. Une entrée par application détectée.
3. Signale explicitement :
   - les documents **contradictoires** entre eux (deux versions divergentes d'une même spécification) ;
   - les documents **manifestement obsolètes** (date ancienne, mention d'une techno abandonnée) ;
   - les applications présentes dans le dépôt mais **absentes** de la base, et l'inverse.

**Livrable A** — `_e2e/KB-INVENTAIRE.md` :

```markdown
# Inventaire — APPLICATION-2026
Racine : C:\Users\5070 Ti\Downloads\---APPLICATION-2026---
Parcourue le : {date} · {n} documents retenus · {n} écartés

## Vue d'ensemble
| Document | Portée | Dernière modif | Fiabilité |

## Par application
### {APP}
| Document | Portée | Dernière modif | Fiabilité |

## Contradictions relevées
## Documents obsolètes
## Manques : applications sans documentation
```

Fiabilité : `RÉFÉRENCE` (fait foi) · `SECONDAIRE` (utile, non structurant) · `DOUTEUX` (obsolète ou contredit).

---

# PHASE B — FICHE DE CONTEXTE DE L'APPLICATION TESTÉE

Objectif : donner au testeur E2E ce qu'il doit **s'attendre** à trouver, avant qu'il ouvre le navigateur.

Sources, dans cet ordre de priorité : documents `RÉFÉRENCE` spécifiques à l'application, puis vue d'ensemble pour tout ce qui est transverse, puis le code pour ce que la base ne dit pas.

**Livrable B** — `_e2e/CONTEXTE-{APP}.md` :

```markdown
# Contexte — {APP}

## 1. Raison d'être
Ce que l'application est censée permettre, et pour qui.  [KB]

## 2. Rattachement à l'écosystème
Position dans APPLICATION-2026, dépendances vers d'autres applications,
socle partagé, conventions transverses applicables.  [KB]

## 3. Rôles et droits attendus
| Rôle | Accès attendu | Source |

## 4. Entités métier
| Entité | Champs structurants | Cycle de vie attendu | Source |

## 5. Parcours utilisateurs attendus
Un bloc par parcours, en étapes numérotées, du point d'entrée au résultat.
C'est ce bloc qui alimente directement le plan de test.  [KB]

## 6. Générations attendues
Images, documents, exports, appels IA : ce qui doit être produit, dans quel format,
avec quelle contrainte de délai.  [KB]

## 7. Espace admin attendu
Périmètre annoncé par la documentation.  [KB]

## 8. Écarts KB ↔ code, relevés dès maintenant
| Point | Ce que dit la base | Ce que dit le code | Sévérité |

## 9. Zones d'ombre
Ce que la documentation ne couvre pas et qu'il faudra caractériser en testant.
Section obligatoire, jamais vide.
```

Règle de discipline : quand la base est muette sur un point, tu écris qu'elle est muette. Tu ne combles pas avec ce qui te semble plausible.

---

# PHASE C — DOCUMENTATION DE L'EXISTANT RÉEL

À exécuter **après** la campagne E2E, en croisant `CONTEXTE-{APP}.md`, `PROGRESS-{APP}.md` et `RAPPORT-{APP}-{date}.md`.

Objectif : produire la documentation de ce que l'application **fait réellement**, et mesurer l'écart avec ce que la base de connaissance prétend.

**Livrable C1** — `_e2e/DOC-{APP}.md` :

```markdown
# {APP} — documentation de l'existant
État constaté le {date}, par parcours navigateur sur {n} éléments.

## 1. Ce que l'application fait réellement
Par parcours : ce qui fonctionne de bout en bout, ce qui casse, ce qui est absent.  [E2E]

## 2. Cartographie des écrans
| Route | Rôle requis | Éléments interactifs | Fonctionnels | Sources |

## 3. Entités et cycle de vie observés
Ce qui est réellement créable, modifiable, supprimable — et par qui.  [E2E] [CODE]

## 4. Générations : comportement réel
Format produit, délai constaté, taux d'échec observé.  [E2E]

## 5. Espace admin : état réel
Verdict PRÊT / PRÊT AVEC RÉSERVES / NON PRÊT, et la liste des blocages.  [E2E]

## 6. Limites de cette documentation
Ce qui n'a pas pu être testé et pourquoi. Obligatoire, jamais vide.
```

**Livrable C2** — `_e2e/ECARTS-KB-{APP}.md` :

```markdown
# Écarts base de connaissance ↔ réalité — {APP}

## Documenté mais inexistant
| Élément | Source KB | Constat E2E | Action : corriger le code / corriger la doc |

## Existant mais non documenté
| Élément | Constat E2E | Où l'ajouter dans la base |

## Documenté différemment de la réalité
| Élément | Version KB | Version réelle | Laquelle fait foi ? |

## Recommandations de mise à jour de la base
Liste ordonnée des documents de la racine à mettre à jour, avec ce qu'il faut y changer.
Tu proposes ; tu ne modifies rien dans la racine.
```

---

## SI LA PHASE C RÉVÈLE UN ÉCART MASSIF

Ne réécris pas la base de connaissance de ta propre initiative. Produis les écarts, classe-les par sévérité, et arrête-toi là. La décision « c'est le code qui a tort » ou « c'est la doc qui a tort » m'appartient.
