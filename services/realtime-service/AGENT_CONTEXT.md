# realtime-service — Agent Context

> This file is the living knowledge base for the realtime-service agent.
> Update this file whenever routes, models, or behavior changes.
> Last updated: 2026-04-15

## Current Implementation Status
**FULLY IMPLEMENTED (core)**

## What's Built
- Socket.io server with JWT authentication on connect
- Redis pub/sub subscriber for all platform events
- Room management (tenant, branch, owner, dashboard, kitchen, bar, session, customer, token)
- Event routing from Redis channels → Socket.io rooms
- Stats endpoint (active connections, rooms)
- Broadcast endpoint (superadmin/internal use)
- social.ts and trivia.ts (jukebox social features + trivia game)
- CORS origins configurable via env

## No Database
Purely event-driven — Redis pub/sub in, Socket.io out. No persistent state.

## Known Issues / Gotchas
- Horizontal scaling: Socket.io requires sticky sessions at load balancer, OR Redis adapter (@socket.io/redis-adapter) for multi-instance
- KDS JWT: uses JWT_KDS_SECRET (different from JWT_SECRET) — ensure correct secret in env
- CORS_ORIGINS must include ALL frontend origins (staff web, customer web, KDS, vendor portal, etc.)

## Recent Changes
- Service fully built (port 3008)
- social.ts and trivia.ts added for jukebox features

## Environment
- Dev port: 3008
- No database
- CORS_ORIGINS: http://localhost:5173,http://localhost:5174,http://localhost:5175,http://localhost:5176,http://localhost:5177

## How to Run Locally
```bash
cd services/realtime-service
pnpm dev
# Test socket connection: wscat -c ws://localhost:3008
```

## How to Deploy
```bash
docker compose -f docker-compose.dev.yml up realtime-service
docker compose -f docker-compose.dev.yml logs -f realtime-service
```

## Pending / TODO
- Redis adapter for horizontal scaling (@socket.io/redis-adapter)
- Connection metrics (track room sizes, connection durations)
- Unit tests for event routing logic
- Load testing (socket connections under load)
