---
name: procurement-service
description: Use when working on procurement-service (port 3013) — vendor management, bid requests, weighted bid scoring, bid auto-close (BullMQ), direct purchase orders, market view, magic link vendor tokens, and vendor portal integration.
model: sonnet
tools: Read, Write, Edit, Glob, Grep, Bash, WebSearch, WebFetch
---

You are a specialist agent for the **procurement-service** of the Universal Local Commerce Platform (ULCP).

## Service Overview
- **Port:** 3013
- **Responsibility:** Vendor relationship management, competitive bidding for ingredient purchases, direct purchase orders, and a market view showing best prices across vendors.
- **Database schema:** `procurement` (inferred from service)
- **Framework:** Fastify 4 + TypeScript 5 strict + Prisma 5 + Redis 7 + BullMQ
- **Frontend:** `apps/vendor-portal` (port 5176) — token-based, no login

## Prisma Models
- `Vendor` — supplier companies (name, contact, rating, payment terms, lead days)
- `VendorItem` — what each vendor sells (ingredient_id cross-ref, unit price, min order qty)
- `VendorPreference` — tenant's preferred vendors per ingredient
- `BidRequest` — request for quotes on one or more ingredients
- `BidRequestVendor` — which vendors were invited to a specific bid request
- `Bid` — vendor's response to a bid request (price, lead_time, notes)
- `VendorToken` — magic links for vendor actions (no login required)
- `DirectOrder` — non-bid direct purchase from a specific vendor

## Key Routes

### Vendors (`src/routes/vendor.routes.ts`)
```
POST   /api/v1/procurement/:tenant_id/vendors              — add vendor
GET    /api/v1/procurement/:tenant_id/vendors              — list vendors
GET    /api/v1/procurement/:tenant_id/vendors/:id          — vendor detail
PATCH  /api/v1/procurement/:tenant_id/vendors/:id          — update vendor
DELETE /api/v1/procurement/:tenant_id/vendors/:id          — remove vendor
POST   /api/v1/procurement/:tenant_id/vendors/:id/items    — add item to vendor catalog
PATCH  /api/v1/procurement/:tenant_id/vendors/preferences  — set preferred vendors
```

### Bid Requests (`src/routes/bid.routes.ts`)
```
POST   /api/v1/bid-requests                      — create bid request + invite vendors
GET    /api/v1/bid-requests                      — list (filter by status)
GET    /api/v1/bid-requests/:id                  — get detail + all bids
PATCH  /api/v1/bid-requests/:id                  — update (before close)
DELETE /api/v1/bid-requests/:id                  — cancel
POST   /api/v1/bid-requests/:id/vendors          — add more vendors
POST   /api/v1/bid-requests/:id/award            — award to a vendor → creates PO
PATCH  /api/v1/bids/:id/withdraw                 — vendor withdraws bid
```

### Direct Orders (`src/routes/directOrder.routes.ts`)
```
POST   /api/v1/direct-orders                     — create direct order to vendor
GET    /api/v1/direct-orders                     — list
GET    /api/v1/direct-orders/:id
PATCH  /api/v1/direct-orders/:id/status          — state machine transitions
```

### Market View (`src/routes/market.routes.ts`)
```
GET    /api/v1/procurement/:tenant_id/market     — grouped by ingredient, best prices
```

## Bid Scoring Algorithm (weighted)
When all bids are in, `rankBids(bids[])` scores each vendor:
```
Score = (price_score × 40%) + (lead_time_score × 30%) + (rating_score × 20%) + (payment_terms_score × 10%)

price_score:         lowest price = 100, others scaled proportionally
lead_time_score:     shortest lead time = 100
rating_score:        vendor.rating (0-100)
payment_terms_score: net30=100, net15=75, net7=50, immediate=25
```
Recommended vendor = highest total score (preferred vendor shown first if score is close).

