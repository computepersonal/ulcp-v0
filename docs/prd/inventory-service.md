# inventory-service — PRD

## Overview

The inventory-service (port 3005) is the stock-management backbone of the ULCP platform. It owns the source of truth for ingredient quantities at each tenant branch, records every stock movement with full traceability, manages purchase orders from draft through receipt, and automatically triggers catalogue item availability changes and staff alerts when stock crosses configured thresholds. The service is a Starter+ feature gate — tenants on the free plan cannot use it, but its internal deduction endpoint is called by the order-service any time an order moves to "preparing" status.

---

## Users / Actors

| Actor | Interaction |
|---|---|
| Tenant owner / manager | Creates and manages ingredients, sets threshold levels, creates and receives purchase orders |
| Staff (with inventory permissions) | Performs manual stock adjustments (waste, transfer, opening stock) |
| order-service (internal) | Calls `/internal/deduct` when an order moves to the "preparing" status |
| procurement-service (internal) | Calls `/internal/purchase-orders` when a bid is awarded or a direct PO is created; calls `/internal/purchase-orders/:id/receive` on delivery |
| catalogue-service (cross-service ref) | References `ingredient_id` in its `ItemIngredient` model — no runtime call, inventory-service is the authoritative source |
| realtime-service / notification-service | Consume Redis events published by this service to alert staff and auto-disable catalogue items |

---

## Core Features

1. **Ingredient management** — Full CRUD for ingredients scoped to `tenant_id + branch_id`. Fields include name, category, unit, stock levels (current/minimum/critical/maximum/reorder), cost tracking (unit cost, last purchase price, rolling average cost), and supplier metadata.
2. **Manual stock adjustment** — Staff can post a delta with a typed reason (`manual_add`, `manual_remove`, `waste`, `transfer_in`, `transfer_out`, `opening`). Every adjustment creates a `StockMovement` record with before/after snapshots.
3. **Stock movement history** — Paginated audit log of every stock change per ingredient, including system deductions from orders and purchase receipts.
4. **Automatic order deduction** — `deductStockForOrder()` is called (via internal HTTP) when an order moves to "preparing". It deducts each ingredient's quantity × order quantity and records a `StockMovement` of type `order_deduct`.
5. **Threshold alerting** — After every deduction, if `current_stock <= critical_stock`, a `STOCK_CRITICAL` event is published. If `current_stock <= minimum_stock`, a `STOCK_LOW` event is published. Both are picked up by realtime-service and notification-service.
6. **Zero-stock auto-disable** — If a critical-flagged ingredient hits exactly 0, a `STOCK_CRITICAL_DISABLE` event is published so catalogue-service (via realtime-service) can mark dependent menu items as unavailable.
7. **Purchase order lifecycle** — Create POs (draft), advance through `sent → confirmed → partial → received`, and cancel. PO numbering is sequential per tenant per year (`PO-YYYY-XXXX`).
8. **Stock receipt via PO** — Marking a PO as received adds stock for every line item, updates the rolling average cost, and publishes `ITEM_BACK_IN_STOCK` if an ingredient is restocked past its critical threshold.
9. **Procurement-service bridge** — Internal endpoints allow procurement-service to create POs (on bid award / direct order) and mark them received when vendor delivers, without duplicating PO logic.
10. **Low-stock filter** — A query filter (`?low_stock=true`) on the ingredient list returns only ingredients at or below their minimum threshold in a single request.
11. **Daily usage summary model** — Schema exists (`DailyUsageSummary`) to record closing stock and usage per ingredient per day. (Cron aggregation not yet implemented — see Open Questions.)

---

