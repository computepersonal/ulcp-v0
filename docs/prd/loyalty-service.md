# loyalty-service — PRD

## Overview

The loyalty-service (port 3011) manages the customer loyalty program for each tenant on the ULCP platform. It tracks per-customer, per-tenant loyalty points, wallet credit, tier status (Silver/Gold/Platinum), visit history, and offers. Points are awarded automatically when an order is completed (via Redis Pub/Sub subscription to `ORDER_COMPLETED`) and can be redeemed at checkout via an internal HTTP API. The service also manages tenant-specific loyalty configuration (earn rates, redemption values, tier thresholds) and provides both customer-facing and staff-facing views of loyalty profiles. Automated offers are triggered by milestones (first order, every 10th order), birthdays, and manual staff grants.

---

## Users / Actors

- **Platform customer** — views their own loyalty profile, offer wallet, and order history at a specific tenant; also views cross-business loyalty summary across all their saved places
- **Staff (all roles)** — looks up customer loyalty profile by ID or mobile number at POS
- **Tenant owner / managing partner** — configures loyalty program settings (earn rate, tier thresholds, birthday discount), grants manual offers, and views the full customer list
- **order-service** (internal, X-Internal-Secret) — calls award-points and redeem-points endpoints at checkout and order completion
- **System (cron)** — expires old offers hourly, sends expiring-soon notifications every 2 hours, checks birthday offers daily at 6 AM

---

## Core Features

1. **Points earning** — on every completed order, points are calculated as `floor(earn_rate × amount_paid_in_rupees)` and credited to the customer's balance for that tenant
2. **Points redemption** — customer can redeem points at checkout; minimum redemption enforced; each point converts to a configurable rupee value (`redemption_value` paise per point)
3. **Loyalty tiers** — three tiers based on lifetime spend: Silver (default), Gold, Platinum; tier is recalculated on every order completion; thresholds are configurable per tenant
4. **Wallet credit** — separate from points; granted by staff or system; used as direct monetary discount at checkout
5. **Offers engine** — three offer types: `auto_applied` (applied without coupon code), `reward` (shown to customer, manually applied), `wallet_credit` (adds to wallet balance)
6. **Automated offer triggers** — birthday (configurable discount percentage, granted at 6 AM on birthday), first order bonus (signup_bonus_points), milestone rewards (every 10 orders → 15% off, 30-day validity)
7. **Manual offer grants** — staff can grant percentage, flat, or free-item offers to any customer at any time
8. **Customer loyalty profile** — full view includes: points balance, wallet balance, tier, visit count, order count, active offers, order history (last 5), favorite items, and staff notes
9. **Cross-business loyalty overview** — customer can see their loyalty balance at every tenant they've visited, with active offer counts, enriched with tenant name and logo
10. **Staff customer lookup** — by customer_id or by mobile number (proxies to identity-service)
11. **Customer list for staff POS** — paginated, filterable by tier, searchable; enriched with name/mobile from identity-service
12. **Offer lifecycle management** — apply offer to order, revoke applied offer (returns to active), automatic expiry sweep

---

## API Endpoints

### Customer routes (Bearer JWT, customer token)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/loyalty/:tenant_id/me` | Customer JWT | My loyalty profile at this tenant (points, tier, offers, history) |
| GET | `/loyalty/me/all` | Customer JWT | Cross-business loyalty summary for all my visited places |
| GET | `/loyalty/:tenant_id/me/history` | Customer JWT | Paginated order history at this tenant |
| GET | `/loyalty/:tenant_id/me/offers` | Customer JWT | My active offers at this tenant |

