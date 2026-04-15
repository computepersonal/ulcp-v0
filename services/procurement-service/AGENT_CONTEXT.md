# procurement-service — Agent Context

> This file is the living knowledge base for the procurement-service agent.
> Update this file whenever routes, models, or behavior changes.
> Last updated: 2026-04-15

## Current Implementation Status
**FULLY IMPLEMENTED**

## What's Built
- Vendor CRUD + vendor item catalog
- Vendor preferences per ingredient
- Bid requests (create, list, get, update, cancel)
- Add vendors to bid request
- Submit bids (vendor portal action via magic link)
- Bid ranking algorithm (weighted score: price 40%, lead_time 30%, rating 20%, payment_terms 10%)
- Award bid → creates PurchaseOrder in inventory-service via internal API
- Bid withdraw
- BullMQ bid-auto-close queue (delayed job at bid_close_at)
- BullMQ bid-recurrence queue (repeating job for recurring orders)
- Direct purchase orders with state machine
- Market view (grouped by ingredient, cached 15min in Redis)
- VendorToken magic links (bid + direct_order types, single-use, 72hr)

## Prisma Models (current)
- Vendor, VendorItem, VendorPreference, BidRequest, BidRequestVendor, Bid, VendorToken, DirectOrder

## Direct Order State Machine
PENDING → CONFIRMED/CANCELLED → DISPATCHED/CANCELLED → DELIVERED

## Known Issues / Gotchas
- Vendor portal (apps/vendor-portal port 5176) uses token-based auth — no login screen
- VendorToken.used_at set on first action — single use
- BullMQ bid-auto-close: job ID must be deterministic (use bidRequestId) to allow cancellation
- awardBid() calls inventory-service internal API — both must have same INTERNAL_API_SECRET

## Recent Changes
- 2026-03-28: Service fully built (port 3013)
- 2026-03-28: Bid scoring algorithm implemented
- 2026-03-28: VendorToken magic links
- 2026-03-28: BullMQ auto-close + recurrence queues
- 2026-03-28: Market view with 15min Redis cache
- 2026-03-28: awardBid() creates PO in inventory-service

## Environment
- Dev port: 3013
- DB schema: procurement
- Calls inventory-service via X-Internal-Secret for PO creation

## How to Run Locally
```bash
cd services/procurement-service
pnpm dev
# Health: GET http://localhost:3013/health
```

## How to Deploy
```bash
docker compose -f docker-compose.dev.yml up procurement-service
docker compose -f docker-compose.dev.yml logs -f procurement-service
```

## Pending / TODO
- Vendor email notifications on bid request invite (notification-service integration)
- Vendor rating system (update after order received)
- Bid comparison view improvements
- Unit tests for bid scoring algorithm
- E2E tests for full bid → award → PO flow
