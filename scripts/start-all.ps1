# ULCP - start everything for local dev in one shot.
#
#   pnpm start               # infra + all built services + all built apps
#   pnpm start -Setup        # also pnpm install + prisma generate/db push first (after pulls / schema changes)
#   pnpm start -NoApps       # backend only
#   pnpm stop                # kill dev processes + stop postgres/redis containers
#
# Brand-new machine? Run scripts/setup.ps1 once first (prereqs, .env files from .env.example).
#
# Steps: Docker Desktop -> postgres(5433)/redis(6380) containers -> free dev ports ->
#        turbo dev (filtered to packages that actually have code) -> health table.

param(
  [switch]$Setup,
  [switch]$NoApps,
  [switch]$Stop
)

# 'Continue', not 'Stop': in PS 5.1 any stderr from native exes (docker compose progress, etc.)
# becomes a terminating error under 'Stop'. Failures are checked via $LASTEXITCODE instead.
$ErrorActionPreference = 'Continue'
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root
$Compose = Join-Path $Root 'docker-compose.yml'

# V0 production scope only (see docs/V0_PRODUCTION.md): 6 services + 4 apps.
$Services = [ordered]@{
  'identity-service'     = 3001
  'tenant-service'       = 3002
  'catalogue-service'    = 3003
  'order-service'        = 3004
  'notification-service' = 3007
  'realtime-service'     = 3008
}
$Apps = [ordered]@{
  'web'            = 5173
  'onboarding'     = 5174
  'kds'            = 5177
  'customer-web'   = 5180
}
$PrismaServices = @('identity-service','tenant-service','catalogue-service','order-service')

function Write-Step($msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }

function Stop-PortListeners([int[]]$ports) {
  $conns = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
           Where-Object { $ports -contains $_.LocalPort }
  $pids = $conns | Select-Object -ExpandProperty OwningProcess -Unique | Where-Object { $_ -gt 4 }
  foreach ($procId in $pids) {
    $p = Get-Process -Id $procId -ErrorAction SilentlyContinue
    if ($p -and $p.ProcessName -notmatch 'docker|com.docker|wslrelay|vpnkit') {
      Write-Host "    killing $($p.ProcessName) (PID $procId)"
      Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
    }
  }
}

function Test-DockerEngine {
  & docker info *> $null
  return ($LASTEXITCODE -eq 0)
}

$AllPorts = @($Services.Values) + @($Apps.Values)

# ---------------------------------------------------------------- stop
if ($Stop) {
  Write-Step 'Stopping dev processes on service/app ports'
  Stop-PortListeners $AllPorts
  if (Test-DockerEngine) {
    Write-Step 'Stopping postgres + redis containers'
    & docker compose -f $Compose stop postgres redis
  }
  Write-Host "`nStopped." -ForegroundColor Green
  exit 0
}

# ---------------------------------------------------------------- docker
Write-Step 'Checking Docker'
if (-not (Test-DockerEngine)) {
  # Windows hides the firmware flag once a hypervisor is running, so only both-false means "off".
  $cpu = Get-CimInstance Win32_Processor | Select-Object -First 1
  $hv = (Get-CimInstance Win32_ComputerSystem).HypervisorPresent
  if (-not $cpu.VirtualizationFirmwareEnabled -and -not $hv) {
    throw 'CPU virtualization (Intel VT-x / AMD SVM) is disabled in BIOS/UEFI - Docker Desktop cannot start its VM. Enable it in BIOS, reboot, and re-run.'
  }
  $dockerDesktop = 'C:\Program Files\Docker\Docker\Docker Desktop.exe'
  if (-not (Test-Path $dockerDesktop)) { throw "Docker engine not running and Docker Desktop not found at $dockerDesktop" }
  Write-Host '    starting Docker Desktop...'
  Start-Process $dockerDesktop
  $deadline = (Get-Date).AddSeconds(180)
  while (-not (Test-DockerEngine)) {
    if ((Get-Date) -gt $deadline) { throw 'Docker engine did not come up within 180s' }
    Start-Sleep -Seconds 3
  }
}
Write-Host '    docker engine ready'

