# Écritures concurrentes — état des lieux et décision à prendre

**Constat établi le 2026-08-14** (P2-14 du plan de correction).

> **Statut : option 2 retenue et implémentée.** Les écritures de nœuds et de
> fiches RH vérifient désormais `updated_at` avant modification. Un conflit
> renvoie une erreur explicite au lieu d'écraser silencieusement la donnée.

## Ancien comportement : « dernier écrivain gagne », silencieux

Les deux chemins d'écriture d'un nœud font le même `on conflict do update set`
sur **toutes** les colonnes, sans prédicat de version :

| Chemin | Fichier |
|---|---|
| SPA → Supabase | `src/services/hybridNodeRepo.ts` (`upsert`, `onConflict: 'id'`) |
| SPA → orchestrateur → Postgres | `orchestrator/src/state/pgGraphStore.ts` (`upsertNode`) |

Même forme pour les fiches RH : `src/services/agentRepo.ts` (`org_agents`).

Conséquence, **vérifiée sur PostgreSQL réel avec le code de production**
(`orchestrator/tests/concurrentWrites.integration.test.ts`) :

1. Alice et Bob ouvrent la même fiche ;
2. Alice corrige le **nom**, enregistre ;
3. Bob corrige le **rôle**, enregistre — sa charge porte encore l'ancien nom,
   qu'il n'a pourtant pas touché ;
4. **aucune erreur** n'est levée, rien n'avertit Bob ;
5. la correction d'Alice a disparu.

Trois précisions qui comptent :

- **La granularité est la ligne, pas le champ.** Bob n'a modifié que le rôle,
  mais il réécrit toutes les colonnes. Deux personnes travaillant sur deux
  champs différents de la même fiche se détruisent mutuellement.
- **Ce n'est pas « la modification la plus récente gagne »**, mais « le dernier
  enregistrement gagne ». Un onglet ouvert depuis une heure écrase une
  correction faite il y a dix secondes.
- **Aucune trace.** `node_transitions` ne journalise que les changements de
  statut. Ni Alice, ni un auditeur, ne peuvent constater l'écrasement après coup.

### Cas à plus grand rayon d'action

L'import en mode `replace` (`import_org_agents`, `supabase/migrations/20260803120200`)
**supprime** les fiches absentes de la charge. Un import lancé par Bob pendant
qu'Alice édite ne se contente pas d'écraser un champ : il retire des lignes.
Ce cas mérite d'être tranché en même temps.

## Ce qui est déjà en place

`hybrid_nodes` et `org_agents` portent un `updated_at` **maintenu
automatiquement** (trigger `touch_updated_at`, côté SPA comme côté
orchestrateur, où il est aussi posé explicitement).

Conséquence pratique : **le verrou optimiste est désormais utilisé** pour les
modifications unitaires de `hybrid_nodes` et `org_agents`. Les imports groupés
utilisent une migration SQL dédiée qui sérialise une source et vérifie sa
version avant l'opération atomique.

## Options

### 1. Assumer le « dernier écrivain gagne » (statu quo, explicite)

Le plus honnête si l'organigramme est édité par une seule personne à la fois.
Coût nul. À condition de l'écrire ici et de retirer l'ambiguïté — aujourd'hui
personne ne sait que c'est le comportement.

Risque conservé : perte silencieuse, non détectable après coup.

### 2. Verrou optimiste sur `updated_at` — **recommandé**

`update … where id = ? and updated_at = <valeur chargée>`. Zéro ligne affectée
⇒ conflit ⇒ erreur explicite, et l'interface propose de recharger.

- Pas de migration : la colonne et le trigger existent.
- Coût réel : les deux chemins d'écriture, plus le traitement du conflit dans
  l'interface (message, rechargement, préservation de la saisie).
- Limite : détecte le conflit, ne le résout pas. L'utilisateur perd sa saisie
  s'il n'y prend pas garde — d'où l'importance de préserver le formulaire.

### 3. Fusion par champ

N'écrire que les champs réellement modifiés (`PATCH` plutôt que `PUT`). Alice et
Bob sur deux champs distincts ne se gênent plus.

- Plus confortable, et cohérent avec la règle « omission = conservation » déjà
  appliquée aux champs chiffrés.
- Mais ne règle pas le cas de deux modifications du **même** champ, et demande
  de suivre l'état « sale » de chaque champ dans l'éditeur.
- Se combine bien avec l'option 2.

### 4. Versionnage complet

Historique par nœud, comparaison, restauration. Répond aussi au besoin d'audit
métier absent aujourd'hui — mais c'est un chantier, pas un correctif.

## Décision et état d'implémentation

**Option 2**, éventuellement complétée plus tard par l'option 3.

Raison : c'est la seule qui supprime le caractère *silencieux* du problème pour
un coût contenu. La migration est nécessaire uniquement pour sécuriser les
imports groupés. Les options 3 et 4 améliorent le confort et l'auditabilité,
mais peuvent être décidées plus tard.

## Suite

Le test `concurrentWrites.integration.test.ts` doit être exécuté avec
`TEST_DATABASE_URL` après application des migrations. Il doit alors être
réécrit en test de conformité : la seconde écriture doit recevoir un conflit,
et non plus reproduire l'ancien écrasement silencieux.
