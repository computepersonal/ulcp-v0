# Universal Local Commerce Platform (ULCP)

Multi-tenant SaaS platform that enables any local business — restaurants, kiranas, boutiques, nurseries, pharmacies, gated communities, food trucks — to go digital with a QR-first approach. Think Shopify + Swiggy + Dunzo combined, hyperlocal, built for small/medium businesses.

This repo is a **pnpm + Turborepo monorepo** containing 15 backend microservices (Fastify + Prisma + PostgreSQL + Redis) and several frontend apps (React + Vite, React Native + Expo).

> Detailed architecture, domain rules, and per-service contracts live in `CLAUDE.md` and `services/*/CLAUDE.md`. This README is a setup guide for getting the project running on a new machine.

---

## Prerequisites

Install the following on the target machine before cloning:

| Tool | Version | Where to get it |
| --- | --- | --- |
| Git | latest | https://git-scm.com/download/win |
| Node.js | **22 LTS** | https://nodejs.org/en/download |
| pnpm | **9+** | After Node: `npm install -g pnpm@9` |
| Docker Desktop | latest | https://www.docker.com/products/docker-desktop/ |

You do **not** need to install PostgreSQL, Redis, TypeScript, Prisma, Turbo, or tsx separately — Docker provides the databases, and the rest install as project dependencies via `pnpm install`.

Verify your install:

```powershell
node --version    # v22.x
pnpm --version    # 9.x
docker --version  # any recent
git --version
```

---

## Quick start (recommended — automated)

```powershell
git clone <repo-url> ulpc
cd ulpc
.\scripts\setup.ps1
pnpm dev
```

`setup.ps1` verifies prerequisites, installs `pnpm` if missing, copies every `services/*/.env.example` to `.env`, brings up Postgres + Redis in Docker, waits for Postgres to be healthy, and runs `prisma db push` for every Prisma-backed service. It's idempotent — safe to re-run.

Flags:
- `-Force` overwrite existing `.env` files from their examples
- `-SkipInstall` skip `pnpm install`
- `-SkipDocker` skip starting Postgres + Redis
- `-SkipDb` skip `prisma db push`

`pnpm dev` runs `turbo dev --concurrency 30`, which spawns the `dev` script in every workspace. Services start on ports 3001–3015; apps start on 5173+.

To stop everything: `Ctrl+C` in the `pnpm dev` terminal, then `docker compose -f docker-compose.yml down` to stop the databases.

### Day-to-day: one-shot start / stop

After setup, `pnpm start` brings up Docker Desktop (if needed), Postgres + Redis, frees stale dev ports, starts every implemented service and app, and prints a health table. Stub packages (delivery/analytics/superadmin services, mobile/superadmin apps) are skipped.

```powershell
pnpm start           # everything
pnpm start -NoApps   # backend only
pnpm start -Setup    # also pnpm install + prisma generate + db push (after pulling schema changes)
pnpm stop            # kill dev processes + stop the containers
```

## Quick start (manual — if you'd rather not run the script)

```powershell
# 1. Clone
git clone <repo-url> ulpc
cd ulpc

# 2. Install all workspace dependencies (services + apps + shared)
pnpm install

# 3. Create each service's .env from its committed .env.example
Get-ChildItem services -Recurse -Filter .env.example | ForEach-Object {
    Copy-Item $_.FullName (Join-Path $_.DirectoryName .env)
}

# 4. Bring up Postgres + Redis in Docker
docker compose -f docker-compose.yml up -d postgres redis

# 5. Push Prisma schemas for every service that has one (first time only)
pnpm --filter @ulcp/identity-service    db:push
pnpm --filter @ulcp/tenant-service      db:push
pnpm --filter @ulcp/catalogue-service   db:push
pnpm --filter @ulcp/order-service       db:push
pnpm --filter @ulcp/inventory-service   db:push
pnpm --filter @ulcp/procurement-service db:push
pnpm --filter @ulcp/jukebox-service     db:push
pnpm --filter @ulcp/loyalty-service     db:push
pnpm --filter @ulcp/ads-service         db:push

# 6. Start everything
pnpm dev
```

---

## Infrastructure ports

Docker Compose maps the dev databases to **non-standard host ports** so they don't collide with local installs:

| Service | Container port | Host port |
| --- | --- | --- |
| PostgreSQL 16 | 5432 | **5433** |
| Redis 7 | 6379 | **6380** |

Credentials (dev only):
- PostgreSQL user / password / db: `ulcp_user` / `ulcp_pass` / `ulcp`
- Each backend service uses its own Postgres schema inside the `ulcp` database (`identity`, `tenant`, `catalogue`, `order_svc`, `inventory`, `procurement`, `jukebox`, `loyalty`, `ads`).

Connection strings:
- `postgresql://ulcp_user:ulcp_pass@localhost:5433/ulcp?schema=<service>`
- `redis://localhost:6380`

---

## Backend services

All services are Fastify + TypeScript + Prisma (where they have a DB). Each runs `dev` via `tsx watch` or `ts-node-dev`.

| Port | Service | Has DB | Purpose |
| ---- | ------- | ------ | ------- |
| 3001 | identity-service     | yes | Staff auth, customer OTP, JWT, RBAC, KDS device registration |
| 3002 | tenant-service       | yes | Tenants, branches, staff, partners, onboarding, tables/sections |
| 3003 | catalogue-service    | yes | Sections, items, variants, addons, combos, recipes, search |
| 3004 | order-service        | yes | Orders, KOT routing, billing, GST, payments, commission |
| 3005 | inventory-service    | yes | Ingredients, stock movements, recipe deduction, alerts |
| 3006 | delivery-service     | yes | Near / far / community / scheduled delivery |
| 3007 | notification-service | no  | SMS, WhatsApp, push, email (BullMQ queue, dev mode logs to console) |
| 3008 | realtime-service     | no  | Socket.io server, Redis pub/sub bridge |
| 3009 | analytics-service    | yes | P&L, reports, dashboards (Pro+ feature gates) |
| 3010 | media-service        | no  | Image upload, Sharp + WebP, local volume in dev / R2 in prod |
| 3011 | loyalty-service      | yes | Loyalty points, tiers, offers, coupons, wishlist, saved places |
| 3012 | superadmin-service   | yes | Platform-wide management, commission settlement |
| 3013 | procurement-service  | yes | Vendor management, bid requests, purchase orders |
| 3014 | jukebox-service      | yes | Venue music queue, song requests, jukebox config |
| 3015 | ads-service          | yes | Ad campaigns, placement engine, venue revenue |

---

## Frontend apps

Vite dev server auto-picks the next free port starting at 5173.

| App | Stack | Purpose |
| --- | --- | --- |
| apps/web                | React 19 + Vite + Tailwind + RTK | Staff POS (floor map, orders, catalogue, settings) |
| apps/customer-web       | React + Vite + Tailwind + Redux | Customer PWA (QR catalogue, cart, checkout) |
| apps/customer-pwa       | React + Vite | Alternate customer entry point |
| apps/kds                | React + Vite (minimal, no Redux) | Kitchen Display System, Socket.io live |
| apps/superadmin         | React + Vite | Platform admin panel |
| apps/merchant-dashboard | React + Vite | Merchant-facing analytics |
| apps/vendor-portal      | React + Vite | Procurement vendor portal |
| apps/jukebox-player     | React + Vite | Jukebox in-venue player |
| apps/mobile             | Expo Bare Workflow | Staff mobile app |
| apps/customer-mobile    | Expo Bare Workflow | Customer mobile app |

For the mobile apps you'll additionally need the Expo tooling — see https://docs.expo.dev/get-started/installation/.

---

## Environment files

`.env` files are **gitignored**. Every runnable service has a committed `.env.example` next to it (`services/<svc>/.env.example`) with dev defaults that match `docker-compose.yml`'s host-port mapping (Postgres 5433, Redis 6380).

`setup.ps1` copies every example to `.env` automatically (skipping any `.env` that already exists; use `-Force` to overwrite). To do it by hand:

```powershell
Get-ChildItem services -Recurse -Filter .env.example | ForEach-Object {
    Copy-Item $_.FullName (Join-Path $_.DirectoryName .env)
}
```

> All committed values are **dev-only weak secrets** (`dev_jwt_secret_must_be_32_chars_long!!` etc.). Replace them before deploying anywhere outside your laptop.

