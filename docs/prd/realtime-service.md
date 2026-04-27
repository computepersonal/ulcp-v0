# realtime-service — PRD

## Overview

The realtime-service (port 3008) is the event-broadcast hub of the ULCP platform. It subscribes to all Redis Pub/Sub events published by other services and forwards them to the correct Socket.io rooms in real time. It is the sole provider of WebSocket connections to all clients — staff POS, KDS devices, customer PWA, and the social/Jukebox feature. The service also hosts the `/social` Socket.io namespace, which powers an anonymous social room inside venues (chat, polls, reactions, private messaging, drink-sending, and trivia). Zero polling is used anywhere in the platform — every live update flows through this service.

---

## Users / Actors

| Actor | Interaction |
|---|---|
| Staff (POS web app) | Receives order:new, order:status:changed, kot:ready, table:status:changed, inventory:critical via Socket.io |
| Tenant owner / manager | Connected to the owner room — receives order:completed, order:unbilled_alert, inventory:low, dashboard:update, tenant:plan:changed |
| KDS device (kitchen/bar) | Connected to kitchen or bar room — receives kot:created, kot:status:changed, kot:rejected |
| Customer (PWA / mobile) | Connected to session or customer room — receives order:status:changed, payment:completed |
| Customer (Social room) | Connected to /social namespace — participates in chat, polls, reactions, private messages, drink requests |
| Token display (Type 1 businesses) | Connected to token room — receives token:update for queue number display |
| Internal services (other services) | Can call POST /api/v1/realtime/broadcast to manually push any event to any room |
| Operations / DevOps | GET /api/v1/realtime/stats to inspect live connection counts and active rooms |

---

## Core Features

1. **Redis Pub/Sub → Socket.io bridge** — Subscribes to 21 Redis event channels and routes each to the correct Socket.io room(s). This is the core function of the service.
2. **Multi-namespace Socket.io server** — The default namespace handles all staff, KDS, customer, dashboard, owner, and token rooms. A separate `/social` namespace handles venue social rooms.
3. **Named Socket.io rooms** — Every broadcast targets a specific scoped room (tenant, branch, kitchen station, session, customer, dashboard, token). No global broadcasts.
4. **Internal broadcast endpoint** — Any service can push an event to any Socket.io room via `POST /api/v1/realtime/broadcast` with the internal secret. Useful for one-off pushes not covered by the event subscriber.
5. **Connection stats** — `GET /api/v1/realtime/stats` returns total live connections and a list of all active rooms with their sizes.
6. **Social namespace (`/social`)** — Full-featured venue social room per `tenant_id + branch_id`. Features: public chat, private messaging, anonymous aliases with emoji avatars, public/private mode, user join/leave announcements, polls (with auto-close), emoji reactions (per-message and floating broadcast), content sharing (images, videos, links, polls, music, match scores, GIFs), drink-sending action (triggers `social:drink:order` event for order-service), and bot commands (`/trivia`, `/vibe`, `/poll`, `/joke`, `/shoutout`, `/help`).
7. **Social room auth** — `/social` namespace requires a valid customer JWT token in `socket.handshake.auth.token`. Staff and unauthenticated users cannot join.
8. **Social presence via Redis** — Social room member lists are stored in Redis hashes (`social:room:{tenant_id}:{branch_id}`) so they survive service restarts and are queryable via HTTP.
9. **Public presence HTTP endpoint** — `GET /api/v1/social/:tenant_id/:branch_id/active` returns the count and list of public-mode users in a social room without requiring a WebSocket connection.
10. **Alias uniqueness and reconnect handling** — Aliases within a social room must be unique. On rapid reconnects (page refresh within 20 seconds), the previous alias and emoji are reused and join/leave spam is suppressed.
11. **Trivia integration** — `/trivia` bot command in social rooms is backed by a `setupTriviaHandlers()` module attached to the `/social` namespace.
12. **Jukebox events** — Subscribes to `JUKEBOX_SONG_STARTED`, `JUKEBOX_SONG_ENDED`, `JUKEBOX_QUEUE_UPDATED` and emits the corresponding events to the `/social` namespace room, enabling live jukebox display in the social view.
13. **KOT rejection broadcast** — `KOT_REJECTED` events are broadcast to both the specific branch room and the parent tenant room, so any manager logged in to a different branch view still sees the alert.
14. **Unbilled order alert** — `ORDER_UNBILLED_ALERT` is broadcast to the owner room and the branch room, notifying staff of orders that were in-progress at midnight but never billed.

---

