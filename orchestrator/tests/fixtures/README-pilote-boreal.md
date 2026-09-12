# TEST FICTIF — Atelier Boréal

Jeu local autorisé par l'utilisateur pour tester le circuit éditorial. Aucun objet
n'a été créé dans Supabase : get_project_url OrganiGrad est refusé dans cette session.
Le JSON est une fixture, pas un export de ressources distantes déjà créées.

Contenu : un projet, cinq membres synthétiques (trois bots, une application et un
validateur), deux dossiers avec articles avant/après correction et prompts visuels,
deux sources fictives, trois messages de scénario. Les domaines .invalid ne doivent
pas être consultés ni présentés comme des sources réelles. Aucun job Engine réel.

Test : depuis orchestrator, `npm test -- tests/piloteBoreal.test.ts`.
Deux tests passent, ainsi que le typecheck. Ils exercent la machine d'état réelle
avec références simulées : sélection Telegram, correction LINK, invalidation des
sorties aval, conservation de l'historique, validation et rejeu idempotent. Aucun
transport Telegram/LINK, appel LLM ou accès Orvion distant n'est exercé.

## Import futur par la session autorisée

Après qualification des cibles et migrations, créer explicitement le projet
« TEST FICTIF — Atelier Boréal » dans le workspace réel autorisé et un tableau
Orvion dédié portant le même préfixe. Associer le compte réel du propriétaire comme
validateur ; Alex est une identité de test, pas un compte à créer ou à autoriser.
Créer la correspondance des identifiants retournés et reconstruire ProjectRef avec
les véritables URL. Ne pas importer aveuglément les UUID de workspace du JSON.

Conserver tous les rattachements dans un reçu d'import. Ne pas remplacer les
14 personas historiques par ces personnages fictifs. Programmer seulement après
la recette manuelle ; publication externe désactivée. Ne pas supprimer ou modifier
des dossiers préexistants pour faire place à ce jeu.
