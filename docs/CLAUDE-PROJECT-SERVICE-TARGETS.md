# Claude — découverte des projets autorisés à un service

14 septembre 2026. Candidat local uniquement. Aucune migration appliquée à distance. Requalifier la cible OrganiGrad selon les instructions du parc avant toute phase d'écriture autorisée ; ne pas substituer une autre base du réseau.

Fichier : `supabase/migrations/20260914150000_project_service_target_discovery.sql`.

SHA-256 : **`419DCC359ED86C8650D512B16601D15344B5F9AAC0F728E05B12446C8AFCD2B3`**.

Prérequis : candidat `project_service_delegations` réconcilié et tables natives projects, workspace_api_keys, hybrid_nodes, workspace_members. La fonction réutilise les grants existants ; elle ne crée aucune association, clé, identité ou table de projets. `hybrid_nodes.type` est requis pour exclure les nœuds qui ne sont plus AGENT_IA ou SOFTWARE_MCP.

Nouvel objet : `list_project_service_targets(uuid,uuid,text,text,uuid,integer)` en SECURITY DEFINER et search_path vide ; aucun droit navigateur, EXECUTE uniquement service_role, aucun grant direct de table ajouté. La cible et l'acteur de clé doivent toujours venir de l'authentification API, jamais de champs libres du navigateur.

La fonction filtre le workspace de clé, le client natif visé, les grants de lecture actifs, le projet actif, les scopes de clé, le créateur toujours administrateur et le nœud valide. Elle expose la plus courte expiration clé/grant. Pagination par UUID de grant, 25 par défaut et maximum 100 ; le curseur ne provient que des lignes visibles. Aucune exécution, document, token ni secret renvoyé.

La route `GET /api/service-projects` construit le ProjectRef natif côté serveur et borne la transaction SQL à 5 secondes, avec lock_timeout de 1 seconde. Un catalogue ne vaut jamais permission de lire un résultat : chaque contenu reste soumis à `execution:read` actuel.

Vérification locale : 11 tests PGlite/API, dont un rouge reproduisant l'affichage d'un nœud devenu humain, corrigé par le filtre natif. Interop locale réelle via Engineclient → HTTPloopback → auth OrganiGrad → RPC SQL : catalogue paginé, mauvais client absent et grant révoqué retiré. Le harness commun compte 22 assertions en incluant les précédents contrôles d'exécution/lecture.

Avant application future : rapprocher catalogue SQL et historique, comparer le hash et les dépendances, vérifier les privilèges effectifs. Aucune clause IF NOT EXISTS ne masque une divergence. Ne rejouer ni cette fonction ni les candidats précédents s'ils sont déjà présents. Après application autorisée, vérifier les droits et garder les flags fermés jusqu'à qualification du service et de sa session pilote. Le retour arrière opérationnel ferme le catalogue ; ne supprime pas les grants/historiques existants.

Revue indépendante locale : 12 tests discovery sur PGlite/Fastify, TypeScript vert. Une ligne expirée entre le retour SQL et la réponse HTTP est désormais refusée en 503 (régression rouge puis verte). Cette première revue précédait l’extension vocale ci-dessous. Aucune migration appliquée.

## Extension vocale — état courant du candidat

La signature six arguments et son résultat Engine restent inchangés : aucune découverte vocale via execution:read. Le même candidat ajoute une surcharge huit arguments `(uuid,uuid,text,text,uuid,integer,text,text)` ; les derniers paramètres sont l'action et la voix native. Aucun paramètre par défaut sur la surcharge, donc aucun changement de résolution des appels historiques. Révoquer aussi public/anon/authenticated/service_role avant d'accorder EXECUTE service_role à cette surcharge.

`voice:assign` et `voice:resolve` sont explicitement distincts. Ils exigent app=chat-vocal, workspace natif exact et resourceId UUID de voix. Le filtre réutilise les droits actuels du grant et de la clé et exige hybrid_nodes.type=AGENT_IA et bot_profiles.enabled=true. Le libellé du persona vient de la colonne native hybrid_nodes.nom. Le résultat ajoute nodeId, nodeName et action pour ce parcours vocal uniquement. Aucun nouveau registre ni grant créé.

La route accepte action explicite et resourceId ; par défaut elle garde execution:read. Une ressource passée au chemin read ou une action vocale sans voix est refusée. Chaque affectation/résolution revérifie toujours sa propre autorité ; le catalogue ne permet aucun effet.

Preuves courantes : 18 tests PGlite/Fastify verts, build orchestrateur vert. Les nouveaux tests couvrent voix exacte, distinction assign/resolve, profil désactivé/manquant, changement de type, scope retiré et compatibilité de la signature read. La nouvelle surcharge est non appliquée ; compléter la revue et la qualification distante avant migration. Les 22 assertions d'interop Engine historiques ne prouvent pas une interop Vox réelle.
