# jukebox-service — Agent Context

> This file is the living knowledge base for the jukebox-service agent.
> Update this file whenever routes, models, or behavior changes.
> Last updated: 2026-04-15

## Current Implementation Status
**FULLY IMPLEMENTED (core)**

## What's Built
- JukeboxConfig per tenant (enable/disable, pricing, content filter)
- Song queue management (add, list, delete, reorder)
- Song history log
- YouTube song search (YouTube Data API v3)
- Player token auth (dedicated token for always-on player screen)
- Billing integration with order-service (add/remove line items via X-Internal-Secret)

## Prisma Models (current)
- JukeboxConfig, JukeboxQueue, JukeboxHistory

## Known Issues / Gotchas
- YouTube Data API has daily quota limits — monitor usage in Google Cloud Console
- Player token is separate from staff JWT — stored in player screen's localStorage
- Billing requires an open table session — if no session exists, song cannot be billed
- social.ts and trivia.ts in realtime-service handle the live event broadcasting

## Recent Changes
- Service built (port TBD — check package.json)
- YouTube integration via youtube.ts
- Billing integration with order-service internal endpoints

## Environment
- Dev port: check package.json (not listed in docker-compose.dev.yml yet)
- DB schema: jukebox
- YOUTUBE_API_KEY required

## How to Run Locally
```bash
cd services/jukebox-service
pnpm dev
```

## How to Deploy
```bash
# Add to docker-compose.dev.yml first
docker compose -f docker-compose.dev.yml up jukebox-service
```

## Pending / TODO
- Add jukebox-service to docker-compose.dev.yml
- Real-time queue updates via realtime-service events
- Customer-facing QR scan → song request flow
- Queue display screen (customer-facing TV/tablet)
- Content moderation filter testing
- Unit tests for queue management
- YouTube API quota management / caching search results
