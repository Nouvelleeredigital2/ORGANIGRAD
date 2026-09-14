# Réconciliation du correctif portraits déjà appliqué

La migration distante `20260912152335`, nommée `bot_portraits_correctif_conforme_depot`, est maintenant conservée dans `supabase/migrations/20260912152335_bot_portraits_correctif_conforme_depot.sql`.

Elle provient de l'export local exact `output/EXPORT-SQL-bot_portraits_correctif_conforme_depot.sql` remis avec les éléments du rapport Claude du 12 septembre. L'export et le fichier copié ont la même empreinte SHA256 : `2de94f56cb748bfbe30eebb2503b549e139e989921651df20bb6330d41b71c80`.

Aucune réécriture SQL et aucune réapplication distante. Le test PGlite de `botStoreSql.test.ts` exécute le correctif après le schéma initial et vérifie que le stockage accepte un portrait HTTPS et refuse HTTP. Le commentaire « table vide » décrit l'état au moment de l'application historique, pas une précondition actuelle à reproduire.
