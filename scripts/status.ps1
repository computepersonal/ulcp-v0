<#
.SYNOPSIS
    Shows which ULCP services and Docker containers are currently running.
#>

function Write-Section($text) {
    Write-Host ""
    Write-Host "=== $text ===" -ForegroundColor Cyan
}
function Write-Ok($text)   { Write-Host "  [up]     $text" -ForegroundColor Green }
function Write-Fail($text) { Write-Host "  [down]   $text" -ForegroundColor Red }
function Write-Ok2($text)  { Write-Host "  [ok]     $text" -ForegroundColor Green }
function Write-Fail2($text){ Write-Host "  [fail]   $text" -ForegroundColor Red }

$services = @(
    @{ Port = 3001; Name = "identity-service" },
    @{ Port = 3002; Name = "tenant-service" },
    @{ Port = 3003; Name = "catalogue-service" },
    @{ Port = 3004; Name = "order-service" },
    @{ Port = 3008; Name = "realtime-service" },
    @{ Port = 8000; Name = "caddy (reverse proxy)" }
)

$apps = @(
    @{ Port = 5173; Name = "web (staff POS)" },
    @{ Port = 5174; Name = "onboarding" },
    @{ Port = 5177; Name = "kds (kitchen display)" }
)

$docker = @(
    @{ Name = "ulcp-postgres"; Label = "PostgreSQL" },
    @{ Name = "ulcp-redis";    Label = "Redis" }
)

# --- Node.js services ---
Write-Section "Node.js Services"

$listeningPorts = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty LocalPort

$upCount = 0
$downCount = 0

foreach ($svc in $services) {
    if ($listeningPorts -contains $svc.Port) {
        Write-Ok   (":{0}  {1}" -f $svc.Port, $svc.Name)
        $upCount++
    } else {
        Write-Fail (":{0}  {1}" -f $svc.Port, $svc.Name)
        $downCount++
    }
}

Write-Host ""
Write-Host ("  {0} up  /  {1} down" -f $upCount, $downCount) -ForegroundColor White

# --- Frontend apps ---
Write-Section "Frontend Apps"

$appUpCount = 0
$appDownCount = 0

foreach ($app in $apps) {
    if ($listeningPorts -contains $app.Port) {
        Write-Ok   (":{0}  {1}" -f $app.Port, $app.Name)
        $appUpCount++
    } else {
        Write-Fail (":{0}  {1}" -f $app.Port, $app.Name)
        $appDownCount++
    }
}

Write-Host ""
Write-Host ("  {0} up  /  {1} down" -f $appUpCount, $appDownCount) -ForegroundColor White

# --- Docker containers ---
Write-Section "Docker Containers"

foreach ($c in $docker) {
    $status = docker inspect --format '{{.State.Status}}' $c.Name 2>$null
    $health = docker inspect --format '{{.State.Health.Status}}' $c.Name 2>$null
    if ($status -eq 'running') {
        Write-Ok2 ("{0}  [{1}]" -f $c.Label, $health)
    } else {
        Write-Fail2 ("{0}  [not running]" -f $c.Label)
    }
}

Write-Host ""