## API Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/health` | None | Service health check |
| GET | `/api/v1/inventory/:tenant_id/:branch_id/ingredients` | None (currently) | List ingredients; supports `?category`, `?search`, `?low_stock`, `?page`, `?limit` |
| GET | `/api/v1/inventory/:tenant_id/:branch_id/ingredients/:id` | None (currently) | Get single ingredient |
| POST | `/api/v1/inventory/:tenant_id/:branch_id/ingredients` | None (currently) | Create a new ingredient |
| PATCH | `/api/v1/inventory/:tenant_id/:branch_id/ingredients/:id` | None (currently) | Update ingredient metadata or thresholds |
| DELETE | `/api/v1/inventory/:tenant_id/:branch_id/ingredients/:id` | None (currently) | Soft-delete (sets `is_active = false`) |
| POST | `/api/v1/inventory/:tenant_id/:branch_id/ingredients/:id/adjust` | None (currently) | Manual stock adjustment with movement type |
| GET | `/api/v1/inventory/:tenant_id/:branch_id/ingredients/:id/movements` | None (currently) | Paginated stock movement history |
| GET | `/api/v1/inventory/:tenant_id/purchase-orders` | None (currently) | List POs; supports `?branch_id`, `?status`, `?page`, `?limit` |
| GET | `/api/v1/inventory/:tenant_id/purchase-orders/:id` | None (currently) | Get single PO |
| POST | `/api/v1/inventory/:tenant_id/purchase-orders` | None (currently) | Create a draft PO |
| PATCH | `/api/v1/inventory/:tenant_id/purchase-orders/:id` | None (currently) | Update PO status (`draft/sent/confirmed/cancelled`) or metadata |
| POST | `/api/v1/inventory/:tenant_id/purchase-orders/:id/receive` | None (currently) | Mark PO received; triggers stock additions |
| POST | `/api/v1/inventory/internal/deduct` | `X-Internal-Secret` | Deduct stock for an order (called by order-service) |
| POST | `/api/v1/inventory/internal/purchase-orders` | `X-Internal-Secret` | Create a PO from procurement-service (bid award / direct order) |
| POST | `/api/v1/inventory/internal/purchase-orders/:id/receive` | `X-Internal-Secret` | Mark PO received from procurement-service |

> **Note:** The public ingredient and PO routes have no JWT authentication in the current implementation. This is likely a gap — see Open Questions.

---

## Data Models

### Ingredient
Key fields: `tenant_id`, `branch_id`, `name`, `category`, `unit`, `current_stock`, `minimum_stock` (LOW threshold), `critical_stock` (CRITICAL threshold), `maximum_stock`, `reorder_quantity`, `unit_cost`, `last_purchase_price`, `average_cost` (rolling), `supplier`, `supplier_lead_days`, `daily_average_usage`, `weeks_of_stock_remaining`, `is_active`.

### StockMovement
Key fields: `tenant_id`, `branch_id`, `ingredient_id`, `movement_type` (enum: `purchase | order_deduct | manual_add | manual_remove | waste | transfer_in | transfer_out | opening`), `quantity` (positive = added, negative = removed), `stock_before`, `stock_after`, `reference_id` (order_id / po_id), `reference_type`, `notes`, `created_by` (null for system deductions).

### PurchaseOrder
Key fields: `tenant_id`, `branch_id`, `po_number` (PO-YYYY-XXXX), `vendor_id` (cross-service ref to procurement-service, no FK), `vendor_name`, `status` (enum: `draft | sent | confirmed | partial | received | cancelled`), `items` (JSON array of line items with ingredient_id, quantity, unit, unit_price, total_price), `subtotal`, `tax_amount`, `total` (all in paise), `expected_delivery_date`, `received_at`, `created_by`, `received_by`.

### DailyUsageSummary
Key fields: `tenant_id`, `branch_id`, `ingredient_id`, `date`, `total_used`, `total_added`, `closing_stock`. Unique constraint on `(tenant_id, branch_id, ingredient_id, date)`.

---

## Business Rules

- Every query MUST be scoped to `tenant_id` (and usually `branch_id`) — no cross-tenant data leakage.
- Inventory is a **Starter+ feature**; the free plan cannot access it. Feature gating is enforced at the API gateway / caller level — the service itself does not check plan limits.
- Costs are stored in **paise** (integer-equivalent float) — use `formatCurrency()` for display.
- Soft-delete only: `DELETE` sets `is_active = false`; the ingredient remains in `StockMovement` history.
- A received or cancelled PO cannot be updated (`PATCH` returns 400).
- `STOCK_CRITICAL_DISABLE` is only published when `current_stock <= 0` (not merely at the critical threshold).
- `ITEM_BACK_IN_STOCK` is only published when restocking carries the ingredient from at-or-below critical back above the critical threshold.
- Rolling average cost is computed as `Math.round((old_avg + new_price) / 2)` — this is a simple mean of two values, not a true weighted average.
- Internal endpoints require `X-Internal-Secret` header matching `INTERNAL_API_SECRET` env var; 403 is returned on mismatch.
- `ingredient_id` in catalogue-service's `ItemIngredient` is an application-level cross-service reference — there is no database foreign key enforcing it.
- Redis runs on port **6380** in this project (not the default 6379).

