# Durcissement applicatif et intégration des corrections — Conception

## Objectif

Porter dans `master` les corrections déjà développées dans `codex/production-readiness`, puis fermer les défauts corrigeables localement : écrasements concurrents silencieux, validation UUID insuffisante, champ WhatsApp dormant et pollution du lint par les artefacts Supabase locaux.

## Décisions

- Les corrections de la branche auditée seront intégrées par sélection contrôlée des commits/fichiers, sans écraser les fichiers locaux non suivis.
- Les écritures de nœuds utiliseront un verrou optimiste fondé sur `updated_at`. Un conflit retournera une erreur explicite et préservera la saisie côté interface autant que possible.
- `whatsappId` sera supprimé des types, DTO et routage de notification, car aucune implémentation WhatsApp n’est disponible.
- Les identifiants de nœuds reçus par l’API seront validés comme UUID avant accès PostgreSQL.
- Les répertoires générés `supabase/.temp` et `supabase/.branches` seront ignorés par Git/ESLint ; aucun fichier local ne sera supprimé.
- La version SheetJS corrigée déjà présente dans la branche auditée sera intégrée avec ses tests et son verrouillage de dépendance.

## Flux et erreurs

Les tests de régression seront écrits avant chaque modification. Une mise à jour concurrente sans correspondance `id + updated_at` sera traitée comme un conflit de version, sans succès HTTP trompeur. Les erreurs de format UUID seront des erreurs de validation 400. Les canaux de notification non implémentés ne seront plus annoncés comme disponibles.

## Vérification

À la fin : lint sans artefacts Supabase, typecheck frontend et orchestrateur, suites unitaires, tests PostgreSQL disponibles, build frontend et build orchestrateur. Les validations nécessitant Supabase/Vercel/Resend resteront documentées comme externes.
