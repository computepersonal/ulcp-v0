# delivery-service — Agent Context

> This file is the living knowledge base for the delivery-service agent.
> Update this file whenever routes, models, or behavior changes.
> Last updated: 2026-04-15

## Current Implementation Status
**NOT YET IMPLEMENTED — STUB ONLY**

Only `package.json` exists. No `src/` directory yet.

## What Needs to Be Built
See the delivery-service agent definition for full requirements.

Priority order for implementation:
1. Near delivery (radius check with geolib) — most used
2. Community delivery (gated community Tower/Block/Flat)
3. Click & collect (pickup codes)
4. Scheduled delivery (slots)
5. Far delivery (Shiprocket API)
6. Food truck mode (daily location)
7. Monthly tab (Pro+)

## Planned Models
- DeliveryZone, DeliveryOrder, Rider, CommunityConfig, MonthlyTab, PickupCode, DeliverySlot, FoodTruckLocation

## Environment
- Dev port: 3006
- DB schema: delivery (to be created)

## Dependencies
- `geolib` npm (already in shared or add to this service)
- Shiprocket API credentials (SHIPROCKET_EMAIL, SHIPROCKET_PASSWORD)

## How to Bootstrap
```bash
cd services/delivery-service
# Create src/ structure following same pattern as other services
# Add to docker-compose.dev.yml
pnpm add fastify @fastify/cors @fastify/helmet @fastify/rate-limit
pnpm add @prisma/client prisma ioredis pino zod
pnpm add geolib
pnpm add -D typescript ts-node-dev @types/node
```

## Pending / TODO
- Everything — this is a stub
- Start with near delivery (most businesses need it)
- Shiprocket integration can come later (Starter+ feature)
