# Protection SSRF

Les URLs MCP (`hybrid_nodes.mcpConfig.serverUrl`) et les webhooks (Slack, Edge
Function) sont **configurables par l'utilisateur** : sans garde-fou, l'orchestrateur
pourrait être détourné pour atteindre des cibles internes.

Composant central : `orchestrator/src/net/ssrfGuard.ts` (`safeFetch`,
`assertUrlAllowed`, `isForbiddenIp*`). Utilisé par `mcpClient.ts` et `notifier.ts`.

## Garanties
1. **Protocole** : `http(s)` uniquement ; `https` exclusif en production.
2. **Résolution DNS avant la requête**, puis vérification de **toutes** les IP retournées.
3. **Blocage** : loopback (`127.0.0.0/8`, `::1`), privées (`10/8`, `172.16/12`,
   `192.168/16`), link-local **métadonnées cloud** (`169.254.0.0/16`), CGNAT
   (`100.64/10`), `0.0.0.0`, multicast/réservé (`≥224`), IPv6 ULA (`fc00::/7`),
   link-local (`fe80::/10`), multicast (`ff00::/8`), et IPv4-mappé (`::ffff:`).
4. **Redirections** suivies manuellement, **revalidées** à chaque saut, nombre limité.
5. **Timeout** + **taille de réponse maximale**.
6. **Allowlist** d'hôtes configurable.
7. **Messages génériques** côté appelant — aucune fuite de topologie interne.

## Politique
- **Stricte par défaut, indépendamment de `NODE_ENV`** (https + IP publiques) — un
  `NODE_ENV` non défini en prod ne désactive donc PAS la protection.
- Le mode permissif (http + cibles privées, pour viser un MCP localhost en dev)
  exige un **opt-in explicite** : variables `SSRF_ALLOW_HTTP=1` /
  `SSRF_ALLOW_PRIVATE=1`, ou une `SsrfPolicy` passée explicitement. À ne jamais
  activer en production.

## Tests
`orchestrator/tests/ssrfGuard.test.ts` (hermétiques, DNS + fetch injectés) :
localhost, IPv4 privée, IPv6 `::1`/ULA/link-local/mappé, **métadonnées
`169.254.169.254`**, redirection → IP privée, HTTPS public autorisé, protocole
refusé, allowlist, timeout, réponse trop volumineuse, cible interdite → 0 appel réseau.

## Limite connue
Pas encore de protection explicite contre le **DNS rebinding** entre la résolution
et la connexion (pinning d'IP). À ajouter si le modèle de menace l'exige.
