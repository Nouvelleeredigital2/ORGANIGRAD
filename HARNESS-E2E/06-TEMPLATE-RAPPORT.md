# 06 — TEMPLATE — RAPPORT DE CAMPAGNE

Fichier cible : `_e2e/RAPPORT-{APP}-{AAAA-MM-JJ}.md`
Produit **uniquement** quand la progression atteint N/N.

---

```markdown
# Rapport E2E — {APP} — {AAAA-MM-JJ}

## 1. Verdict
Cinq lignes maximum. Un utilisateur lambda peut-il aller du début à la fin
du parcours principal, oui ou non, et où ça casse.
Pas de nuance décorative : si c'est cassé, l'écrire.

## 2. Chiffres
| Indicateur | Valeur |
|---|---|
| Éléments planifiés | |
| Éléments testés | |
| OK | |
| CASSÉ | |
| DÉGRADÉ | |
| NON CÂBLÉ | |
| BLOQUÉ | |
| NON TESTÉ (action interdite) | |
| Corrections appliquées | |
| Corrections échouées / abandonnées | |
| Pauses d'authentification | |

Répartition par sévérité : P0 · P1 · P2 · P3

## 3. P0 et P1 restants
| # | Élément | Route | Constat | Cause (fichier:ligne) | Correctif proposé |

## 4. Ruptures de parcours
Les points précis où un utilisateur lambda se serait arrêté sans savoir quoi faire :
message d'erreur absent, écran vide sans explication, bouton sans retour,
étape suivante introuvable. C'est la partie la plus utile du rapport.

## 5. Générations
| Génération | Déclencheur | Résultat obtenu | Délai constaté | Verdict |

## 6. Espace admin
Verdict : PRÊT | PRÊT AVEC RÉSERVES | NON PRÊT
Liste exacte des blocages, sans arrondi.

## 7. Écarts avec la base de connaissance
Renvoi vers `_e2e/ECARTS-KB-{APP}.md` s'il existe ; sinon, les écarts
majeurs relevés en cours de campagne.

## 8. Corrections appliquées
| Fichier:ligne | Anomalie | Correctif | Retesté à l'écran | Commit |

Toute ligne dont la colonne « Retesté à l'écran » n'est pas OUI
est une correction non validée, et doit être présentée comme telle.

## 9. À nettoyer
Données de test créées pendant la campagne, à supprimer manuellement.
| Objet | Emplacement | Créé le |

## 10. Ce qui n'a pas été testé, et pourquoi
Section obligatoire, jamais vide. Distinguer :
- écarté volontairement (action interdite, hors périmètre)
- non atteint (session interrompue, dépendance indisponible)
- non testable en l'état, avec ce qu'il faudrait pour le rendre testable

## 11. Suite recommandée
Trois actions maximum, ordonnées. Pas de liste de souhaits.
```

---

## RÈGLES DE RÉDACTION

- Aucune affirmation sans étiquette `[KB]` `[CODE]` `[E2E]` `[À CONFIRMER]`.
- Aucun constat sans référence : capture pour un constat d'écran, `fichier:ligne` pour un constat de code.
- « Devrait fonctionner » n'est pas un verdict. Soit c'est retesté à l'écran, soit c'est `[À CONFIRMER]`.
- Un rapport qui ne contient aucun problème est suspect : vérifier alors la couverture réelle avant de conclure.
