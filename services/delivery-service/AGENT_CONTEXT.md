# delivery-service — Agent Context

> This file is the living knowledge base for the delivery-service agent.
> Update this file whenever routes, models, or behavior changes.
> Last updated: 2026-04-16

## Current Implementation Status
**NOT YET IMPLEMENTED — STUB ONLY**

Only `package.json` exists. No `src/` directory yet.

## What Needs to Be Built
Priority order for implementation:
1. Near delivery (radius check with geolib) — most businesses need this
2. Community delivery (Tower+Block+Flat for gated communities)
3. Click & collect (pickup codes PKP-XXXX)
4. Scheduled delivery (Morning/Afternoon/Evening slots)
5. Far delivery (Shiprocket API — Starter+ feature)
6. Food truck mode (daily location set by owner)
7. Monthly tab (Pro+ — gated community credit)

## Delivery Status Machine
`pending_acceptance → accepted → preparing → out_for_delivery → delivered`

## Planned Models
- DeliveryZone (near delivery radius + pricing config)
- DeliveryOrder (links to order-service order)
- Rider (assignment, location)
- CommunityConfig (layout_type, towers, blocks, flat ranges)
- MonthlyTab (Pro+ — credit account per resident)
- PickupCode (PKP-XXXX — click & collect)
- DeliverySlot (Morning/Afternoon/Evening time windows)
- FoodTruckLocation (lat/lng per day, set by owner)

## Community Delivery Layout Types
```
towers_only | blocks_only | towers_and_blocks | villas | open_numbering
```
Block dropdown cascades from tower selection in UI.

## Near Delivery Pricing Models
```
flat          ← fixed fee regardless of distance
distance_based ← fee increases with distance (per km rate)
free_above    ← free if order total above threshold
```

## Environment
- Dev port: 3006
- DB schema: delivery (to be created)
- Fastify v4 (same as all other services — do NOT install v5)
- Zod v3

## How to Bootstrap
```bash
cd services/delivery-service
pnpm add fastify@^4 @fastify/cors@^9 @fastify/helmet@^11 @fastify/swagger@^8 @fastify/swagger-ui@^4
pnpm add @prisma/client@^5 ioredis pino@^9 pino-pretty@^11 zod@^3 dotenv
pnpm add geolib
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
- Start with near delivery (flat fee + distance-based pricing)
- Shiprocket integration can come later (Starter+ feature)
