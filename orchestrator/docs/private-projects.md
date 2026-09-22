# Producteur personnel projets — contrat backend local

Base de travail : `760150412cff067bf0e39e6bc79c3a6e789cb6f3`, lot backend du plan
`H/docs/plans/2026-09-09-raccordement-projets-personnel.md`. Aucun
déploiement, SQL distant ou changement frontend dans ce lot backend. Le contrat réseau
est défini localement, sans dépendance à une nouvelle version d'apps2026/contracts.

## Configuration et montage

`PRIVATE_PROJECTS_ENABLED=false` par défaut. Pour une activation ultérieure,
`true` exige Postgres, un vérificateur JWT configuré, `PRIVATE_PROJECTS_JWT_ISSUER`
HTTPS exact terminé par `/auth/v1`, et une liste non vide `CORS_ALLOWED_ORIGINS`
d'origines HTTPS exactes. Aucune URL par défaut n'est fournie. Ce flag est
indépendant de `PROJECTS_ENABLED` ; il exige néanmoins les tables projets.

`buildPgServer` accepte `privateProjectsEnabled`, `privateProjectsIssuer`,
`allowedOrigins`, `sql`, `verifyUserToken` (ou `jwtSecret`) et facultativement
`privateProjectsVerifyUserToken`. Ce dernier est prioritaire uniquement pour ce
lot : le bootstrap lui donne un transport JWKS borné à 4,5 s. La vérification
privée est bornée à 5 s. Le comportement du vérificateur historique est inchangé.
Un vérificateur injecté doit vérifier réellement la signature du même JWT ;
l'interface n'autorise pas une identité fournie par un navigateur.

## API pour l'interface Organigrad

Toutes les requêtes de gestion portent `Authorization: Bearer <JWT humain>` et
`X-Workspace-Id: <uuid>`. POST et DELETE exigent aussi un `Origin` présent dans
l'allowlist, y compris en appel API direct. Les UUID sont canoniques minuscules.

| Opération | Entrée | Réponse |
| --- | --- | --- |
| `POST /api/private-projects/tokens` | JSON strict `{projectId,name,expiresAt}` | `201 {id,token,workspace,projectId,scopes:['projects:read'],expiresAt}` |
| `GET /api/private-projects/tokens?projectId=<uuid>&cursor=<uuid>` | `projectId` obligatoire, `cursor` optionnel | `200 {tokens:[{id,name,prefix,expiresAt,createdAt,revokedAt}],nextCursor?}` |
| `DELETE /api/private-projects/tokens/:tokenId` | aucun body ni query | `204`, idempotent si la ligne reste accessible |

`name` : 1–80 caractères, trim serveur, caractères de contrôle interdits.
`expiresAt` : obligatoire, entier Unix en secondes, strictement futur ; le
serveur plafonne à `min(demande, JWT.exp, floor(auth.sessions.not_after))`, en
omettant seulement la dernière borne si NULL. La valeur retournée fait autorité.
`createdAt` / `revokedAt` : dates ISO, révocation nullable. La liste est limitée
à 100 lignes par page, triées par identifiant croissant. Elle n'expose ni hash,
ni secret, ni identifiant de session. Elle inclut les jetons expirés/révoqués
dont la session émettrice existe encore et respecte `not_after`. Une session
actuelle du même titulaire permet de gérer ces anciens jetons.

Seule l'émission renvoie le secret `ogp_` suivi de 64 caractères hexadécimaux.
Le client doit l'afficher une seule fois, l'effacer après copie/changement de
session et ne jamais le conserver dans une URL ou un stockage navigateur.
Tout champ supplémentaire (`scopes`, `ownerId`, `sessionId`, etc.) est rejeté.

## API pour le coffre Synapse

`GET /api/private-projects/introspect` prend exclusivement le Bearer personnel,
sans query et sans `X-Workspace-Id`. Réponse JSON strictement limitée à :

```ts
{
  active: true,
  appId: 'organigrad',
  subject: string,       // utilisateur Organigrad, jamais identité Synapse déduite
  workspace: string,     // UUID Organigrad issu du jeton
  projectId: string,     // UUID obligatoire et immuable
  scopes: ['projects:read'],
  expiresAt: number      // secondes Unix, peut diminuer si not_after diminue
}
```