### Staff routes (Bearer JWT, staff token)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/loyalty/:tenant_id/customer/:customer_id` | Staff JWT | Full customer loyalty profile (includes staff_notes) |
| GET | `/loyalty/:tenant_id/customer/by-mobile/:mobile` | Staff JWT | Look up customer by mobile number |
| POST | `/loyalty/:tenant_id/customer/:customer_id/notes` | Staff JWT | Update staff notes for a customer |
| GET | `/loyalty/:tenant_id/customer/:customer_id/offers` | Staff JWT | List offers (filter by status: active/used/expired) |
| POST | `/loyalty/:tenant_id/customer/:customer_id/offers/grant` | Staff JWT | Manually grant an offer to a customer |
| POST | `/loyalty/:tenant_id/offers/:offer_id/apply` | Staff JWT | Apply an offer to a specific order_id |
| POST | `/loyalty/:tenant_id/offers/:offer_id/revoke` | Staff JWT | Revoke an applied offer (returns to active) |
| GET | `/loyalty/:tenant_id/customers` | Staff JWT | Paginated customer list, filterable by tier, searchable |

### Config routes (Staff JWT, owner roles only for PATCH)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/loyalty/:tenant_id/config` | Staff JWT | Get tenant loyalty configuration |
| PATCH | `/loyalty/:tenant_id/config` | Staff JWT (owner only) | Update earn rate, thresholds, birthday settings |

### Internal routes (X-Internal-Secret header only)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/loyalty/internal/award-points` | X-Internal-Secret | Award points on order completion (called by order-service) |
| POST | `/loyalty/internal/redeem-points` | X-Internal-Secret | Redeem points at checkout (called by order-service) |

---

## Data Models

### CustomerLoyalty
Per-customer, per-tenant loyalty record. Unique on `(tenant_id, customer_id)`.

| Field | Type | Notes |
|-------|------|-------|
| tenant_id | String | Scopes record to a tenant |
| customer_id | String | References PlatformCustomer in identity-service |
| points_balance | Int | Current redeemable points |
| wallet_balance | Int | Wallet credit balance (in paise) |
| lifetime_spend | Int | Total amount spent in paise — used for tier calculation |
| lifetime_earned_points | Int | Cumulative points ever earned |
| lifetime_redeemed_points | Int | Cumulative points ever redeemed |
| visits_count | Int | Total visits (incremented on every order completion) |
| orders_count | Int | Total completed orders |
| last_visit_at | DateTime | Timestamp of most recent completed order |
| tier | Enum | silver / gold / platinum |
| favourite_items | String[] | Array of item IDs (populated externally — see Open Questions) |
| staff_notes | String? | Free-text notes, hidden from customer-facing API |

### CustomerOffer
One offer per row. Linked to a tenant and customer.

| Field | Type | Notes |
|-------|------|-------|
| tenant_id / customer_id | String | Scoping |
| type | Enum | auto_applied / reward / wallet_credit |
| value_type | Enum | percentage / flat / free_item |
| value | Int | Percentage (1-100) or flat amount in paise |
| trigger | Enum | birthday / milestone / manual_grant / signup / first_order / reorder / anniversary |
| status | Enum | active / used / expired / cancelled |
| expires_at | DateTime? | Null = never expires |
| used_on_order_id | String? | Set when status → used |
| auto_apply | Boolean | True = applied automatically at checkout |
| min_order_amount | Int? | Minimum order in paise for the offer to be valid |
| free_item_id / free_item_name | String? | For free_item type offers |

### CustomerVisit
One row per completed order, used for history display and visit stats.

| Field | Type | Notes |
|-------|------|-------|
| tenant_id / customer_id | String | Scoping |
| order_id | String | Reference to order-service |
| branch_id | String | Which branch |
| total_amount | Int | In paise |
| items_count | Int | Number of items in the order |

### LoyaltyConfig
One row per tenant. Created with defaults on first access (`getOrCreateConfig`).

