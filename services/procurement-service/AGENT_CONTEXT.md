# procurement-service — Agent Context

> This file is the living knowledge base for the procurement-service agent.
> Update this file whenever routes, models, or behavior changes.
> Last updated: 2026-04-16

## Current Implementation Status
**FULLY IMPLEMENTED**

## What's Built
- Vendor CRUD + vendor item catalog (prices, unit, lead_time per ingredient)
- Vendor preferences per ingredient (preferred vendor + ranking hints)
- Bid requests (create, list, get, update draft, cancel, open for bidding)
- Add vendors to bid request + invite additional vendors
- Submit bids (vendor portal via magic link token)
- Bid ranking: weighted score (price 40%, lead_time 30%, rating 20%, payment_terms 10%)
- Award bid → creates PurchaseOrder in inventory-service via internal API
- Bid withdraw
- BullMQ bid-auto-close queue (delayed job at bid_close_at, deterministic job ID = bidRequestId)
- BullMQ bid-recurrence queue (repeating job for recurring orders)
- Direct purchase orders (state machine: pending→confirmed/cancelled→dispatched/cancelled→delivered)
- Market view: grouped by ingredient, recommended vendor (preferred first → highest score), 15min Redis cache
- VendorToken magic links (token_type: "bid" | "direct_order", single-use via used_at timestamp)

## Prisma Models (current)
- Vendor, VendorItem, VendorPreference
- BidRequest, BidRequestVendor, Bid
- VendorToken, DirectOrder

## Direct Order State Machine
`PENDING → CONFIRMED/CANCELLED → DISPATCHED/CANCELLED → DELIVERED`

## Key Routes
```
GET/POST   /api/v1/procurement/:tenant_id/vendors
GET/PATCH/DELETE /api/v1/procurement/:tenant_id/vendors/:id
POST/GET   /api/v1/procurement/:tenant_id/vendors/:id/items
PATCH/DELETE /api/v1/procurement/:tenant_id/vendors/:id/items/:item_id
POST/GET/DELETE /api/v1/procurement/:tenant_id/preferences

POST/GET   /api/v1/procurement/:tenant_id/bid-requests
GET/PATCH/DELETE /api/v1/procurement/:tenant_id/bid-requests/:id
POST  /api/v1/procurement/:tenant_id/bid-requests/:id/open
POST  /api/v1/procurement/:tenant_id/bid-requests/:id/close
GET   /api/v1/procurement/:tenant_id/bid-requests/:id/bids/ranked
POST  /api/v1/procurement/:tenant_id/bid-requests/:id/award/:bid_id
POST  /api/v1/procurement/:tenant_id/bid-requests/:id/invite

POST/GET   /api/v1/procurement/:tenant_id/direct-orders
GET/DELETE /api/v1/procurement/:tenant_id/direct-orders/:id
PATCH /api/v1/procurement/:tenant_id/direct-orders/:id/status

GET /api/v1/procurement/:tenant_id/market
GET /api/v1/procurement/:tenant_id/market/:ingredient_id/history

# Vendor-facing (no JWT — token auth):
GET  /api/v1/procurement/vendor/bid-request/:token
POST /api/v1/procurement/vendor/bid-request/:token/bid
PATCH /api/v1/procurement/vendor/bid/:bid_id/withdraw
GET  /api/v1/procurement/vendor/order/:token
POST /api/v1/procurement/vendor/order/:token/respond
```

## Known Issues / Gotchas
- Vendor portal (apps/vendor-portal, port 5176) is token-based — no login screen required
- VendorToken.used_at set on first action — single-use token
- BullMQ bid-auto-close job ID must be deterministic (= bidRequestId) to allow cancellation
- `awardBid()` calls inventory-service internal API — both services must share same INTERNAL_API_SECRET
- Market view cached 15min in Redis — stale after vendor items update (cache busted only on next request after TTL)

## Recent Changes
- 2026-03-28: Service fully built (port 3013)
- 2026-03-28: Bid scoring algorithm implemented
- 2026-03-28: VendorToken magic links (72hr expiry)
- 2026-03-28: BullMQ auto-close + recurrence queues
- 2026-03-28: Market view with 15min Redis cache
- 2026-03-28: awardBid() creates PO in inventory-service
- 2026-04-16: AGENT_CONTEXT.md refreshed with full route list

## Environment
- Dev port: 3013
- DB schema: procurement
- Redis: port 6380
- Calls inventory-service via X-Internal-Secret for PO creation/receive

## How to Run Locally
```bash
cd services/procurement-service
pnpm dev
# Health: GET http://localhost:3013/health
# Swagger: http://localhost:3013/docs
```

## How to Deploy
```bash
docker compose -f docker-compose.dev.yml up procurement-service
docker compose -f docker-compose.dev.yml logs -f procurement-service
```

## Frontend: apps/vendor-portal (port 5176)
- React 18 + Vite + Tailwind + TanStack Query v5
- 6 screens: BidLanding, BidSubmit, BidConfirmed, BidResult, DirectOrderView, DirectOrderDone
- Token from URL param — no login needed

## Dependencies on Other Services
- **inventory-service** (internal) — calls /internal/purchase-orders on bid award, /internal/purchase-orders/:id/receive on direct order delivered

## Pending / TODO
- Vendor email notifications on bid request invite (hook into notification-service)
- Vendor rating system (update after order received)
- Unit tests for bid scoring algorithm
- E2E tests for full bid → award → PO flow
