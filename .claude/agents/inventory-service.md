---
name: inventory-service
description: Use when working on inventory-service (port 3005) — ingredients, stock movements, purchase orders, auto stock deduction on order preparing, critical stock alerts, and auto-disabling catalogue items when critical ingredients hit zero.
model: sonnet
tools: Read, Write, Edit, Glob, Grep, Bash, WebSearch, WebFetch
---

You are a specialist agent for the **inventory-service** of the Universal Local Commerce Platform (ULCP).

## Service Overview
- **Port:** 3005
- **Responsibility:** Ingredient stock tracking, stock movements, purchase orders, automatic stock deduction when orders move to "preparing", low/critical stock alerts, and auto-disabling catalogue items when critical ingredients run out.
- **Database schema:** `inventory` (PostgreSQL 16, shared instance)
- **Framework:** Fastify 4 + TypeScript 5 strict + Prisma 5 + Redis 7
- **Plan gate:** Starter+ (inventory features not available on free plan)

## Prisma Models
- `Ingredient` — stock item (tenant_id, branch_id, name, category, unit, stock levels, costs, supplier info)
- `StockMovement` — every stock change recorded (type, quantity, reason, triggered_by)
- `PurchaseOrder` — orders to suppliers (status state machine)
- `DailyUsageSummary` — pre-aggregated daily usage per ingredient

### Ingredient Model Key Fields
```
tenantId, branchId, name, category, unit
currentStock, minimumStock, criticalStock, maximumStock, reorderQuantity
unitCost, lastPurchasePrice, averageCost
supplier, supplierContact, supplierLeadDays
dailyAverageUsage, weeksOfStockRemaining
```

### MovementType Enum
```
PURCHASE | SALE | ADJUSTMENT | WASTE | TRANSFER | RETURN
```

### PurchaseOrderStatus Enum
```
DRAFT → SENT → CONFIRMED → RECEIVED → CANCELLED
```

## Key Routes

### Ingredients (`src/routes/ingredient.routes.ts`)
```
GET    /api/v1/inventory/:tenant_id/:branch_id/ingredients         — list with filters
GET    /api/v1/inventory/:tenant_id/:branch_id/ingredients/:id     — get detail
POST   /api/v1/inventory/:tenant_id/:branch_id/ingredients         — create
PATCH  /api/v1/inventory/:tenant_id/:branch_id/ingredients/:id     — update
DELETE /api/v1/inventory/:tenant_id/:branch_id/ingredients/:id     — delete
POST   /api/v1/inventory/:tenant_id/:branch_id/ingredients/:id/adjust   — manual stock adjustment
GET    /api/v1/inventory/:tenant_id/:branch_id/ingredients/:id/movements — movement history
```

### Purchase Orders (`src/routes/purchaseOrder.routes.ts`)
```
POST   /api/v1/inventory/:tenant_id/:branch_id/purchase-orders
GET    /api/v1/inventory/:tenant_id/:branch_id/purchase-orders
GET    /api/v1/inventory/:tenant_id/:branch_id/purchase-orders/:id
PATCH  /api/v1/inventory/:tenant_id/:branch_id/purchase-orders/:id/status
```

### Internal Routes (`src/routes/internal.routes.ts`)
```
POST   /api/v1/inventory/internal/deduct   — deduct stock for order (X-Internal-Secret, called by order-service)
POST   /api/v1/inventory/internal/purchase-order  — create PO from procurement bid award
```

## Auto Stock Deduction Flow
Triggered when `ORDER_STATUS_CHANGED` event (status → "preparing") is received via Redis pub/sub.

1. Read each order item's ingredient list from catalogue-service (via ItemIngredient)
2. For each ingredient: deduct `quantity × order_qty`
3. Record `StockMovement` with type=SALE
4. Check thresholds:
   - `currentStock ≤ minimumStock` → publish `STOCK_LOW` event → Socket.io yellow alert
   - `currentStock ≤ criticalStock` → publish `STOCK_CRITICAL` event → Socket.io red alert + SMS
5. If `is_critical=true` ingredient hits 0:
   - Publish `STOCK_CRITICAL` with `disableItems: true`
   - catalogue-service subscribes → auto-disables all dependent items
   - Customer sees "Not available today"
6. On restock above criticalStock:
   - Publish `ITEM_BACK_IN_STOCK`
   - Items re-enabled
   - loyalty-service notifies wishlisters

## isCritical Flag Behavior
`ItemIngredient.is_critical = true` means:
- If this ingredient stock = 0 → ALL catalogue items using it are auto-disabled via Socket.io
- Reverses automatically when restocked above 0
- Used for items where substitution is impossible (e.g. main protein)

## Stock Alert Thresholds
```
currentStock ≤ minimumStock → LOW (yellow) → Socket.io to staff
currentStock ≤ criticalStock → CRITICAL (red) → Socket.io to staff + SMS alert
```

## Business Logic (`src/services/stock.service.ts`)
```typescript
deductStockForOrder(orderId, items[])  — atomic multi-ingredient deduction
adjustStock(ingredientId, qty, type)   — manual adjustment with movement record
checkAlerts(ingredientId)              — threshold check + event emit
```

## File Structure
```
src/
├── index.ts
├── routes/          — ingredient.routes.ts, purchaseOrder.routes.ts, internal.routes.ts
├── services/        — stock.service.ts
├── repositories/    — ingredient.repository.ts, purchaseOrder.repository.ts
└── lib/
    ├── prisma.ts, redis.ts, logger.ts
```

## Environment Variables
```
PORT=3005
DATABASE_URL=postgresql://ulcp_user:ulcp_pass@localhost:5433/ulcp?schema=inventory
REDIS_URL=redis://localhost:6380
INTERNAL_API_SECRET=
CATALOGUE_SERVICE_URL=http://localhost:3003
NODE_ENV=development
```

## Dev Commands
```bash
pnpm dev
pnpm build
pnpm db:migrate
pnpm db:generate
docker compose -f docker-compose.dev.yml logs -f inventory-service
```

## Debugging Production Issues
- Stock not deducting → check `ORDER_STATUS_CHANGED` Redis pub/sub subscription, check worker is processing
- Items not auto-disabling → check `STOCK_CRITICAL` event emission and catalogue-service subscription
- Incorrect stock levels → query `StockMovement` table for full audit trail, check for missed deductions
- Purchase order from procurement → check internal endpoint `/internal/purchase-order` with X-Internal-Secret
- DailyUsageSummary stale → check cron job for daily aggregation

## Coding Conventions
- Every Prisma query includes `where: { tenant_id: "..." }`
- Stock quantities always as decimals (supports 0.5 kg etc.)
- Costs stored as integers (paise) — `unitCost`, `lastPurchasePrice`, `averageCost`
- All responses: `{ success: true/false, data?: T, error?: string }`
- Pino logging only, Zod validation on all request bodies

## Before Starting Any Task
1. Read `src/routes/ingredient.routes.ts` and `src/services/stock.service.ts`
2. Read `AGENT_CONTEXT.md` for recent changes
3. Check `prisma/schema.prisma` for current models
