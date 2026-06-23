# Usage : .\backup-supabase.ps1 -Project memoire-vive
# Nécessite : supabase CLI installé, SUPABASE_ACCESS_TOKEN défini
param(
  [ValidateSet('memoire-vive', 'link')]
  [string]$Project = 'memoire-vive'
)

$ids = @{
  'memoire-vive' = 'aknlikwelaorsebbhnfw'
  'link'         = 'knsqgxhnuhohjkgxegys'
}
$projectId = $ids[$Project]
$date = Get-Date -Format 'yyyy-MM-dd_HH-mm'
$outDir = "backups\$Project\$date"
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

Write-Host "Backup $Project ($projectId) → $outDir"

# Export schéma
supabase db dump --project-ref $projectId --schema public > "$outDir\schema.sql"

# Export données tables critiques
$tables = @('archived_decisions', 'users', 'messages', 'workspaces')
foreach ($table in $tables) {
  supabase db dump --project-ref $projectId --data-only --table $table > "$outDir\$table.sql" 2>$null
  if ($LASTEXITCODE -eq 0) { Write-Host "  v $table" } else { Write-Host "  ! $table skipped" }
}

Write-Host "Backup terminé : $outDir"
