# Tâche en cours — réception Synapse en ligne

État : **correctif de contrat fusionné et déployé ; recette réelle gelée par l’incident de secrets du 6 octobre 2026**.

## Terminé

- [x] Code, migrations d’isolation et raccordement initial Synapse → OrganiGrad livrés jusqu’au SHA `f80320c68bff94c9e24dd5cd9bdafae2734bd280`.
- [x] Cibles requalifiées : Synapse `owekpppiqacsqagkiwuf`, OrganiGrad `xucmfdggetwxmpquqjvj`.
- [x] Recherche en lecture seule des identités communes : une seule identité qualifiée, donc aucune paire A/B préexistante utilisable.
- [x] Erreur Auth Admin historique résolue : clé serveur OrganiGrad corrigée avec sauvegarde privée et sonde Admin HTTP 200.
- [x] Deux comptes et deux workspaces de recette créés sur les deux cibles ; aucun secret ni identifiant personnel consigné.
- [x] Dérive de contrat identifiée : Synapse émettait un JWS `synapse-launch+jws`, tandis que l’image OrganiGrad `f80320c6` n’acceptait que le code opaque historique de 43 caractères.
- [x] PR [#44](https://github.com/Nouvelleeredigital2/ORGANIGRAD/pull/44) fusionnée au commit `892a4c4bd25ef267806cf5db6161a2384fb604bc` après CI verte.
- [x] Image immuable `organigrad-backend:20261006-892a4c4` construite depuis le commit fusionné et déployée via `deployer-compose`; conteneur sain et label de révision vérifié.
- [x] Trois credentials applicatifs exposés dans une sortie de diagnostic ont été tournés de façon coordonnée : pont LINK, jeton applicatif Synapse et credential d’adaptateur Synapse. Les anciennes valeurs répondent 401 et les nouvelles 200/404 selon la route attendue.

## Blocage actif

La même sortie de diagnostic a aussi affiché `SUPABASE_DB_URL` et `SUPABASE_SERVICE_ROLE_KEY`. Ces secrets restent actifs. Leur rayon d’impact couvre le projet Supabase OrganiGrad et peut inclure des consommateurs hors Docker ou une Edge Function. Leur rotation fournisseur est donc séparée et n’a pas été improvisée.

La recette réelle est gelée jusqu’à leur rotation coordonnée. Voir `docs/security/incident-20261006-runtime-secrets.md`. Les comptes et workspaces de recette déjà créés sont conservés pour reprise ; aucun circuit ni décision métier n’a encore été validé de bout en bout.

Qualification complémentaire : le VPS ne montre qu'un consommateur actif des deux
valeurs, `/opt/organigrad/.env`. Les consommateurs Supabase gérés hors VPS ne sont pas
inventoriables avec les accès présents et la coexistence des anciennes/nouvelles valeurs
n'est pas prouvée. Aucune rotation fournisseur n'a donc été exécutée.

## Reste à faire

- [ ] Qualifier tous les consommateurs de `SUPABASE_DB_URL` et `SUPABASE_SERVICE_ROLE_KEY`, puis tourner les deux secrets côté fournisseur avec sauvegarde, fenêtre de coexistence ou rollback documenté.
- [ ] Vérifier SQL, Auth Admin, `notify-email`, santé orchestrateur et refus des anciennes valeurs après rotation.
- [ ] Reprendre les deux comptes, deux workspaces et deux projets avec le même `ProjectRef` de bout en bout.
- [ ] Créer un circuit réel, affecter un membre, démarrer, décider, redémarrer puis relire l’audit.
- [ ] Vérifier refus compte B, URL/API directe, ticket expiré ou rejoué, deux onglets, clavier et 390 px.
- [ ] Produire le reçu réseau et mettre à jour le registre A01–A20.

Définition de terminé : secrets exposés révoqués, puis `ACCOUNT_VERIFIED`, `CROSS_APP_VERIFIED`, `BUSINESS_PATH_VERIFIED` et `ONLINE_VERIFIED` avec reçus anonymisés et SHA déployé.
