# inventory-service — Agent Context

> This file is the living knowledge base for the inventory-service agent.
> Update this file whenever routes, models, or behavior changes.
> Last updated: 2026-04-16

## Current Implementation Status
**FULLY IMPLEMENTED (core)**

## What's Built
- Ingredient CRUD (create, list, get, update, delete)
- Manual stock adjustment with movement recording
- Stock movement history per ingredient
- Purchase order CRUD with status state machine (DRAFT→SENT→CONFIRMED→RECEIVED→CANCELLED)
- PO numbering: PO-YYYY-XXXX sequential per tenant per year
- Internal stock deduction endpoint (called by order-service on preparing)
- Internal purchase order creation endpoint (called by procurement-service on bid award)
- Internal PO receive endpoint (called by procurement-service on direct order delivered)
- `deductStockForOrder()` — deducts per-item stock, checks thresholds, publishes alerts
- `receiveStock()` — adds stock, updates average cost, publishes ITEM_BACK_IN_STOCK if restocked past critical

## Prisma Models (current)
- Ingredient, StockMovement (MovementType enum), PurchaseOrder (PurchaseOrderStatus enum), DailyUsageSummary

## MovementType values
`purchase | order_deduct | manual_add | manual_remove | waste | transfer_in | transfer_out | opening`

## PurchaseOrderStatus values
`DRAFT → SENT → CONFIRMED → RECEIVED → CANCELLED`

## Key Routes
```
GET/POST   /api/v1/inventory/:tenant_id/:branch_id/ingredients
GET/PATCH/DELETE /api/v1/inventory/:tenant_id/:branch_id/ingredients/:id
POST  /api/v1/inventory/:tenant_id/:branch_id/ingredients/:id/adjust
GET   /api/v1/inventory/:tenant_id/:branch_id/ingredients/:id/movements

GET/POST   /api/v1/inventory/:tenant_id/purchase-orders
GET/PATCH  /api/v1/inventory/:tenant_id/purchase-orders/:id
POST  /api/v1/inventory/:tenant_id/purchase-orders/:id/receive

POST /api/v1/inventory/internal/deduct                    ← X-Internal-Secret
POST /api/v1/inventory/internal/purchase-orders           ← X-Internal-Secret
POST /api/v1/inventory/internal/purchase-orders/:id/receive ← X-Internal-Secret
```

## Redis Events Published
```
STOCK_LOW                ← ingredient hits minimum_stock threshold
STOCK_CRITICAL           ← ingredient hits critical_stock threshold
STOCK_CRITICAL_DISABLE   ← is_critical ingredient hits 0 (disables catalogue items)
ITEM_BACK_IN_STOCK       ← ingredient restocked past critical threshold
```

## Known Issues / Gotchas
- `ingredient_id` in catalogue-service's ItemIngredient is a cross-service ref — inventory-service is the source of truth for Ingredient records
- Stock deduction is triggered by ORDER_STATUS_CHANGED (status=preparing) — consumed by inventory-service Redis subscriber
- `is_critical=true` + stock=0 → publishes STOCK_CRITICAL_DISABLE → realtime-service → catalogue items auto-disabled
- Internal routes protected by X-Internal-Secret — must match INTERNAL_API_SECRET env var across all services
- Redis default port is **6380** (not 6379)
- `(prisma as unknown as ...).$on("query")` pattern used for dev query logging — avoids any cast

## Recent Changes
- 2026-03-28: Service fully built (port 3005)
- 2026-03-28: Internal routes: /internal/deduct + /internal/purchase-orders
- 2026-03-28: StockMovement with full MovementType enum
- 2026-03-28: PurchaseOrder with status state machine
- 2026-04-16: `any` types replaced with typed FastifyRequest/FastifyReply in internal.routes.ts
- 2026-04-16: Redis default port corrected to 6380

## Environment
- Dev port: 3005
- DB schema: inventory
- Redis: **port 6380**
- Internal endpoints: X-Internal-Secret required

## How to Run Locally
```bash
cd services/inventory-service
pnpm dev
# Health: GET http://localhost:3005/health
# Swagger: http://localhost:3005/docs
```

## How to Deploy
```bash
docker compose -f docker-compose.dev.yml up inventory-service
docker compose -f docker-compose.dev.yml logs -f inventory-service
```

## Dependencies on Other Services
- **order-service** — calls /internal/deduct when order→preparing (via Redis event subscriber)
- **procurement-service** — calls /internal/purchase-orders on bid award; /internal/purchase-orders/:id/receive on direct order delivered
- **catalogue-service** — ItemIngredient.ingredient_id cross-service ref (no runtime call)
- **realtime-service** — consumes STOCK_CRITICAL + STOCK_CRITICAL_DISABLE events to notify staff

## Pending / TODO
- DailyUsageSummary cron aggregation (compute daily average usage per ingredient)
- Low/critical alert emit testing end-to-end
- Unit tests for deductStockForOrder()
- E2E tests for deduction → alert → catalogue-disable flow