`GET /api/private-projects/context` prend le même Bearer, sans sélecteur, et
renvoie exactement le DTO existant `{project,taskSummary,workspaceMemberCount,
recentActivity}`. Les deux routes GET acceptent aussi HEAD avec les mêmes
contrôles. Aucune mutation projet n'est enregistrée. Les JWT humains et clés
`ok_` sont refusés sur ces lectures ; le jeton personnel est refusé sur la
gestion, les anciennes routes projets, le graphe, les actions humaines et MCP.
Le nouveau chemin ne renseigne aucun principal/scopes de l'ancien auth hook.

## Stockage, contrôles et erreurs

`public.personal_project_tokens` conserve SHA-256 du secret aléatoire de 32
octets, un préfixe d'affichage, titulaire/workspace/projet/session obligatoires,
expiration du JWT émetteur, expiration effective et révocation. Les FK suppriment
le jeton avec l'utilisateur, le projet ou la session. Aucun `SET NULL` n'élargit
un accès. Une contrainte impose exactement `['projects:read']`, le trigger
interdit la mutation des liens, des scopes et des expirations. Seule une
révocation irréversible est modifiable. RLS active, aucun droit aux rôles
`anon`/`authenticated` ; droits serveur limités à SELECT/INSERT/UPDATE révocation.

La signature est vérifiée avant d'interpréter les claims. `iss`, `aud` exactement
`authenticated`, `role=authenticated`, `is_anonymous=false`, `sub`, `session_id`
et `exp` sont contrôlés strictement ; `sub` doit égaler le résultat du vérificateur.
Un `nbf` fourni est aussi vérifié. La session doit encore exister pour le même
utilisateur, ne pas être future/expirée ; l'utilisateur ne doit être ni anonyme ni
banni. L'appartenance actuelle et le projet exact sont relus en SQL avant toute
opération. Les lectures personnelles sont en transaction repeatable-read/read-only,
avec contrôle de session/appartenance et projection dans le même snapshot.
Elles n'écrivent pas `last_used_at` et n'émettent aucun événement métier.

Toutes les réponses privées portent `Cache-Control: private, no-store`. Erreurs
`{error:code}` sans entrée, SQL, secret ou message fournisseur :

| Statut | Code principal |
| --- | --- |
| 400 | `PRIVATE_PROJECTS_INVALID_REQUEST` |
| 401 | `PRIVATE_PROJECTS_UNAUTHORIZED` |
| 403 | `PRIVATE_PROJECTS_FORBIDDEN` ou `PRIVATE_PROJECTS_ORIGIN_DENIED` |
| 404 | `PRIVATE_PROJECTS_NOT_FOUND` |
| 413/415 | `PRIVATE_PROJECTS_INVALID_REQUEST` |
| 429 | `PRIVATE_PROJECTS_RATE_LIMITED`, `Retry-After: 60` |
| 503 | `PRIVATE_PROJECTS_UNAVAILABLE` |

Limites : corps 2 Kio, URL 1 024 caractères, JWT 8 192 caractères ; budget fixe
de 600 requêtes/minute dont 60 mutations/minute par instance ; mémoire constante.
SQL `statement_timeout=5s`, `lock_timeout=1s`, paramètres locaux à la transaction.
Le logger Fastify reste désactivé et les erreurs privées ne sont pas journalisées.
Les proxies et journaux d'accès externes doivent être qualifiés séparément.

## SQL local et qualification restante

Migration `supabase/migrations/20260909150000_private_project_tokens.sql` et report
identique `supabase/schema/baseline_private_project_tokens_2026-09-09.sql`.
Prérequis : migration projets et vraies tables Supabase `auth.users`,
`auth.sessions`. La fixture PGlite ne recrée que les colonnes utilisées.
La migration ne crée ni ne modifie de schéma Auth. Le compte SQL réellement
chargé doit posséder les droits requis de lecture Auth et les droits sur la
nouvelle table ; ni les grants de production ni le schéma distant ne sont prouvés.

