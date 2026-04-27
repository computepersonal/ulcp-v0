# analytics-service — PRD

## Overview

The analytics-service (port 3009) is the platform's reporting and business intelligence layer. It aggregates data from the order-service, inventory-service, and tenant-service to produce pre-computed reports covering revenue, order trends, item performance, staff productivity, customer insights, and P&L statements. All reports are Redis-cached with a 15-minute TTL, and the dashboard endpoint must respond in under 5ms by serving exclusively from cache. This service does not own any transaction data — it reads from other services' databases and publishes cached aggregates.

---

## Users / Actors

- **Tenant owner / managing partner** — primary consumer; views dashboard, revenue reports, and P&L
- **Reports analyst** (staff role with `reports:view` permission) — can access revenue/order/item reports
- **Platform superadmin** — cross-tenant visibility (future)
- **System (cron)** — pre-computes and caches reports every 15 minutes

---

## Core Features

1. **Real-time dashboard** (Pro+ only) — live broadcast of revenue, active orders, tables in use, and active deliveries every 30 seconds via Socket.io through the realtime-service
2. **Revenue report** (all plans) — total revenue by day/week/month, AOV trend, payment mode breakdown
3. **Orders report** (all plans) — order count, order type donut, peak hours heatmap, cancellation rate
4. **Item performance report** (Starter+) — top items by revenue and volume, category revenue breakdown
5. **Staff performance report** (Pro+) — orders handled per staff member
6. **Customer insights** (Pro+) — new vs returning customers, retention rate, top spenders
7. **P&L statement** (Pro+) — revenue minus COGS (from inventory stock movements × unit cost) minus platform commission minus subscription fee
8. **PDF export** (Pro+) — generated via puppeteer
9. **Excel export** (Pro+) — generated via exceljs
10. **Pre-computation cron** — runs every 15 minutes, recomputes all reports and refreshes Redis cache

---

## API Endpoints

