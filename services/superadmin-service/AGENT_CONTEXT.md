# superadmin-service — Agent Context

> This file is the living knowledge base for the superadmin-service agent.
> Update this file whenever routes, models, or behavior changes.
> Last updated: 2026-04-16

## Current Implementation Status
**NOT YET IMPLEMENTED — STUB ONLY**

Only `package.json` exists. No `src/` directory yet.

## What Needs to Be Built
Priority order for implementation:
1. Platform overview dashboard (tenant count, GMV, MRR, commissions)
2. Tenant list + detail view
3. Tenant activate/suspend
4. Commission settlement (monthly invoices, mark paid)
5. Platform notifications (broadcast to all businesses or customers)
6. Tenant impersonation (generate scoped JWT as tenant)
7. Moderation (flagged reviews, reported businesses)
8. Platform settings (commission rates, feature flags)

## Access Control
- **ALL routes**: require `role === "platform_superadmin"` in JWT
- This role is set manually in DB — never via any self-service API
- Never accessible to regular tenant users or partners

## Planned Routes
```
GET  /api/v1/superadmin/overview           ← platform metrics
GET  /api/v1/superadmin/tenants            ← list all tenants (paginated)
GET  /api/v1/superadmin/tenants/:id        ← tenant detail
PATCH /api/v1/superadmin/tenants/:id       ← activate/suspend/plan override
POST /api/v1/superadmin/tenants/:id/impersonate ← get scoped JWT

GET  /api/v1/superadmin/revenue            ← MRR breakdown, commission earned/pending
GET  /api/v1/superadmin/settlements        ← list commission invoices
POST /api/v1/superadmin/settlements        ← generate monthly invoices
PATCH /api/v1/superadmin/settlements/:id   ← mark paid

GET  /api/v1/superadmin/customers          ← cross-business spend data
POST /api/v1/superadmin/broadcast          ← notify all businesses or customers

GET  /api/v1/superadmin/moderation/reviews        ← flagged reviews
DELETE /api/v1/superadmin/moderation/reviews/:id   ← remove review

GET/PATCH /api/v1/superadmin/settings      ← commission rates, feature flags
```

## Commission Settlement Flow
1. Monthly cron: aggregate CommissionRecord entries from order-service DB per tenant
2. Generate invoice (PDF via puppeteer)
3. Mark as sent → mark as paid (manual or payment webhook)
4. Tenant sees invoice in their Settings > Subscription

## Environment
- Dev port: 3012
- DB schema: superadmin (to be created)
- Fastify v4 (same as all other services — do NOT install v5)
- Zod v3

## How to Bootstrap
```bash
cd services/superadmin-service
pnpm add fastify@^4 @fastify/cors@^9 @fastify/helmet@^11 @fastify/swagger@^8 @fastify/swagger-ui@^4
pnpm add @prisma/client@^5 ioredis pino@^9 pino-pretty@^11 zod@^3 dotenv node-cron puppeteer
pnpm add -D prisma@^5 typescript ts-node-dev @types/node
```

## Platform Services Reference
```
identity    (3001), tenant     (3002), catalogue  (3003), order      (3004)
inventory   (3005), delivery   (3006), notification(3007), realtime  (3008)
analytics   (3009), media      (3010), loyalty    (3011), superadmin (3012)
procurement (3013), jukebox    (3014), ads        (3015)
```

## Pending / TODO
- Everything — this is a stub
- First task: platform overview dashboard (read from other services' DBs)
- Commission settlement is high priority (platform revenue flow)