Limite explicite de session : **timebox, inactivité et politique session unique
ne sont pas appliquées ici au-delà de JWT.exp, existence et not_after**. La
qualification de leur politique réelle et de son matérialisation est un
préalable à l'activation. Un renouvellement de JWT ne prolonge pas un jeton déjà
émis : réémettre un jeton puis renouveler la connexion Synapse est nécessaire.

Les requêtes déjà entrées dans un snapshot peuvent finir pendant une révocation
concurrente ; toute nouvelle opération relit les droits. PGlite prouve requêtes,
contraintes et transactions, pas les courses entre connexions d'un PostgreSQL
déployé. Le budget par instance est volontairement global ; un appelant peut le
consommer et la limite ne se partage pas entre plusieurs instances. Pas de quota
durable du nombre total de jetons, ni purge planifiée dans ce sous-lot.

Le DTO historique inclut les projets archivés, les titres des dix tâches récentes
et le **nombre de membres du workspace**. Ce champ dépasse le seul projet en
termes de métadonnées ; il est conservé pour respecter le contrat existant.

## Preuves locales

Tests d'abord : 28 échecs sur 32 observés le 9 septembre (émission absente :
404 au lieu de 201), puis implémentation. Pour la borne de vérification, échec
`pending` au lieu de 401 après 5 s virtuelles, puis correction. Les faux délais
HTTP Fastify avaient initialement bloqué le harnais ; la preuve de délai appelle
le vérificateur privé directement, avec libération de la promesse de fixture.

`tests/privateProjects.test.ts` utilise Fastify réel, JWT HS256 signé et moteur
PostgreSQL PGlite en mémoire : émission/empreinte, preuve stricte, parité DTO,
isolation, session supprimée, membre retiré, projet supprimé, bannissement,
anonymat, expirations JWT/session/token, révocation idempotente, origine,
immutabilité SQL, rôles navigateur, panne SQL, table sessions absente, limites.
Les transactions API de cette fixture prennent réellement `SET LOCAL ROLE
service_role` avec grants explicites : aucune écriture projet n'est accordée à
ce rôle de fixture. Les insertions de liens session/projet incohérents sont
également refusées par le SQL ; les données de fixture sont provisionnées hors
de ce rôle serveur.
Les suites historiques `projectRoutes`, `projectApiSql`, `auth`, `userAuth`,
`userAuthJwks` et `env` restent les contrôles de non-régression.

La preuve transverse Organigrad/Synapse est détenue par main dans H, distincte
de ce lot. Aucun résultat de cette preuve n'est revendiqué ici.

Vérification finale locale du 9 septembre : `npm test` dans `orchestrator`, avec
`TEST_DATABASE_URL` supprimée de l'environnement du processus : 38 fichiers
réussis, 4 ignorés ; **460 tests réussis, 62 ignorés**. La suite privée comporte
39 tests. Rejeu indépendant de main : mêmes 460 succès / 62 ignorés, types et build
réussis ; revue indépendante supplémentaire de 137 tests sans défaut actionnable.
`npm run typecheck` et `git diff --check -- orchestrator supabase`
réussissent. Les messages de panne Synapse de la suite complète proviennent des
scénarios historiques de résilience ; le nouveau parcours ne journalise aucun
secret. Le backend est enregistré dans `e44eb76`, depuis `7601504`. Le contrôle
global frontend a ensuite relevé `no-control-regex` dans le validateur du nom :
contrôle numérique équivalent, test des 33 caractères interdits et nouveau rejeu
460 réussis / 62 ignorés. Les deux SQL identiques ont seulement perdu leur ligne
vide finale supplémentaire. Aucun changement de migration ni de base distante.

La preuve transverse H a été rejouée à 8/8 après revue ; elle utilise le contrat
`contracts@1.6.0-pilot.2` distribué dans Synapse. Ce backend ne change ni package
ni lockfile de son consommateur historique d'événements et respecte la forme
exacte `projectConnectionIntrospectionSchema`, vérifiée par cette intégration.