| Field | Type | Default | Notes |
|-------|------|---------|-------|
| earn_rate | Float | 0.1 | Points per rupee spent (e.g., 0.1 = 1 point per ₹10) |
| redemption_value | Int | 100 | Paise per point (e.g., 100 = ₹1 per 10 points at earn_rate 0.1) |
| min_redemption_points | Int | 50 | Minimum points required to redeem |
| signup_bonus_points | Int | 100 | Points awarded on first order |
| birthday_offer_enabled | Boolean | true | |
| birthday_discount_pct | Int | 50 | Percentage discount on birthday |
| tier_silver_threshold | Int | 0 | Min lifetime spend (paise) for Silver |
| tier_gold_threshold | Int | 100000 | ₹1000 lifetime spend → Gold |
| tier_platinum_threshold | Int | 500000 | ₹5000 lifetime spend → Platinum |

Note: The CLAUDE.md describes different tier thresholds (Gold=1000 pts, Platinum=5000 pts based on points, not spend). The actual Prisma schema uses lifetime_spend in paise for tier calculation. The CLAUDE.md documentation is inconsistent with the code — the code governs.

---

## Business Rules

- **Points formula**: `floor(earn_rate × (amount_paid_paise / 100))` — e.g., at default earn_rate=0.1, a ₹500 order earns 5 points
- **Redemption formula**: `points × redemption_value` (in paise) — e.g., 50 points × 100 = ₹50 discount
- **Tier thresholds**: Based on `lifetime_spend` in paise (configurable per tenant). Default thresholds: Gold=₹1000, Platinum=₹5000 total spend
- **Tier upgrade**: Checked on every order completion; upgrades are immediate, downgrades are not implemented (see Open Questions)
- **First order bonus**: Granted only once — guarded by checking for existing `signup` trigger offer before creating
- **Milestone reward**: Every 10th order triggers a 15% off, 30-day expiry reward offer; checked via `orders_count % 10 === 0`
- **Birthday offer**: Granted daily at 6 AM by cron; checks customer birthday from identity-service; only one birthday offer granted per calendar day (guarded by `hasTriggerOffer("birthday")`)
- **Offer expiry sweep**: Runs hourly; marks expired offers as `status = "expired"`
- **Expiring soon notifications**: Offers expiring within 24 hours trigger a `OFFER_EXPIRING_SOON` Redis Pub/Sub event every 2 hours (picked up by notification-service)
- **Config access**: PATCH `/config` requires `tenant_owner`, `primary_owner`, `managing_partner`, or `platform_superadmin` role
- **Feature gating**: Loyalty tiers are a Pro+ feature per CLAUDE.md, but the code does not currently enforce this gate — all tenants can configure tiers
- **Wallet credit grants**: When a staff member grants a `wallet_credit` offer, the wallet_balance is immediately incremented in CustomerLoyalty in addition to creating the CustomerOffer record
- **Offer validation on apply**: Checks `status === "active"` and `expires_at < now()` before marking as used
- **Internal secret auth**: All `POST /loyalty/internal/*` routes are protected exclusively by `X-Internal-Secret` — no JWT required

---

## Service Dependencies

| Dependency | Direction | Purpose |
|------------|-----------|---------|
| order-service | Inbound (internal HTTP) | Calls `/internal/award-points` on order completion; calls `/internal/redeem-points` at checkout |
| order-service | Inbound (Redis Pub/Sub) | Also listens to `ORDER_COMPLETED` event directly as a backup/primary trigger |
| identity-service | Outbound (HTTP GET) | Fetches `PlatformCustomer` profile (name, mobile, birthday, anniversary); cached 5 min in Redis |
| tenant-service | Outbound (HTTP GET) | Fetches tenant name + logo for cross-business loyalty overview (`/me/all`) |
| notification-service | Outbound (Redis Pub/Sub publish) | Publishes `OFFER_EXPIRING_SOON`, `BIRTHDAY_OFFER_GRANTED`, `LOYALTY_POINTS_AWARDED`, `TIER_UPGRADED`, `MILESTONE_REACHED`, `OFFER_GRANTED` events |
| Redis | Read/Write | Customer profile cache (5 min), Pub/Sub for event publishing |

---

## Current Build Status

