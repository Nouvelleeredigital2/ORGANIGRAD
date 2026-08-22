[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('graph', 'security', 'concurrency')]
    [string]$Suite
)

$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$orchestratorPath = Join-Path $projectRoot 'orchestrator'
$containerName = "organigrad-pg-$Suite-$([guid]::NewGuid().ToString('N').Substring(0, 8))"
$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0)
$listener.Start()
$hostPort = ([System.Net.IPEndPoint]$listener.LocalEndpoint).Port
$listener.Stop()
$previousDatabaseUrl = $env:TEST_DATABASE_URL

try {
    & docker version --format '{{.Server.Version}}' | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw 'Docker doit être démarré pour exécuter les tests PostgreSQL.'
    }

    $portBinding = '127.0.0.1:' + $hostPort + ':5432'
    & docker run --detach --rm --name $containerName --env POSTGRES_PASSWORD=test --publish $portBinding postgres:16 | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw "Impossible de démarrer le conteneur PostgreSQL $containerName."
    }

    $deadline = (Get-Date).AddSeconds(60)
    do {
        & docker exec $containerName pg_isready -U postgres -d postgres | Out-Null
        if ($LASTEXITCODE -eq 0) { break }
        Start-Sleep -Seconds 1
    } while ((Get-Date) -lt $deadline)

    if ($LASTEXITCODE -ne 0) {
        throw "PostgreSQL n'est pas devenu disponible dans le délai imparti."
    }

    $env:TEST_DATABASE_URL = "postgres://postgres:test@127.0.0.1:$hostPort/postgres"
    & npm.cmd --prefix $orchestratorPath run "test:pg:$Suite"
    exit $LASTEXITCODE
}
finally {
    if ($null -eq $previousDatabaseUrl) {
        Remove-Item Env:TEST_DATABASE_URL -ErrorAction SilentlyContinue
    } else {
        $env:TEST_DATABASE_URL = $previousDatabaseUrl
    }
    & docker stop $containerName 2>$null | Out-Null
}
