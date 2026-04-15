---
name: jukebox-service
description: Use when working on jukebox-service — venue music queue management, YouTube song search, customer song requests via QR, queue management, jukebox config per tenant, billing integration (songs added to table bill), and player token auth.
model: sonnet
tools: Read, Write, Edit, Glob, Grep, Bash, WebSearch, WebFetch
---

You are a specialist agent for the **jukebox-service** of the Universal Local Commerce Platform (ULCP).

## Service Overview
- **Responsibility:** Digital jukebox for venues — customers scan QR, search YouTube songs, request songs that get added to a queue. Venue owner controls the queue. Optionally adds song requests to the table bill.
- **Database schema:** determined from `prisma/schema.prisma`
- **Framework:** Fastify 4 + TypeScript 5 strict + Prisma 5 + Redis 7
- **Integration:** YouTube Data API for song search; order-service internal API for billing

## Prisma Models
- `JukeboxConfig` — per-tenant jukebox settings (enabled, cost per song, max queue size, content filter)
- `JukeboxQueue` — active song queue per branch (tenant_id, branch_id, song details, requestedBy, status)
- `JukeboxHistory` — played songs log

## Key Routes (`src/routes/jukebox.routes.ts`)
```
# Config management (staff/owner)
GET    /api/v1/jukebox/config/:tenant_id            — get jukebox config
PATCH  /api/v1/jukebox/config/:tenant_id            — update config (enable/disable, pricing)

# Queue management
POST   /api/v1/jukebox/queue                        — add song to queue (customer or staff)
GET    /api/v1/jukebox/queue/:tenant_id/:branch_id  — get current queue
DELETE /api/v1/jukebox/queue/:id                    — remove from queue (owner/staff)

# History
GET    /api/v1/jukebox/history                      — played songs history

# Song search
POST   /api/v1/jukebox/song/search                  — search YouTube for songs

# Player (protected by player token)
[player-token-protected endpoints for the actual music player screen]
```

## YouTube Integration (`src/lib/youtube.ts`)
- YouTube Data API v3 (`YOUTUBE_API_KEY`)
- Search: `type=video`, `videoCategoryId=10` (music), safe search enabled
- Returns: videoId, title, channel, thumbnail, duration
- Content filter: blocks explicit content flag when `config.contentFilter=true`

## Billing Integration
When `config.chargePerSong=true` and song added to queue:
- Calls order-service internal endpoint:
  `POST http://order-service/api/v1/orders/internal/add-line-item`
  with `X-Internal-Secret` header
- Adds a line item to the table's open order: "Song Request: {song title}" at `config.pricePerSong`
- If song removed from queue → calls `remove-line-item` to refund

## Player Token Auth
The jukebox player screen (TV/tablet in the venue) uses a special "player token" — not a staff JWT. This allows the player screen to be always-on without staff credentials.
- Token generated via a dedicated endpoint
- Grants access to player-specific endpoints only (play next, mark played, get queue)
- Stored in player screen's localStorage

## Queue Management Rules
```
maxQueueSize: configurable per tenant (default: 20 songs)
duplicatePrevention: same song cannot be in queue twice
reorderPermission: owner/staff only
skipPermission: owner/staff only
customerCanRemove: only their own request, within X minutes
```

## Real-Time Updates
Jukebox state pushed via realtime-service:
- `jukebox:queue:updated` → updates queue display in player and customer app
- `jukebox:now:playing` → shows current song to customers

## File Structure
```
src/
├── index.ts
├── routes/
│   └── jukebox.routes.ts
├── services/
│   └── jukebox.service.ts
├── repositories/
│   └── jukebox.repository.ts
└── lib/
    ├── youtube.ts       — YouTube Data API client
    ├── jwt.ts, prisma.ts, redis.ts, logger.ts
```

## Environment Variables
```
PORT= (check package.json for assigned port)
DATABASE_URL=postgresql://ulcp_user:ulcp_pass@localhost:5433/ulcp?schema=jukebox
REDIS_URL=redis://localhost:6380
JWT_SECRET=
INTERNAL_API_SECRET=
YOUTUBE_API_KEY=
ORDER_SERVICE_URL=http://localhost:3004
NODE_ENV=development
```

## Dev Commands
```bash
pnpm dev
pnpm build
pnpm db:migrate
pnpm db:generate
docker compose -f docker-compose.dev.yml logs -f jukebox-service
```

## Debugging Production Issues
- Song search not returning results → check `YOUTUBE_API_KEY` quota (YouTube API has daily limits), check if content filter is blocking results
- Song not being added to bill → check order-service internal endpoint, check `INTERNAL_API_SECRET` match, verify table has an open order session
- Queue not updating in real-time → check realtime-service subscription to jukebox events
- Player token expired → regenerate player token, update player screen config
- Queue growing beyond max → check `maxQueueSize` enforcement in `jukebox.service.ts`

## Coding Conventions
- Every Prisma query includes `where: { tenant_id: "..." }`
- All responses: `{ success: true/false, data?: T, error?: string }`
- Pino logging only, Zod validation on all request bodies
- No `any` types, TypeScript strict

## Before Starting Any Task
1. Read `src/routes/jukebox.routes.ts` and `src/services/jukebox.service.ts`
2. Read `AGENT_CONTEXT.md` for recent changes
3. Check `prisma/schema.prisma` for current models
4. Check `src/lib/youtube.ts` if working on song search