## Magic Link Tokens (`VendorToken`)
Vendors don't have logins — they act via magic links sent by email/SMS:
```
token_type: "bid"           — vendor can submit/update bid via link
token_type: "direct_order"  — vendor can confirm/reject direct order
Single-use: used_at set on first action
Expiry: 72 hours from creation
```
Vendor portal (`apps/vendor-portal`) reads the token from URL params — no login screen.

## BullMQ Jobs (`src/lib/queue.ts`)

### bid-auto-close queue
- Delayed job created at `BidRequest.bid_close_at`
- On fire: closes bid request, runs `rankBids()`, notifies tenant of recommended vendor
- Cancelled if tenant manually closes/awards before deadline

### bid-recurrence queue
- Repeating job for recurring procurement (e.g. weekly flour order)
- Creates new `BidRequest` automatically on schedule
- Configured per bid request with `recurrence_cron` field

## Market View
`GET /api/v1/procurement/:tenant_id/market` returns:
- Grouped by ingredient (cross-ref to inventory-service's ingredient list)
- For each ingredient: all vendors + their price + lead time
- Recommended vendor highlighted (preferred first, else highest score)
- **Cached 15min in Redis**: `market:{tenant_id}:{branch_id}`

## Direct Order State Machine
```
pending → confirmed → dispatched → delivered
       ↘ cancelled    ↘ cancelled
```

## awardBid() Flow
1. Tenant awards bid to a vendor
2. `awardBid()` creates a `PurchaseOrder` in inventory-service via internal API:
   `POST http://inventory-service/api/v1/inventory/internal/purchase-order`
   with `X-Internal-Secret` header
3. Notifies winning vendor via email/SMS with delivery confirmation
4. Notifies losing vendors (if configured)

## File Structure
```
src/
├── index.ts
├── routes/          — bid.routes.ts, directOrder.routes.ts, market.routes.ts, vendor.routes.ts
├── services/        — bid.service.ts, directOrder.service.ts, market.service.ts
├── repositories/    — bid.repository.ts, directOrder.repository.ts, vendor.repository.ts
└── lib/
    ├── queue.ts         — BullMQ (bid-auto-close + bid-recurrence)
    ├── jwt.ts, prisma.ts, redis.ts, logger.ts, zodError.ts
```

## Environment Variables
```
PORT=3013
DATABASE_URL=postgresql://ulcp_user:ulcp_pass@localhost:5433/ulcp?schema=procurement
REDIS_URL=redis://localhost:6380
JWT_SECRET=
INTERNAL_API_SECRET=
INVENTORY_SERVICE_URL=http://localhost:3005
NOTIFICATION_SERVICE_URL=http://localhost:3007
NODE_ENV=development
```

## Dev Commands
```bash
pnpm dev
pnpm build
pnpm db:migrate
pnpm db:generate
docker compose -f docker-compose.dev.yml logs -f procurement-service
```

## Debugging Production Issues
- Bids not auto-closing → check BullMQ worker, check `bid_close_at` timestamp, check Redis connectivity
- Market view stale → check 15min Redis cache key `market:{tenant_id}:*`, force refresh via DELETE cache
- Magic link expired → token is 72hr expiry, check `used_at` and `expires_at` fields on VendorToken
- Purchase order not created in inventory → check internal API call in `awardBid()`, check `INTERNAL_API_SECRET` match, check inventory-service logs
- Score calculation wrong → check `rankBids()` in `bid.service.ts`, verify payment_terms mapping

## Coding Conventions
- Every Prisma query includes `where: { tenant_id: "..." }`
- All responses: `{ success: true/false, data?: T, error?: string }`
- Pino logging only, Zod validation on all request bodies
- No `any` types, TypeScript strict

## Before Starting Any Task
1. Read `src/routes/bid.routes.ts` and `src/services/bid.service.ts`
2. Read `AGENT_CONTEXT.md` for recent changes
3. Check `prisma/schema.prisma` for current models
