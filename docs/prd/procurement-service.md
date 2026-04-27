# procurement-service — PRD

## Overview

The procurement-service (port 3013) manages the full B2B supply chain for ULCP tenants. It gives restaurant and business owners a structured way to buy ingredients and supplies from vendors — either through a competitive bidding workflow (where multiple vendors quote a price) or through direct purchase orders sent to a known vendor. A built-in market view aggregates vendor pricing across all tracked ingredients so buyers can make informed decisions without leaving the platform.

---

## Users / Actors

| Actor | Role |
|---|---|
| Tenant Owner / Manager | Creates vendors, manages bid requests, places direct orders, awards bids |
| Staff (authenticated) | Can browse market view and list orders; full CRUD gated by `authenticateStaff` middleware |
| Vendor (external) | Receives a magic-link token via email/notification; views bid requests; submits or withdraws bids; views and confirms/declines direct orders — no account or JWT required |
| inventory-service (internal) | Receives purchase order creation calls on bid award and delivery confirmation |

---

## Core Features

1. **Vendor directory** — CRUD for vendors including contact details, GSTIN, supply categories, and a rating score.
2. **Vendor item catalog** — Per-vendor price list for specific ingredients: unit price (in paise), minimum order quantity, lead time in days, and availability flag.
3. **Vendor preferences** — Tenants can mark a preferred vendor per ingredient; preferences are used to rank vendors in the market view.
4. **Bid requests (RFQ)** — Tenants create a request-for-quote for one or more ingredients, invite specific vendors, set a closing time, and configure ranking weights (price, lead time, rating, payment terms).
5. **Bid request lifecycle** — `draft → open → closed → awarded` or `cancelled`. Opening generates per-vendor magic-link tokens and schedules a BullMQ auto-close job. Closing can be manual or automatic.
6. **Vendor portal (magic link)** — Vendors receive a single-use token URL. They can view the bid request, submit a bid (items, total, lead time, validity, payment terms, delivery info), or withdraw an already-submitted bid.
7. **Bid ranking** — Weighted scoring algorithm: price (40%), lead time (30%), vendor rating (20%), payment terms (10%). Weights are configurable per bid request. Staff can fetch the ranked list before awarding.
8. **Bid award** — Awarding a bid sets the winning vendor, marks other bids as rejected, and automatically creates a PurchaseOrder in inventory-service via internal API.
9. **Direct purchase orders** — Skip the bidding flow; create a one-shot order to a known vendor with explicit item lines and price. Vendor confirms or declines via magic-link token.
10. **Direct order lifecycle** — `pending → confirmed / cancelled → dispatched / cancelled → delivered`. On delivery, a receive call is made to inventory-service to update stock.
11. **Market view** — A read-only dashboard grouped by ingredient showing all vendors who supply it, their current price, lead time, and a recommended pick (preferred vendor first, then highest scored). Cached in Redis for 15 minutes.
12. **Price history** — Last 5 direct orders for a specific vendor + ingredient combination, used to track price trends.
13. **Recurring bid requests** — Recurrence types: one_time, daily, weekly, fortnightly, monthly, on_demand. A BullMQ repeating job handles recurrence scheduling (see Open Questions).

---

## API Endpoints

### Staff-facing (all require `authenticateStaff`)

| Method | Path | Description |
|---|---|---|
| POST | `/:tenant_id/vendors` | Create a vendor |
| GET | `/:tenant_id/vendors` | List vendors (filter: category, is_active) |
| GET | `/:tenant_id/vendors/:vendor_id` | Get vendor detail |
| PATCH | `/:tenant_id/vendors/:vendor_id` | Update vendor |
| DELETE | `/:tenant_id/vendors/:vendor_id` | Delete vendor |
| POST | `/:tenant_id/vendors/:vendor_id/items` | Add item to vendor catalog |
| GET | `/:tenant_id/vendors/:vendor_id/items` | List vendor's items |
| PATCH | `/:tenant_id/vendors/:vendor_id/items/:id` | Update vendor item |
| DELETE | `/:tenant_id/vendors/:vendor_id/items/:id` | Delete vendor item |
| POST | `/:tenant_id/vendors/:vendor_id/preferred` | Set/clear preferred vendor for an ingredient |
| POST | `/:tenant_id/bid-requests` | Create bid request (starts as draft) |
| GET | `/:tenant_id/bid-requests` | List bid requests (filter: status) |
| GET | `/:tenant_id/bid-requests/:id` | Get bid request detail |
| PATCH | `/:tenant_id/bid-requests/:id` | Update bid request (draft only) |
| DELETE | `/:tenant_id/bid-requests/:id` | Delete bid request |
| POST | `/:tenant_id/bid-requests/:id/open` | Open bid request — generate tokens, notify vendors, schedule auto-close |
| POST | `/:tenant_id/bid-requests/:id/close` | Manually close bid request |
| GET | `/:tenant_id/bid-requests/:id/bids/ranked` | Get weighted-score ranked bids |
| POST | `/:tenant_id/bid-requests/:id/award/:bid_id` | Award bid → create PO in inventory-service |
| POST | `/:tenant_id/bid-requests/:id/vendors` | Add vendors to invite list |
| POST | `/:tenant_id/direct-orders` | Place direct order with a vendor |
| GET | `/:tenant_id/direct-orders` | List direct orders (filter: vendor_id, status, ingredient_id, from, to) |
| GET | `/:tenant_id/direct-orders/:id` | Get direct order detail |
| PATCH | `/:tenant_id/direct-orders/:id/status` | Advance order status (confirmed/dispatched/delivered/cancelled) |
| GET | `/:tenant_id/market` | Market view — all ingredients with vendor options, sorted low stock first |
| GET | `/:tenant_id/market/:ingredient_id` | Market view — single ingredient vendor comparison |
| GET | `/:tenant_id/market/:ingredient_id/history/:vendor_id` | Price history — last 5 orders |

