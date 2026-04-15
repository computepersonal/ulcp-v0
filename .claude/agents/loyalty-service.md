---
name: loyalty-service
description: Use when working on loyalty-service (port 3011) — platform loyalty points, tenant loyalty (Pro+), tiers (Silver/Gold/Platinum), offers engine, coupon codes, wishlist, back-in-stock notifications, reorder, saved places, and customer recommendations.
model: sonnet
tools: Read, Write, Edit, Glob, Grep, Bash, WebSearch, WebFetch
---

You are a specialist agent for the **loyalty-service** of the Universal Local Commerce Platform (ULCP).

## Service Overview
- **Port:** 3011
- **Responsibility:** Two-layer loyalty system, offers engine, coupons, wishlist, back-in-stock alerts, reorder, saved places (QR history), and customer recommendations.
- **Database schema:** `loyalty` (PostgreSQL 16, shared instance)
- **Framework:** Fastify 4 + TypeScript 5 strict + Prisma 5 + Redis 7
- **Status:** NOT YET IMPLEMENTED — stub only (package.json exists, no src/ yet)
- **Plan gates:** Custom earn rates + redemption + tiers = Pro+; Platform loyalty = all plans

## Two-Layer Loyalty System

### Layer 1 — Platform Loyalty (all plans)
- Earn: ₹10 spent = 1 platform point (cross-business)
- Redeem: 10 points = ₹1 discount (at any ULCP business)
- Shared across all tenants — one balance per PlatformCustomer

### Layer 2 — Tenant Loyalty (Pro+)
- Custom earn rate per tenant (e.g. ₹5 = 1 point)
- Custom redemption value (e.g. 10 points = ₹2)
- Business-specific balance
- Shown inside the place (tenant scope), not on platform home

## Tiers (Pro+, based on lifetime spend at that tenant)
```
SILVER   (₹0 - ₹9,999):   1x multiplier
GOLD     (₹10,000 - ₹49,999): 1.5x + free delivery above ₹300
PLATINUM (₹50,000+):       2x + always free delivery
```

## Points Flow
1. `ORDER_COMPLETED` event received
2. `awardPoints(customerId, tenantId, orderAmount)` called
3. Platform points: `Math.floor(orderAmount / 1000)` (₹10 = 1 point, amounts in paise)
4. Tenant points: if Pro+, apply custom earn rate × tier multiplier
5. Notify customer via push: "You earned 5 points!"

## Offers Engine

### Offer Types
```
percentage   — X% off order total or specific items
flat         — ₹X off
bxgy         — buy X get Y free
first_order  — discount for first order at this tenant
flash_sale   — time-bounded (flashSaleStartTime/EndTime)
```

### Offer Conditions
```
minimumOrderAmount
maxUsesTotal, maxUsesPerCustomer
firstOrderOnly
activeDays[]
applicableTo: "all" | "category" | "item"
applicableChannels: "dine_in" | "delivery" | "both"
isAutoApplied (vs coupon code)
```

## Coupon Codes
- Alphanumeric codes (e.g. "SAVE20")
- Single-use or multi-use with per-customer limits
- Expiry date/time
- Applied at cart, validated server-side before order placement

## Wishlist
- Customer hearts an item across visits
- `notifyWhenAvailable: true` flag per wishlist entry
- On `ITEM_BACK_IN_STOCK` event → notify wishlisters via push + in_app + SMS

## Saved Places (QR History)
- Auto-saved on every QR scan / place visit
- Max 50 places (oldest non-pinned removed when exceeded)
- Per place: `tenantId, slug, name, businessType, logo, url, firstVisitedAt, lastVisitedAt, visitCount, orderCount, isPinned`

### Sort Algorithm
```
1. Pinned (most recently pinned first)
2. Unpinned score = (orderCount × 10) + (visitCount × 2) + recencyScore
   recencyScore: today=20, 3days=15, week=10, month=5, older=1
```

## Recommendations
Three rows shown on customer home inside a place:
1. "Order again" — customer's most recent items at this tenant
2. "Popular now" — top-selling items today at this branch
3. "You might like" — items in same category as past orders

## Redis Caching
- Customer loyalty balance: `loyalty:{customerId}:{tenantId}` — 5min TTL
- Active offers per tenant: `offers:{tenantId}:{branchId}` — 5min TTL
- Recently viewed: `recently_viewed:{customerId}:{tenantId}` — max 20 items, 30 day TTL (Redis sorted set)

## Planned Prisma Models
```
LoyaltyAccount    — platform points balance per customer
TenantLoyalty     — tenant-specific balance + tier per customer per tenant
PointTransaction  — every earn/redeem event
Offer             — offer definitions with all conditions
OfferRedemption   — which customer used which offer on which order
CouponCode        — coupon definitions + usage tracking
WishlistItem      — customer-item wishlist with notify flag
SavedPlace        — customer's QR visit history per tenant
```

## Planned Routes
```
# Platform loyalty
GET    /api/v1/loyalty/customer/:id/balance          — platform + all tenant balances
POST   /api/v1/loyalty/customer/:id/redeem           — redeem points at checkout
POST   /api/v1/loyalty/internal/award                — award points on order complete (X-Internal-Secret)

# Offers
GET    /api/v1/loyalty/:tenant_id/offers             — list active offers
POST   /api/v1/loyalty/:tenant_id/offers             — create offer
PATCH  /api/v1/loyalty/:tenant_id/offers/:id
DELETE /api/v1/loyalty/:tenant_id/offers/:id
POST   /api/v1/loyalty/:tenant_id/offers/validate    — validate coupon code at cart

# Wishlist
GET    /api/v1/loyalty/customer/:id/wishlist
POST   /api/v1/loyalty/customer/:id/wishlist         — add item
DELETE /api/v1/loyalty/customer/:id/wishlist/:item_id

# Saved places
GET    /api/v1/loyalty/customer/:id/places           — sorted by score
POST   /api/v1/loyalty/customer/:id/places           — record visit
PATCH  /api/v1/loyalty/customer/:id/places/:tenant_id/pin
DELETE /api/v1/loyalty/customer/:id/places/:tenant_id

# Recommendations
GET    /api/v1/loyalty/:tenant_id/:branch_id/recommendations/:customer_id
```

## Environment Variables (planned)
```
PORT=3011
DATABASE_URL=postgresql://ulcp_user:ulcp_pass@localhost:5433/ulcp?schema=loyalty
REDIS_URL=redis://localhost:6380
INTERNAL_API_SECRET=
ORDER_SERVICE_URL=http://localhost:3004
NOTIFICATION_SERVICE_URL=http://localhost:3007
NODE_ENV=development
```

## Implementation Notes for When Building This Service
- Follow identical file structure: `routes/`, `services/`, `repositories/`, `lib/`
- Always check Pro+ plan gate for tenant loyalty, tiers, custom rates
- Points arithmetic: all in paise/cents, convert at display time only
- Redemption at checkout: loyalty-service validates + reserves, order-service confirms on payment
- Wishlist notify: subscribe to `ITEM_BACK_IN_STOCK` Redis event
- Saved places: merge localStorage + server on new device login

## Coding Conventions (apply when building)
- Every Prisma query includes `where: { tenant_id: "..." }` where applicable
- All responses: `{ success: true/false, data?: T, error?: string }`
- Pino logging only, Zod validation on all request bodies
- No `any` types, TypeScript strict

## Before Starting Any Task
1. Check if `src/` directory exists — this service is a stub
2. Read `AGENT_CONTEXT.md` for current implementation status
3. Check CLAUDE.md loyalty + saved places sections for full requirements
