# tenant-service — Agent Context

> This file is the living knowledge base for the tenant-service agent.
> Update this file whenever routes, models, or behavior changes.
> Last updated: 2026-04-15

## Current Implementation Status
**FULLY IMPLEMENTED**

## What's Built
- Tenant CRUD (create, read, update, deactivate)
- Tenant creation calls identity-service PATCH /users/:id/tenant via X-Internal-Secret
- Branch management (create, list, update, deactivate)
- Staff invitations (email invite with secure token)
- Partner system (invite, accept, permissions management)
- 6-step onboarding wizard with state persistence
- Table management (CRUD per branch, QR code generation)
- Section management (floor map sections with color + position)
- Table sessions (open/close dine-in sessions)
- KDS device setup codes (6-digit, 10-min expiry) + device registration
- Plan enforcement middleware (planGuard)
- Subscription model (free/starter/pro)

## Prisma Models (current)
- Tenant (includes: city, state, pincode, kot_ack_mode, kot_ack_delay_secs)
- Branch, Partner, StaffInvite, Section, Table, TableSession, Subscription, KdsSetupCode

## Known Issues / Gotchas
- Table.qr_code is NOT unique in DB — uniqueness is inherent via tableId. QR encodes unique table ID so no uniqueness constraint needed (base64 QR string too large for PostgreSQL btree index).
- tenant_id is NEVER typed by user — always system-generated

## Recent Changes
- 2026-03-19: Tenant creation redesigned — calls identity-service to assign tenant_id
- 2026-03-26: Tenant model extended: city, state, pincode fields added
- 2026-03-26: Table + Section models added (floor map)
- 2026-03-26: Table.qr_code @unique removed (PostgreSQL btree 2704-byte limit)
- 2026-03-28: Tenant model extended: kot_ack_mode + kot_ack_delay_secs

## Environment
- Dev port: 3002
- DB schema: tenant
- Calls identity-service at: IDENTITY_SERVICE_URL (http://localhost:3001 dev)

## How to Run Locally
```bash
cd services/tenant-service
pnpm dev
# Health check: GET http://localhost:3002/health
```

## How to Run Tests
```bash
# No tests written yet
```

## How to Deploy
```bash
docker compose -f docker-compose.dev.yml up tenant-service
docker compose -f docker-compose.dev.yml logs -f tenant-service
```

## Pending / TODO
- Partner permission scope middleware (partnerScope)
- Staff shift management (shifts, attendance, clock-in)
- WaiterTipTally model
- Chain/franchise support (isChain, chainConfig)
- Unit + E2E tests
