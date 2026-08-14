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

## Non corrigé — signalé : double envoi possible en concurrence

L'ordre des opérations dans la fonction est :

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

**Correction recommandée** — réserver la clé *avant* d'envoyer :

1. `INSERT` avec `status = 'pending'` ; une violation d'unicité (23505) signifie
   qu'un autre envoi est déjà en cours ou fait → répondre `deduped`, ne rien
   envoyer ;
2. envoyer ;
3. `UPDATE` de la ligne avec le statut final ; en cas d'échec d'envoi,
   **supprimer** la réservation pour qu'un retry légitime puisse repasser.

Reste à traiter dans ce schéma : une fonction interrompue entre 1 et 3 laisse
une ligne `pending` qui bloquerait les retries — prévoir une reprise des
`pending` plus anciens qu'un délai donné.

Non appliqué ici volontairement : la fonction n'est ni exécutable ni déployable
depuis cet environnement (pas de Deno), et modifier le chemin d'envoi sans
pouvoir le tester ferait courir un risque supérieur au défaut corrigé — lequel
suppose deux invocations réellement concurrentes.

## À constater sur le projet déployé

Ces points ne se lisent pas dans le dépôt.

1. La fonction est-elle **déployée** sur `xucmfdggetwxmpquqjvj`, et dans quelle
   version ? (Dashboard → Edge Functions, ou `supabase functions list`.)
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