### Vendor-facing (no JWT — magic link token auth)

| Method | Path | Description |
|---|---|---|
| GET | `/vendor/bid-request/:token` | View bid request via magic link |
| POST | `/vendor/bid-request/:token/bid` | Submit bid (token is marked used after submission) |
| PATCH | `/vendor/bid/:bid_id/withdraw` | Withdraw a submitted bid |
| GET | `/vendor/order/:token` | View direct order via notification link |
| POST | `/vendor/order/:token/respond` | Accept or decline direct order |

---

## Data Models

### Vendor
- `tenant_id`, `name`, `contact_name`, `contact_email`, `contact_phone`
- `contact_whatsapp`, `address`, `city`, `state`, `pincode`, `gstin`
- `categories` (String array — ingredient categories this vendor supplies)
- `rating` (Float, default 5.0), `rating_count`
- `is_active`, `is_verified` (verified flag exists but no verification flow is built yet)

### VendorItem
- `vendor_id`, `tenant_id`, `ingredient_id`, `ingredient_name`
- `unit`, `unit_price` (paise), `min_order_quantity`, `lead_time_days`, `is_available`

### VendorPreference
- Composite unique: `(tenant_id, vendor_id, ingredient_id)` — one preferred vendor per ingredient per tenant

### BidRequest
- `tenant_id`, `branch_id`, `title`, `description`, `status` (enum: draft/open/closed/awarded/cancelled)
- `items` (Json array — each item has ingredient_id, ingredient_name, quantity, unit, notes)
- `recurrence` (enum), `recurrence_day`
- `bid_open_at`, `bid_close_at`
- `ranking_weights` (Json, default: price:40, lead_time:30, rating:20, payment:10)
- `awarded_vendor_id`, `awarded_bid_id`, `created_by`

### Bid
- `bid_request_id`, `vendor_id`, `tenant_id`, `status` (submitted/withdrawn/awarded/rejected)
- `items` (Json array with unit_price per item), `total_amount` (paise)
- `lead_time_days`, `valid_until`, `payment_terms` (advance/on_delivery/net_7/net_15/net_30)
- `delivery_included`, `delivery_charge`

### VendorToken
- `vendor_id`, `bid_request_id?`, `direct_order_id?`
- `token` (unique cuid), `token_type` ("bid" or "direct_order")
- `expires_at`, `used_at` — single-use enforced via non-null `used_at`

### DirectOrder
- `tenant_id`, `branch_id`, `vendor_id`, `status`
- `items` (Json array), `total_amount`, `payment_terms`
- `expected_delivery_date`, `purchase_order_id`
- Lifecycle timestamps: `confirmed_at`, `dispatched_at`, `delivered_at`, `cancelled_at`, `cancelled_reason`

---

## Business Rules

