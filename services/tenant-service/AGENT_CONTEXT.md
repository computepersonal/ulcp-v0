# tenant-service — Agent Context

> This file is the living knowledge base for the tenant-service agent.
> Update this file whenever routes, models, or behavior changes.
> Last updated: 2026-04-16

## Current Implementation Status
**FULLY IMPLEMENTED**

## What's Built
- Tenant CRUD (create, read, update, deactivate)
- Tenant creation calls identity-service PATCH /users/:id/tenant via X-Internal-Secret (assigns tenant_id, promotes role to tenant_owner)
- Branch management (create, list, update, deactivate, is_primary tracking)
- Staff invitations (email invite with secure token, 48hr expiry)
- Partner system (invite, accept, update permissions)
- 6-step onboarding wizard with state persistence (resume anytime)
- Post-onboarding checklist (7 tasks → 30-day Starter trial reward)
- Table management per branch (CRUD, QR code generation as base64 data URL)
- Floor map sections (CRUD per branch, color + position)
- Table sessions (open/close dine-in sessions)
- KDS device setup codes (6-digit, 10-min expiry) + device registration
- Plan enforcement middleware (planGuard)
- Subscription model (free/starter/pro)

## Prisma Models (current)
- Tenant (includes: city, state, pincode, kot_ack_mode, kot_ack_delay_secs)
- Branch
- Partner, StaffInvite
- Section, Table, TableSession
- Subscription, KdsSetupCode

## Tenant Model Key Fields
```
kot_ack_mode: "auto" | "kds" | "printer"  (default: "auto")
kot_ack_delay_secs: Int                    (default: 60)
business_type: String                      (all 10 types + non-food types)
gst: Json (isRegistered, gstin, stateCode, defaultRate)
plan: String
```

## Known Issues / Gotchas
- Table.qr_code is **NOT unique** in DB — uniqueness is inherent (QR encodes unique table ID). Base64 QR string too large for PostgreSQL btree index.
- tenant_id is **NEVER typed by user** — always system-generated
- IDENTITY_SERVICE_URL must be set in .env for internal calls to work

## Recent Changes
- 2026-03-19: Tenant creation redesigned — calls identity-service PATCH /users/:id/tenant
- 2026-03-26: Tenant model extended: city, state, pincode fields
- 2026-03-26: Table + Section models added (floor map)
- 2026-03-26: Table.qr_code @unique removed (PostgreSQL btree 2704-byte limit)
- 2026-03-28: Tenant model extended: kot_ack_mode + kot_ack_delay_secs
- 2026-04-16: AGENT_CONTEXT.md updated with full platform service list

## Environment
- Dev port: 3002
- DB schema: tenant
- Calls identity-service at: IDENTITY_SERVICE_URL (default: http://localhost:3001)
- INTERNAL_API_SECRET must match identity-service

## How to Run Locally
```bash
cd services/tenant-service
pnpm dev
# Health: GET http://localhost:3002/health
# Swagger: http://localhost:3002/docs
```

## How to Deploy
```bash
docker compose -f docker-compose.dev.yml up tenant-service
docker compose -f docker-compose.dev.yml logs -f tenant-service
```

## Dependencies on Other Services
- **identity-service** (internal) — called after tenant creation to assign tenant_id to user
- **order-service** — reads kot_ack_mode from this service (cached 30min)
- **catalogue-service** — reads primary branch_id from this service (cached 30min)

## Full Platform — 15 Services Reference
```
identity    (3001), tenant     (3002), catalogue  (3003), order      (3004)
inventory   (3005), delivery   (3006), notification(3007), realtime  (3008)
analytics   (3009), media      (3010), loyalty    (3011), superadmin (3012)
procurement (3013), jukebox    (3014), ads        (3015)
```

## Pending / TODO
- Partner permission scope middleware (partnerScope — filter data by partner permissions)
- Staff shift management (shifts, attendance, clock-in records)
- WaiterTipTally model (daily tip aggregation per staff)
- Chain/franchise support (isChain flag, chainConfig, branch override catalogue)
- Unit + E2E tests
