# inventory-service — Agent Context

> This file is the living knowledge base for the inventory-service agent.
> Update this file whenever routes, models, or behavior changes.
> Last updated: 2026-04-15

## Current Implementation Status
**FULLY IMPLEMENTED (core)**

## What's Built
- Ingredient CRUD (create, list, get, update, delete)
- Manual stock adjustment with movement recording
- Stock movement history per ingredient
- Purchase order CRUD with status state machine
- Internal stock deduction endpoint (called by order-service on preparing)
- Internal purchase order creation endpoint (called by procurement-service on bid award)
- stock.service.ts with deductStockForOrder() + alert checking

## Prisma Models (current)
- Ingredient, StockMovement (MovementType enum), PurchaseOrder (PurchaseOrderStatus enum), DailyUsageSummary

## MovementType values
PURCHASE | SALE | ADJUSTMENT | WASTE | TRANSFER | RETURN

## PurchaseOrderStatus values
DRAFT → SENT → CONFIRMED → RECEIVED → CANCELLED

## Known Issues / Gotchas
- ingredient_id in catalogue-service's ItemIngredient is a cross-service ref — inventory-service is the source of truth
- Stock deduction is triggered by Redis pub/sub event ORDER_STATUS_CHANGED (status=preparing), not direct call
- isCritical flag: if ingredient hits 0 AND is_critical=true, ALL dependent catalogue items auto-disabled via STOCK_CRITICAL event

## Recent Changes
- 2026-03-28: Service fully built (port 3005)
- 2026-03-28: Internal routes: /internal/deduct + /internal/purchase-order
- 2026-03-28: StockMovement with MovementType enum
- 2026-03-28: PurchaseOrder with status state machine

## Environment
- Dev port: 3005
- DB schema: inventory
- Internal endpoints protected by X-Internal-Secret

## How to Run Locally
```bash
cd services/inventory-service
pnpm dev
# Health: GET http://localhost:3005/health
```

## How to Run Tests
```bash
# No tests written yet
```

## How to Deploy
```bash
docker compose -f docker-compose.dev.yml up inventory-service
docker compose -f docker-compose.dev.yml logs -f inventory-service
```

## Pending / TODO
- Redis pub/sub subscriber for ORDER_STATUS_CHANGED (trigger deduction)
- Auto-disable items via STOCK_CRITICAL event publish
- DailyUsageSummary cron aggregation
- Low/critical alert emit (STOCK_LOW, STOCK_CRITICAL events)
- Unit tests for deductStockForOrder()
- E2E tests for deduction → alert flow