- Bid requests can only be edited in `draft` status.
- A bid request must have a `bid_close_at` set before it can be opened.
- Opening a bid request generates one VendorToken per invited vendor. Tokens expire at `bid_close_at`.
- Tokens are single-use — `used_at` is set on first submit/respond action; subsequent requests with the same token get 409.
- A BullMQ delayed job auto-closes the bid request at `bid_close_at`; awarding can happen from either `open` or `closed` status.
- Bid ranking weights must sum to 100 (enforced by convention; no server-side validation currently).
- Payment term scoring: net_30 scores highest (100), advance scores lowest (60) — longer terms are preferred by the algorithm.
- Awarding a bid: sets `awarded_bid_id`/`awarded_vendor_id` on the BidRequest, marks the winning Bid as `awarded`, marks all other bids on that request as `rejected`, creates a PurchaseOrder in inventory-service (non-fatal if inventory-service is unreachable).
- Vendors cannot be awarded a withdrawn bid.
- Direct order state machine: `pending → confirmed OR cancelled → dispatched OR cancelled → delivered`.
- Vendor confirmation/decline of a direct order uses the same single-use token pattern as bids.
- Market view is cached in Redis for 15 minutes; any update to vendor items invalidates the cache immediately.
- All monetary values stored in paise (integer).
- All queries scoped to `tenant_id`.

---

## Service Dependencies

| Service | Direction | Purpose |
|---|---|---|
| inventory-service (port 3005) | Outbound (HTTP internal) | Creates PurchaseOrder on bid award; calls receive endpoint on direct order delivered |
| notification-service | Not yet wired | Planned: send magic link email/WhatsApp to vendors on bid request open |
| Redis | Internal | BullMQ queues (bid auto-close, recurrence); market view cache; Redis Pub/Sub events (BID_REQUEST_OPENED, BID_REQUEST_CLOSED, BID_AWARDED) |

The inventory-service call uses `X-Internal-Secret` header and is non-fatal — procurement continues even if the PO creation fails.

---

## Current Build Status

**Fully implemented:**
- Vendor CRUD + VendorItem catalog
- VendorPreference (preferred vendor per ingredient)
- Full bid request lifecycle (draft → open → closed → awarded/cancelled)
- Vendor invite list + BidRequestVendor join table
- Magic-link token generation and single-use enforcement
- Vendor portal routes (view + submit bid, view + respond to direct order)
- Bid withdrawal
- Weighted scoring algorithm with configurable weights
- Ranked bids endpoint
- Bid award → inventory-service PO creation
- BullMQ auto-close delayed job (deterministic job ID = bid_request_id enables safe cancellation)
- BullMQ recurrence queue (repeating jobs for recurring bid requests)
- Direct order placement + full state machine
- Direct order vendor confirmation via token
- Market view with Redis cache
- Price history endpoint
- Redis Pub/Sub event publishing (BID_REQUEST_OPENED, BID_REQUEST_CLOSED, BID_AWARDED)

**apps/vendor-portal (port 5176):**
- 6 screens: BidLanding, BidSubmit, BidConfirmed, BidResult, DirectOrderView, DirectOrderDone
- Token from URL param — no login required

**Not yet built / stubs:**
- Vendor email/WhatsApp notifications when bid request is opened (notification-service integration)
- Vendor rating update flow (after order is received)
- `is_verified` field exists on Vendor but no verification workflow is implemented

---

## Open Questions / Gaps

1. **Vendor notification delivery** — When a bid request is opened, VendorTokens are generated and published via Redis (`BID_REQUEST_OPENED`), but no service currently consumes this event to send email or WhatsApp messages to vendors. Who sends the magic link? Does notification-service listen for this event, or does procurement-service call it directly?

2. **Vendor rating updates** — The `rating` and `rating_count` fields exist on Vendor, but there is no endpoint or flow to update them after an order is completed or delivered. Who triggers rating updates and on what criteria?

3. **Recurring bid request behavior** — The recurrence type and BullMQ repeating job are defined, but it is not clear what exactly happens when a recurring job fires: does it clone the bid request as a new draft, auto-open it, or something else?

4. **Bid ranking weight validation** — There is no server-side check that the four ranking weights (price, lead_time, rating, payment) sum to 100. Should this be enforced, and what is the fallback if they don't?

5. **Daily budget enforcement** — The AdCampaign schema (ads-service) tracks daily budget; the bid request has no budget field. Should bid requests or direct orders have a budget cap?

6. **Multi-branch procurement** — Each bid request and direct order is tied to a single `branch_id`. Is there a plan for consolidated procurement across multiple branches for chain tenants?

7. **Vendor portal token expiry UX** — Tokens expire at `bid_close_at`. There is no refresh or re-invite flow. If a vendor loses the link or it expires, staff must manually close and re-open, which resets the process. Is this acceptable?

8. **`is_verified` flag** — The field exists but no endpoint or admin flow sets it. Who verifies vendors and what does verification unlock?

9. **Procurement plan gating** — Procurement is not mentioned in PLAN_FEATURES. Is vendor management available on all plans (Free, Starter, Pro), or should it be gated behind Starter+?

10. **Price history data source** — The `getPriceHistory()` function is referenced in routes but its implementation was not inspected in detail. Confirm whether it reads from DirectOrder items or from a separate historical price model.
