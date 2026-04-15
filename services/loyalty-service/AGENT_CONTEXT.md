# loyalty-service — Agent Context

> This file is the living knowledge base for the loyalty-service agent.
> Update this file whenever routes, models, or behavior changes.
> Last updated: 2026-04-15

## Current Implementation Status
**NOT YET IMPLEMENTED — STUB ONLY**

Only `package.json` exists. No `src/` directory yet.

## What Needs to Be Built
See the loyalty-service agent definition for full requirements.

Priority order for implementation:
1. Platform loyalty points (earn on order complete, redeem at checkout) — all plans
2. Saved places (QR visit history + scoring algorithm) — all customers
3. Offers engine (basic % and flat offers) — all plans
4. Coupon codes — all plans
5. Wishlist + back-in-stock notifications
6. Tenant loyalty (custom rates) — Pro+ gate
7. Tiers (Silver/Gold/Platinum) — Pro+ gate
8. Recommendations (order again, popular now, you might like)

## Environment
- Dev port: 3011
- DB schema: loyalty (to be created)

## Saved Places Scoring Algorithm
```
Pinned items: always first (sorted by pinnedAt DESC)
Score = (orderCount × 10) + (visitCount × 2) + recencyScore
recencyScore: today=20, 3days=15, week=10, month=5, older=1
```

## How to Bootstrap
```bash
cd services/loyalty-service
pnpm add fastify @fastify/cors @fastify/helmet @fastify/rate-limit
pnpm add @prisma/client prisma ioredis pino zod bullmq
pnpm add -D typescript ts-node-dev @types/node
```

## Pending / TODO
- Everything — this is a stub
- Start with platform loyalty (most critical for customer experience)
- Saved places needed for customer home screen