Write-Step 'Starting postgres (5433) + redis (6380)'
& docker compose -f $Compose up -d postgres redis
if ($LASTEXITCODE -ne 0) { throw 'docker compose up failed' }

foreach ($c in @('ulcp-postgres', 'ulcp-redis')) {
  $deadline = (Get-Date).AddSeconds(90)
  do {
    $health = (& docker inspect -f '{{.State.Health.Status}}' $c 2>$null)
    if ($health -eq 'healthy') { break }
    if ((Get-Date) -gt $deadline) { throw "$c not healthy after 90s (status: $health)" }
    Start-Sleep -Seconds 2
  } while ($true)
  Write-Host "    $c healthy"
}

# ---------------------------------------------------------------- setup (optional)
if ($Setup) {
  Write-Step 'pnpm install'
  & pnpm install
  if ($LASTEXITCODE -ne 0) { throw 'pnpm install failed' }

  # Must run before services start - a running service locks the Prisma query engine DLL on Windows.
  Stop-PortListeners @($Services.Values)
  foreach ($svc in $PrismaServices) {
    Write-Step "prisma generate + db push: $svc"
    & pnpm --filter "@ulcp/$svc" db:generate
    if ($LASTEXITCODE -ne 0) { throw "db:generate failed for $svc" }
    & pnpm --filter "@ulcp/$svc" db:push
    if ($LASTEXITCODE -ne 0) { Write-Warning "db:push failed for $svc (possible data-loss prompt) - run it manually" }
  }
}

# ---------------------------------------------------------------- free ports
Write-Step 'Freeing service/app ports (old dev processes)'
Stop-PortListeners $AllPorts

# ---------------------------------------------------------------- turbo dev
$filters = @('--filter=@ulcp/shared')
foreach ($s in $Services.Keys) { $filters += "--filter=@ulcp/$s" }
if (-not $NoApps) { foreach ($a in $Apps.Keys) { $filters += "--filter=@ulcp/$a" } }

Write-Step "Starting $($filters.Count) packages via turbo (Ctrl+C to stop all)"
$turboArgs = @('exec', 'turbo', 'dev', '--concurrency', '30', '--continue') + $filters
$turbo = Start-Process -FilePath 'pnpm.cmd' -ArgumentList $turboArgs -NoNewWindow -PassThru

# ---------------------------------------------------------------- health table
$deadline = (Get-Date).AddSeconds(300)  # first cold start with tsx can take 3-4 min
$pending = @{}
foreach ($k in $Services.Keys) { $pending[$k] = $Services[$k] }
while ($pending.Count -gt 0 -and (Get-Date) -lt $deadline -and -not $turbo.HasExited) {
  Start-Sleep -Seconds 3
  foreach ($k in @($pending.Keys)) {
    try {
      Invoke-WebRequest -Uri "http://localhost:$($pending[$k])/health" -UseBasicParsing -TimeoutSec 2 | Out-Null
      $pending.Remove($k)
    } catch { }
  }
}

$listening = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
             Select-Object -ExpandProperty LocalPort -Unique
Write-Host "`n================ ULCP status ================" -ForegroundColor Cyan
foreach ($k in $Services.Keys) {
  $ok = -not $pending.ContainsKey($k)
  $label = if ($ok) { 'UP  ' } else { 'DOWN' }
  $color = if ($ok) { 'Green' } else { 'Red' }
  Write-Host ("  [{0}] {1,-22} http://localhost:{2}" -f $label, $k, $Services[$k]) -ForegroundColor $color
}
if (-not $NoApps) {
  foreach ($k in $Apps.Keys) {
    $ok = $listening -contains $Apps[$k]
    $label = if ($ok) { 'UP  ' } else { '... ' }
    $color = if ($ok) { 'Green' } else { 'Yellow' }
    Write-Host ("  [{0}] {1,-22} http://localhost:{2}" -f $label, $k, $Apps[$k]) -ForegroundColor $color
  }
}
Write-Host '  postgres localhost:5433 | redis localhost:6380' -ForegroundColor DarkGray
Write-Host "=============================================`n" -ForegroundColor Cyan

Wait-Process -Id $turbo.Id
