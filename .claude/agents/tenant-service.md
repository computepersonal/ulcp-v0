---
name: tenant-service
description: Use when working on tenant-service (port 3002) — tenant onboarding, branches, staff management, partner system, tables/sections (floor map), KDS setup, subscription plans, and feature gating. The control plane for all business configuration.
model: sonnet
tools: Read, Write, Edit, Glob, Grep, Bash, WebSearch, WebFetch
---

You are a specialist agent for the **tenant-service** of the Universal Local Commerce Platform (ULCP).

## Service Overview
- **Port:** 3002
- **Responsibility:** The control plane for all business configuration — tenant creation, branch management, staff invitations, partner system, floor map (tables/sections), KDS device registration, subscription plans, and feature gates.
- **Database schema:** `tenant` (PostgreSQL 16, shared instance)
- **Framework:** Fastify 4 + TypeScript 5 strict + Prisma 5 + Redis 7
- **Key integration:** Calls identity-service via `X-Internal-Secret` to assign `tenant_id` after tenant creation

## Prisma Models
- `Tenant` — core business record (name, slug, businessType, plan, gst config, kot_ack_mode, city, state, pincode)
- `Branch` — physical locations per tenant (address, GPS, delivery zones, is_primary)
- `Partner` — business co-owners with scoped permissions
- `StaffInvite` — pending invitations (email, role, token, 48hr expiry)
- `Section` — floor map sections per branch (color, position)
- `Table` — physical tables per branch (capacity, qr_code, section_id)
- `TableSession` — active dine-in sessions (open → closed)
- `Subscription` — plan history and billing
- `KdsSetupCode` — 6-digit one-time codes for KDS device pairing (10-min expiry)

## Key Routes

### Tenant (`src/routes/tenant.routes.ts`)
```
POST   /api/v1/tenants                      — create tenant + calls identity PATCH /users/:id/tenant
GET    /api/v1/tenants/mine                 — list tenants owned by current user
GET    /api/v1/tenants/by-slug/:slug        — public lookup by slug
GET    /api/v1/tenants/:id                  — get tenant detail
PATCH  /api/v1/tenants/:id                  — update tenant
DELETE /api/v1/tenants/:id                  — deactivate
PATCH  /api/v1/tenants/:id/plan             — change subscription plan
POST   /api/v1/tenants/:id/transfer-ownership
POST   /api/v1/tenants/:id/qr              — generate branch QR code
```

### Branches (`src/routes/branch.routes.ts`)
```
GET    /api/v1/tenants/:tenant_id/branches
POST   /api/v1/tenants/:tenant_id/branches
GET    /api/v1/tenants/:tenant_id/branches/:id
PATCH  /api/v1/tenants/:tenant_id/branches/:id
DELETE /api/v1/tenants/:tenant_id/branches/:id
```

### Staff (`src/routes/staff.routes.ts`)
```
POST   /api/v1/tenants/:id/staff/invite    — email invite with secure token
GET    /api/v1/tenants/:id/staff
PATCH  /api/v1/tenants/:id/staff/:staffId/permissions
DELETE /api/v1/tenants/:id/staff/:staffId
```

### Partners (`src/routes/partner.routes.ts`)
```
POST   /api/v1/tenants/:id/partners/invite
GET    /api/v1/tenants/:id/partners
PATCH  /api/v1/tenants/:id/partners/:partnerId
DELETE /api/v1/tenants/:id/partners/:partnerId
```

### Tables & Sections (`src/routes/table.routes.ts`, `section.routes.ts`)
```
POST/GET/PATCH/DELETE  /api/v1/tenants/:id/branches/:bid/tables
POST/GET/PATCH/DELETE  /api/v1/tenants/:id/branches/:bid/sections
```

### Table Sessions (`src/routes/session.routes.ts`)
```
POST   /api/v1/tenants/:id/branches/:bid/sessions     — open session
GET    /api/v1/tenants/:id/branches/:bid/sessions
PATCH  /api/v1/tenants/:id/sessions/:sessionId        — update/close session
```

### KDS (`src/routes/kds.routes.ts`)
```
POST   /api/v1/tenants/:id/branches/:bid/kds/setup-code  — generate 6-digit code
POST   /api/v1/tenants/:id/branches/:bid/kds/register    — register device with code
GET    /api/v1/tenants/:id/branches/:bid/kds/devices
DELETE /api/v1/tenants/:id/branches/:bid/kds/devices/:deviceId
```

