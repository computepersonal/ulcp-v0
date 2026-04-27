# order-service — PRD

**Port:** 3004 | **Last reviewed:** 2026-04-27

---

## Overview

The order-service is the transactional core of ULCP. It handles the full lifecycle of every order placed on the platform — from initial placement by a customer or staff member, through kitchen ticket (KOT) routing and acknowledgment, to billing, payment, and commission recording. It implements a sequential KOT numbering system (KOT-001 to KOT-999, resetting daily), automatic KOT splitting for full-service restaurants (food → kitchen, drink → bar), three KOT acknowledgment modes, GST calculation for registered and unregistered businesses, Razorpay/Stripe payment abstraction, commission calculation on order completion, and a stale-order sweep at startup and midnight. It also provides a daily sales summary for the Reports screen.

---

## Users / Actors

| Actor | Auth type | Capabilities |
|---|---|---|
| Platform customer | Customer JWT | Place order, track own order, view table bill, confirm prepaid payment |
| Staff (any role) | Staff JWT | Place orders, view/list orders for tenant, get bill summary |
| Staff (with `reports:view`) | Staff JWT | Access daily summary report |
| KDS device | KDS JWT | Read KOTs for branch; update KOT status; printer-ack; reject KOT |
| Kitchen staff on KDS | Staff JWT or KDS JWT | Same as above |
| Internal services | X-Internal-Secret | Add/remove line items (jukebox); internal order data reads |

---

## Core Features

1. **Place order (staff)** — staff POST creates an order with a snapshot of items (name, price, quantity, veg_type, GST rate, station, variant, options, add-ons). Calculates subtotal, tax, discount, tip, total. Generates sequential order_number (ORD-001). Creates KOTs and dispatches them based on KOT ack mode. Fetches `kot_ack_mode` from tenant-service (cached 30 min in Redis).
2. **Place order (customer)** — customer JWT version of the above. `tenant_id` is included in the body (from QR scan context). Customer_id from JWT. Same KOT generation logic.
3. **KOT generation and routing** — every order creates one or more KOTs. For `seated_full_service` (Type 3): items with `station: "kitchen"` go to a kitchen KOT, items with `station: "bar"` go to a bar KOT. All other types: single kitchen KOT. KOT number is sequential per branch per day (KOT-001...) via atomic `DailyCounter` upsert.
4. **KOT acknowledgment modes** — three modes configured per tenant:
   - `auto`: BullMQ delayed job fires after `kot_ack_delay_secs` (default 60s). Cancelled if staff/printer acks first.
   - `kds`: Chef taps "Acknowledge" on the KDS screen.
   - `printer`: Thermal printer confirms successful print job. On print failure: KOT stays pending, `KOT_PRINT_FAILED` event published.
   - All three modes funnel through `acknowledgeKot()` — idempotent.
5. **KOT status lifecycle** — `pending → acknowledged → preparing → ready → served → rejected`. Staff or KDS device drives transitions.
6. **Per-item status tracking** — each item within a KOT has its own status: `pending → preparing → ready → served | cancelled`. KDS can update individual items.
7. **KOT rejection** — kitchen can reject a KOT with a reason. If ALL KOTs for an order are rejected, the order is auto-cancelled. `KOT_REJECTED` event published to realtime-service.
8. **Auto-bump on "served"** — when all KOTs for an order reach `served`, the parent order is automatically bumped to `served` status. If the order was prepaid, it is then auto-completed.
9. **Order status lifecycle** — `pending → confirmed → preparing → ready → picked_up | delivered → completed | cancelled`. Transitions tracked in `OrderStatusHistory`.
10. **Order cancellation** — any staff can cancel a `pending` order; `acknowledged` requires staff+; `preparing` requires owner only. Reason is required. Sets `cancelled_reason` and `cancelled_by`.
11. **Bill summary** — `GET /:tenant_id/:id/bill` returns full bill: items, subtotal, GST breakdown (CGST + SGST or IGST), discount, tip, total. Order receipts are invoice (GST-registered) or receipt (non-registered) depending on tenant GST settings.
12. **Payment recording (staff)** — `POST /:tenant_id/:id/payment` records payment method (cash/upi/card/online), sets `payment_status: "paid"`, advances order to `completed`, calculates and records commission.
13. **Payment recording (customer prepaid)** — `POST /customer/:tenant_id/:id/payment` for customer-initiated prepaid confirmation (stub for Razorpay webhook). In production this endpoint is replaced by a signature-verified webhook.
14. **Table bill (consolidated)** — `GET /table-bill/:tenant_id/:branch_id/:table_id` returns all unpaid orders for a table aggregated into a single bill view. `POST /table-bill/.../pay` pays all orders on a table in a single operation.
15. **Customer table bill view** — unauthenticated `GET /customer/table-bill/:table_id` allows customers to see their running tab (no auth required — table_id is the secret).
16. **Commission calculation** — on every `recordPayment()` call, commission is calculated: rate = 3% (free), 2% (starter/premium), 1.5% (pro/allinone). Recorded in `CommissionRecord`. `settled: false` until superadmin marks it settled.
17. **Daily sales summary** — `GET /:tenant_id/summary/daily` (requires `reports:view` permission) returns: total revenue, order count, average order value, payment method breakdown, top 10 items by quantity, unbilled orders list, and currently active orders.
18. **Stale order sweep** — runs on service startup and at midnight:
    - `pending/confirmed` orders older than threshold → silently cancelled
    - `preparing/ready` orders → `ORDER_UNBILLED_ALERT` event published (owner room via realtime-service)
