# Tâche en cours — réception Synapse en ligne

État : **code, migrations et déploiement terminés ; recette réelle bloquée avant création de données**.

## Terminé

- [x] Ouverture Synapse par ticket court échangé exclusivement côté serveur.
- [x] Projet natif portant exactement le `ProjectRef`.
- [x] Sélection explicite d'un workspace accessible et rôle `member` par défaut.
- [x] Préparation, grant et revoke idempotents sans suppression d'une adhésion préexistante.
- [x] Isolation RLS/API : un grant Synapse sur le projet A ne donne aucun accès direct au projet B.
- [x] PR d'ouverture fusionnée (`38312d6e7173f5e8fab937226a0f7b642fc2f227`).
- [x] PR d'isolation fusionnée (`94da68da`).
- [x] Correctif de réouverture collaborative fusionné dans `master` (`f80320c68bff94c9e24dd5cd9bdafae2734bd280`).
- [x] Migrations `20261004120000` et `20261004160000` appliquées et vérifiées sur la cible qualifiée `xucmfdggetwxmpquqjvj`.
- [x] Images immuables `organigrad-front` et `orchestrator` du SHA `f80320c6` déployées et saines.

## Blocage constaté le 4 octobre 2026

La première recette réelle A/B s'arrête avant toute création métier : l'API Supabase Auth Admin de la cible Synapse `owekpppiqacsqagkiwuf` répond `401 Invalid API key` au jeton serveur actuellement chargé par le service Synapse. Le jeton porte bien la référence et le rôle attendus, mais n'est plus accepté pour l'administration Auth. Aucun projet, circuit ou compte de recette n'a été créé par cette tentative.

Ce blocage concerne la création des deux comptes témoins depuis Synapse. Il ne remet pas en cause le déploiement OrganiGrad déjà vérifié. Les clés ne sont pas consignées dans ce document.

## Reste à faire

- [ ] Charger une clé serveur Synapse valide ou utiliser deux comptes de démonstration existants dont la session est techniquement disponible.
- [ ] Rejouer deux comptes, deux workspaces et deux projets avec le même `ProjectRef` de bout en bout.
- [ ] Créer un circuit réel, affecter un membre, démarrer, décider, redémarrer puis relire l'audit.
- [ ] Vérifier refus compte B, URL/API directe, ticket expiré ou rejoué, deux onglets, clavier et 390 px.
- [ ] Produire le reçu réseau et mettre à jour le registre A01–A20.

Définition de terminé : `ACCOUNT_VERIFIED`, `CROSS_APP_VERIFIED`, `BUSINESS_PATH_VERIFIED` et `ONLINE_VERIFIED` avec reçus anonymisés et SHA déployé.
