# superadmin-service — PRD

## Overview

The superadmin-service (port 3012) is the platform operator's control plane for the entire ULCP SaaS platform. It provides Anthropic-style "god mode" visibility into all tenants, their revenue, commission earned by the platform, and moderation controls. Only users with the `platform_superadmin` role — set manually in the database — can access any endpoint. Key responsibilities include: platform-wide metrics (GMV, MRR, tenant count), tenant lifecycle management (activate/suspend/plan override), monthly commission settlement (invoice generation), cross-business customer data, broadcast notifications to all businesses or customers, and content moderation (flagged reviews). This service does not process any live transactions — it reads from other services' databases and triggers administrative actions.

---

## Users / Actors

- **Platform superadmin** — the sole user of this service; this role must be set manually in the `identity` DB (`users.role = "platform_superadmin"`); there is no self-service path to obtain this role
- **System (cron)** — monthly commission invoice generation (planned)

No tenant owners, staff, or customers can access any endpoint in this service.

---

## Core Features

1. **Platform overview dashboard** — aggregate metrics: total tenant count, GMV (gross merchandise value), MRR (monthly recurring revenue from subscriptions), commission earned, new signups
2. **Tenant management** — list all tenants with pagination, view detail, activate/suspend accounts, override subscription plan
3. **Tenant impersonation** — generate a scoped JWT that allows the superadmin to act as a tenant owner for support purposes
4. **Revenue and commission reporting** — MRR breakdown by plan tier, commission earned/pending per tenant, platform-level financial summary
5. **Commission settlement** — monthly batch: aggregate CommissionRecord entries from order-service per tenant, generate PDF invoices via puppeteer, track invoice status (sent/paid)
6. **Cross-business customer data** — view customers sorted by platform-wide spend across all tenants
7. **Platform broadcast notifications** — send messages to all businesses (tenant owners) or all customers via notification-service
8. **Review moderation** — list flagged reviews across all tenants, remove reviews
9. **Platform settings** — configure commission rates (free/starter/pro), subscription prices, feature flags per plan

---

## API Endpoints

All routes are planned but not yet implemented. The following is the intended API surface from AGENT_CONTEXT.md. All routes require `platform_superadmin` role in JWT.

### Overview & Tenants

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/v1/superadmin/overview` | Superadmin JWT | Platform metrics: tenant count, GMV, MRR, commission, signups |
| GET | `/api/v1/superadmin/tenants` | Superadmin JWT | Paginated list of all tenants |
| GET | `/api/v1/superadmin/tenants/:id` | Superadmin JWT | Full tenant detail |
| PATCH | `/api/v1/superadmin/tenants/:id` | Superadmin JWT | Activate/suspend tenant or override plan |
| POST | `/api/v1/superadmin/tenants/:id/impersonate` | Superadmin JWT | Generate a scoped JWT as the tenant owner |

### Revenue & Settlement

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/v1/superadmin/revenue` | Superadmin JWT | MRR breakdown by plan, total commission earned/pending |
| GET | `/api/v1/superadmin/settlements` | Superadmin JWT | List all commission invoices (paginated) |
| POST | `/api/v1/superadmin/settlements` | Superadmin JWT | Generate monthly invoices for all tenants |
| PATCH | `/api/v1/superadmin/settlements/:id` | Superadmin JWT | Mark invoice as paid |