19. **Internal line item add/remove** — `POST /internal/add-line-item` allows jukebox-service to append a song charge to an active order; `POST /internal/remove-line-item` allows removing it on cancellation. Secured by X-Internal-Secret.
20. **Order tracking (customer)** — `GET /customer/:tenant_id/:id` returns a limited view of the order (id, status, items, total, payment_status) — enforces ownership check (`customer_id` must match JWT).

---

## API Endpoints

### Orders
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/v1/orders` | Staff JWT | Place a new order |
| POST | `/api/v1/orders/customer` | Customer JWT | Place a new order as customer |
| GET | `/api/v1/orders/:tenant_id` | Staff JWT | List orders (filterable by branch, status, type, date) |
| GET | `/api/v1/orders/:tenant_id/summary/daily` | Staff JWT (`reports:view`) | Daily sales summary |
| GET | `/api/v1/orders/:tenant_id/:id` | Staff JWT | Get order detail |
| GET | `/api/v1/orders/customer/:tenant_id/:id` | Customer JWT | Get own order for tracking |
| PATCH | `/api/v1/orders/:tenant_id/:id/status` | Staff JWT | Advance order status |
| POST | `/api/v1/orders/:tenant_id/:id/cancel` | Staff JWT | Cancel order with reason |
| GET | `/api/v1/orders/:tenant_id/:id/bill` | Staff JWT | Get bill summary |
| POST | `/api/v1/orders/:tenant_id/:id/payment` | Staff JWT | Record payment (completes order, calculates commission) |
| POST | `/api/v1/orders/customer/:tenant_id/:id/payment` | Customer JWT | Customer confirms prepaid payment |
| GET | `/api/v1/orders/table-bill/:tenant_id/:branch_id/:table_id` | Staff JWT | Consolidated table bill |
| POST | `/api/v1/orders/table-bill/:tenant_id/:branch_id/:table_id/pay` | Staff JWT | Pay all orders on a table |
| GET | `/api/v1/orders/customer/table-bill/:table_id` | None | Customer view of table bill |
| POST | `/api/v1/orders/internal/add-line-item` | X-Internal-Secret | Add jukebox song charge to active order |
| POST | `/api/v1/orders/internal/remove-line-item` | X-Internal-Secret | Remove a line item from an order |

### KOTs
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/v1/kots/:tenant_id/:branch_id` | Staff JWT or KDS JWT | List KOTs for branch (filterable by status) |
| PATCH | `/api/v1/kots/:tenant_id/:id/status` | Staff JWT or KDS JWT | Update KOT status |
| POST | `/api/v1/kots/:tenant_id/:id/printer-ack` | Staff JWT or KDS JWT | Printer confirms print success/failure |
| POST | `/api/v1/kots/:tenant_id/:id/reject` | Staff JWT or KDS JWT | Kitchen rejects a KOT |
| PATCH | `/api/v1/kots/:tenant_id/:id/items/:item_id/status` | Staff JWT or KDS JWT | Update individual item status within KOT |

---

## Data Models

### Order
The root order record. Key fields:
- `tenant_id`, `branch_id`, `table_id`, `table_name` (snapshot), `session_id`, `customer_id`
- `order_number` — sequential per branch per day (ORD-001); resets midnight via `DailyCounter`
- `type` — dine_in | takeaway | delivery
- `status` — pending | confirmed | preparing | ready | picked_up | delivered | completed | cancelled
- `items` — JSONB snapshot: `[{ id, name, price, quantity, veg_type, gst_rate, is_tax_inclusive, station, variant_name?, options?, addons? }]`
- `subtotal`, `tax_amount`, `discount_amount`, `tip_amount`, `total` — all integers in paise
- `gst_breakdown` — JSONB: `{ cgst, sgst, igst }` all in paise
- `payment_status` — pending | paid | failed | refunded
- `payment_method` — cash | upi | card | online
- `notes`, `cancelled_reason`, `cancelled_by`