## API Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/health` | None | Service health; includes live connection count |
| GET | `/api/v1/realtime/stats` | None | Total connections, uptime, list of active Socket.io rooms with sizes |
| POST | `/api/v1/realtime/broadcast` | `X-Internal-Secret` | Manually broadcast any event to any named Socket.io room |
| GET | `/api/v1/social/:tenant_id/:branch_id/active` | None | List of public-mode users currently in a venue's social room |

### Socket.io Events (default namespace — emitted to clients)

| Event name | Target room | Trigger |
|---|---|---|
| `order:new` | `tenant:{t}:branch:{b}` | ORDER_CREATED |
| `order:status:changed` | Branch room + session room + `order:{id}` room | ORDER_STATUS_CHANGED |
| `order:completed` | `tenant:{t}:owner` | ORDER_COMPLETED |
| `order:unbilled_alert` | Owner room + branch room | ORDER_UNBILLED_ALERT |
| `kot:created` | `kitchen:{t}:{b}:{station}` | KOT_CREATED |
| `kot:status:changed` | Kitchen/bar station room | KOT_STATUS_CHANGED |
| `kot:ready` | Branch room | KOT_STATUS_CHANGED (status=ready) |
| `kot:rejected` | Branch room + tenant room | KOT_REJECTED |
| `table:status:changed` | Branch room | TABLE_STATUS_CHANGED or TABLE_CLOSED |
| `payment:completed` | Branch room + session room + order room | PAYMENT_COMPLETED |
| `inventory:low` | `tenant:{t}:owner` | STOCK_LOW |
| `inventory:critical` | `tenant:{t}` (all staff) | STOCK_CRITICAL |
| `menu:item:available` | `tenant:{t}` | ITEM_BACK_IN_STOCK |
| `menu:item:unavailable` | `tenant:{t}` | MENU_ITEM_UNAVAILABLE |
| `dashboard:update` | `tenant:{t}:dashboard` | DASHBOARD_UPDATE |
| `token:update` | `token:{t}:{b}` | TOKEN_DISPLAY_UPDATE |
| `tenant:plan:changed` | `tenant:{t}` | TENANT_PLAN_CHANGED |
| `jukebox:now_playing` | `/social` namespace + branch room | JUKEBOX_SONG_STARTED |
| `jukebox:song_ended` | `/social` namespace | JUKEBOX_SONG_ENDED |
| `jukebox:queue_updated` | `/social` namespace | JUKEBOX_QUEUE_UPDATED |

### Socket.io Events (`/social` namespace — client-to-server)

| Event | Purpose |
|---|---|
| `social:join` | Join a venue's social room with alias, mode (public/private), and intent |
| `social:leave` | Explicitly leave the social room |
| `social:message` | Send a public chat message (rate-limited: 1/second); supports bot commands |
| `social:private:message` | Send a direct message to a specific peer by their stable peer_id |
| `social:action:request` | Request a social action (drink, join_table, dance, date, bff) to another user |
| `social:action:response` | Accept or decline a social action request |
| `social:toggle:mode` | Switch between public and private visibility |
| `social:content:share` | Share content (image, video, link, poll, music, match score, GIF) to the room |
| `social:poll:vote` | Cast a vote on a shared poll |
| `social:message:react` | React to (or un-react from) a message with an emoji |
| `social:reaction:broadcast` | Broadcast a floating emoji reaction to the whole room |
| `social:users:request` | Request the current user list |

### Socket.io Events (`/social` namespace — server-to-client)

| Event | Purpose |
|---|---|
| `social:user:joined` | Notify room when a new user joins (public joins only) |
| `social:user:left` | Notify room when a user leaves |
| `social:users:list` | Full user list sent to the joining user |
| `social:users:updated` | Updated user list broadcast after any join/leave/mode change |
| `social:bot:message` | Bot announcements and command responses |
| `social:message` | Broadcast of a public chat message |
| `social:private:message` | Deliver a direct message to the recipient |
| `social:private:message:sent` | Ack to sender with recipient alias |
| `social:action:received` | Deliver an action request to the target |
| `social:action:resolved` | Notify both parties of action acceptance/rejection |
| `social:announcement` | Public room announcement (e.g. "Alice sent a drink to Bob") |
| `social:drink:order` | Emitted to room when a drink action is accepted (for order-service integration) |
| `social:content:received` | Deliver shared content (image, poll, link, etc.) to room members |
| `social:poll:updated` | Real-time vote count update |
| `social:poll:closed` | Final vote counts when a poll expires |
| `social:reaction:updated` | Per-message reaction count update |
| `social:reaction:floatup` | Floating emoji broadcast |

