# Relais des bots — plan d'implémentation

Objectif : reprendre le module Bots, convertir les 14 fiches historiques et
préparer la synchronisation sûre vers le lecteur existant.

Décisions de Laurent du 11 septembre : conversion automatique relue bot par bot ;
Organigrad propriétaire des personas, LINK conserve les validations. Le relais
demande une installation sans redémarrage automatique. Architecture et choix
validés dans le relais et les réponses utilisateur ; exécution dans ce worktree.

1. Rejouer typecheck et Vitest des deux paquets, puis corriger les défauts réels
   d'autorisation/concurrence/compilation de la revue avec tests régressifs.
2. Ajouter scripts/bots/convert_profiles.py et ses tests : extraction explicite
   des huit sections, conservation des limites et sources, exclusion des exemples,
   arrêt sur section inconnue ou manquante. Produire 14 JSON et un inventaire de
   provenance. Relire les champs ; ne pas déclarer l'import effectué.
3. Ajouter scripts/bots/sync_profiles.py et ses tests : contrôler bundle, SHA,
   identités autorisées et loader ; normaliser les lignes # sans perdre le texte ;
   plan avant écriture, sauvegarde privée, dérive bloquée, transaction avec rollback,
   aucun signal/restart ni état de conversation modifié.
4. Qualifier l'API de production et Supabase avant migration/import. Référence
   documentaire et configuration effective : xucmfdggetwxmpquqjvj. Le connecteur
   get_project_url refuse actuellement les droits et le connecteur transversal
   ne dispose pas du PAT concerné : pas de migration distante tant que ce contrôle
   obligatoire n'aboutit pas. Ne pas utiliser une autre base comme substitut.
5. Exécuter tests locaux et compiler les 14 fiches avec les deux compilateurs ;
   documenter les résultats réels et limites. Mettre à jour PR24 puis intégrer
   seulement les correctifs vérifiés, sans faire croire au déploiement de l'UI.

Validation : unittest Python isolé, suites Vitest hermétiques, typecheck, build,
comparaison compilateur client/serveur. Les essais en ligne des personas actuelles
et les alertes Observatory sont consignés séparément dans apps2026-hub.
