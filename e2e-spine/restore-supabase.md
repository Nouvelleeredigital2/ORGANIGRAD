# Procédure de restauration — Supabase APPS-2026

## Pré-requis
- Supabase CLI installé (`npm install -g supabase` ou téléchargement binaire)
- Variable d'environnement `SUPABASE_ACCESS_TOKEN` définie avec un token de service valide
- Accès au dossier de backup généré par `backup-supabase.ps1`

## Étapes

### 1. Identifier le dossier de backup cible
```
backups\
  memoire-vive\
    2026-06-24_14-30\
      schema.sql
      archived_decisions.sql
      users.sql
      messages.sql
      workspaces.sql
  link\
    2026-06-24_14-30\
      schema.sql
      ...
```
Choisir le dossier daté le plus récent (ou celui souhaité pour un point de restauration précis).

### 2. Restaurer le schéma
> ATTENTION : cette opération recrée les tables. Elle doit être effectuée sur une base vide ou après `DROP SCHEMA public CASCADE; CREATE SCHEMA public;`.

```powershell
# Mémoire Vive
$projectId = 'aknlikwelaorsebbhnfw'
$backupDir = 'backups\memoire-vive\2026-06-24_14-30'

supabase db push --project-ref $projectId < "$backupDir\schema.sql"
```

En cas d'erreur de connexion directe, utiliser `psql` avec la connection string Supabase :
```powershell
$connStr = "postgresql://postgres:[PASSWORD]@db.$projectId.supabase.co:5432/postgres"
psql $connStr -f "$backupDir\schema.sql"
```

### 3. Restaurer les données table par table
```powershell
$tables = @('archived_decisions', 'users', 'messages', 'workspaces')
foreach ($table in $tables) {
  $file = "$backupDir\$table.sql"
  if (Test-Path $file) {
    Write-Host "Restauration : $table"
    psql $connStr -f $file
  } else {
    Write-Host "Fichier absent, ignoré : $table"
  }
}
```

### 4. Vérification post-restore
Exécuter les requêtes de contrôle suivantes :

```sql
-- Nombre de décisions archivées
SELECT COUNT(*) FROM archived_decisions;

-- Dernière décision (doit correspondre au backup)
SELECT id, created_at FROM archived_decisions ORDER BY created_at DESC LIMIT 5;

-- Intégrité utilisateurs
SELECT COUNT(*) FROM users;
```

Via Supabase CLI :
```powershell
supabase db execute --project-ref $projectId --query "SELECT COUNT(*) FROM archived_decisions;"
```

### 5. Relancer les applications
Une fois la base restaurée, redémarrer les services dans cet ordre :

1. **Synapse bus** : `npm start` dans `NED-IA-SYNAPS/apps/ned-ia-synapse/backend`
2. **Organigrad** : `npm run dev` ou `npm start`
3. **LINK** : `npm run dev` ou `npm start`
4. **Vérifier les health checks** :
   - `curl $SYNAPSE_URL/health`
   - `curl $ORGANIGRAD_URL/health`
   - `curl $LINK_URL/health`

### 6. Cas particulier : restauration partielle (table unique)
Si seule une table est corrompue, il est possible de restaurer uniquement cette table sans toucher au schéma :

```powershell
# Vider la table cible, puis réinjecter
psql $connStr -c "TRUNCATE TABLE archived_decisions CASCADE;"
psql $connStr -f "$backupDir\archived_decisions.sql"
```

## Points de vigilance
- Les backups ne couvrent pas les fichiers Storage Supabase (images, pièces jointes). Effectuer un export séparé si nécessaire via le dashboard Supabase > Storage.
- Les migrations Supabase (`supabase/migrations/`) font foi pour le schéma : en cas de divergence, rejouer les migrations plutôt que de restaurer le `schema.sql`.
- En production, tester la restauration sur un projet Supabase de staging avant d'intervenir sur le projet de production.
