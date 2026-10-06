# Sécurité — synthèse opérationnelle

## Contrôles présents dans le code

- Auth humaine par Supabase JWT et rôles de workspace.
- RLS sur les tables accessibles au navigateur.
- Clés techniques hashées, scopes, expiration et révocation.
- Séparation des décisions humaines et des actions techniques.
- SSE par ticket court à usage unique.
- CORS par allowlist.
- Garde SSRF avec résolution DNS, blocage des IP privées/métadonnées, revalidation des redirections, timeout et taille maximale.
- DTO publics sans prompts, webhooks ou configurations MCP sensibles.
- Edge Function email authentifiée, destinataire borné au nœud et idempotence en base.
- Limites d’import XLSX et neutralisation des formules CSV.
- Porte de dépendances high/critical dans la CI.

## Risques ouverts ou non vérifiés

- La présence et la rotation de `INTEGRATION_ENCRYPTION_KEY` ne sont pas imposées en mode PostgreSQL ; sans clé, les champs sensibles restent en clair.
- L’isolation réelle des workspaces, les RLS et le schéma déployé n’ont pas été revalidés pendant cet audit.
- Les E2E connectés et les tests PostgreSQL réels exigent un environnement isolé.
- Les emails, Slack, LINK, Synapse, MCP, Engine, Orvion et la voix n’ont pas été exercés avec de vrais services.
- Le consommateur Synapse est signalé comme devant encore être cloisonné par workspace avant activation durable.
- Le baseline historique et les migrations ont connu une dérive ; ne pas appliquer de SQL distant sans comparaison et sauvegarde.

## Références détaillées

- `docs/security/authorization.md`
- `docs/security/ssrf-protection.md`
- `docs/security/encryption-at-rest.md`
- `docs/security/secrets-management.md`
- `docs/security/notify-email-audit.md`
- `docs/security/dependances.md`

