# Actions asynchrones — convention

Un audit fonctionnel des six vues a montré que la majorité des anomalies
perçues par l'utilisateur n'étaient pas des bugs de logique métier, mais des
**issues d'action non observables** : une écriture qui échoue pendant que
l'interface affiche un succès, un panneau qui se referme comme si la décision
avait été prise, une copie de clé qui n'a jamais eu lieu.

Ce document fixe les trois règles qui s'appliquent à toute action utilisateur
déclenchant un appel réseau ou une écriture.

## Règle 1 — Aucun `void promise` sans `.catch`

Un rejet non géré ne laisse qu'une ligne de console. L'utilisateur, lui, voit
une interface qui se comporte comme si tout allait bien.

```ts
// ✗ l'échec est invisible
void bridge.approve(node.id);

// ✓ l'issue est matérialisée et affichée
const outcome = await run(() => bridge.approve(node.id), {
    success: 'Validation enregistrée.',
});
```

## Règle 2 — Ne jamais refermer une interface avant le succès

Fermer un panneau, vider un formulaire ou réinitialiser un champ **avant** que
l'appel n'ait abouti fait perdre la saisie de l'utilisateur et lui fait croire
que l'action a réussi.

```ts
// ✗ le motif de rejet est perdu si l'appel échoue
onReject(node, feedback);
setFeedback('');
setPanelOpen(false);

// ✓ on ne referme qu'au succès
const outcome = await run(() => onReject(node, feedback));
if (outcome.ok) {
    setFeedback('');
    setPanelOpen(false);
}
```

## Règle 3 — Aucun `catch {}` vide

Soit l'erreur remonte, soit la fonction renvoie un résultat explicite que
l'appelant est obligé d'examiner. Un `catch` vide transforme une panne en
comportement silencieux — c'est ainsi qu'un échec d'écriture `localStorage`
(quota, navigation privée) se traduisait par un message « Configuration
enregistrée ».

## Outillage

| Module | Rôle |
|---|---|
| `src/utils/asyncGuard.ts` | `attempt()` renvoie un `Outcome<T>` au lieu de lever — l'appelant ne peut pas ignorer le cas d'échec. `describeError` normalise une valeur `unknown`. |
| `src/hooks/useAsyncAction.ts` | `run()` exécute l'action, affiche l'issue via le canal de retour, et renvoie l'`Outcome` pour que l'appelant décide de refermer ou non. |
| `src/feedback/` | Canal de retour unifié. Les tons `warning` et `error` ne s'effacent jamais seuls : un échec doit être lu, pas entraperçu. |
| `src/utils/clipboard.ts` | Copie qui ne lève jamais et dit toujours si elle a abouti — le repli `execCommand` couvre les contextes non sécurisés. |

Hors d'un `<FeedbackProvider>`, `useFeedback()` renvoie une implémentation
neutre : les tests qui rendent une vue isolément n'ont rien à câbler.
