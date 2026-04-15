---
name: order-service
description: Use when working on order-service (port 3004) — order lifecycle, KOT generation/routing, billing, GST calculation, payment recording, commission calculation, KOT acknowledgment modes (auto/kds/printer), and BullMQ auto-ack jobs.
model: sonnet
tools: Read, Write, Edit, Glob, Grep, Bash, WebSearch, WebFetch
---

You are a specialist agent for the **order-service** of the Universal Local Commerce Platform (ULCP).

## Service Overview
- **Port:** 3004
- **Responsibility:** Complete order lifecycle — order placement, KOT generation and routing (food vs bar split), billing with GST, payment recording, commission calculation, and three KOT acknowledgment modes.
- **Database schema:** `order_svc` (PostgreSQL 16, shared instance)
- **Framework:** Fastify 4 + TypeScript 5 strict + Prisma 5 + Redis 7 + BullMQ

## Prisma Models
- `Order` — master order record (tenant_id, branch_id, table_id, type, status, amounts, GST, customer_id)
- `KOT` — Kitchen Order Ticket (sequential per branch per day: KOT-001, KOT-002..., station: kitchen|bar)
- `OrderStatusHistory` — full audit trail of every status change with timestamps
- `CommissionRecord` — platform commission per completed order (rate by plan, amount in paise)
- `DailyCounter` — atomic counter for KOT numbering, resets at midnight per branch

## Order Status Flow
```
pending → confirmed → preparing → ready → completed
       ↘ cancelled (any stage with right permissions)
```

## KOT Status Flow
```
pending → acknowledged → preparing → ready → served
```

## Key Routes

### Orders (`src/routes/order.routes.ts`)
```
POST   /api/v1/orders/customer                  — place order (customer JWT)
POST   /api/v1/orders                           — place order (staff JWT)
GET    /api/v1/orders/:tenant_id               — list orders for tenant
GET    /api/v1/orders/:tenant_id/:id           — get order detail
PATCH  /api/v1/orders/:tenant_id/:id/status    — update order status
POST   /api/v1/orders/:tenant_id/:id/cancel    — cancel order
GET    /api/v1/orders/:tenant_id/:id/bill      — get bill summary
POST   /api/v1/orders/:tenant_id/:id/payment   — record payment
POST   /api/v1/orders/internal/add-line-item   — add jukebox song to bill (X-Internal-Secret)
POST   /api/v1/orders/internal/remove-line-item — remove/refund jukebox item
```

### KOTs (`src/routes/kot.routes.ts`)
```
GET    /api/v1/kots/:tenant_id                         — list KOTs
GET    /api/v1/kots/:tenant_id/:id                     — get KOT detail
PATCH  /api/v1/kots/:tenant_id/:id/status              — update KOT status (kds mode ack here)
POST   /api/v1/kots/:tenant_id/:id/printer-ack         — printer confirms print (printer mode)
GET    /api/v1/kots/:tenant_id/:branch_id/active       — active KOTs for KDS screen
```

## KOT Generation
- Sequential numbering: `KOT-001`, `KOT-002`... via atomic upsert on `DailyCounter`
- Resets at midnight per branch timezone
- Multiple KOTs per table session (all consolidated at billing)

## KOT Auto-Split (Type 3 — seated_full_service)
- Food items → `station: "kitchen"` KOT
- Drink/beverage items → `station: "bar"` KOT
- Split determined by `item.item_type === "beverage"`
- Two separate KDS screens receive the split KOTs

## Three KOT Acknowledgment Modes
Fetched from tenant-service at order placement (cached 30min in Redis).

```
"auto"    → BullMQ delayed job fires after kot_ack_delay_secs (default 60s)
            If KOT still pending → auto-acknowledge
            Job cancelled if staff/printer acks first

"kds"     → Chef taps on KDS screen
            PATCH /kots/:tenant_id/:id/status { status: "acknowledged" }

"printer" → Thermal printer confirms successful print
            POST /kots/:tenant_id/:id/printer-ack { success: true }
            On print failure → KOT stays pending
```