| Component | Status |
|-----------|--------|
| Prisma schema | Built — CustomerLoyalty, CustomerOffer, CustomerVisit, LoyaltyConfig |
| Database migration | Applied (via `prisma db push`) |
| `src/index.ts` | Built |
| `src/routes/customer.routes.ts` | Built — 4 customer-facing endpoints |
| `src/routes/staff.routes.ts` | Built — 7 staff-facing endpoints |
| `src/routes/config.routes.ts` | Built — GET + PATCH config |
| `src/routes/internal.routes.ts` | Built — award-points + redeem-points |
| `src/services/loyalty.service.ts` | Built — all business logic |
| `src/repositories/*.ts` | Built — all 4 repositories |
| `src/lib/eventSubscriber.ts` | Built — subscribes to ORDER_COMPLETED via Redis |
| `src/lib/cronJobs.ts` | Built — 3 cron jobs (offer expiry, expiring soon, birthday) |
| Wishlist / back-in-stock | Not implemented (described in CLAUDE.md) |
| Reorder feature | Not implemented |
| Recommendations engine | Not implemented |
| Saved places | Not implemented in this service (described in CLAUDE.md as customer-web feature) |
| Platform loyalty layer | Not implemented (the CLAUDE.md describes a cross-business "platform loyalty" separate from tenant loyalty — only tenant loyalty exists in code) |

The loyalty-service core is fully implemented. The PROGRESS.md marks it as "Not Started" as of the last update (2026-04-23), but the source code is present and built.

---

## Open Questions / Gaps

1. **Platform loyalty vs tenant loyalty**: The CLAUDE.md describes two distinct layers — a platform-wide loyalty program (₹10 = 1 point, cross-business redemption) and a per-tenant loyalty program. The code only implements tenant-scoped loyalty. The platform loyalty layer with cross-business point pools does not exist yet.
2. **Tier downgrade**: If a customer's lifetime spend somehow decreases (refunds), the tier calculation would downgrade them. Is tier downgrade intentional? Currently upgrades are applied immediately; no downgrade logic exists.
3. **`favourite_items` population**: The `CustomerLoyalty` model has a `favourite_items String[]` field, but no code currently writes to it. How is it populated — by the loyalty-service analyzing order history, or by the customer explicitly marking items?
4. **Tier gating enforcement**: CLAUDE.md states loyalty tiers are Pro+ only. The code does not check the tenant's plan before applying tier logic. Should plan gating be added, and should existing Gold/Platinum customers be downgraded if their tenant downgrades from Pro?
5. **Redemption currency**: The `redemption_value` field is stored in the `LoyaltyConfig` as `Int` with default 100 (paise per point). The CLAUDE.md describes "₹1 per 10 points" — at earn_rate=0.1 this is consistent, but the UI display formula needs careful documentation to avoid PM confusion.
6. **Offer application at checkout**: The internal `redeem-points` endpoint exists and is called by order-service. But how does the order-service know which `CustomerOffer` to apply? The `/offers/:offer_id/apply` route takes an `order_id` — who calls this and when during the checkout flow?
7. **Reorder and recommendation features**: Described in CLAUDE.md as customer features but not implemented. Should these live in loyalty-service or in the customer-web frontend?
8. **Back-in-stock notifications for wishlist**: The CLAUDE.md describes a wishlist with `notifyWhenAvailable` flag. There is no wishlist model in the current Prisma schema. Is this in scope for this service or a future addition?
9. **Anniversary offers**: The `OfferTrigger` enum includes `anniversary`, but no cron job or trigger logic implements anniversary offers. Is this planned?
10. **`reorder` trigger**: Similarly, `reorder` is in the enum but has no implementation path.
11. **Offer amount in paise**: The `value` field on CustomerOffer is typed as `Int` but used for both percentage (0-100) and flat amounts (paise). There is no currency unit annotation — this could cause PM confusion. Should flat offers store paise explicitly?