All routes are planned but not yet implemented. The following is the intended API surface from the AGENT_CONTEXT.md:

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/v1/analytics/:tenant_id/dashboard` | Staff JWT (Pro+) | Full dashboard payload (served from Redis cache only) |
| GET | `/api/v1/analytics/:tenant_id/revenue` | Staff JWT (all plans) | Revenue totals, trends, AOV, payment breakdown |
| GET | `/api/v1/analytics/:tenant_id/orders` | Staff JWT (all plans) | Order counts, type distribution, peak hours |
| GET | `/api/v1/analytics/:tenant_id/items` | Staff JWT (Starter+) | Item-level performance, top sellers, category revenue |
| GET | `/api/v1/analytics/:tenant_id/staff` | Staff JWT (Pro+) | Orders per staff member |
| GET | `/api/v1/analytics/:tenant_id/customers` | Staff JWT (Pro+) | New vs returning, retention, top spenders |
| GET | `/api/v1/analytics/:tenant_id/pl` | Staff JWT (Pro+) | P&L statement (revenue - COGS - commission - subscription) |
| POST | `/api/v1/analytics/:tenant_id/export/pdf` | Staff JWT (Pro+) | Trigger PDF generation via puppeteer |
| POST | `/api/v1/analytics/:tenant_id/export/excel` | Staff JWT (Pro+) | Trigger Excel generation via exceljs |

Note: the order-service already provides a basic `GET /api/v1/orders/:tenant_id/summary/daily` endpoint. That route is live today and is currently used by the staff POS Reports page. The analytics-service is meant to extend beyond single-day summaries to multi-period trends, P&L, and exports.

---

## Data Models

The analytics-service has no Prisma schema yet. It will read cross-service data from:

**order-service DB (schema: order_svc)**
- `Order` — id, tenant_id, branch_id, status, order_type, total_amount, payment_mode, created_at
- `CommissionRecord` — order_id, tenant_id, commission_amount (used for P&L deduction)
- `KOT` — staff_id linkable for staff performance

**inventory-service DB (schema: inventory)**
- `StockMovement` — movement_type=`order_deduct`, quantity, unit_cost — source of COGS

**tenant-service DB (schema: tenant)**
- `Tenant` — plan (free/starter/pro), subscription cost for P&L

**Redis (analytics cache)**
- Key pattern: `analytics:{tenant_id}:{report_type}` — TTL 900 seconds (15 min)
- Dashboard load target: < 5ms (cache must be warm before any client request arrives)

---

## Business Rules

- Dashboard endpoint must ONLY serve from Redis cache — never compute on the request path
- Reports are recomputed every 15 minutes by a background cron job
- Plan gates:
  - Free/Starter: revenue + orders reports only
  - Starter+: item performance report
  - Pro+: staff performance, customer insights, P&L, PDF/Excel exports, live dashboard
- P&L formula: `revenue - COGS - platform_commission - subscription_cost`
  - COGS = sum of (StockMovement.quantity × StockMovement.unit_cost) where movement_type = `order_deduct`
- All monetary values stored and computed in paise (integer); displayed via `formatCurrency()`
- Dates stored as UTC, displayed in tenant's configured timezone
- The existing `GET /api/v1/orders/:tenant_id/summary/daily` in order-service is the only live analytics-adjacent endpoint today; analytics-service will replace/extend it for multi-period and export use cases

---

## Service Dependencies

| Dependency | Direction | Purpose |
|------------|-----------|---------|
| order-service DB | Read (direct DB access) | Orders, payments, KOTs, commission records |
| inventory-service DB | Read (direct DB access) | Stock movements for COGS calculation |
| tenant-service DB | Read (direct DB access) | Subscription plan for P&L cost deduction |
| realtime-service | Publish → Redis Pub/Sub | `DASHBOARD_UPDATE` event for live dashboard broadcast to Pro+ clients |
| Redis | Cache read/write | All pre-computed report results (15-min TTL) |

Note: Direct DB access across service schemas is a pragmatic choice for a single-PostgreSQL-instance setup. This is a known architectural tradeoff — if services are split to separate databases, the analytics-service will need HTTP calls or an event-sourced data warehouse instead.

---

## Current Build Status

| Component | Status |
|-----------|--------|
| `package.json` | Exists (minimal — only `@ulcp/shared` dep, no Fastify or Prisma yet) |
| `src/` directory | Does not exist |
| Prisma schema | Does not exist |
| Any routes | None implemented |
| Redis caching layer | Not implemented |
| Pre-computation cron | Not implemented |
| PDF/Excel export | Not implemented |
| Plan gating middleware | Not implemented |

The analytics-service is a stub only. The `AGENT_CONTEXT.md` file documents the intended build order and environment setup.

The order-service's `GET /orders/:tenant_id/summary/daily` route is the current stand-in used by the staff POS Reports screen. It returns: revenue, order count, top items, payment mode breakdown, unbilled orders count, and active orders count — for a single day only.

---

## Open Questions / Gaps

1. **Cross-DB reads vs HTTP calls**: The plan says analytics reads directly from other services' DB schemas. This works on a single Postgres instance but breaks in a microservices-proper setup. Should analytics use internal HTTP APIs instead, or is direct schema access acceptable long-term?
2. **Report granularity**: Are date range filters (today/yesterday/7d/30d/custom) scoped per-tenant or per-branch? The CLAUDE.md describes a dashboard but does not specify branch-level vs tenant-level filtering.
3. **Live dashboard event cadence**: The CLAUDE.md says "every 30 seconds." Is this a push from analytics-service via cron, or does realtime-service broadcast independently?
4. **PDF/Excel generation**: puppeteer is heavy (Chromium download ~300MB). Should this run in the analytics container or a separate worker? The AGENT_CONTEXT.md flags this as a concern.
5. **Staff performance**: "orders handled per staff" — is this the staff who created the order, the KOT acknowledger, or both? The order-service schema needs clarification on which staff_id field to attribute.
6. **Customer insights**: New vs returning is a cross-service concept (customer is in identity-service, orders in order-service). The join logic needs to be defined.
7. **Caching strategy for exports**: PDF/Excel generation can take several seconds. Should exports be async (return a job ID + poll) or synchronous?
8. **Retention definition**: The CLAUDE.md mentions "retention rate" but does not define the window (e.g., customers who ordered in month N-1 who also ordered in month N).
9. **Revenue reporting in chain/franchise mode**: Should parent-chain reports consolidate branches or remain per-branch?