`acknowledgeKot()` is **idempotent** — returns current state if already acknowledged, cancels pending BullMQ job.

## GST Calculation
- Two modes per tenant: `GST_REGISTERED` (CGST+SGST or IGST) vs `NON_REGISTERED` (total only)
- Item-level GST rates: 0, 5, 12, 18, 28%
- `isTaxInclusive` flag: if true, backs out GST from price
- Intra-state → CGST + SGST; Interstate → IGST
- Invoice: `INV-YYYY-XXXX` (GST registered) or `RCP-YYYY-XXXX` (non-registered)

## Commission Calculation
- Triggered when `order.status → completed`
- Rates by plan: free=3%, starter=2%, pro=1.5%
- Stored in `CommissionRecord` (settled monthly)
- Razorpay Route: auto-splits at checkout (placeholder in current implementation)

## Billing
```
subtotal = sum of (item.price × qty)
discount = coupon / offer reduction
gst      = calculated per item rate
commission = subtotal × plan_rate
tips     = recorded separately (cash or UPI)
total    = subtotal - discount + gst
```
All amounts stored as integers (paise/cents).

## BullMQ Queue (`src/lib/queue.ts`)
- Queue name: `kot-auto-ack`
- Job: delayed by `kot_ack_delay_secs`, cancelled on manual ack
- Redis-based, requires Redis ≥ 5.0 (Docker Redis on port 6380)

## File Structure
```
src/
├── index.ts
├── routes/          — order.routes.ts, kot.routes.ts
├── services/        — order.service.ts (GST calc, KOT generation, commission)
├── repositories/    — order, kot, commission, counter
└── lib/
    ├── queue.ts         — BullMQ setup
    ├── tenantClient.ts  — fetch tenant config (kot_ack_mode, plan)
    ├── jwt.ts, prisma.ts, redis.ts, logger.ts, zodError.ts
```

## Environment Variables
```
PORT=3004
DATABASE_URL=postgresql://ulcp_user:ulcp_pass@localhost:5433/ulcp?schema=order_svc
REDIS_URL=redis://localhost:6380
JWT_SECRET=
INTERNAL_API_SECRET=
CATALOGUE_SERVICE_URL=http://localhost:3003
TENANT_SERVICE_URL=http://localhost:3002
COMMISSION_FREE=3
COMMISSION_STARTER=2
COMMISSION_PRO=1.5
RAZORPAY_KEY_ID=
RAZORPAY_SECRET=
RAZORPAY_ROUTE_ENABLED=false
NODE_ENV=development
```

## Dev Commands
```bash
pnpm dev
pnpm build
pnpm db:migrate
pnpm db:generate
docker compose -f docker-compose.dev.yml logs -f order-service
```

## Debugging Production Issues
- KOT not auto-acknowledging → check BullMQ worker is running, check Redis connectivity (must be Redis ≥ 5.0 on port 6380)
- KOT numbering wrong → check `DailyCounter` table, verify midnight reset cron is running
- GST calculation off → check `item.gst.isTaxInclusive` flag and tenant's state code for intra/interstate
- Commission not recording → check `ORDER_COMPLETED` event flow, check `CommissionRecord` in DB
- Orders not showing on KDS → check realtime-service pub/sub, `KOT_CREATED` event emission
- Jukebox billing → internal endpoints use `X-Internal-Secret`, never exposed through Kong

## Cancellation Rules
- `pending`: anyone can cancel
- `acknowledged/preparing`: staff with orders:manage
- `preparing` onwards: owner only

## Coding Conventions
- Every Prisma query includes `where: { tenant_id: "..." }`
- All amounts in paise (integer) — never floating point
- All responses: `{ success: true/false, data?: T, error?: string }`
- Pino logging only, Zod validation on all request bodies
- No `any` types, TypeScript strict

## Before Starting Any Task
1. Read `src/routes/order.routes.ts` and `src/routes/kot.routes.ts`
2. Read `AGENT_CONTEXT.md` for recent changes
3. Check `prisma/schema.prisma` for current models
