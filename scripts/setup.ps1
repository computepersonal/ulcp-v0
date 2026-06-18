<#
.SYNOPSIS
    One-shot dev-environment setup for the ULCP monorepo on Windows.

.DESCRIPTION
    Verifies prerequisites (git, node 22+, docker), installs pnpm if missing,
    bootstraps every service's .env from its .env.example, brings up Postgres
    and Redis via Docker Compose, waits for Postgres to be healthy, then runs
    `prisma db push` for every Prisma-backed service.

    After this script completes successfully, you can run `pnpm dev`.

.PARAMETER Force
    Overwrite existing .env files from their .env.example counterparts.
    Without this flag, existing .env files are left untouched.

.PARAMETER SkipInstall
    Skip `pnpm install`.

.PARAMETER SkipDocker
    Skip starting Postgres + Redis containers.

.PARAMETER SkipDb
    Skip running `prisma db push` for each service.

.EXAMPLE
    .\scripts\setup.ps1
    Full setup, leaving existing .env files alone.

.EXAMPLE
    .\scripts\setup.ps1 -Force
    Full setup, regenerating every .env from its .env.example.
#>

[CmdletBinding()]
param(
    [switch]$Force,
    [switch]$SkipInstall,
    [switch]$SkipDocker,
    [switch]$SkipDb
)

$ErrorActionPreference = 'Stop'

# Resolve repo root from this script's location (scripts/ lives at repo root).
$RepoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $RepoRoot

function Write-Section($text) {
    Write-Host ""
    Write-Host "=== $text ===" -ForegroundColor Cyan
}

function Write-Ok($text)    { Write-Host "  [ok]   $text" -ForegroundColor Green }
function Write-Skip($text)  { Write-Host "  [skip] $text" -ForegroundColor DarkGray }
function Write-Warn($text)  { Write-Host "  [warn] $text" -ForegroundColor Yellow }
function Write-Fail($text)  { Write-Host "  [fail] $text" -ForegroundColor Red }

function Test-Tool($name) {
    return [bool](Get-Command $name -ErrorAction SilentlyContinue)
}

# ---------------------------------------------------------------------------
# 1. Prerequisite checks
# ---------------------------------------------------------------------------

Write-Section "Checking prerequisites"

$missing = @()

if (Test-Tool git) {
    Write-Ok ("git    -> " + (git --version))
} else {
    Write-Fail "git not found. Install from https://git-scm.com/download/win"
    $missing += 'git'
}

if (Test-Tool node) {
    $nodeVersion = (node --version).TrimStart('v')
    $major = [int]($nodeVersion.Split('.')[0])
    if ($major -lt 22) {
        Write-Fail "node $nodeVersion found, but >= 22 is required. Install Node 22 LTS from https://nodejs.org"
        $missing += 'node22'
    } else {
        Write-Ok "node   -> v$nodeVersion"
    }
} else {
    Write-Fail "node not found. Install Node 22 LTS from https://nodejs.org"
    $missing += 'node'
}

if (Test-Tool docker) {
    Write-Ok ("docker -> " + ((docker --version) -replace 'Docker version ',''))
    try {
        docker info --format '{{.ServerVersion}}' *>$null
        if ($LASTEXITCODE -ne 0) { throw "engine down" }
        Write-Ok "docker engine is running"
    } catch {
        Write-Fail "docker is installed but the engine is not running. Open Docker Desktop and wait for the whale icon to settle, then re-run this script."
        $missing += 'docker-engine'
    }
} else {
    Write-Fail "docker not found. Install Docker Desktop from https://www.docker.com/products/docker-desktop/"
    $missing += 'docker'
}

if ($missing.Count -gt 0) {
    Write-Host ""
    Write-Host "Prerequisites missing. Resolve the items above and re-run setup.ps1." -ForegroundColor Red
    exit 1
}

# ---------------------------------------------------------------------------
# 2. pnpm (install if missing)
# ---------------------------------------------------------------------------

Write-Section "pnpm"

if (Test-Tool pnpm) {
    $pnpmVersion = (pnpm --version)
    $pnpmMajor = [int]($pnpmVersion.Split('.')[0])
    if ($pnpmMajor -lt 9) {
        Write-Warn "pnpm $pnpmVersion found, but >= 9 is required. Upgrading..."
        npm install -g pnpm@9
        if ($LASTEXITCODE -ne 0) { Write-Fail "pnpm upgrade failed"; exit 1 }
        Write-Ok "pnpm upgraded to $((pnpm --version))"
    } else {
        Write-Ok "pnpm   -> $pnpmVersion"
    }
} else {
    Write-Host "  installing pnpm@9 via npm..."
    npm install -g pnpm@9
    if ($LASTEXITCODE -ne 0) {
        Write-Fail "npm install -g pnpm@9 failed"
        exit 1
    }
    if (-not (Test-Tool pnpm)) {
        Write-Fail "pnpm installed but is not on PATH in this shell. Open a new PowerShell window and re-run setup.ps1."
        exit 1
    }
    Write-Ok "pnpm installed -> $((pnpm --version))"
}