---

## Service Dependencies

| Dependency | Direction | Reason |
|---|---|---|
| order-service | Inbound call | Calls `/internal/deduct` when `ORDER_STATUS_CHANGED` → preparing |
| procurement-service | Inbound call | Calls `/internal/purchase-orders` on bid award; `/internal/.../receive` on delivery |
| catalogue-service | Cross-service ref (no call) | `ItemIngredient.ingredient_id` references this service's `Ingredient` records |
| realtime-service | Outbound event | Consumes `STOCK_LOW`, `STOCK_CRITICAL`, `STOCK_CRITICAL_DISABLE`, `ITEM_BACK_IN_STOCK` from Redis to push Socket.io alerts to staff |
| notification-service | Outbound event | Consumes `STOCK_LOW`, `STOCK_CRITICAL` to send push/SMS alerts to the owner |
| Redis (pub/sub) | Publisher | Publishes all four stock events listed above |
| PostgreSQL | Database | Owns the `inventory` schema |

---

## Current Build Status

**Fully implemented (core):**
- All ingredient CRUD endpoints with Zod validation
- Manual stock adjustment with movement type enum
- Stock movement history with pagination
- Purchase order full lifecycle (draft → sent → confirmed → received → cancelled)
- Sequential PO numbering per tenant per year
- `deductStockForOrder()` with threshold detection and Redis event publishing
- `receiveStock()` with average cost update and back-in-stock event
- All three internal routes (deduct, create PO, receive PO)
- Swagger/OpenAPI docs at `/docs`
- Graceful shutdown (SIGTERM/SIGINT)

**Stubbed or missing:**
- No JWT / authentication middleware on public routes — tenant_id and branch_id are path params only, not validated against a JWT claim
- `DailyUsageSummary` cron aggregation not implemented (model exists, no job)
- `daily_average_usage` and `weeks_of_stock_remaining` fields on `Ingredient` are stored but never computed automatically
- No unit or integration tests
- No plan-level feature gate inside the service itself
- `partial` PO status exists in the enum but there is no endpoint or logic that sets a PO to `partial`
- The `lead_ingredient_id` field on `PurchaseOrder` (used for the Prisma relation) is architecturally ambiguous — a PO covers multiple ingredients via the `items` JSON array, yet the relation field implies a single "lead" ingredient

---

## Open Questions / Gaps

1. **Authentication gap**: Public ingredient and PO routes have no JWT guard. Should these be protected? If so, which roles get read vs. write access?
2. **Plan enforcement**: Who enforces the Starter+ gate? The API gateway, the caller, or should this service check `tenant.plan`?
3. **Daily usage cron**: What is the intended schedule and trigger for aggregating `DailyUsageSummary`? Should it run at midnight local time per tenant timezone?
4. **`is_critical` flag**: The CLAUDE.md references an `is_critical` boolean on `Ingredient` (controls auto-disable behavior), but this field does not exist in the Prisma schema. Currently, the code treats `current_stock <= 0` as the disable trigger for any critical ingredient. Is a separate boolean needed?
5. **Weighted average cost**: The current rolling average is `(old + new) / 2`. Should it be a proper quantity-weighted average (FIFO/WAVG) for accurate COGS reporting?
6. **Transfer between branches**: `transfer_in` / `transfer_out` movement types exist but there is no endpoint or service logic to coordinate a matched transfer between two branches.
7. **`partial` PO status**: The enum includes `partial` for partially received deliveries, but no endpoint advances a PO to this state. Is partial receipt a planned feature?
8. **`lead_ingredient_id` on PurchaseOrder**: The Prisma schema has a Prisma relation from `PurchaseOrder` to a single `Ingredient`. This conflicts with the JSON `items` array approach. Should this relation be removed?
9. **Stock deduction trigger**: Currently the inventory-service has no Redis subscriber — the internal HTTP call from order-service triggers deduction. Is this the final design, or should inventory-service subscribe to `ORDER_STATUS_CHANGED` directly?
10. **Negative stock**: Nothing prevents `current_stock` from going negative if an order deduction exceeds available stock. Should this be blocked or allowed (for tracking purposes)?