---

## Data Models

The realtime-service has **no Prisma schema and no database**. All state is ephemeral and stored in Redis:

### Social Room State (Redis hash)
Key: `social:room:{tenant_id}:{branch_id}`
Value: hash where each field is a `socket_id` and the value is a JSON `SocialUserEntry`:
```
{ alias, mode ("public"|"private"), joined_at (epoch ms), customer_id, emoji, intent ("socialize"|"date"|null) }
```
TTL: 4 hours (refreshed on each join).

### Customer Socket Index (Redis string)
Key: `social:csock:social:room:{tenant_id}:{branch_id}:{customer_id}`
Value: current `socket_id` for this customer in this room.
Used for stable private message routing that survives reconnects. TTL: 4 hours.

### Recent Leave Marker (Redis string)
Key: `social:recent_leave:social:room:{tenant_id}:{branch_id}:{customer_id}`
Value: alias string. TTL: 20 seconds.
Suppresses duplicate join/leave spam on rapid page refresh.

### Poll State (Redis string)
Key: `social:poll:{message_id}`
Value: JSON `{ question, options, votes[], voters[], expires_at }`.
TTL: poll duration in minutes.

### Message Reactions (Redis string)
Key: `social:reactions:{message_id}`
Value: JSON `{ emoji: socket_id[] }`.
TTL: 4 hours.

---

## Business Rules

- **Zero polling**: All client state updates are push-only via Socket.io. No client should poll any HTTP endpoint for live data.
- **Room naming is strict**: Room names follow exact patterns (`tenant:{t}`, `tenant:{t}:branch:{b}`, `tenant:{t}:owner`, `tenant:{t}:dashboard`, `kitchen:{t}:{b}:kitchen`, `kitchen:{t}:{b}:bar`, `session:{s}`, `customer:{c}`, `token:{t}:{b}`). Clients must join the correct room at connect time.
- **KOT station routing**: `KOT_CREATED` and `KOT_STATUS_CHANGED` route to either the `kitchen` or `bar` station room based on the `station` field in the event payload. Bar station exists only for `seated_full_service` business type.
- **Social room auth**: The `/social` namespace requires a valid customer JWT. Staff cannot join social rooms.
- **Social alias uniqueness**: Within a room, aliases must be unique. If a chosen alias is taken, a numeric suffix is appended (e.g. "Ali2", "Ali3").
- **Social reconnect grace period**: If a customer reconnects within 20 seconds of leaving, their previous alias and emoji are reused and the join/leave messages are suppressed.
- **Social message rate limit**: 1 public message per second per socket. Excess messages are silently dropped.
- **Social message length limit**: Max 500 characters per message.
- **Social alias length limit**: Max 30 characters.
- **Social poll max options**: 4 options per poll.
- **Private messaging routing**: Private messages use the stable `customer_id` (peer_id) as the address, not the socket_id. The Redis csock index translates `customer_id` to the current socket_id at send time.
- **Drink action**: When a `drink` social action is accepted, a `social:drink:order` event is emitted to the room. This event carries `item_id`, `item_name`, `from_alias`, `to_alias`, and `to_table`. Actual order creation is the responsibility of the order-service (which must listen for this event — currently not verified).
- **Internal broadcast**: `POST /api/v1/realtime/broadcast` emits to any room by name. The response includes `delivered_to` (count of sockets in the room at time of broadcast).
- **No message persistence**: Chat messages, polls, and reactions are not stored anywhere beyond their Redis TTLs. There is no message history.

---

## Service Dependencies

| Dependency | Direction | Reason |
|---|---|---|
| Redis (pub/sub) | Subscriber | Consumes all 21 event channels from other services |
| Redis (data store) | Read/write | Social room presence, polls, reactions, csock index |
| order-service | Event consumer | ORDER_CREATED, ORDER_STATUS_CHANGED, ORDER_COMPLETED, ORDER_UNBILLED_ALERT |
| inventory-service | Event consumer | STOCK_LOW, STOCK_CRITICAL, ITEM_BACK_IN_STOCK |
| catalogue-service | Event consumer | MENU_ITEM_UNAVAILABLE |
| tenant-service | Event consumer | TABLE_STATUS_CHANGED, TABLE_CLOSED, TENANT_PLAN_CHANGED |
| order-service (KOT) | Event consumer | KOT_CREATED, KOT_STATUS_CHANGED, KOT_REJECTED |
| analytics-service | Event consumer | DASHBOARD_UPDATE |
| jukebox-service | Event consumer | JUKEBOX_SONG_STARTED, JUKEBOX_SONG_ENDED, JUKEBOX_QUEUE_UPDATED |
| identity-service | JWT validation | Verifies customer JWT on /social namespace connection |
| All frontend clients | Socket.io clients | Staff POS, KDS, customer PWA, social room |
| PostgreSQL | None | No database |

