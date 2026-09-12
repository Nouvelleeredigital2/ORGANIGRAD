# Import des fiches relues depuis la session OrganiGrad

Complément d'exécution du lot 6 approuvé : les 14 fiches converties sont déjà
relues dans docs/bots-import-20260911. Le registre réel du workspace est vide.
Le CLI exige une copie de jeton humain ; utiliser l'API existante depuis l'écran
Bots permet de conserver l'authentification dans l'application.

Le bouton propose une prévisualisation des noms et métiers, puis crée seulement
les fiches absentes, en brouillon, avec les UUID historiques. Toute collision
UUID/runtime bloque avant la première création. Les fiches existantes restent
intactes, y compris leurs modifications et leur état d'activation. Une erreur
interrompt le lot ; une reprise relit le registre et conserve les créations
déjà réalisées. Un changement de workspace arrête les prochaines créations.
Ce paquet est un outil ponctuel d'import ; le registre ne dépend pas de lui.

1. Tests du lot réel : 14 UUID conservés, brouillons, collisions, reprise,
   erreur partielle, arrêt lors du changement de contexte.
2. Service d'import utilisant fetchBots/upsertBot existants (POST seulement).
3. Prévisualisation et progression accessibles dans BotsView.
4. Tests, typecheck, lint, build ; commit et image immutable.
5. Import par l'interface authentifiée, relecture des 14 fiches. Aucune
   synchronisation Hermès, activation, programmation ou publication implicite.
