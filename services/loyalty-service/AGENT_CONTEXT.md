# loyalty-service — Agent Context

> This file is the living knowledge base for the loyalty-service agent.
> Update this file whenever routes, models, or behavior changes.
> Last updated: 2026-04-16

## Current Implementation Status
**NOT YET IMPLEMENTED — STUB ONLY**

Only `package.json` exists. No `src/` directory yet.

## What Needs to Be Built
Priority order for implementation:
1. Platform loyalty points (earn on ORDER_COMPLETED, redeem at checkout) — all plans
2. Saved places (QR visit history + scoring algorithm) — all customers
3. Offers engine (basic % and flat offers) — all plans
4. Coupon codes (single-use, multi-use, expiry) — all plans
5. Wishlist + back-in-stock notifications
6. Tenant loyalty (custom earn rate + redemption value) — Pro+ gate
7. Tiers (Silver/Gold/Platinum by lifetime spend) — Pro+ gate
8. Recommendations (order again, popular now, you might like)

## Two-Layer Loyalty System
```
PLATFORM:
  ₹10 = 1 point, ₹1 per 10 points
  Cross-business — one wallet, usable anywhere
  Handled by loyalty-service

TENANT (Pro+):
  Custom earn rate + custom redemption value
  Business-specific — separate from platform points
  Handled by loyalty-service (scoped to tenant_id)
```

## Tiers (Pro+ only)
```
SILVER    0-999 points:   1x multiplier
GOLD      1000-4999:      1.5x + free delivery >₹300
PLATINUM  5000+:          2x + always free delivery
```

## Saved Places Scoring Algorithm
```javascript
// Pinned items: always first (sorted by pinnedAt DESC)
// Unpinned score:
score = (orderCount × 10) + (visitCount × 2) + recencyScore
// recencyScore: today=20, 3days=15, week=10, month=5, older=1
// Max 50 places — oldest non-pinned removed when exceeded
```

## Offers Engine Types
```
percentage  ← X% off subtotal
flat        ← ₹X off subtotal
bxgy        ← buy X get Y free
first_order ← first order only
flash_sale  ← time-limited (flashSaleStartTime/EndTime)
```

## Environment
- Dev port: 3011
- DB schema: loyalty (to be created)
- Fastify v4 (same as all other services — do NOT install v5)
- Zod v3

## How to Bootstrap
```bash
cd services/loyalty-service
pnpm add fastify@^4 @fastify/cors@^9 @fastify/helmet@^11 @fastify/swagger@^8 @fastify/swagger-ui@^4
pnpm add @prisma/client@^5 ioredis pino@^9 pino-pretty@^11 zod@^3 dotenv bullmq
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
- Start with platform loyalty (most critical for customer experience)
- Saved places needed for customer home screen
- awardPoints() must subscribe to ORDER_COMPLETED Redis event