# ---------------------------------------------------------------------------
# 3. Bootstrap .env files from .env.example
# ---------------------------------------------------------------------------

Write-Section "Bootstrapping service .env files"

$envExamples = Get-ChildItem -Path (Join-Path $RepoRoot 'services') -Recurse -Filter '.env.example' -File

if ($envExamples.Count -eq 0) {
    Write-Warn "No .env.example files found under services/. Skipping."
} else {
    foreach ($example in $envExamples) {
        $envPath = Join-Path $example.DirectoryName '.env'
        $serviceName = Split-Path -Leaf $example.DirectoryName
        if ((Test-Path $envPath) -and -not $Force) {
            Write-Skip "$serviceName  (.env already exists; use -Force to overwrite)"
        } else {
            Copy-Item -Path $example.FullName -Destination $envPath -Force
            Write-Ok "$serviceName  ->  .env"
        }
    }
}

# ---------------------------------------------------------------------------
# 4. pnpm install
# ---------------------------------------------------------------------------

if ($SkipInstall) {
    Write-Section "pnpm install (skipped)"
} else {
    Write-Section "pnpm install (this can take a few minutes on first run)"
    pnpm install
    if ($LASTEXITCODE -ne 0) {
        Write-Fail "pnpm install failed"
        exit 1
    }
    Write-Ok "dependencies installed"
}

# ---------------------------------------------------------------------------
# 5. Docker: Postgres + Redis
# ---------------------------------------------------------------------------

if ($SkipDocker) {
    Write-Section "Docker infra (skipped)"
} else {
    Write-Section "Starting Postgres + Redis"
    docker compose -f docker-compose.dev.yml up -d postgres redis
    if ($LASTEXITCODE -ne 0) {
        Write-Fail "docker compose up failed"
        exit 1
    }

    Write-Host "  waiting for postgres to become healthy..." -NoNewline
    $deadline = (Get-Date).AddSeconds(60)
    $healthy = $false
    while ((Get-Date) -lt $deadline) {
        $status = docker inspect --format '{{.State.Health.Status}}' ulcp-postgres 2>$null
        if ($status -eq 'healthy') { $healthy = $true; break }
        Start-Sleep -Seconds 2
        Write-Host "." -NoNewline
    }
    Write-Host ""
    if ($healthy) {
        Write-Ok "postgres ready on localhost:5433"
        Write-Ok "redis    ready on localhost:6380"
    } else {
        Write-Fail "postgres did not become healthy within 60s. Check: docker logs ulcp-postgres"
        exit 1
    }
}

# ---------------------------------------------------------------------------
# 6. Prisma db push for every service with a schema
# ---------------------------------------------------------------------------

if ($SkipDb) {
    Write-Section "Prisma db push (skipped)"
} else {
    Write-Section "Syncing Prisma schemas to Postgres"

    $prismaServices = Get-ChildItem -Path (Join-Path $RepoRoot 'services') -Directory | Where-Object {
        Test-Path (Join-Path $_.FullName 'prisma\schema.prisma')
    }

    foreach ($svc in $prismaServices) {
        $svcName = $svc.Name
        Write-Host "  $svcName ... " -NoNewline
        pnpm --filter "@ulcp/$svcName" db:push 2>&1 | Out-Null
        if ($LASTEXITCODE -eq 0) {
            Write-Host "ok" -ForegroundColor Green
        } else {
            Write-Host "FAILED" -ForegroundColor Red
            Write-Warn "    re-run manually for details: pnpm --filter @ulcp/$svcName db:push"
        }
    }
}

# ---------------------------------------------------------------------------
# Done
# ---------------------------------------------------------------------------

Write-Section "Setup complete"
Write-Host ""
Write-Host "Next steps:" -ForegroundColor White
Write-Host "  1. Start everything:    " -NoNewline; Write-Host "pnpm dev" -ForegroundColor Yellow
Write-Host "  2. Start one service:   " -NoNewline; Write-Host "pnpm --filter @ulcp/identity-service dev" -ForegroundColor Yellow
Write-Host "  3. Start one app:       " -NoNewline; Write-Host "pnpm --filter @ulcp/web dev" -ForegroundColor Yellow
Write-Host "  4. Stop containers:     " -NoNewline; Write-Host "docker compose -f docker-compose.dev.yml down" -ForegroundColor Yellow
Write-Host ""
