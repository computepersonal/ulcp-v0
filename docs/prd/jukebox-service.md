# jukebox-service — PRD

## Overview

The jukebox-service (port 3014) enables ULCP venue tenants to run a paid, customer-driven music queue. Customers at a table browse a curated song catalog seeded by the venue owner, request songs for a fee, and optionally include a dedication message. A dedicated player screen (a TV or tablet running `apps/jukebox-player`) consumes the queue in real time. Song requests are billed through order-service, so the charge appears on the customer's tab. The service is built for social venues — restaurants, bars, and entertainment spaces — not a general streaming feature.

---

## Users / Actors

| Actor | Role |
|---|---|
| Tenant Owner / Staff | Configures jukebox settings, seeds song catalog, generates player setup code |
| Customer (in-venue) | Searches the catalog, adds songs to queue, optionally adds a dedication, cancels their own queued songs |
| Player (TV screen) | The `apps/jukebox-player` app; authenticates with a long-lived player token; polls for next song, reports playback completion |
| order-service (internal) | Receives line-item add calls for billing |
| realtime-service | Broadcasts queue change events to connected Socket.io clients |
| ads-service | Serves ads in the jukebox-player right column (no involvement from jukebox-service itself) |

---

## Core Features

1. **Jukebox configuration** — Per-tenant settings: enable/disable, price per song (paise), max queue length, max songs per customer, allow/disallow dedications, content filter level (family / adult / off).
2. **Tenant song catalog** — Owner pre-seeds allowed songs by pasting YouTube or Spotify URLs (single or bulk up to 50 at once). Metadata (title, artist, thumbnail, duration) is extracted via oEmbed — no API keys required.
3. **Song search** — Customers search the tenant's own catalog (not live YouTube/Spotify). Requires minimum 2 characters. Returns up to 20 matches.
4. **Queue management** — Customers add songs to the live queue. Each addition records position, alias, optional dedication, and amount charged. Queue enforces max length and per-customer limits.
5. **Billing integration** — When a logged-in customer adds a song, the service calls order-service to add a line item (`type: "jukebox"`) to their open order. If billing fails, the song is still queued (non-fatal).
6. **Queue status** — Returns currently playing song, list of queued songs with per-song estimated wait time (cumulative), total wait estimate, and player connectivity status (heartbeat-based, 60-second window).
7. **Song cancellation** — Customers can remove their own queued songs (only songs in `queued` status; cannot cancel a playing or played song). Cancellation returns the charged amount as a refund signal (actual refund logic not implemented in this service).
8. **Player pairing** — Staff generates a 6-digit setup code (valid 10 minutes, stored in Redis). The player app submits the code via `POST /player/pair` to receive a long-lived player JWT stored in localStorage.
9. **Player playback control** — Player calls `GET /player/:tenant_id/:branch_id/next` to advance the queue. Reports completion or skip via `POST /player/:tenant_id/:branch_id/finished`. Sends heartbeat every ~30 seconds.
10. **Song history** — Played and skipped songs are logged to `JukeboxHistory`. Viewable per branch.
11. **Real-time queue broadcasts** — On queue change (song added, cancelled, started, finished), the service publishes Redis Pub/Sub events (`JUKEBOX_QUEUE_UPDATED`, `JUKEBOX_SONG_STARTED`, `JUKEBOX_SONG_ENDED`) for realtime-service to forward via Socket.io.
12. **Song catalog management** — Staff can list, filter (genre, language, active status), edit metadata (title, artist, genre, language, is_active, sort_order, duration_secs), and delete songs from the catalog.

---

## API Endpoints

### Configuration

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/v1/jukebox/:tenant_id/config` | None | Get jukebox config for tenant |
| PATCH | `/api/v1/jukebox/:tenant_id/config` | (unenforced) | Update config settings |
| POST | `/api/v1/jukebox/:tenant_id/config/player-setup-code` | (unenforced) | Generate 6-digit setup code for player pairing |

### Queue

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/v1/jukebox/:tenant_id/:branch_id/queue` | None | Full queue with now-playing, up-next, wait estimates |
| GET | `/api/v1/jukebox/:tenant_id/:branch_id/queue/status` | None | Lightweight queue status + player health check |
| POST | `/api/v1/jukebox/:tenant_id/:branch_id/queue/add` | Optional customer JWT | Add song to queue (enforces config limits, triggers billing) |
| DELETE | `/api/v1/jukebox/:tenant_id/:branch_id/queue/:id` | Optional customer JWT | Cancel own queued song |

