# Edge Function `notify-email` — audit et points à vérifier

**Revue de code du 2026-08-14** (P1-8 du plan de correction).

L'Edge Function tourne sous Deno : elle n'est ni exécutable ni déployable depuis
cet environnement. Ce document sépare donc ce qui a été **vérifié dans le code**
de ce qui reste à **constater sur le projet déployé**.

## Vérifié par lecture du code — conforme

| Exigence du plan | État |
|---|---|
| Authentification de l'appelant | ✅ le Bearer doit être **exactement** `SUPABASE_SERVICE_ROLE_KEY`, sinon 401. La SPA ne peut pas appeler la fonction (anti-relais). |
| Destinataire non arbitraire | ✅ `to` doit correspondre à `hybrid_nodes.notification_channels.email` **du nœud et du workspace visés**, sinon 403. |
| Expéditeur non contrôlable | ✅ `from` vient de `EMAIL_FROM`, jamais de la requête. |
| Service e-mail indisponible | ✅ échec Resend → statut `failed`, ligne d'audit avec l'erreur, réponse **502** — pas un faux succès. |
| Fuite de données en journal | ✅ aucun contenu d'e-mail journalisé ; l'appelant masque l'adresse (`maskEmail`). |

## Corrigé côté orchestrateur — la clé d'idempotence ignorait l'occurrence

La clé était `workspace:nœud:type:de->vers`. Deux passages successifs par la
**même** transition produisaient la même clé, et la fonction dédupliquait le
second envoi contre la ligne d'audit du premier.

Conséquence concrète : un nœud remis en attente de validation après un refus
**ne prévenait plus personne** — définitivement, tant que la ligne d'audit du
premier envoi existait. Exactement l'inverse de ce que l'idempotence doit faire.

Corrigé en ajoutant l'horodatage de la transition à la clé
(`orchestrator/src/observability/notifier.ts`), avec deux tests : deux
occurrences → deux clés, un retry → une seule clé.

**Limite assumée** : deux occurrences séparées de moins d'une milliseconde
partagent encore la clé. Les transitions notifiées supposent une action humaine
ou d'agent entre les deux, donc le cas ne se présente pas en pratique. Le lever
complètement demanderait de transporter un identifiant de transition dans
`TransitionEvent` — `node_transitions.id` existe côté Postgres, mais pas dans le
store en mémoire.

## Corrigé le 2026-08-22 — double envoi en concurrence

L'ordre des opérations **était** :

1. `SELECT` sur `notifications` pour la clé d'idempotence ;
2. **envoi de l'e-mail** ;
3. `INSERT` de la ligne d'audit.

Deux invocations concurrentes portant la même clé passent toutes deux l'étape 1
avant que l'une n'atteigne l'étape 3 : **deux e-mails partent**. L'index unique
`notifications_idempotency_uniq` ne l'empêche pas — il ne fait échouer que le
second `INSERT`, après l'envoi, et cet échec est avalé par le `try/catch`. La
seconde invocation répond alors `{ ok: true }` en ayant envoyé un doublon sans
rien journaliser.

Le commentaire de `20260617140000_notifications_idempotency.sql` affirme que
« l'unicité partielle garantit qu'un même envoi réussi n'est pas dupliqué » :
c'est faux dans cet ordre d'opérations.

**Correction appliquée** — réserver la clé *avant* d'envoyer :

1. `INSERT` avec `status = 'pending'` ; une violation d'unicité (23505) signifie
   qu'un autre envoi est déjà en cours ou fait → répondre `deduped`, ne rien
   envoyer ;
2. envoyer ;
3. `UPDATE` de la ligne avec le statut final. En cas d'échec d'envoi, la clé
   d'idempotence est remise à **`NULL`** plutôt que la ligne supprimée : l'index
   unique étant partiel (`where idempotency_key is not null`), la trace de
   l'échec est conservée **et** un retry légitime peut repasser.

Aucune migration : `pending` est déjà la valeur par défaut de la colonne et fait
partie de sa contrainte `CHECK`.

**Pourquoi appliqué maintenant, alors que je refusais le 14/08 ?** Le refus
reposait sur « ne pas toucher un chemin d'envoi qui fonctionne sans pouvoir le
tester ». L'audit du 22/08 a établi que la fonction **n'est pas déployée** (404
sur `functions/v1/notify-email`, confirmé trois fois) : il n'y a aucun
comportement en production à casser, et la version corrigée est celle qui sera
déployée. Le risque a changé de camp.

**Non exécuté** : toujours pas de Deno dans cet environnement. À éprouver au
premier déploiement (jalon 2 du plan).

**Limite connue** : une fonction interrompue entre la réservation et sa clôture
laisse une ligne `pending` qui bloquera les retries de cet événement. Requête de
reprise à prévoir si le cas se présente :

```sql
-- Libère les réservations restées en attente au-delà de 15 minutes
update public.notifications
   set idempotency_key = null, status = 'failed',
       error = coalesce(error, 'reservation orpheline')
 where status = 'pending'
   and idempotency_key is not null
   and created_at < now() - interval '15 minutes';
```

## À constater sur le projet déployé

Ces points ne se lisent pas dans le dépôt.

1. ~~La fonction est-elle **déployée** ?~~ **Répondu le 2026-08-22 : NON.**
   `POST functions/v1/notify-email` renvoie **404** (trois essais). Elle est donc
   à déployer : `supabase functions deploy notify-email`.
2. Le code déployé correspond-il à `supabase/functions/notify-email/index.ts` ?
   Même question que pour le schéma en P0-2 : le dépôt doit être la source.
3. Les variables sont-elles renseignées : `RESEND_API_KEY`, `EMAIL_FROM` ?
   **Sans `RESEND_API_KEY`, la fonction bascule en « envoi simulé » et répond
   `ok: true` sans envoyer aucun e-mail** — le cas le plus trompeur, puisque
   tout paraît fonctionner de bout en bout.
4. Test réel : déclencher une validation HITL et **confirmer la réception**.
   Un appel HTTP réussi ne prouve pas la réception — voir le point 3.
5. Déclencher deux fois la même transition et vérifier que **deux** e-mails
   arrivent (c'est le défaut corrigé ci-dessus, à confirmer de bout en bout).