> `analytics-service`, `delivery-service`, and `superadmin-service` are scaffolds at the moment (no `src/`, no Prisma schema, no `.env.example`). When they get built out, copy the closest service's `.env.example`, change `PORT` and the `DATABASE_URL` schema name, and set the cross-service URLs they import.

---

## Common commands

```powershell
# Install / refresh deps
pnpm install

# Bring infra up / down
docker compose -f docker-compose.yml up -d postgres redis
docker compose -f docker-compose.yml down

# Start everything
pnpm dev

# Start just one service
pnpm --filter @ulcp/identity-service dev

# Start just one app
pnpm --filter @ulcp/web dev

# Build / lint / test the whole repo
pnpm build
pnpm lint
pnpm test

# Prisma operations (per service)
pnpm --filter @ulcp/identity-service db:push       # sync schema to DB (dev)
pnpm --filter @ulcp/identity-service db:studio     # open Prisma Studio
pnpm --filter @ulcp/identity-service db:generate   # regenerate client
```

---

## Repo layout

```
ulpc/
├── CLAUDE.md                  # architecture reference (start here for deep context)
├── docs/
│   ├── BOOTSTRAP.md           # original Claude-Code build guide
│   ├── BUILD_ORDER.md         # phase-by-phase build sequence
│   ├── CHANGELOG.md           # full project history
│   └── prd/                   # per-service PRDs
├── docker-compose.yml     # Postgres + Redis + containerized service builds
├── docker-compose.prod.yml    # production compose (Kong gateway etc.)
├── kong.yml                   # API gateway declarative config
├── turbo.json
├── pnpm-workspace.yaml
├── scripts/
│   └── setup.ps1              # one-shot dev environment setup (Windows)
├── services/                  # 15 Fastify microservices (see table above)
├── packages/
│   └── shared/                # shared types, errors, constants, utils, eventBus
└── apps/                      # React/Expo frontends (see table above)
```

Each service follows the same structure:

```
services/<svc>/
├── CLAUDE.md         # domain context for this service
├── AGENT_CONTEXT.md  # quick-reference for AI agents
├── Dockerfile
├── package.json
├── tsconfig.json
├── prisma/
│   └── schema.prisma
└── src/
    ├── index.ts         # Fastify bootstrap
    ├── routes/          # HTTP handlers (thin)
    ├── services/        # business logic
    ├── repositories/    # Prisma queries
    ├── middleware/      # auth, tenant guard
    └── lib/             # logger, prisma, redis, jwt
```

---

## Troubleshooting

**`pnpm install` fails on `bcrypt` or `@prisma/client` build step**
Those packages have native build steps; they're allowlisted in the root `package.json` under `pnpm.onlyBuiltDependencies`. If install still fails, ensure you're on Node 22 (`node --version`) and re-run `pnpm install`.

**Service starts but immediately errors with `ECONNREFUSED ::1:5433`**
Postgres isn't up. Run `docker compose -f docker-compose.yml up -d postgres redis` and confirm with `docker ps`.

**Service starts but errors with `P2021: table does not exist`**
You skipped `prisma db push` for that service. Run `pnpm --filter @ulcp/<svc> db:push`.

**Port already in use on 5433 or 6380**
You have native Postgres/Redis running on those ports. Either stop them, or change the host port in `docker-compose.yml` and update every service's `.env` accordingly.

**Tenant onboarding fails because identity-service can't reach tenant-service (or vice versa)**
Both services must be running. Confirm with `curl http://localhost:3001/health` and `http://localhost:3002/health`. Internal service-to-service calls require the matching `INTERNAL_API_SECRET` in both `.env` files.

**Docker Desktop on Windows says "engine not running"**
Open Docker Desktop and wait for the whale icon to stabilize before re-running `docker compose ...`.

**Catalogue API returns stale data**
Catalogue is cached in Redis for 5 min (`CATALOGUE_CACHE_TTL_SECS`). Either wait it out, or `docker compose exec redis redis-cli FLUSHDB`.

---

## Next reading

- `CLAUDE.md` — full architecture, plan tiers, commission system, conventions
- `services/<svc>/CLAUDE.md` — domain rules for each service
- `apps/CLAUDE.md` — shared design system + state management for frontends
- `docs/CHANGELOG.md` — what shipped when
- `docs/BUILD_ORDER.md` — original phase-by-phase build plan