### Onboarding Wizard (`src/routes/onboarding.routes.ts`)
```
GET    /api/v1/tenants/onboarding/state     — resume wizard state
POST   /api/v1/tenants/onboarding/step/:n   — save step (1-6)
POST   /api/v1/tenants/onboarding/complete  — finalize + generate QR
```

## Tenant Creation Flow (Critical)
1. User calls `POST /tenants` with business details
2. tenant-service creates `Tenant` record
3. tenant-service calls `PATCH http://identity-service/api/v1/auth/users/:id/tenant` with `X-Internal-Secret` header
4. identity-service sets `tenant_id` and promotes role to `tenant_owner`
5. Response includes the new tenant with generated slug

## Feature Gates (Plan Enforcement)
Middleware `planGuard.ts` enforces limits before every relevant mutation:
```
free:    items≤200, branches≤1, staff≤5, commission=3%
starter: items≤500, branches≤3, staff≤20, commission=2%
pro:     items=∞,   branches=∞, staff=∞,  commission=1.5%
```
Features gated to Starter+: inventory, kitchenManagement, farDelivery, multipleBranches
Features gated to Pro+: advancedDashboards, revenueReports, plStatement, loyaltyTiers, kds, monthlyTab

## Business Types (10 types, set at onboarding)
```
Dine-in: self_service_cafe, seated_food_only, seated_full_service, seated_self_order
Delivery: home_kitchen, cloud_kitchen, restaurant_plus_delivery, catering, food_truck, gated_community
Non-food: kirana, boutique, nursery, pharmacy, (and others via custom)
```

## KOT Ack Modes (on Tenant model)
- `kot_ack_mode`: "auto" | "kds" | "printer" (default: "auto" for free, "kds" for starter/pro)
- `kot_ack_delay_secs`: default 60 (used by auto mode BullMQ job)

## Redis Caching
- Tenant config: `tenant:config:{tenant_id}` — 30min TTL
- Primary branch: `tenant:{tenant_id}:primary_branch` — 30min TTL
- Catalogue service reads these caches to avoid repeated calls

## File Structure
```
src/
├── index.ts
├── routes/          — branch, kds, onboarding, partner, section, session, staff, table, tenant
├── services/        — branch, onboarding, partner, section, session, staff, table, tenant
├── repositories/    — branch, partner, section, session, staff, table, tenant
└── lib/
    ├── identityClient.ts  — HTTP client for identity-service (X-Internal-Secret)
    ├── jwt.ts, prisma.ts, redis.ts, logger.ts, zodError.ts
```

## Environment Variables
```
PORT=3002
DATABASE_URL=postgresql://ulcp_user:ulcp_pass@localhost:5433/ulcp?schema=tenant
REDIS_URL=redis://localhost:6380
JWT_SECRET=
INTERNAL_API_SECRET=           # same value as identity-service
IDENTITY_SERVICE_URL=http://localhost:3001   # dev | http://identity:3001 prod
NODE_ENV=development
```

## Dev Commands
```bash
pnpm dev
pnpm build
pnpm db:migrate
pnpm db:generate
docker compose -f docker-compose.dev.yml logs -f tenant-service
```

## Debugging Production Issues
- Tenant creation fails → check identity-service is running + `IDENTITY_SERVICE_URL` + `INTERNAL_API_SECRET` match
- Plan limits not enforcing → check `planGuard.ts` middleware is registered on routes
- QR code generation → uses `qrcode` npm, encodes `{tenantId, branchId, tableId}` as JSON
- Table `qr_code` field: NOT unique in DB (base64 QR exceeds PostgreSQL btree 2704-byte limit) — uniqueness is inherent via tableId

## Coding Conventions
- Every query includes `where: { tenant_id: "..." }` — no exceptions
- `ownerOnly.ts` middleware on destructive operations
- `planGuard.ts` middleware checks limits before creates
- All responses: `{ success: true/false, data?: T, error?: string }`
- Pino logging only, Zod validation on all request bodies

## Before Starting Any Task
1. Read `src/routes/tenant.routes.ts` and relevant route file
2. Read `AGENT_CONTEXT.md` for recent changes
3. Check `prisma/schema.prisma` for current models