### Search

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/v1/jukebox/:tenant_id/search?q=` | None | Search tenant song catalog (min 2 chars, max 20 results) |

### Song Catalog (owner/staff management)

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/v1/jukebox/:tenant_id/songs` | Optional staff JWT (best-effort) | Add song by URL (YouTube or Spotify) |
| POST | `/api/v1/jukebox/:tenant_id/songs/bulk` | Optional staff JWT (best-effort) | Bulk add up to 50 songs by URL array |
| GET | `/api/v1/jukebox/:tenant_id/songs/count` | None | Count active songs in catalog |
| GET | `/api/v1/jukebox/:tenant_id/songs` | None | List catalog (filter: search, genre, language, is_active; paginated) |
| PATCH | `/api/v1/jukebox/:tenant_id/songs/:id` | None | Edit song metadata |
| DELETE | `/api/v1/jukebox/:tenant_id/songs/:id` | None | Remove song from catalog |

### Player (player token required via `X-Player-Token` header)

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/v1/jukebox/player/pair` | None | Submit setup code, receive player token |
| GET | `/api/v1/jukebox/player/:tenant_id/:branch_id/next` | Player token | Advance queue to next song, archive current |
| POST | `/api/v1/jukebox/player/:tenant_id/:branch_id/finished` | Player token | Mark song as completed or skipped, auto-start next |
| POST | `/api/v1/jukebox/player/:tenant_id/:branch_id/heartbeat` | Player token | Update `player_last_seen` timestamp |

### History

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/v1/jukebox/:tenant_id/:branch_id/history` | None | Get playback history for branch |

---

## Data Models

### JukeboxConfig
- `tenant_id` (unique — one config per tenant, not per branch)
- `branch_id` — the branch this config/player applies to
- `is_enabled`, `price_per_song` (paise, default 2000 = ₹20)
- `max_queue_length` (default 20), `max_songs_per_user` (default 3)
- `allow_dedications` (bool), `content_filter` ("family" / "adult" / "off")
- `player_setup_code` (nullable, 6-digit, stored during pairing), `player_token` (nullable, long-lived JWT)
- `player_last_seen` — timestamp of last heartbeat; used to determine player connectivity

### JukeboxQueue
- `tenant_id`, `branch_id`, `position` (integer ordering)
- `status` — queued / playing / played / skipped
- Song fields: `song_id`, `song_title`, `song_artist`, `song_duration_secs`, `song_thumbnail`, `source`
- `requested_by_alias` (display name), `requested_by_customer_id` (nullable — set if customer is logged in)
- `dedicated_to_alias`, `dedication_message` (nullable)
- `order_id` (nullable — linked billing order from order-service)
- `amount_charged` (paise)
- `played_at`, `skipped_at` (nullable)

### JukeboxHistory
- `tenant_id`, `branch_id`, `song_title`, `song_artist`, `song_thumbnail`
- `requested_by` (alias), `dedicated_to` (nullable)
- `played_at`, `duration_secs`

### Song (tenant song catalog)
- `tenant_id`, `title`, `artist`, `duration_secs` (default 240s — see caveats below)
- `thumbnail` (nullable), `source` ("youtube" or "spotify"), `source_id`, `source_url`
- `genre`, `language` (nullable), `is_active`, `sort_order`
- `added_by` (staff user ID, nullable)
- Unique constraint: `(tenant_id, source, source_id)` — prevents duplicate songs per tenant

---

## Business Rules

- Jukebox must be enabled (`is_enabled: true`) before songs can be added to the queue.
- Queue additions are blocked when the active queue length reaches `max_queue_length`.
- Identified customers (with JWT) are limited to `max_songs_per_user` songs in the queue simultaneously. Anonymous users have no per-user limit.
- Only the customer who requested a song can cancel it (enforced by `requested_by_customer_id` match). Staff can cancel any song by not providing a customer token.
- Only songs in `queued` status can be cancelled. Playing and played songs cannot be removed.
- Billing is best-effort: if order-service call fails, the song is still added to the queue and the failure is logged as a warning.
- Player connectivity is considered active if `player_last_seen` is within the last 60 seconds.
- Setup codes are 6 digits, valid for 600 seconds (10 minutes), stored in Redis. Pairing consumes the code and deletes it from Redis.
- Player tokens are long-lived JWTs signed with a separate secret (`JUKEBOX_PLAYER_SECRET`). They are stored in the player app's localStorage.
- Song duration from oEmbed is always defaulted to 240 seconds (4 minutes) because neither noembed.com (YouTube) nor Spotify oEmbed returns actual track duration. Staff must manually correct durations via PATCH if accurate wait times are important.
- The `finished` endpoint auto-advances to the next queued song atomically — it marks the finished song, adds to history, and sets the next song to `playing` in one flow.
- `GET /player/next` and `POST /player/finished` both write to history and advance the queue; calling both for the same song would double-write history. The intended flow is to use only `finished`.
- In-house ad zone in the player app is served directly by ads-service — jukebox-service has no involvement.
- The content filter setting (`family` / `adult` / `off`) is stored but not currently enforced server-side during song catalog addition or queue requests.

