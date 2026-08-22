# Écritures concurrentes — politique retenue

**Constat établi le 2026-08-14** (P2-14 du plan de correction).

> **Statut : tranché le 2026-08-22 — option 2, verrou optimiste.** Appliqué sur
> les trois chemins d'écriture. Le reste de ce document décrit le comportement
> d'AVANT et le raisonnement qui a mené au choix ; il est conservé parce qu'il
> explique pourquoi les autres options ont été écartées.
>
> **Ce qui a changé.** La mise à jour ne s'applique que si la ligne n'a pas
> bougé depuis son chargement (`updated_at` comme jeton). Zéro ligne affectée ⇒
> refus explicite au lieu d'un écrasement silencieux. Aucune migration : la
> colonne et son trigger existaient déjà.
>
> | Chemin | État |
> |---|---|
> | SPA → Supabase, fiches (`org_agents`) | ✅ gardé |
> | SPA → Supabase, nœuds (`hybrid_nodes`) | ✅ gardé |
> | SPA → orchestrateur → Postgres | ✅ gardé (jeton transmis par l'API) |
> | Import de masse | délibérément NON gardé — il assume l'écrasement |
>
> **Ce que le verrou ne fait pas** : fusionner. Le second auteur est prévenu et
> doit recharger. Sa saisie est conservée (le formulaire reste ouvert), mais il
> doit réappliquer sa modification.
>
> **Limite connue** : la comparaison se fait à la milliseconde. PostgreSQL
> stocke des microsecondes, mais un jeton ayant transité par un `Date`
> JavaScript les perd ; tronquer des deux côtés rend la comparaison stable quelle
> que soit la provenance du jeton. Deux écritures dans la même milliseconde
> pourraient donc encore se recouvrir — un cas sans réalité pour une édition
> humaine.

## Le comportement d’AVANT : « dernier écrivain gagne », silencieux

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

Conséquence pratique : **un verrou optimiste est implémentable sans migration.**
Le jeton de version existe déjà, il n'est simplement pas utilisé.

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

## Recommandation

**Option 2**, éventuellement complétée plus tard par l'option 3.

Raison : c'est la seule qui supprime le caractère *silencieux* du problème pour
un coût contenu, sans migration. Les options 3 et 4 améliorent le confort et
l'auditabilité, mais on peut les décider plus tard ; laisser une écriture
disparaître sans que personne ne l'apprenne est ce qui pose problème
aujourd'hui.

## Vérification

`orchestrator/tests/concurrentWrites.integration.test.ts` — 5 tests contre un
**PostgreSQL réel**, en CI :

- la seconde écriture est refusée **et la première survit** ;
- après rechargement, le second auteur peut réappliquer sa modification ;
- l'écriture renvoie le nouveau jeton, utilisable aussitôt (sans quoi un second
  enregistrement consécutif se refuserait lui-même) ;
- sans jeton, le comportement historique est conservé (création, import) ;
- une fiche supprimée entre-temps n'est **pas ressuscitée** — et l'erreur est
  distincte du conflit, « recharge » n'ayant aucun sens pour une fiche disparue.

Côté SPA, `src/services/agentRepoConflit.test.ts` verrouille la forme de la
requête (l'oubli d'un filtre sur le jeton rouvrirait la brèche sans rien casser
d'autre). Ce n'est pas une preuve de bout en bout : il n'y a pas de PostgREST
dans cet environnement.
