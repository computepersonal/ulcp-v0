# jukebox-service — Agent Context

> This file is the living knowledge base for the jukebox-service agent.
> Update this file whenever routes, models, or behavior changes.
> Last updated: 2026-04-22

## Current Implementation Status
**FULLY IMPLEMENTED (core)**

## What's Built
- JukeboxConfig per tenant (enable/disable, pricing, content filter, max_queue_size)
- Song queue management (add, list, reorder, delete)
- Song history log
- Tenant Song catalog — owner pre-seeds songs via YouTube/Spotify URLs; customers search catalog only (no YouTube API)
- oEmbed metadata extraction (no API keys — uses noembed.com for YouTube, open.spotify.com/oembed for Spotify)
- Player token auth (dedicated long-lived token for always-on player screen)
- Billing integration with order-service (add/remove line items via X-Internal-Secret)
- Player state management (now-playing, queue, history)

## Prisma Models (current)
- JukeboxConfig, JukeboxQueue, JukeboxHistory, Song

## Key Routes
```
GET  /api/v1/jukebox/:tenant_id/config              ← get jukebox settings
PATCH /api/v1/jukebox/:tenant_id/config             ← update settings (JWT required)

GET  /api/v1/jukebox/:tenant_id/:branch_id/queue         ← list current queue
GET  /api/v1/jukebox/:tenant_id/:branch_id/queue/status  ← queue status + player health
POST /api/v1/jukebox/:tenant_id/:branch_id/queue/add     ← add song to queue
DELETE /api/v1/jukebox/:tenant_id/:branch_id/queue/:id   ← remove from queue

GET  /api/v1/jukebox/:tenant_id/search?q=           ← search tenant Song catalog (replaces YouTube API)

# Song catalog management (staff/owner)
POST   /api/v1/jukebox/:tenant_id/songs             ← add song by URL (YouTube or Spotify)
POST   /api/v1/jukebox/:tenant_id/songs/bulk        ← bulk add (array of URLs, max 50)
GET    /api/v1/jukebox/:tenant_id/songs             ← list catalog (search, genre, language, is_active filters)
GET    /api/v1/jukebox/:tenant_id/songs/count       ← count active songs
PATCH  /api/v1/jukebox/:tenant_id/songs/:id         ← edit song metadata
DELETE /api/v1/jukebox/:tenant_id/songs/:id         ← remove song

# Player (player token required)
POST /api/v1/jukebox/player/pair                    ← pair player screen with setup code
GET  /api/v1/jukebox/player/:tenant_id/:branch_id/next       ← get + advance to next song
POST /api/v1/jukebox/player/:tenant_id/:branch_id/finished   ← mark song finished/skipped
POST /api/v1/jukebox/player/:tenant_id/:branch_id/heartbeat  ← player keepalive
```

## Known Issues / Gotchas
- oEmbed metadata extraction (noembed.com + Spotify oEmbed) is free but may rate-limit on heavy bulk imports — add delays if needed
- oEmbed does not provide track duration — all songs default to 240s; owner can edit via PATCH
- Spotify oEmbed title is track name only (no artist embedded); owner may need to correct artist via PATCH
- Player token is separate from staff JWT — stored in jukebox-player app's localStorage
- Billing requires an open table session — if no session, song cannot be billed
- social.ts and trivia.ts in realtime-service handle live event broadcasting for social room
- YOUTUBE_API_KEY env var is no longer used (search uses tenant catalog, not live YouTube API)

## Recent Changes
- 2026-04-15: Service built (port 3014)
- 2026-04-15: YouTube integration via youtube.ts
- 2026-04-15: Billing integration with order-service internal endpoints
- 2026-04-16: AGENT_CONTEXT.md updated with correct port and ads integration note
- 2026-04-22: Song catalog system — Song model added to Prisma schema (jukebox_songs table)
- 2026-04-22: src/lib/oembed.ts — URL metadata extraction via noembed.com (YouTube) and Spotify oEmbed (no API keys)
- 2026-04-22: src/repositories/song.repository.ts — addSong, bulkAddSongs, listSongs, getSong, updateSong, deleteSong, countSongs, searchSongs
- 2026-04-22: Search endpoint now queries tenant Song catalog instead of live YouTube API
- 2026-04-22: src/lib/youtube.ts — MOCK_SONGS and searchYouTube removed; YouTubeSong interface kept for queue compatibility
- 2026-04-22: 6 new song catalog routes added to jukebox.routes.ts (POST/GET/PATCH/DELETE songs + bulk + count)

## Environment
- Dev port: **3014**
- DB schema: jukebox
- Prisma client output: `src/generated/prisma`
- Fastify v4 (same as all other services)
- YOUTUBE_API_KEY required for search

## How to Run Locally
```bash
cd services/jukebox-service
pnpm dev
# Health: GET http://localhost:3014/health
# Swagger: http://localhost:3014/docs
```

## How to Deploy
```bash
docker compose -f docker-compose.dev.yml up jukebox-service
docker compose -f docker-compose.dev.yml logs -f jukebox-service
```

## Dependencies on Other Services
- **order-service** (internal) — add/remove song billing line items via `X-Internal-Secret`
- **realtime-service** — social.ts/trivia.ts handle jukebox Socket.io room broadcasting
- **ads-service** — jukebox-player app fetches `placement=jukebox_player` ads from ads-service directly (no jukebox-service involvement)

## Frontend App: apps/jukebox-player (port 5178)
- React 18 + Vite + TypeScript + Tailwind CSS
- Always-on TV screen: now-playing, queue, QR code for song requests
- `useJukeboxAds()` hook: fetches 5 ads from ads-service, rotates every 30s, refreshes every 10min
- Ad zone in right column below QR code
- Player token stored in localStorage (set once from staff Settings)

## Pending / TODO
- Real-time queue updates via realtime-service events (Socket.io push on queue change)
- Customer-facing QR scan → song request flow (customer scans QR, adds song from phone)
- Queue display screen (customer-facing TV/tablet)
- Content moderation filter testing
- YouTube API quota management / caching search results in Redis (TTL 1hr)
- Unit tests for queue management