---

## Service Dependencies

| Service | Direction | Purpose |
|---|---|---|
| order-service (port 3004) | Outbound (HTTP internal) | Adds jukebox song as a line item to the customer's open order for billing |
| Redis | Internal | Setup code storage (TTL 600s); pub/sub events (JUKEBOX_QUEUE_UPDATED, JUKEBOX_SONG_STARTED, JUKEBOX_SONG_ENDED) |
| realtime-service | Downstream (listens to Redis) | Broadcasts queue change events to Socket.io rooms for live queue display |
| ads-service | None (consumed by frontend directly) | jukebox-player frontend fetches `placement=jukebox_player` ads independently |
| noembed.com / Spotify oEmbed | Outbound (HTTP, third-party) | oEmbed metadata extraction for song catalog building (no API key required) |

---

## Current Build Status

**Fully implemented (core):**
- JukeboxConfig CRUD (upsert)
- Player pairing flow (setup code → Redis → player token JWT)
- Player heartbeat and connectivity tracking
- Queue management (add, list, status, cancel)
- Per-user and total queue limit enforcement
- Billing integration with order-service (non-fatal)
- `getNextSong()` and `finishSong()` with automatic queue advancement
- Redis Pub/Sub event publishing on queue changes
- Song history logging
- Song catalog: add by URL (single + bulk), list with filters and pagination, edit metadata, delete
- oEmbed metadata extraction (YouTube via noembed.com, Spotify via open.spotify.com/oembed)
- Song search against tenant catalog

**apps/jukebox-player (port 5178):**
- Always-on TV screen: now-playing, queue, QR code for song requests
- Ad zone via `useJukeboxAds()` hook (rotates 5 ads every 30s, refreshes every 10 minutes)

**Not yet built / pending:**
- Real-time queue updates via Socket.io push to customer-facing screens (events are published to Redis but realtime-service forwarding to jukebox rooms is not confirmed)
- Customer-facing QR scan → song request flow on mobile
- Content filter enforcement server-side (field exists, no filter logic implemented)
- Actual refund on song cancellation (the `cancelSong()` function returns `refunded: amount` but does not call order-service to remove the line item)
- YouTube API-based search fallback (was removed; now catalog-only search)

---

## Open Questions / Gaps

1. **Auth enforcement is inconsistent** — Config PATCH, song catalog management (POST/PATCH/DELETE songs), and setup code generation have no `preHandler` auth guard in the current route file. Any caller with access to port 3014 can modify the config or catalog. Is this intentional (relying on Kong gateway for auth), or should `authenticateStaff` be added?

2. **Song cancellation refund** — `cancelSong()` returns `{ refunded: amount }` but does not call order-service to remove the billing line item. Is cancellation expected to trigger a refund, and who is responsible for that flow?

3. **Content filter enforcement** — The `content_filter` config field (`family` / `adult` / `off`) is stored but never applied when songs are added to the catalog or the queue. What is the expected behavior? Should the platform filter YouTube/Spotify source material by genre or explicit metadata?

4. **One config per tenant vs. per branch** — `JukeboxConfig` has a `@unique` constraint on `tenant_id`, meaning only one jukebox per tenant regardless of branch count. The `branch_id` field on the config selects which branch the player is associated with, but a multi-branch tenant cannot run jukeboxes at two branches simultaneously. Is this a known limitation or a product decision?

5. **`GET /player/next` vs `POST /player/finished`** — Both endpoints can advance the queue and write to history. The AGENT_CONTEXT does not clarify the intended call order. If a player calls `next` and then `finished` for the same song, history will be double-written. Should `next` be removed or made read-only?

6. **oEmbed rate limits** — Bulk import (up to 50 URLs) makes concurrent oEmbed requests to noembed.com and Spotify. No rate limiting or delay is applied. Under heavy use this could result in 429 responses and failed imports. Is there a plan for retry logic or batching?

7. **Player token rotation** — Player tokens are long-lived JWTs with no explicit expiry in the pairing response. What is their TTL? Is there a revocation mechanism if a player device is replaced?

8. **Song request from customer mobile** — The product vision mentions customers scanning a QR code to request songs from their phone. The queue add endpoint exists and accepts an optional customer JWT, but no customer-facing UI or flow is built. What is the planned UX — does the customer scan a table QR to land on a song request page?

9. **Jukebox plan gating** — Jukebox is not listed in the `PLAN_FEATURES` constants. Should it be a Pro+ feature, available to all plans, or sold as an add-on?

10. **Price per song — fixed or variable** — Currently one price per jukebox config. Is there a need for variable pricing (e.g., higher price during peak hours or for certain song types)?
