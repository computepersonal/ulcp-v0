# analytics-service — Agent Context

> This file is the living knowledge base for the analytics-service agent.
> Update this file whenever routes, models, or behavior changes.
> Last updated: 2026-04-16

## Current Implementation Status
**NOT YET IMPLEMENTED — STUB ONLY**

Only `package.json` exists. No `src/` directory yet.

## What Needs to Be Built
Priority order for implementation:
1. Basic revenue + order reports (all plans need this)
2. Redis caching layer (15min TTL for all reports — dashboard must load < 5ms)
3. Pre-computation cron job (every 15min)
4. P&L statement (Pro+) — revenue - COGS - commission - subscription
5. Customer insights (Pro+) — new vs returning, retention, top spenders
6. Live dashboard broadcast via realtime-service (Pro+)
7. PDF export (puppeteer — heavy, consider separate worker)
8. Excel export (exceljs)

## Performance Requirement
Dashboard load must be **< 5ms** — only serve from Redis cache, never compute on request path.

## Planned Routes
```
GET /api/v1/analytics/:tenant_id/dashboard    ← Pro+ gated, Redis-cached
GET /api/v1/analytics/:tenant_id/revenue      ← all plans (basic)
GET /api/v1/analytics/:tenant_id/orders       ← all plans (basic)
GET /api/v1/analytics/:tenant_id/items        ← Starter+ (item performance)
GET /api/v1/analytics/:tenant_id/staff        ← Pro+ (staff performance)
GET /api/v1/analytics/:tenant_id/customers    ← Pro+ (customer insights)
GET /api/v1/analytics/:tenant_id/pl           ← Pro+ (P&L statement)
POST /api/v1/analytics/:tenant_id/export/pdf  ← Pro+ (puppeteer PDF)
POST /api/v1/analytics/:tenant_id/export/excel ← Pro+ (exceljs)
```

## Data Sources (cross-service reads)
- order-service DB — orders, payments, KOTs, commission
- inventory-service DB — stock movements, COGS (unitCost × quantity deducted)
- tenant-service DB — subscription info for P&L

## Environment
- Dev port: 3009
- DB schema: analytics (to be created)
- Fastify v4 (same as all other services — do NOT install v5)
- Zod v3 (same as other services)

## How to Bootstrap
```bash
cd services/analytics-service
# Scaffold same structure as other services
pnpm add fastify@^4 @fastify/cors@^9 @fastify/helmet@^11 @fastify/swagger@^8 @fastify/swagger-ui@^4
pnpm add @prisma/client@^5 ioredis pino@^9 pino-pretty@^11 zod@^3 dotenv
pnpm add bullmq node-cron puppeteer exceljs
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
- Start with basic revenue/order report endpoint with Redis cache
- Add cron for pre-computation before building complex features
