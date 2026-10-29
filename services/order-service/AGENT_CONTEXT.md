# order-service — Agent Context

> This file is the living knowledge base for the order-service agent.
> Update this file whenever routes, models, or behavior changes.
> Last updated: 2026-04-16

## Current Implementation Status
**FULLY IMPLEMENTED**

## What's Built
- Order placement (customer JWT + staff JWT)
- Order status lifecycle: pending → confirmed → preparing → ready → completed
- Order cancellation with permission levels (pending: anyone; acknowledged: staff+; preparing: owner only)
- Bill generation (subtotal, GST, discount, commission)
- Payment recording → completes full lifecycle (status→completed, commission, ORDER_STATUS_CHANGED event)
- KOT generation with sequential numbering (KOT-001, KOT-002...) via DailyCounter atomic upsert
- KOT auto-split for seated_full_service (food → kitchen KOT, drinks → bar KOT)
- Three KOT ack modes: auto (BullMQ delayed job), kds (manual PATCH), printer (POST printer-ack)
- KOT status flow: pending → acknowledged → preparing → ready → served
- KOT reject flow: POST /reject → status "rejected"; if all KOTs rejected → order auto-cancelled
- Commission calculation on order completion (CommissionRecord)
- GST calculation (inclusive + exclusive, CGST+SGST split)
- `requirePermission(permission)` middleware — owner roles bypass, others checked against JWT permissions[]
- Daily summary report (GET /summary/daily) — gated behind reports:view permission
- Stale order sweep on startup + midnight cron: pending→silent cancel; confirmed/preparing/ready→ORDER_UNBILLED_ALERT
- BullMQ worker for auto-ack jobs with graceful shutdown

## Prisma Models (current)
- Order, KOT, OrderStatusHistory, CommissionRecord, DailyCounter

## Key Routes
```
POST   /api/v1/orders/                              ← place order
GET    /api/v1/orders/:tenant_id                    ← list (filter by branch/status/type/date)
GET    /api/v1/orders/:tenant_id/:id                ← detail
PATCH  /api/v1/orders/:tenant_id/:id/status         ← update status
POST   /api/v1/orders/:tenant_id/:id/cancel         ← cancel
GET    /api/v1/orders/:tenant_id/:id/bill           ← bill summary
POST   /api/v1/orders/:tenant_id/:id/payment        ← record payment (completes lifecycle)
GET    /api/v1/orders/:tenant_id/summary/daily      ← daily report (requires reports:view)

GET    /api/v1/kots/:tenant_id/:branch_id           ← list KOTs (filter by status)
PATCH  /api/v1/kots/:tenant_id/:id/status           ← update KOT status
POST   /api/v1/kots/:tenant_id/:id/printer-ack      ← printer confirms print
PATCH  /api/v1/kots/:tenant_id/:id/items/:item_id/status ← per-item status
POST   /api/v1/kots/:tenant_id/:id/reject           ← kitchen rejects KOT
```

## Redis Events Published
```
ORDER_CREATED, ORDER_STATUS_CHANGED, ORDER_COMPLETED
PAYMENT_COMPLETED, KOT_STATUS_CHANGED, KOT_PRINT_FAILED
KOT_REJECTED, ORDER_UNBILLED_ALERT
```

## Known Issues / Gotchas
- BullMQ requires Redis ≥ 5.0 — Docker Redis on **port 6380** (local Redis 3.0 on 6379 incompatible)
- `acknowledgeKot()` is idempotent — safe to call multiple times, cancels pending BullMQ job
- Commission calculated at order completion, not at payment time
- Razorpay Route is a placeholder — not yet integrated with real Razorpay API
- `kot_ack_mode` fetched from tenant-service on order placement (cached 30min in Redis)

## Recent Changes
- 2026-03-28: Service fully built (port 3004)
- 2026-04-08: KOT reject flow (POST /reject, allKotsRejected() auto-cancels order)
- 2026-04-08: requirePermission() middleware added
- 2026-04-08: GET /summary/daily — real daily report, gated behind reports:view
- 2026-04-08: recordPayment() completes full lifecycle (status→completed, commission, events)
- 2026-04-08: Startup + midnight stale order sweep
- 2026-04-08: KOT_REJECTED + ORDER_UNBILLED_ALERT events published
- 2026-04-16: Redis default port corrected to 6380

## Environment
- Dev port: 3004
- DB schema: order_svc
- BullMQ Redis: **port 6380** (must be Redis ≥ 5.0)
- Calls tenant-service for kot_ack_mode (cached 30min)

## How to Run Locally
```bash
cd services/order-service
pnpm dev
# Health: GET http://localhost:3004/health
# Swagger: http://localhost:3004/docs
```

## How to Deploy
```bash
docker compose -f docker-compose.yml up order-service
docker compose -f docker-compose.yml logs -f order-service
```

## Dependencies on Other Services
- **tenant-service** — fetch kot_ack_mode + branch info (cached 30min)
- **inventory-service** — order-service publishes ORDER_STATUS_CHANGED; inventory-service subscribes and calls /internal/deduct
- **realtime-service** — consumes all order/KOT events via Redis pub/sub
- **notification-service** — consumes ORDER_CREATED, ORDER_COMPLETED, PAYMENT_COMPLETED
- **analytics-service** (future) — consumes ORDER_COMPLETED for revenue aggregation

## Pending / TODO
- Razorpay Route actual integration (currently placeholder)
- Refund endpoints (full / partial / item-level)
- Table session close flow (triggers inventory deduction, commission, receipt)
- Unit tests for GST calculation
- E2E tests for order placement flow