---

## Current Build Status

**Fully implemented:**
- Fastify HTTP server with CORS, helmet, Swagger docs at `/docs`
- Socket.io server attached to the same HTTP server
- Redis Pub/Sub subscriber for all 21 event channels
- Full event-to-room routing logic for all 21 channels
- `/social` Socket.io namespace with customer JWT auth middleware
- All social room features: join/leave, public chat, private messaging, alias management, reconnect handling, polls, reactions, content sharing, social actions (drink, join_table, dance, date, bff), bot commands
- Trivia handlers attached to the social namespace
- Internal broadcast endpoint
- Connection stats endpoint
- Public social presence HTTP endpoint
- Graceful shutdown (SIGTERM/SIGINT)

**Stubbed or missing:**
- **`socketMiddleware` (Redux integration)** — The CLAUDE.md documents a `socketMiddleware` that dispatches Redux actions (`addActiveOrder()`, `playSound()`, `markKOTReady()`, etc.) on the client side when Socket.io events arrive. This middleware lives in the frontend apps, not this service, and its current implementation status in `apps/web` is not confirmed here.
- **`social:drink:order` consumer** — When a drink action is accepted in a social room, `social:drink:order` is emitted to the room. There is no confirmed listener in order-service that picks this up and creates an actual order.
- **Trivia content** — `setupTriviaHandlers()` is wired in but the trivia question bank and game logic in `trivia.ts` and `trivia-packs/` was not inspected. Completeness is unknown.
- **Floor map updates** — The CLAUDE.md references a real-time floor map with drag-and-drop table assignment. The `table:status:changed` event is handled, but whether KDS/floor-map-specific events beyond this are implemented is not confirmed.
- **Token display (Type 1)** — `TOKEN_DISPLAY_UPDATE` → `token:update` is wired. The token display app in `apps/web` or a dedicated app consuming this is not confirmed.
- **No room join/leave auth for default namespace** — Staff can connect to any tenant's rooms by supplying any `tenant_id`. There is no server-side validation that the connecting user belongs to the specified tenant.

---

## Open Questions / Gaps

1. **Default namespace auth**: Staff connect to tenant-specific rooms (`tenant:{t}:branch:{b}`) by name. How does the server verify that a connecting socket's JWT belongs to that `tenant_id`? Currently there is no middleware enforcing this in the default namespace.
2. **`social:drink:order` handling**: When a drink is sent via the social room, the event is emitted but where is the actual order created? Does order-service subscribe to this Socket.io event, or does the frontend call the order-service HTTP API directly?
3. **Trivia completeness**: Is the trivia feature (question bank, scoring, multiplayer rounds) fully implemented? What happens when a client sends `/trivia` — is a real game started?
4. **Social room analytics**: Are social room engagement metrics (messages sent, actions taken, peak occupancy) tracked anywhere? The ads-service uses `social_room` as a placement surface — this implies some analytics are needed.
5. **Social room moderation**: Can a tenant owner remove a user from their social room? Can they disable the social room entirely?
6. **Persistent chat**: Is there a requirement to show chat history when a user joins a room mid-conversation? Currently all messages are ephemeral.
7. **Scale / multi-instance**: Socket.io is configured with Redis pub/sub for the event subscriber, but if multiple realtime-service instances are run, Socket.io itself needs a Redis adapter to route events across instances. Is the Redis adapter (`@socket.io/redis-adapter`) configured?
8. **DASHBOARD_UPDATE publisher**: Who publishes the `DASHBOARD_UPDATE` Redis event, and at what frequency? This was not confirmed in the reviewed source files.
9. **TOKEN_DISPLAY_UPDATE publisher**: Who publishes `TOKEN_DISPLAY_UPDATE`? This is referenced in the event subscriber but the publisher was not identified.
10. **Social room TTL**: The Redis hash for a social room has a 4-hour TTL refreshed on each join. What happens if a user is in a room for more than 4 hours? Is the TTL refreshed on each message?
11. **`MENU_ITEM_UNAVAILABLE` publisher**: Who publishes this event? The catalogue-service presumably does on item toggle, but this was not confirmed.
12. **Intent field on social join**: Users can specify `intent: "socialize" | "date"`. How is this used in the UI? Is it visible to other users? Are there any privacy or safety considerations?
