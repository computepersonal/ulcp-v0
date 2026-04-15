# analytics-service — Agent Context

> This file is the living knowledge base for the analytics-service agent.
> Update this file whenever routes, models, or behavior changes.
> Last updated: 2026-04-15

## Current Implementation Status
**NOT YET IMPLEMENTED — STUB ONLY**

Only `package.json` exists. No `src/` directory yet.

## What Needs to Be Built
See the analytics-service agent definition for full requirements.

Priority order for implementation:
1. Basic revenue + order reports (all plans need this)
2. Redis caching layer (15min TTL for all reports)
3. Pre-computation cron job (every 15min)
4. P&L statement (Pro+)
5. Customer insights (Pro+)
6. Live dashboard broadcast via realtime-service (Pro+)
7. PDF export (puppeteer)
8. Excel export (exceljs)

## Performance Requirement
Dashboard load must be **< 5ms** — only serve from Redis cache, never compute on request path.

## Environment
- Dev port: 3009
- DB schema: analytics (to be created)

## Dependencies
- `puppeteer` (PDF export — heavy, consider separate worker)
- `exceljs` (Excel export)
- Cross-service data access: order-service (revenue), inventory-service (COGS)

## How to Bootstrap
```bash
cd services/analytics-service
# Follow same structure as other services
pnpm add fastify @fastify/cors @fastify/helmet
pnpm add @prisma/client prisma ioredis pino zod bullmq
pnpm add puppeteer exceljs
pnpm add -D typescript ts-node-dev @types/node
```

## Pending / TODO
- Everything — this is a stub
- Start with basic revenue/order report endpoint
- Add Redis caching layer before any complex computation
