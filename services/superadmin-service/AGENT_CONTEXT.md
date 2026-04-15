# superadmin-service — Agent Context

> This file is the living knowledge base for the superadmin-service agent.
> Update this file whenever routes, models, or behavior changes.
> Last updated: 2026-04-15

## Current Implementation Status
**NOT YET IMPLEMENTED — STUB ONLY**

Only `package.json` exists. No `src/` directory yet.

## What Needs to Be Built
See the superadmin-service agent definition for full requirements.

Priority order for implementation:
1. Platform overview dashboard (tenant count, GMV, MRR, commissions)
2. Tenant list + detail view
3. Tenant activate/suspend
4. Commission settlement (monthly invoices)
5. Platform notifications (broadcast to all businesses)
6. Tenant impersonation
7. Moderation (flagged reviews, reported businesses)
8. Platform settings (commission rates, feature flags)

## Access Control
- ALL routes: require `role === "platform_superadmin"` in JWT
- This role is set manually in DB — not via any API
- Never accessible to regular tenant users

## Environment
- Dev port: 3012
- DB schema: superadmin (to be created)

## How to Bootstrap
```bash
cd services/superadmin-service
pnpm add fastify @fastify/cors @fastify/helmet @fastify/rate-limit
pnpm add @prisma/client prisma ioredis pino zod
pnpm add -D typescript ts-node-dev @types/node
```

## Pending / TODO
- Everything — this is a stub
- First task: dashboard with tenant count, GMV, MRR
- Commission settlement is high priority (revenue flow)