### KOT (Kitchen Order Ticket)
- `order_id`, `tenant_id`, `branch_id`
- `kot_number` — KOT-001 format, sequential per branch per day
- `station` — kitchen | bar
- `status` — pending | acknowledged | preparing | ready | served | rejected
- `table_name` — snapshot for printout
- `items` — JSONB array (filtered from order items by station): each item includes `id, name, price, quantity, variant_name?, options?, addons?, status?`

### OrderStatusHistory
Immutable status change log: `order_id`, `status`, `changed_by` (user_id), `notes`, `created_at`.

### CommissionRecord
One record per completed order: `order_id` (unique), `tenant_id`, `rate` (%), `amount` (paise), `plan`, `settled` (boolean). Used by superadmin-service for monthly settlement.

### DailyCounter
Tracks sequential numbering per branch per day: `branch_id`, `date` (YYYY-MM-DD string), `order_seq`, `kot_seq`. Unique on `(branch_id, date)`. Atomic `upsert` with `increment` ensures no gaps or duplicates under concurrency.

---

## Business Rules

- All monetary amounts stored as integers in paise (₹1 = 100). Never floats.
- `items` on Order and KOT are price snapshots at time of order — catalogue changes do not affect existing orders
- `table_name` is a snapshot — table renames do not affect existing orders or KOT printouts
- Order numbering: ORD-001 per branch per day, resets at midnight (via DailyCounter)
- KOT numbering: KOT-001 per branch per day, resets at midnight (via DailyCounter)
- KOT split rule: only `seated_full_service` business type splits food vs drink; all other types get a single kitchen KOT
- `kot_ack_mode` fetched from tenant-service at every order placement; cached 30 minutes in Redis
- Auto-ack BullMQ job is cancelled idempotently if manual ack arrives first
- Commission rates: free plan = 3%, premium/starter = 2%, pro/allinone = 1.5%
- Commission is calculated once on `recordPayment()` and stored; not recalculated
- Commission settlement is done monthly by superadmin; `settled` flag flipped by superadmin-service
- GST: `GST_REGISTERED` tenant → Tax Invoice with CGST+SGST (intrastate) or IGST (interstate); `NON_REGISTERED` → plain receipt
- GST modes: tax-inclusive (price already includes tax) and tax-exclusive (tax added on top); handled by `calculateGST()`
- Cancellation permissions: pending → anyone; acknowledged → staff+; preparing → owner only
- KOT rejection: if all KOTs for an order are rejected, parent order auto-cancelled, `ORDER_STATUS_CHANGED` published
- Prepaid + all KOTs served → order auto-completed (no manual payment step needed)
- Stale order sweep on startup + midnight: pending orders silently cancelled; confirmed/preparing/ready orders trigger `ORDER_UNBILLED_ALERT`
- Razorpay webhook: HMAC-SHA256 signature verified using `crypto.timingSafeEqual()`; idempotency via Redis key `webhook:EVENTID` (TTL 24hr)
- Raw card/UPI data never reaches this service — provider handles PCI-DSS L1

---

## Service Dependencies

| Service | Direction | Reason |
|---|---|---|
| tenant-service | Outbound (order → tenant) | Fetch KOT ack mode + plan at order placement (cached 30min Redis) |
| realtime-service | Outbound (order → realtime via Redis pub/sub) | Publish events: `ORDER_STATUS_CHANGED`, `KOT_REJECTED`, `ORDER_UNBILLED_ALERT`, `KOT_STATUS_CHANGED`, `KOT_PRINT_FAILED` |
| tenant-service | Outbound (order → tenant) | Update table status via internal `PATCH /:table_id/status` on order completion |
| inventory-service | Inbound (inventory → order) / Async | Inventory deducts stock when order reaches "preparing" (reads ItemIngredient data from catalogue-service, not order-service) |
| jukebox-service | Inbound (jukebox → order) | Calls `/internal/add-line-item` to add song charges to active orders |
| superadmin-service | Inbound (superadmin → order) | Reads CommissionRecord for monthly settlement |
| notification-service | Outbound (order → notification via events) | Triggers WhatsApp/SMS/push notifications on order status changes |
| Redis | Internal | BullMQ delayed jobs for auto-ack; tenant KOT config cache; pub/sub event publishing |

---

## Current Build Status

