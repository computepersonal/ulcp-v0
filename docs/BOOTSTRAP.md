# ULCP — Claude Code Bootstrap Guide

> Use this guide to build the entire project from scratch using Claude Code + your API key.
> No manual file creation needed. Claude Code reads CLAUDE.md and does everything.

---

## Prerequisites (one-time, manual)

Install these before using Claude Code:

```bash
# 1. Node.js 22 (via nvm — recommended)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
nvm install 22 && nvm use 22

# 2. pnpm
npm install -g pnpm

# 3. Claude Code
npm install -g @anthropic/claude-code

# 4. Docker Desktop
# Download from: https://www.docker.com/products/docker-desktop/
# Install and launch it. Verify with: docker --version
```

---

## Set Your API Key

```bash
# macOS / Linux
export ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxxxxxx

# Windows (PowerShell)
$env:ANTHROPIC_API_KEY="sk-ant-xxxxxxxxxxxxxxxx"
```

---

## First Time — Project Bootstrap

```bash
mkdir -p ~/Projects/ulcp
cd ~/Projects/ulcp
claude
```

Once inside Claude Code, paste this prompt:

```
Read CLAUDE.md fully.

Bootstrap Phase 1 of the Universal Local Commerce Platform:

1. Create the full monorepo folder structure (services/, packages/, apps/, infra/)
2. Create root config files: pnpm-workspace.yaml, turbo.json, package.json, .gitignore
3. Build packages/shared with: types, errors, constants, utils, and appConfig (configurable via env)
4. Build services/identity-service completely:
   - package.json, tsconfig.json, .env
   - Prisma schema (User + RefreshToken models)
   - src/lib: logger (Pino), prisma client, redis (ioredis), jwt helpers
   - src/middleware: authenticate.ts (JWT guard)
   - src/routes: auth.routes.ts (register, login, refresh, logout, /me)
   - src/index.ts: Fastify app with helmet, cors, rate-limit
5. Create docker-compose.yml with postgres:16-alpine and redis:7-alpine
6. Run: pnpm install
7. Start Docker databases: docker compose -f docker-compose.yml up -d postgres redis
8. Run Prisma migration (name it "init")
9. Start the identity service and confirm it is running on port 3001
10. Test /health endpoint and show the response

Follow all conventions in CLAUDE.md. Use TypeScript strict mode. No any types.
App name must come from appConfig (env: APP_NAME), not hardcoded.
```

---

## Starting Each New Session

```bash
cd ~/Projects/ulcp
claude
```

Then paste:

```
Read CLAUDE.md and PROGRESS.md.
Tell me what's already built and what's next.
Then let's continue with [Phase X / feature name].
```

---

## Phase-by-Phase Prompts

### Phase 1 — Foundation (monorepo + identity-service)

```
Read CLAUDE.md fully. Build Phase 1:
- Monorepo: pnpm workspaces + Turborepo
- packages/shared: types, errors, constants, utils, appConfig (env-driven)
- docker-compose.yml: postgres:16 + redis:7
- services/identity-service: Fastify + Prisma + JWT + bcrypt + Redis refresh tokens
  Routes: POST /register /login /refresh /logout GET /me
- Start Postgres + Redis via Docker
- Run prisma migrate (name: init)
- Start the service, test /health
All TypeScript strict. Follow CLAUDE.md conventions.
```

### Phase 2 — Core Commerce

```
Read CLAUDE.md, PROGRESS.md, and services/tenant-service/CLAUDE.md. Build Phase 2:

1. services/tenant-service (port 3002):
   - Tenant onboarding wizard (6 steps, save state at each)
   - Business types (all 10 from tenant-service/CLAUDE.md)
   - Branch management, staff invite (email + SMS)
   - QR code generation per table/branch (qrcode npm)
   - Plan enforcement middleware (check PLAN_ITEM_LIMITS etc)
   - Subscription model (free/starter/pro)
   - All multi-tenant: every query scoped to tenantId

2. services/catalogue-service (port 3003):
   - Sections + items CRUD
   - Variants, modifiers, bundles, recipes
   - Item toggle (available/unavailable), sold-out
   - Drag-and-drop order (via position field)
   - Redis cache (CATALOGUE_CACHE_TTL_SECS = 300)
   - Cache invalidation on any update (Cloudflare + Redis)
   - Full-text search (PostgreSQL tsvector + GIN index)
   - Plan limit enforcement (PLAN_ITEM_LIMITS)

3. services/order-service (port 3004):
   - Order lifecycle state machine
   - KOT generation + auto-split (food vs drink by business type)
   - Billing: subtotal, GST, discount, loyalty redemption, tips
   - Commission calculation on completion (COMMISSION_RATES)
   - Razorpay Route integration for auto commission split
   - Table session management
   - Redis events for real-time updates

Add each service to docker-compose.yml.
Follow all CLAUDE.md conventions. TypeScript strict.
```

