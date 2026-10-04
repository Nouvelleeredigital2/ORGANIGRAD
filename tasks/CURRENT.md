# Tâche en cours

## Raccorder OrganiGrad au ProjectRef Synapse

Statut : première livraison déployée ; correctif d'isolation A/B en validation avant réception distante.

- [x] Ticket court échangé exclusivement côté serveur.
- [x] Projet natif portant exactement le ProjectRef.
- [x] Sélection explicite d'un workspace accessible.
- [x] Préparation, grant `member` et revoke sans suppression d'une adhésion préexistante.
- [x] Migration additive, privée et rejouable.
- [x] Suites complètes, typechecks, lints et builds locaux.
- [x] PR d'ouverture verte et fusionnée (`38312d6e7173f5e8fab937226a0f7b642fc2f227`).
- [x] Migration `20261004120000` appliquée sur la cible Supabase qualifiée.
- [x] Images backend/frontend immuables du SHA fusionné déployées.
- [ ] Correctif RLS/API : un grant Synapse sur A ne donne aucun accès direct à B.
- [ ] Migration `20261004160000` fusionnée, appliquée et vérifiée.
- [ ] Recette réelle A/B, reconnexion, redémarrage, refus URL/API et mobile 390 px.
- [ ] Reçu réseau et registre A01–A20 mis à jour.
