# realtime-service — Agent Context

> This file is the living knowledge base for the realtime-service agent.
> Update this file whenever routes, models, or behavior changes.
> Last updated: 2026-04-16

## Current Implementation Status
**FULLY IMPLEMENTED (core)**

## What's Built
- Socket.io server (v4) with JWT authentication on connect
- Redis pub/sub subscriber (dedicated connection) for all platform events
- Auto-join rooms based on JWT role on connect
- Room management: tenant, branch, owner, dashboard, kitchen, bar, session, customer, token
- Event routing: Redis channel → correct Socket.io room
- Stats endpoint (active connections, room sizes)
- Broadcast endpoint (internal/superadmin use, X-Internal-Secret)
- social.ts: jukebox social room event broadcasting
- trivia.ts: jukebox trivia game logic
- CORS origins configurable via CORS_ORIGINS env var

## No Database
Purely event-driven — Redis pub/sub in, Socket.io out. No persistent state.

## Redis Events → Socket.io Events (complete mapping)
```
ORDER_CREATED            → order:new             → tenant:ID:branch:BID room
ORDER_STATUS_CHANGED     → order:status:changed  → tenant:ID:branch:BID room
ORDER_COMPLETED          → order:completed       → tenant:ID:branch:BID room
KOT_CREATED              → kot:created           → kitchen:ID:BID:kitchen or :bar (by station)
KOT_STATUS_CHANGED       → kot:status:changed    → branch room
KOT_STATUS_CHANGED(ready)→ kot:ready             → branch room
KOT_REJECTED             → kot:rejected          → tenant:ID:branch:BID room
ORDER_UNBILLED_ALERT     → order:unbilled:alert  → tenant:ID:owner room
TABLE_STATUS_CHANGED     → table:status:changed  → tenant:ID:branch:BID room
TABLE_CLOSED             → table:status:changed  → tenant:ID:branch:BID room
STOCK_LOW                → inventory:low         → tenant:ID:owner room
STOCK_CRITICAL           → inventory:critical    → tenant:ID room
ITEM_BACK_IN_STOCK       → menu:item:available   → tenant:ID room
MENU_ITEM_UNAVAILABLE    → menu:item:unavailable → tenant:ID room
DASHBOARD_UPDATE         → dashboard:update      → tenant:ID:dashboard room
TOKEN_DISPLAY_UPDATE     → token:update          → token:ID:BID room
PAYMENT_COMPLETED        → payment:completed     → tenant:ID:branch:BID room
TENANT_PLAN_CHANGED      → tenant:plan:changed   → tenant:ID room
```

## Socket.io Rooms
```
tenant:TENANTID                    ← all staff
tenant:TENANTID:branch:BRANCHID    ← branch staff
tenant:TENANTID:owner              ← owner + managing partners
tenant:TENANTID:dashboard          ← live dashboard subscribers
kitchen:TENANTID:BRANCHID:kitchen  ← kitchen KDS
kitchen:TENANTID:BRANCHID:bar      ← bar KDS (Type 3 — seated_full_service)
session:SESSIONID                  ← customer table session
customer:CUSTOMERID                ← customer all devices
token:TENANTID:BRANCHID            ← Type 1 token display screen
```

## Key Routes
```
GET  /health                    ← includes live connections count
GET  /api/v1/realtime/stats     ← rooms + connection count + uptime
POST /api/v1/realtime/broadcast ← X-Internal-Secret, broadcast to any room
```

## Known Issues / Gotchas
- Horizontal scaling: requires @socket.io/redis-adapter for multi-instance (not yet implemented)
- KDS JWT uses JWT_KDS_SECRET (different from JWT_SECRET) — both must be set in env
- CORS_ORIGINS must include ALL frontend origins: 5173 (web), 5176 (vendor-portal), 5177 (kds), 5178 (jukebox-player), 5180 (customer-web)
- Fastify v4 (downgraded from v5 during 2026-04-16 audit — v5 had TypeProvider incompatibility with @fastify/swagger)

## Recent Changes
- 2026-04-08: KOT_REJECTED → kot:rejected event handler added
- 2026-04-08: ORDER_UNBILLED_ALERT → order:unbilled:alert event handler added (owner room)
- 2026-04-15: social.ts + trivia.ts added for jukebox social features
- 2026-04-16: Fastify downgraded v5→v4 (TypeScript audit fix)
- 2026-04-16: CORS_ORIGINS updated to include ports 5178 (jukebox-player), 5180 (customer-web)

## Environment
- Dev port: 3008
- No database (Redis only)
- CORS_ORIGINS: `http://localhost:5173,http://localhost:5176,http://localhost:5177,http://localhost:5178,http://localhost:5180`
- Fastify v4 (same as all other services)

## How to Run Locally
```bash
cd services/realtime-service
pnpm dev
# Health: GET http://localhost:3008/health
# Stats: GET http://localhost:3008/api/v1/realtime/stats
# Test socket: wscat -c ws://localhost:3008
```

## How to Deploy
```bash
docker compose -f docker-compose.yml up realtime-service
docker compose -f docker-compose.yml logs -f realtime-service
```

## Dependencies on Other Services
- No HTTP calls — consumes Redis pub/sub events only
- All services publish events; realtime-service routes them to connected clients

## Pending / TODO
- Redis adapter for horizontal scaling (@socket.io/redis-adapter)
- Connection metrics (track room sizes, connection durations over time)
- Unit tests for event routing logic
- Load testing (socket connections under load)