### Phase 3 — Payments & Notifications

```
Read CLAUDE.md, PROGRESS.md, and services/notification-service/CLAUDE.md. Build Phase 3:

1. services/notification-service (port 3007):
   - MSG91 for OTP SMS
   - Interakt for WhatsApp (order confirmed, ready, delivered)
   - Firebase FCM for push notifications
   - SendGrid for email (welcome, order receipt)
   - BullMQ queue (Redis): retry failed notifications 3x with backoff
   - Fire-and-forget pattern: never block order flow
   - OTP: SHA-256 hash stored, 5 min TTL, 5 attempts max, one-time use

Follow CLAUDE.md security rules. TypeScript strict.
```

### Phase 4 — Frontends

```
Read CLAUDE.md, PROGRESS.md, apps/CLAUDE.md, apps/web/CLAUDE.md, apps/customer-web/CLAUDE.md. Build Phase 4:

1. apps/web — Staff POS (React 18 + Vite + Tailwind + Redux Toolkit + RTK Query)
   (screen specs in apps/web/CLAUDE.md)

2. apps/customer-web — Customer PWA (React 18 + Vite + Tailwind + Redux)
   (screen specs in apps/customer-web/CLAUDE.md)

3. apps/kds — Kitchen Display System (React + Vite, minimal, no Redux)
   - Live order cards by KOT, item status toggle, Socket.io real-time, full-screen TV

Design system: Indigo primary, Inter + JetBrains Mono, dark mode.
Use shadcn/ui + Radix UI + Lucide React.
```

### Phase 5 — Analytics, Delivery, Loyalty

```
Read CLAUDE.md, PROGRESS.md, and the relevant service CLAUDE.md files. Build Phase 5:

1. services/analytics-service (port 3009) — see services/analytics-service/CLAUDE.md
2. services/delivery-service (port 3006) — see services/delivery-service/CLAUDE.md
3. services/loyalty-service (port 3011) — see services/loyalty-service/CLAUDE.md

TypeScript strict. Follow CLAUDE.md conventions.
```

### Phase 6 — Production Infrastructure

```
Read CLAUDE.md and PROGRESS.md. Build Phase 6:

1. docker-compose.prod.yml (all services + Kong + PostgreSQL + Redis)
2. Dockerfile for each service (FROM node:22-alpine, multi-stage build)
3. Kong API Gateway: kong.yml declarative config, all routes, JWT + rate limiting plugins
4. GitHub Actions CI/CD: ci.yml (lint+test on PR), deploy.yml (build+push+deploy on main)
5. Hetzner setup scripts: server-init.sh, deploy.sh
6. Health check endpoints on all services (/health)

TypeScript strict. Follow CLAUDE.md conventions.
```

### Add a New Feature (any time)

```
Read CLAUDE.md and PROGRESS.md.
Also read the CLAUDE.md for each affected service.

Add: [describe the feature clearly]

Service(s) affected: [list them]
New models needed: [describe]
New routes needed: [list endpoints]
Frontend changes: [describe UI changes]

Follow all CLAUDE.md conventions.
After building, update PROGRESS.md.
```

---

## PROGRESS.md — Keep This Updated

After each phase, ask Claude Code:

```
Update PROGRESS.md with what we just built.
Mark Phase X as complete.
List what's left and what's next.
```

---

## Useful Claude Code Commands

```bash
claude                              # start a session
claude --continue                   # continue last session
claude --dangerously-skip-permissions  # fewer prompts
```

## Service Slash Commands

Use these to jump directly into a service agent:

```
/identity    /tenant     /catalogue   /order
/inventory   /delivery   /notification /realtime
/analytics   /media      /loyalty     /superadmin
/procurement /jukebox    /ads
```

---

## Tips for Best Results

| Tip | Why |
| --- | --- |
| Always start with "Read CLAUDE.md and PROGRESS.md" | Grounds Claude in your full architecture |
| For service work, also read the service CLAUDE.md | Full domain context without loading everything |
| One phase at a time | Keeps context focused, avoids mistakes |
| Update PROGRESS.md after each phase | Next session starts with accurate context |
| Use /identity, /order etc. slash commands | Jumps directly into the right service agent |
