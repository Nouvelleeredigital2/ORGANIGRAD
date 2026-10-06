# Cartographie fonctionnelle

État au 23 septembre 2026. « Présent » signifie observé dans le code, pas validé en production.

| Domaine | Frontend | Backend/données | Tests observés | Statut d’audit |
|---|---|---|---|---|
| Auth email/mot de passe, OTP, session, déconnexion | `src/components/auth`, `useSession` | Supabase Auth | unitaires + E2E connectés | Présent ; connecté non exécuté |
| Workspaces, membres, invitations, rôles | vues Membres/Clés | tables/RPC/RLS Supabase | unitaires, SQL, connectés | Présent ; production non revalidée |
| Organigramme RH et pôles | vues organigramme/dashboard | `org_agents`, repo local/Supabase | unitaires + E2E import/export | E2E hermétique validé |
| Import CSV/XLSX | aperçu, modes merge/replace | parsing navigateur + RPC atomique | unitaires + E2E | Hermétique validé ; connecté non testé |
| Export CSV/PDF A3 | UI et aperçu | navigateur | unitaires + E2E fichiers | Validé hermétiquement |
| Graphe Humain/IA/MCP | vue Orchestration | `hybrid_nodes` | unitaires + E2E | Local validé ; distant non testé ici |
| Lancement, statuts, journal, HITL | vue Orchestration/Validation | machine à états, transitions, SSE | backend + E2E | Local validé ; connecté non testé ici |
| CRUD nœuds | éditeur/cartes | API et store PostgreSQL | unitaires/API | Présent ; DB réelle non exécutée |
| Bots Hermès | vue Bots/éditeur/import | `bot_profiles`, activation, bundle | frontend/backend/PGlite | Présent ; runtime Hermès non vérifié |
| Projets et tâches | vue Projets sous flag | tables, RLS, API | unitaires/PGlite/E2E dédiés | Présent ; activation environnementale non vérifiée |
| Projets privés | gestion de jetons sous flag | routes et table dédiée | backend/PGlite | Présent ; rôle SQL/Auth à qualifier |
| Circuits et exécutions | vue Circuits | stores, routes, reçus | backend/PGlite | Présent ; workflow externe non vérifié |
| Planification/rattrapage | UI d’horaires | grants, worker, occurrences | backend/PGlite | Opt-in ; exécution réelle non vérifiée |
| Livraison Orvion/Engine | références et statuts | clients externes, reçus | tests mockés/PGlite | Non vérifié avec services réels |
| LINK import/pont d’identité | actions d’intégration | routes et signatures | backend | Non vérifié de bout en bout |
| Synapse | indirect | producteur/consommateur | backend | Consommateur désactivé par défaut ; runtime non vérifié |
| Notifications email/Slack | retours UI | Notifier + Edge Function | unitaires/mockés | Réception réelle non vérifiée |
| Voix | bouton micro/validation | proxy SDK | unitaires/backend | Gateway réel non vérifié |
| RAG | — | — | — | Absent |

## Parcours principal estimé

1. L’utilisateur s’authentifie et sélectionne un workspace.
2. Il consulte ou prépare les acteurs humains/IA/MCP.
3. Il lance un nœud, une chaîne ou un circuit.
4. L’orchestrateur persiste l’état et journalise les transitions.
5. Une validation humaine est demandée lorsque le flux l’exige.
6. La décision ou le reçu externe fait avancer, bloque ou termine l’exécution.

Ce parcours complet n’a pas été validé aujourd’hui contre Supabase et les services externes réels.

