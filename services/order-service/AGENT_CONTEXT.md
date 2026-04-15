# order-service — Agent Context

> This file is the living knowledge base for the order-service agent.
> Update this file whenever routes, models, or behavior changes.
> Last updated: 2026-04-15

## Current Implementation Status
**FULLY IMPLEMENTED**

## What's Built
- Order placement (customer JWT + staff JWT)
- Order status lifecycle (pending → confirmed → preparing → ready → completed)
- Order cancellation with permission levels
- Bill generation (subtotal, GST, discount, commission)
- Payment recording
- KOT generation with sequential numbering (KOT-001, KOT-002...)
- KOT auto-split for seated_full_service (food → kitchen, drinks → bar)
- Three KOT ack modes (auto BullMQ, kds manual, printer webhook)
- KOT status flow (pending → acknowledged → preparing → ready → served)
- Commission calculation on order completion
- GST calculation (inclusive + exclusive, intra/interstate)
- DailyCounter atomic upsert for KOT numbering
- BullMQ auto-ack queue (delayed job cancels on manual ack)
- Internal endpoints for jukebox line items (add/remove)

## Prisma Models (current)
- Order, KOT, OrderStatusHistory, CommissionRecord, DailyCounter

## Known Issues / Gotchas
- BullMQ requires Redis ≥ 5.0 — Docker Redis runs on port 6380 (NOT 6379) due to local Redis 3.0 incompatibility
- acknowledgeKot() is idempotent — safe to call multiple times
- Commission is calculated at order completion, not at payment
- Razorpay Route is a placeholder in current implementation

## Recent Changes
- 2026-03-28: Service fully built (port 3004)
- 2026-03-28: KOT sequential numbering via DailyCounter atomic upsert
- 2026-03-28: GST calculation (inclusive + exclusive)
- 2026-03-28: KOT auto-split for Type 3 (seated_full_service)
- 2026-03-28: Three KOT ack modes with BullMQ
- 2026-03-28: acknowledgeKot() idempotent
- 2026-03-28: Internal jukebox billing endpoints

## Environment
- Dev port: 3004
- DB schema: order_svc
- BullMQ Redis: port 6380 (must be Redis ≥ 5.0)
- Calls tenant-service for kot_ack_mode (cached 30min)

## How to Run Locally
```bash
cd services/order-service
pnpm dev
# Health: GET http://localhost:3004/health
```

## How to Run Tests
```bash
# No tests written yet
```

## How to Deploy
```bash
docker compose -f docker-compose.dev.yml up order-service
docker compose -f docker-compose.dev.yml logs -f order-service
```

## Pending / TODO
- Razorpay Route actual integration (currently placeholder)
- Refund endpoints (full / partial / item-level)
- Table session close flow (triggers inventory deduction, commission, receipt)
- OrderStatusHistory querying for audit trail
- Unit tests for GST calculation
- E2E tests for order placement flow
