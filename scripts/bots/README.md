# Reprise des 14 personas

Décision du 11 septembre 2026 : Organigrad devient la référence des fiches ;
LINK conserve les validations humaines. La bascule distante n'est pas effectuée.

`convert_profiles.py --source <personas-fiches> --output <dossier>` produit les
champs structurés, la provenance et les 14 UUID historiques de LINK. Les sections
inconnues ou manquantes arrêtent la conversion. Les exemples d'évaluation sont
exclus. Le paquet relu est dans `docs/bots-import-20260911/` : 14 fiches, 30 URL
de sources conservées. Le texte complet des méthodes et limites est conservé ;
le socle partagé est condensé. Le compilateur serveur produit review-bundle.json
via compile_review_bundle.ts ; un test vérifie la parité avec l'aperçu client.

Avant une écriture : qualifier le projet Supabase, les fonctions prérequises,
l'API effectivement déployée et le workspace réel. Le 11 septembre, la référence
chargée est xucmfdggetwxmpquqjvj mais get_project_url refuse les droits. Aucune
migration, aucun import et aucune installation des nouveaux prompts n'ont eu lieu.

`import_profiles.py --profiles <json> --sha256 <empreinte> --api-url <https://hote/api>
--workspace <uuid> --drafts` est sans réseau par défaut. Ajouter `--apply --link-nodes`
après qualification, avec ORGANIGRAD_IMPORT_TOKEN dans l'environnement sécurisé.
`--drafts` vérifie d'abord l'empreinte du fichier original, puis demande uniquement
des créations avec `enabled: false`. Le fichier relu n'est pas réécrit. Sans cette
option, un fichier demandant `enabled: true` est refusé localement avant tout appel.
Les fiches déjà présentes ne sont jamais modifiées : leur état d'activation actuel
est conservé, tous les autres champs et leurs UUID historiques doivent correspondre.
Une collision d'identifiant ou de runtime bloque avant la première écriture.
Le reçu conserve le mode brouillon, l'empreinte du fichier source, l'UUID attendu,
l'UUID reçu et les erreurs partielles sans écraser l'identité attendue. Il
est enregistré avant chaque demande et après chaque étape : consulter ce reçu
et l'API après une interruption avant de relancer. Les créations réussies ne
sont pas supprimées si une liaison ultérieure échoue.

Importer un brouillon n'active aucun bot. La vérification des dépendances et
l'activation réelle restent un raccordement distinct ; aucun contournement
d'activation n'est fourni à cet importateur.

Dans le conteneur Hermès qualifié, sous UID 10000, utiliser sync_profiles.py en
mode `plan`, avec --url (HTTPS /api/bots/bundle), --plan et --runtime-sha256.
La clé ORGANIGRAD_BOTS_TOKEN porte uniquement les scopes nécessaires dont
bots:export. Relire le plan puis utiliser `apply` avec les mêmes paramètres de
cible et --expected-plan-sha256. L'installateur partage .personas-deploy.lock
avec le chemin historique, sauvegarde les fichiers et restaure les remplacements
en cas d'échec. Il contrôle le lecteur réel et ne redémarre aucun service.
Les 14 identités historiques doivent toutes être présentes et activées ; gérer
une nouvelle identité ou un retrait nécessite une extension explicite du lecteur.

Ne pas désactiver l'édition historique LINK avant la bascule Organigrad vérifiée.
Après celle-ci, retirer l'export concurrent des personas de LINK tout en gardant
ses validations. Ce changement LINK reste à implémenter après qualification.

Tests locaux : python -B -m unittest discover -s scripts/bots -p 'test_*.py'.
Ces tests isolés sont aussi exécutés par la CI et ne contactent aucun serveur.