### Customers, Notifications, Moderation, Settings

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/v1/superadmin/customers` | Superadmin JWT | Cross-business customer spend data |
| POST | `/api/v1/superadmin/broadcast` | Superadmin JWT | Broadcast notification to all businesses or all customers |
| GET | `/api/v1/superadmin/moderation/reviews` | Superadmin JWT | List flagged/reported reviews |
| DELETE | `/api/v1/superadmin/moderation/reviews/:id` | Superadmin JWT | Remove a review |
| GET | `/api/v1/superadmin/settings` | Superadmin JWT | View platform settings (commission rates, feature flags) |
| PATCH | `/api/v1/superadmin/settings` | Superadmin JWT | Update commission rates, prices, feature flags |

---

## Data Models

The superadmin-service has no Prisma schema yet. It will primarily read from other services' databases:

**order-service DB (schema: order_svc)**
- `CommissionRecord` — tenant_id, order_id, commission_amount, plan_at_time, created_at — source for settlement aggregation
- `Order` — for GMV calculation

**tenant-service DB (schema: tenant)**
- `Tenant` — plan, status (active/suspended), created_at — source for MRR and tenant management
- `Branch` — for multi-branch context

**identity-service DB (schema: identity)**
- `User` — for cross-tenant user counts, support lookups
- `PlatformCustomer` — for cross-business customer data

**loyalty-service DB (schema: loyalty, planned)**
- `CustomerVisit` — for cross-business spend aggregation

**Planned own models (superadmin schema):**
- `CommissionInvoice` — tenant_id, month, total_commission, status (pending/sent/paid), pdf_url, generated_at, paid_at
- `PlatformSetting` — key-value store for commission rates, feature flags, plan prices

---

## Business Rules

- **Access control is absolute**: Every route in this service must verify `JWT.role === "platform_superadmin"` before proceeding. No other role — including `tenant_owner` or `managing_partner` — can access any endpoint. The role is set manually in the database and cannot be obtained through any API.
- **Commission rates** (current platform defaults):
  - Free plan: 3% of every completed order
  - Starter plan: 2%
  - Pro plan: 1.5%
  - Enterprise plan: custom (negotiated)
- **Commission calculation**: Already computed by order-service at order completion and stored in `CommissionRecord`. The superadmin-service aggregates these records for settlement.
- **Settlement cycle**: Monthly. Invoices are generated for the prior month's CommissionRecord total per tenant. Once generated, tenants are expected to pay; the superadmin marks invoices paid manually (or via future payment webhook).
- **Razorpay Route integration**: For orders processed through Razorpay, commission is split at payment time (customer pays ₹500 → ₹490 to restaurant + ₹10 to platform instantly). CommissionRecord tracks this. For non-Razorpay orders, commission is tracked but not auto-split — manual settlement applies.
- **Plan override**: The superadmin can change a tenant's plan without going through Razorpay. This is used for manual upgrades, grandfathering, and support exceptions.
- **Suspend vs delete**: Suspending a tenant disables their access and stops QR scans from working; deletion is not planned (data retention).
- **Impersonation**: The impersonation JWT should be scoped with a short TTL and an audit trail. The implementation details of scope and audit are not yet defined.
- **Broadcast notifications**: Routed through notification-service (internal HTTP or Redis Pub/Sub). The superadmin-service composes the message; notification-service handles channel selection and delivery.
- **Moderation**: Reviews are stored in loyalty-service (planned). Flagging mechanism (customer reports, threshold-based auto-flag) is not yet defined.
- **Settings changes**: Changing commission rates would affect all new CommissionRecord calculations from that point forward. Existing records and invoices are not retroactively modified.

---

## Service Dependencies

| Dependency | Direction | Purpose |
|------------|-----------|---------|
| order-service DB | Read (direct DB) | CommissionRecord aggregation for settlement; GMV from Orders |
| tenant-service DB | Read (direct DB) | Tenant list, plan, status for management views |
| identity-service DB | Read (direct DB) | User/customer data for cross-business views |
| identity-service | Outbound (HTTP) | Generate impersonation JWT (likely via an internal endpoint) |
| notification-service | Outbound (HTTP internal) | Broadcast notifications to all businesses or customers |
| loyalty-service DB | Read (direct DB, planned) | CustomerVisit for cross-business spend data |
| analytics-service | Unclear | May share data sources or call analytics endpoints for platform-level reports |

---

## Current Build Status

| Component | Status |
|-----------|--------|
| `package.json` | Exists (minimal — only `@ulcp/shared` dep, no Fastify or Prisma yet) |
| `src/` directory | Does not exist |
| Prisma schema | Does not exist |
| Any routes | None implemented |
| Commission settlement logic | Not implemented |
| Tenant impersonation | Not implemented |
| Platform settings store | Not implemented |
| Moderation system | Not implemented |

The superadmin-service is a **stub only**. No source code exists beyond `package.json`.

The `apps/superadmin/` directory exists in the monorepo but is also not yet built (no source in PROGRESS.md).

Commission tracking is functional: order-service already writes `CommissionRecord` rows on order completion. The settlement workflow (aggregation → invoice PDF → paid marking) is the first high-priority feature to build.

---

## Open Questions / Gaps

1. **Direct DB access vs API calls**: The AGENT_CONTEXT.md implies the superadmin-service reads directly from other services' database schemas. This is the same tradeoff as analytics-service. For a superadmin use case (low frequency, admin-only), is this acceptable, or should other services expose internal HTTP APIs?
2. **Impersonation security**: Tenant impersonation is a high-risk feature. What should the JWT scope be? Should it be read-only or full tenant_owner access? Is there an audit trail requirement before implementing?
3. **Commission rate changes**: If commission rates change (via PATCH /settings), should there be a transition period? Pending orders at the old rate? The current CommissionRecord stores `plan_at_time` — is this enough to reconstruct historical rates?
4. **Razorpay Route partial coverage**: Not all tenants may use Razorpay Route for commission splitting. For non-Razorpay orders, commission is tracked but not auto-collected. How does the platform actually collect commission from tenants that pay via manual invoice?
5. **Enterprise plan handling**: Enterprise tenants have custom commission rates. Where are those rates stored, and how does order-service know which rate to use for a given Enterprise tenant?
6. **Moderation flagging mechanism**: No review flagging system exists in loyalty-service yet. Should there be a customer-facing "report" button, an automated profanity filter, or only manual superadmin review? This needs to be designed before the moderation endpoint makes sense.
7. **`apps/superadmin/` frontend**: The admin panel UI is not started. Is this a React app inside the monorepo or will an off-the-shelf admin framework (like Retool) be used to reduce build time?
8. **MRR calculation**: MRR from subscriptions is straightforward for monthly plans. How is it calculated for tenants on annual plans, enterprise deals, or grandfathered pricing? Is MRR a simple count × plan_price or does it need proration?
9. **Tenant suspension effect**: When a tenant is suspended, should all in-flight orders be cancelled? Should staff JWTs be invalidated immediately (would require JWT blacklisting in identity-service)? What happens to customer QR scans during suspension?
10. **Cross-business customer spend**: The CLAUDE.md mentions "cross-business spend data" as a superadmin feature. This requires joining data from identity-service (customers) with order-service (orders) across all tenants. The query design for this at scale (millions of orders) needs careful indexing consideration.
11. **Settlement invoice delivery**: Once a PDF invoice is generated, how is it delivered to the tenant? Via email (SendGrid)? Via the tenant's Settings > Subscription page? Is there a webhook for payment confirmation?