**Built and working:**
- Staff order placement with KOT generation and routing
- Customer order placement (customer JWT)
- KOT auto-ack via BullMQ delayed job (auto mode)
- KOT manual ack via KDS (kds mode)
- KOT printer-ack (printer mode) with failure handling
- KOT rejection flow (single KOT + all-rejected auto-cancel)
- Per-item status update within KOT
- KOT status update with auto-bump of order to "served" when all KOTs served
- Order status transitions via `PATCH /:id/status`
- Order cancellation with reason + permissions check
- Bill summary
- Payment recording (staff): sets paid + completes order + calculates commission
- Customer prepaid payment stub
- Table bill (consolidated view + pay all)
- Customer table bill (no auth)
- Customer order tracking
- Daily sales summary (revenue, orders, payment breakdown, top items, unbilled, active)
- Commission record creation on completion
- DailyCounter atomic sequential numbering (orders + KOTs)
- Stale order sweep on startup + midnight
- Internal add/remove line item (jukebox)
- Redis pub/sub event publishing for all status changes
- `requirePermission()` middleware on reports endpoint

**Stubbed or missing:**
- Razorpay Route auto-split at checkout — described in CLAUDE.md but the actual Razorpay order creation and webhook handler are not visible in the route files; the customer payment endpoint is labeled "dev stub for Razorpay webhook"
- Stripe integration — `getPaymentProvider()` abstraction layer described in CLAUDE.md; not implemented (Razorpay only, and that is itself partially stubbed)
- Refund flow — `CLAUDE.md` describes full/partial/item-level refunds with Razorpay auto-refund; no refund endpoints visible in routes
- GST calculation — `calculateGST()` referenced in CLAUDE.md but not confirmed wired at order placement (the items snapshot includes `gst_rate` and `is_tax_inclusive` per item, but the actual tax computation at order placement needs verification)
- Thermal printer integration — `node-thermal-printer` described; the printer-ack endpoint exists but the auto-print-on-KOT-creation logic (TCP connection to `printer_ip`) is not confirmed implemented
- Inventory stock deduction on order preparing — `deductStockForOrder()` described; integration between order-service events and inventory-service is described but not verified wired
- Table status update on order completion — described (order-service calls tenant-service internal endpoint); not confirmed in code
- Session close on table bill payment — `recordTablePayment()` exists; whether it also closes the `TableSession` is not confirmed
- Notification dispatch on order events — described in CLAUDE.md; not confirmed wired (would be via realtime → notification or direct pub/sub)
- COD support — mentioned in CLAUDE.md (India only); `cod` is not in the `paymentSchema` enum (only cash/upi/card/online)

---

## Open Questions / Gaps

1. **GST calculation at order placement** — items carry `gst_rate` and `is_tax_inclusive` in the snapshot but it's unclear whether `calculateGST()` is called during `placeOrder()` to compute `tax_amount` and `gst_breakdown`. The bill endpoint needs to return accurate GST. Is this calculated at placement or at billing time?
2. **Razorpay integration** — the customer payment endpoint is explicitly labeled "dev stub for Razorpay webhook". When will the actual Razorpay order creation (frontend initiation) and signature-verified webhook be implemented? What is the complete payment flow for online orders?
3. **Refund endpoints** — the CLAUDE.md describes a full refund system (full, partial, item-level; Razorpay auto and cash). No refund routes exist. This is a significant gap for any business that needs to cancel orders post-payment.
4. **Thermal printer auto-print** — the printer-ack endpoint exists (receiving confirmation FROM the printer) but does the service actually initiate printing when a KOT is created? Is the TCP connection to `Branch.printer_ip` implemented in `placeOrder()`?
5. **Table status sync** — when an order is completed or a table bill is paid, does order-service call tenant-service to set `Table.status = "available"`? This is described but not confirmed in the routes.
6. **TableSession lifecycle** — `session_id` is on Order but TableSession is managed by tenant-service. Who creates the session (customer QR scan? staff?), and who closes it (table bill payment?)? The boundary between services needs clarification.
7. **COD payment method** — missing from the `paymentSchema` enum in routes (only cash/upi/card/online). Is COD mapped to "cash" or is it a separate method needing its own handling (delivery orders only)?
8. **Commission rate source** — the `CommissionRecord` stores `plan` but where does it fetch the plan at completion time? From tenant-service or from the DailyCounter record? If the tenant upgrades plans, does the commission rate change for in-flight orders?
9. **Order number gap handling** — `DailyCounter` uses atomic upsert+increment. If a service instance crashes mid-transaction, are there gaps in the sequence? Is this acceptable (gaps in ORD-001, ORD-002 sequence)?
10. **`reports:view` scope** — the daily summary endpoint requires `reports:view` permission. But the `requirePermission()` middleware checks the JWT. If a tenant owner (who bypasses permission checks per CLAUDE.md) calls this endpoint, does the bypass work correctly?
