# Claude Code — Boréal : identité interapplications et reçus d’exécution

## Objet

Préparer, sans appliquer, les migrations additives qui rendent possibles les décisions LINK et les livrables Orvion du pilote. Les comptes Supabase LINK et OrganiGrad ont des UUID distincts : **ne jamais rapprocher par e-mail, nom, UUID ou workspace**.

## 1. Liaison d’identité humaine, propriétaire Synapse

Qualifier d’abord le schéma Synapse réellement déployé et rechercher un mécanisme existant de liaison de comptes. S’il existe, l’étendre ; sinon créer une liaison explicite `link_user_id` ↔ `organigrad_user_id`, créée et révoquée par les deux sessions humaines vérifiées, avec :

- un identifiant de liaison opaque, les deux autorités, les deux UUID, la date de création, révocation et audit ;
- unicité par paire et refus d’un compte actif associé à plusieurs comptes dans la même autorité ;
- aucune adresse e-mail, JWT, jeton service ou donnée de profil dupliquée ;
- une RPC ou route de résolution réservée au pont LINK→OrganiGrad, qui vérifie à nouveau la liaison active, le `ProjectRef`, l’appartenance LINK à la conversation et l’appartenance OrganiGrad au workspace avant d’émettre l’acteur OrganiGrad ;
- refus déterministe `IDENTITY_LINK_REQUIRED`, `IDENTITY_LINK_REVOKED` ou `PROJECT_FORBIDDEN`.

Le pont ne doit jamais accepter un `organigrad_user_id` fourni par le navigateur LINK.

## 2. Reçus persistants de production OrganiGrad

Qualifier `circuit_executions`, `circuit_step_attempts` et les sorties actuellement enregistrées. Si aucune table ne lie durablement une exécution à une référence de livrable, ajouter une table additive de reçus qui contient seulement : workspace, `ProjectRef`, run, étape, version de run, référence `{sourceApp,id,kind,version,canonicalUrl}`, clé d’idempotence, empreinte du payload, mandat utilisé et horodatages.

- contrainte unique sur la clé d’idempotence dans le périmètre workspace/run/étape ; même clé et empreinte différente → `IDEMPOTENCY_CONFLICT` ;
- le reçu est réservé avant l’appel externe, puis marqué accepté seulement après réponse vérifiée ;
- une réponse perdue reste `uncertain` et ne permet pas une seconde écriture ;
- une correction conserve les références anciennes et invalide seulement les reçus de contrôle dépendants ;
- aucune colonne de contenu éditorial, prompt complet, clé Engine ou JWT ;
- RLS sans policy si l’accès est uniquement serveur, `revoke all` explicite incluant `service_role`, RPC restreinte au service exact.

## 3. Livrables attendus

Une branche par application propriétaire, tests SQL de concurrence et de révocation, contrats de RPC installés, rollback limité aux objets nouveaux. Ne modifier ni migrations historiques, ni le garde `guard_bot_activation`, ni les identifiants des 14 personas.
