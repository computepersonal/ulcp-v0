# Universal Local Commerce Platform — CLAUDE.md

# Complete Architecture Reference for Claude Code Sessions

# Last Updated: April 16, 2026

---

## STARTING EVERY SESSION

```
"Read CLAUDE.md and PROGRESS.md first.
Tell me what's built and what we're doing today."
```

---

## ABOUT THIS PROJECT

Multi-tenant SaaS platform enabling ANY local business to go digital
with a QR-first approach. Not food-only — restaurants, kiranas, boutiques,
nurseries, pharmacies, gated community delivery, and any custom type.

Think: Shopify + Swiggy + Dunzo combined, hyperlocal and QR-first,
built for small/medium businesses globally.

---

## ARCHITECTURE: MICROSERVICES + CDN

### Core Philosophy

1. Each service does ONE thing well
2. Services communicate via events (not direct calls where possible)
3. Each service has its own database
4. CDN serves everything static — origin only gets dynamic requests
5. Lightweight = small Docker images, minimal deps per service
6. Fail gracefully — one service down doesn't crash everything

### 15 Services

```
1.  identity    (3001) — auth, JWT, OTP, RBAC, KDS device tokens
2.  tenant      (3002) — tenants, branches, staff, partners, subscriptions
3.  catalogue   (3003) — sections, items, recipes, bundles, search
4.  order       (3004) — orders, KOT, billing, payments, commission
5.  inventory   (3005) — ingredients, stock movements, purchase orders
6.  delivery    (3006) — near/far/community/scheduled/food truck delivery
7.  notification (3007) — SMS, WhatsApp, push, email (fire-and-forget)
8.  realtime    (3008) — Socket.io, KDS, floor map (Redis pub/sub only)
9.  analytics   (3009) — reports, P&L, dashboards (pre-computed, cached)
10. media       (3010) — image upload, resize, WebP, Cloudflare R2
11. loyalty     (3011) — points, tiers, offers engine, coupons, wishlist
12. superadmin  (3012) — platform management, commission settlement
13. procurement (3013) — vendor management, bidding, direct purchase orders, market view
14. jukebox     (3014) — jukebox queue, song requests, player management
15. ads         (3015) — ad campaigns, placement engine, venue revenue, explore feed
```

### Communication

- Sync (HTTP): client → API Gateway → service
- Async (events): services → Redis Pub/Sub → other services
- Real-time: Redis Pub/Sub → Realtime Service → Socket.io → clients

### API Gateway: Kong (open source)

All traffic enters through gateway on port 8000
Handles: routing, rate limiting (100 req/min), JWT verify, CORS
Config: kong.yml declarative (no database mode)

### CDN Stack

- Cloudflare: static assets, API caching, DDoS, SSL (free tier)
- Cloudflare R2: image storage (no egress fees, $0.015/GB)
- Images served as WebP — thumb(150px) medium(600px) full(1200px)
- Catalogue API cached at Cloudflare edge — 5 min TTL
- Cache purged via Cloudflare API on any catalogue update
- Customer QR scan = Cloudflare serves catalogue, NOT your server

### Infrastructure: Hetzner Cloud

```
SERVER 1 — API Services     (4 vCPU, 8GB) ~₹1200/mo
  identity, tenant, catalogue, order

SERVER 2 — Background       (2 vCPU, 4GB) ~₹600/mo
  inventory, delivery, notification, loyalty, superadmin

SERVER 3 — Realtime         (2 vCPU, 4GB) ~₹600/mo
  realtime service (Socket.io), Redis Pub/Sub subscriber

SERVER 4 — Data             (4 vCPU, 8GB) ~₹1200/mo
  PostgreSQL 16, Redis 7

TOTAL: ~₹3600/month to start. Scale individually as needed.
```

### Database Per Service (own PostgreSQL schema each)

```
All services share one PostgreSQL 16 instance, isolated by schema:
identity, tenant, catalogue, order_svc,
inventory, delivery, notification, analytics, loyalty
```

### Redis Caching Strategy

```
Tenant config:              30 min
Full catalogue per tenant:   5 min  (aggressive — QR scans hit this)
Pre-computed analytics:     15 min
Customer loyalty balance:    5 min
Active offers per tenant:    5 min
OTP codes:                   5 min
JWT blacklist:               token TTL
Recently viewed:            30 days (key: recently_viewed:CUST:TENANT)
```

---

## TECH STACK

- **Runtime:** Node.js 22 LTS
- **Language:** TypeScript 5 (strict mode, no `any`)
- **Backend Framework:** Fastify 4 (all services)
- **Database:** PostgreSQL 16 (primary data store)
- **ORM:** Prisma 5 (type-safe queries, auto-generated types)
- **Cache / Sessions:** Redis 7 (BullMQ queues, pub/sub, JWT blacklist)
- **Frontend Web:** React 18 + Vite, Redux Toolkit + RTK Query, Tailwind CSS
- **Mobile:** Expo Bare Workflow, React Native, Redux Toolkit
- **KDS App:** React + Vite (dedicated, minimal — no Redux needed)
- **Real-time:** Socket.io (backed by Redis pub/sub)
- **State:** AsyncStorage (mobile), localStorage (web)
- **Auth:** JWT access tokens (15m) + Redis refresh tokens (30d)
- **OTP/SMS:** MSG91
- **WhatsApp:** Interakt
- **Push:** Firebase FCM
- **Email:** SendGrid
- **Distance:** geolib npm
- **Shipping:** Shiprocket API
- **Payments:** Razorpay + Razorpay Route (auto commission split)
- **Thermal Printing:** node-thermal-printer (Epson/Star via TCP/IP)
- **Image processing:** Sharp (resize + WebP)
- **Storage:** Cloudflare R2 (S3-compatible, no egress fees)
- **PDF:** puppeteer | **Excel:** exceljs
- **Drag and drop:** @dnd-kit/sortable
- **Job queues:** BullMQ (Redis-based, replaces Bull)
- **Logging:** Pino (structured JSON, no console.log in services)
- **Validation:** Zod (all request bodies)
- **Monorepo:** pnpm workspaces + Turborepo
- **Containers:** Docker + Docker Compose (dev), planned K8s (prod)

---

## CODING RULES — ALWAYS FOLLOW

- **TypeScript strict mode everywhere** — no `any`, use `unknown` + type guards
- **CommonJS modules** (`"module": "commonjs"` in tsconfig) — Fastify + Prisma work best with CJS
- Always `async/await`, never callbacks
- Always `try/catch` in route handlers — use Fastify's `setErrorHandler` for global errors
- **API response shape:** `{ success: true/false, data?: T, error?: string }`
- **Every Prisma query MUST include `where: { tenant_id: "..." }`** — no exceptions
- Routes in `/routes/`, business logic in `/services/`, DB queries in `/repositories/`
- Shared code in `/packages/shared/src/`
- Each service independently deployable
- **Logging:** Pino only — never `console.log` in service code
- **Validation:** Zod on every request body before touching the DB
- **Currency:** always stored as integers (paise/cents) — use `formatCurrency()` util for display
- **Dates:** stored as UTC, displayed in tenant's timezone
- **Commits:** Conventional Commits — `feat:`, `fix:`, `chore:`, `docs:`

---

## MONOREPO STRUCTURE

```
ulcp/
├── CLAUDE.md
├── PROGRESS.md
├── docker-compose.dev.yml
├── docker-compose.prod.yml
├── kong.yml
├── turbo.json
├── pnpm-workspace.yaml
├── package.json               ← pnpm workspaces root
│
├── services/
│   ├── identity-service/      ← port 3001
│   │   ├── Dockerfile         ← FROM node:22-alpine
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── prisma/
│   │   │   └── schema.prisma
│   │   └── src/
│   │       ├── index.ts       ← Fastify app bootstrap
│   │       ├── routes/        ← route handlers (thin)
│   │       ├── services/      ← business logic
│   │       ├── repositories/  ← Prisma DB queries
│   │       ├── middleware/    ← authenticate, tenant guard
│   │       └── lib/           ← logger, prisma, redis, jwt
│   ├── tenant-service/        ← port 3002
│   ├── catalogue-service/     ← port 3003
│   ├── order-service/         ← port 3004
│   ├── inventory-service/     ← port 3005
│   ├── delivery-service/      ← port 3006
│   ├── notification-service/  ← port 3007
│   ├── realtime-service/      ← port 3008
│   ├── analytics-service/     ← port 3009
│   ├── media-service/         ← port 3010
│   ├── loyalty-service/       ← port 3011
│   └── superadmin-service/    ← port 3012
│
├── packages/
│   └── shared/
│       └── src/
│           ├── config/
│           │   └── app.ts           ← appConfig (APP_NAME etc from env)
│           ├── events/
│           │   └── eventBus.ts      ← Redis Pub/Sub
│           ├── middleware/
│           │   ├── authenticate.ts  ← JWT verify (all services)
│           │   └── validate.ts      ← Zod request validation
│           ├── constants/
│           │   ├── events.ts
│           │   ├── permissions.ts   ← PERMISSIONS object
│           │   ├── roles.ts         ← PRESET_ROLES
│           │   └── plans.ts         ← PLAN_FEATURES config
│           ├── errors/
│           │   └── index.ts         ← AppError, ValidationError etc
│           ├── types/
│           │   └── index.ts         ← shared TS interfaces
│           └── utils/
│               ├── currency.ts      ← formatCurrency, toMinorUnits
│               ├── gst.ts           ← GST calculation
│               ├── planFeatures.ts  ← plan limit checks
│               └── slugify.ts
│
└── apps/
    ├── superadmin/            ← platform admin panel (React + Vite)
    ├── web/                   ← staff POS (React + Vite)
    ├── kds/                   ← kitchen display (React + Vite, minimal)
    ├── mobile/                ← staff mobile (Expo Bare)
    ├── customer-web/          ← customer QR PWA (React + Vite)
    └── customer-mobile/       ← customer app (Expo Bare)
```

---

## CONSTANTS (single source of truth)

```js
COMMISSION_RATES = { free: 3, starter: 2, pro: 1.5 };
PLAN_ITEM_LIMITS = { free: 200, starter: 500, pro: Infinity };
PLAN_BRANCH_LIMITS = { free: 1, starter: 3, pro: Infinity };
PLAN_STAFF_LIMITS = { free: 5, starter: 20, pro: Infinity };
PLAN_PRICES = { free: 0, starter: 999, pro: 2499 };
DEFAULT_DELIVERY_RADIUS_KM = 5;
OTP_EXPIRY_MINS = 5;
KDS_SETUP_CODE_EXPIRY_MINS = 10;
CATALOGUE_CACHE_TTL_SECS = 300;
TENANT_CONFIG_CACHE_TTL_SECS = 1800;
ANALYTICS_CACHE_TTL_SECS = 900;
MIDNIGHT_RESET_CRON = "0 0 * * *";
```

---

## SAAS SUBSCRIPTION PLANS

```
FREE (₹0/month)
  Items: 200, Branches: 1, Staff: 5, Commission: 3%
  Features: QR menu, basic orders, billing, order history

STARTER (₹999/month)
  Items: 500, Branches: 3, Staff: 20, Commission: 2%
  Features: + Inventory, + Kitchen management

PRO (₹2499/month)
  Items: ∞, Branches: ∞, Staff: ∞, Commission: 1.5%
  Features: + Real-time dashboards, + P&L, + Analytics,
            + Customer insights, + PDF/Excel, + Loyalty tiers

ENTERPRISE (Custom)
  Everything + custom limits + dedicated support
```

### Feature Gates

```
inventory, kitchenManagement         → Starter+
advancedDashboards, revenueReports   → Pro+
plStatement, menuAnalytics           → Pro+
customerInsights, pdfExport          → Pro+
excelExport, loyaltyTiers, kds       → Pro+
farDelivery, multipleBranches        → Starter+
monthlyTab                           → Pro+
qrOrdering                           → All plans
```

---

## COMMISSION SYSTEM

Commission = % of every completed order the platform earns.
Calculated when order.status → completed.
Settled monthly via invoice.

Razorpay Route: auto-splits at checkout.
Customer pays ₹500 → ₹490 to restaurant + ₹10 to platform instantly.

---

## TWO USER SYSTEMS

### System 1 — Platform Customers

Login: mobile + OTP (no password ever)
JWT: customerId only (platform-wide)
Scope: cross-business — one profile, shop anywhere
Auto-register on first OTP verify (name optional)

### System 2 — Business Staff + Partners

Login: email + password
JWT: user_id + tenant_id (nullable) + role + permissions[]
Scope: locked to one tenant
Partners use same system (is_partner: true flag)

#### Registration Flow — tenant_id is ALWAYS system-generated, never typed by user

**Owner (new business):**
1. `POST /api/v1/auth/register` — `{email, password, name}` only
   → JWT issued with `tenant_id: null`, `role: "pending_onboarding"`
2. `POST /api/v1/tenants` — creates tenant record
   → tenant-service internally calls identity-service `PATCH /users/:id/tenant`
   → sets `tenant_id`, promotes role to `tenant_owner` automatically
3. All subsequent logins: `{email, password, tenant_id}` (tenant_id now known)

**Staff (invited):**
- `POST /tenants/:id/staff/invite` — sends invite with a secure token
- Invited person registers/logs in using the invite token
- `tenant_id` comes from the invite record, never from manual input

**Customers:**
- `tenant_id` comes from QR code context (URL param), never typed

#### Internal Service Security

`PATCH /api/v1/auth/users/:id/tenant` (identity-service):
- Secured by `X-Internal-Secret` header (shared env var: `INTERNAL_API_SECRET`)
- Never exposed through Kong API gateway — internal service-to-service only
- Called by tenant-service after creating a tenant

---

## BUSINESS ONBOARDING (6-step wizard)

```
Step 1: Account (name, mobile, email, password + OTP verify)
Step 2: Business type (visual grid — all types)
Step 3: Profile (name, slug, logo, cover, address, GST toggle)
Step 4: Catalogue (preset sections auto-loaded, add first item)
Step 5: Operations (tables config OR delivery zones)
Step 6: Go Live (QR generated, download/share, checklist)
```

- State saved at every step — resume anytime
- Business preset auto-loads on type selection
- QR code generated immediately on completion
- Post-onboarding checklist: 7 tasks = 30-day Starter trial reward
- Slug auto-generated from name, editable before confirm
- Handled by: tenant-service wizard endpoints

---

## MULTI-OWNER / PARTNER SYSTEM

### Ownership

```
PRIMARY OWNER (1 — permanent, all permissions, cannot be removed)
PARTNERS (unlimited — invited via email+SMS, 48hr expiry)
```

### Partner Roles

```
primary_owner      → everything, permanent
managing_partner   → full ops + financial
silent_partner     → financial visibility only
operations_partner → ops only, no financial
branch_partner     → specific branch(es) only
custom_partner     → fully configurable
```

### Partner Permissions (toggle per partner)

```
revenue, allBranches, assignedBranches[], commissionDetails,
staffManagement, menuEditing, subscriptionBilling,
addRemovePartners, businessSettings
```

partnerScope middleware filters all data by partner permissions.

---

## THREE-LAYER RBAC

### Layer 1: Platform Roles

```
platform_superadmin → full platform
tenant_owner        → full tenant, cannot be restricted
```

### Layer 2: Preset Roles

```
UNIVERSAL: branch_manager, cashier, waiter, delivery_staff,
           inventory_manager, reports_analyst

KITCHEN (Types 2,3,4,7 only):
  head_chef      → KDS + assign duties + menu:edit + inventory
  sous_chef      → KDS + assign duties (when head chef absent)
  line_cook      → KDS view + mark items ready
  bartender      → bar KDS only (Type 3)
  kitchen_helper → KDS view only
```

### Layer 3: Granular Permissions

```
menu:view, menu:edit, menu:publish
orders:view, orders:manage, orders:refund, orders:discount
billing:view, billing:manage, billing:refund
reports:view, reports:download, revenue:view
inventory:view, inventory:manage, inventory:purchase
staff:view, staff:manage, staff:permissions
tables:view, tables:manage, tables:confirm
customers:view, customers:export
delivery:view, delivery:manage, delivery:settings
kds:view, kds:manage, kitchen:assign, kitchen:schedule
branch:settings, branch:manage, shifts:view, shifts:manage
```

Head chef: has menu:edit but NOT menu:publish (cannot permanently delete).
Branch managers can only set permissions within their own branch.

---

## BUSINESS TYPES — ALL 10

### DINE-IN

**Type 1 — self_service_cafe**
Counter pickup, token system (1-999, resets daily)
Token display: full-screen TV page. KOT → Kitchen only.

**Type 2 — seated_food_only**
Waiter service, food only. Staff confirms table (2 min auto-reject).
Single KOT → Kitchen KDS + Printer.

**Type 3 — seated_full_service**
Food + drinks. KOT AUTO-SPLIT:
food items → Kitchen KDS + Printer
drink items → Bar KDS + Printer (two separate KDS screens)

**Type 4 — seated_self_order**
autoConfirmTable: true. Customer orders via QR, collects themselves.
Single KOT → Kitchen KDS + Printer.

### DELIVERY

**Type 5 — home_kitchen:** delivery only, manual acceptance, WhatsApp QR
**Type 6 — cloud_kitchen:** delivery only, near + far
**Type 7 — restaurant_plus_delivery:** BOTH dine-in + delivery, unified KDS
**Type 8 — catering:** advance booking (min X hrs), partial payment
**Type 9 — food_truck:** daily location set by owner, walk-in + delivery
**Type 10 — gated_community:** community delivery only, monthly tab

### NON-FOOD (Universal Catalogue)

kirana, boutique, nursery, pharmacy, handicrafts,
bakery, stationery, home_kitchen_products, custom

---

## UNIVERSAL CATALOGUE SYSTEM

### CatalogueItem Model (key fields)

```
tenant_id, section_id, branch_id
name, description, sku
images[]: { url, isPrimary }
mrp, price, offer_price, offer_valid_till, unit
has_variants, variants[]: { name, sku, price, mrp, stock, isAvailable }
attributes[]: { name, value }
track_stock, stock, low_stock_alert
is_available, unavailable_reason
availability_type: temporary | permanent
sort_order
is_food

// Food classification
veg_type: "veg" | "vegan" | "non_veg" | "egg"
meal_type: "breakfast" | "lunch" | "dinner" | "snacks" | "all_day"
item_type: "food" | "beverage" | "dessert" | "merchandise" | "service"
course: "starter" | "main" | "dessert" | "sides" | "beverages"

// Nutrition / media
prep_time_mins, calories, video_url

// Rating (cached from reviews service)
rating: Float, rating_count: Int

todayPriceOverride: {
  price, original_price, reason, set_by, set_at, resets_at
}
is_daily_special: Boolean        ← auto-removed at midnight
```

### Related Catalogue Models

```
ItemOptionGroup          ← customizations per item (e.g. "Egg Type")
  ItemOptionChoice[]     ← choices with add_on_price (e.g. Boiled +₹10)
  is_required, min_select, max_select

AddonGroup               ← tenant-level reusable add-on groups (e.g. "Sides")
  AddonGroupItem[]       ← add-on items with price
ItemAddonGroup           ← junction: which addon groups link to which items

Combo                    ← bundle deals (buy A+B at special price)
  ComboItem[]            ← items in combo with quantity + optional variant
  price, mrp, valid_from, valid_till, branch_id

ItemIngredient           ← allergens + inventory recipe linking
  allergens[]: "gluten" | "dairy" | "eggs" | "nuts" | "peanuts" |
               "soy" | "fish" | "shellfish" | "sesame" | "mustard"
  calories, is_critical  ← if is_critical + stock=0 → auto-disable item
  ingredient_id          ← references Ingredient in inventory-service (cross-service, no FK)
  quantity               ← quantity used per serving
  unit                   ← unit of measurement (g, ml, pcs, etc.)
```

### ItemIngredient Routes (catalogue-service)

Recipe system — links catalogue items to inventory ingredients with per-serving quantities.
`ingredient_id` is a cross-service reference to inventory-service's Ingredient model (no DB foreign key).

```
POST   /api/v1/catalogue/:tenant_id/items/:item_id/ingredients         ← add ingredient to item recipe
GET    /api/v1/catalogue/:tenant_id/items/:item_id/ingredients         ← list all ingredients for item
PATCH  /api/v1/catalogue/:tenant_id/items/:item_id/ingredients/:ingredient_id  ← update quantity/unit
DELETE /api/v1/catalogue/:tenant_id/items/:item_id/ingredients/:ingredient_id  ← remove from recipe
```

When `order.status → preparing`:
- inventory-service reads each item's ingredients via this data
- Deducts `quantity × order_qty` from ingredient stock
- If `is_critical=true` and stock hits 0 → item auto-disabled via Socket.io

### Public Catalogue Response

`GET /api/v1/catalogue/:tenant_id/:branch_id/public` returns:
- `sections[]` — available sections for branch
- `items[]` — available items with option_groups, addon_groups, ingredients
- `combos[]` — available combos for branch
- `context: "customer"`

---

## MENU VIEW MODES

### Three Contexts

```
customer      → browse + order only
                disabled items HIDDEN entirely
                no toggle shown ever

staff_order   → order on behalf
                disabled items shown GREYED with reason
                "Ordering for Table X" banner
                no edit toggle (unless also has menu:edit)

staff_edit    → full edit controls
                only if staff has menu:edit permission
                toggle: [👁️ View Mode] [✏️ Edit Mode]
```

### Context Resolution (catalogue-service)

- No auth token → customer context
- Staff JWT + no menu:edit → staff_order
- Staff JWT + menu:edit → toggle available (default: view mode)
- Context object returned in every catalogue API response

### Edit Mode Features

Inline toggle at top of page.
Orange "● Live editing" indicator + "Changes visible immediately" banner.

Quick actions per item:

- Toggle ON/OFF (temporary → resets midnight | permanent)
- Sold out reasons: sold_out, ingredient_missing, quality_issue, custom
- Temporary price override (resets midnight via cron)
- Drag reorder: @dnd-kit/sortable (items + sections)
- Add daily special (auto-removed midnight)
- Section toggle (hide/show entire section)
- Change image (upload from edit mode)
- Delete: two-step flow

### Two-Step Delete Flow

Step 1: Item disabled + hidden immediately (requires menu:edit)
Step 2: Permanent delete confirmation (requires menu:publish)
Between steps: item stays disabled, can be cancelled (keep disabled, don't delete)

### Midnight Cron Jobs (per branch timezone)

- Re-enable all temporary disabled items
- Remove all daily specials (isDailySpecial: true)
- Reset all todayPriceOverride fields

### Waiter Ordering on Behalf

Scenario A — Own phone (staff app):
Full staff JWT, staff_order context, select table from floor map

Scenario B — Shared tablet:
POST /auth/staff/pin-unlock → short-lived token (30 min, orders:create only)
Auto-resets to PIN screen after 60s idle
Waiter identified in KOT for tracking

---

## RECIPE-TO-INVENTORY SYSTEM (Starter+)

When order.status → preparing: deductStockForOrder() auto-runs
Deducts ingredient quantities × order qty
Records every deduction in StockMovement
Checks thresholds → sends alerts
Critical ingredient at 0 → item auto-disabled, reverses on restock

### isCritical Flag

If critical ingredient = 0 → all dependent items auto-disabled via Socket.io
Customer sees "Not available today". Reverses when restocked.

### Stock Alerts

minimumStock → LOW (yellow), criticalStock → CRITICAL (red)
Both: Socket.io to staff + critical also SMS

### Ingredient Model

```
tenantId, branchId, name, category, unit
currentStock, minimumStock, criticalStock, maximumStock, reorderQuantity
unitCost, lastPurchasePrice, averageCost
supplier, supplierContact, supplierLeadDays
dailyAverageUsage, weeksOfStockRemaining
```

---

## KOT SYSTEM

Sequential per branch per day: KOT-001... resets midnight.
Multiple KOTs per table session. All consolidated at billing.

### KOT Routing

```
Type 2/4/7: Single KOT → Kitchen KDS + Kitchen Printer
Type 3:     Auto-split by item.station:
              food  → Kitchen KDS + Printer
              drink → Bar KDS + Printer
```

### KOT Acknowledgment Modes

Configured per tenant (`kot_ack_mode` + `kot_ack_delay_secs` on Tenant model).
Default by plan: free → "auto", starter/pro → "kds"

```
auto    → BullMQ delayed job fires after kot_ack_delay_secs (default 60s)
          If KOT still pending → auto-acknowledge
          Job cancelled if staff/printer acks first

kds     → Chef taps on KDS screen
          PATCH /api/v1/kots/:tenant_id/:id/status { status: "acknowledged" }

printer → Thermal printer confirms successful print job
          POST /api/v1/kots/:tenant_id/:id/printer-ack { success: true }
          On print failure: publishes KOT_PRINT_FAILED, KOT stays pending
```

All three modes funnel through `acknowledgeKot()` — idempotent, cancels pending auto-ack job.

### KOT Status Flow

pending → acknowledged → preparing → ready → served

### Item Status (within KOT)

pending → preparing → ready → served | cancelled

### Thermal Printer

node-thermal-printer. Connects via TCP/IP: tcp://PRINTER_IP:9100
Printer IP configured per branch. Auto-prints on KOT creation.
Reprints available from KDS and POS.

---

## KDS SYSTEM

Full-screen React web app (apps/kds/).
Runs on ANY browser — tablet, TV, monitor, old phone.
No Redux — React useState + Socket.io only.
Config saved to localStorage (one-time 6-digit setup code).

### Card Colors

White=pending, Blue=preparing, Yellow=>70% target time, Red+pulse=overdue

### KDS Sounds

new_kot.mp3, modified.mp3, overdue.mp3, all_clear.mp3

---

## TABLE LIFECYCLE

```
available (🟢) → pending_confirmation (Types 2,3) → occupied (🟡)
→ ordering (🟡 + badge) → billed (🔴) → available (🟢)
```

### On Table Close

✅ Table available (Socket.io floor map)
✅ Inventory deducted (deductStockForSession)
✅ Commission calculated + recorded
✅ Receipt to customer (email + in-app)
✅ Kitchen performance + session analytics recorded

---

## CUSTOMER ONBOARDING

Browse without login (zero friction).
OTP only triggered on "Add to Cart".
Auto-register on first OTP verify (name optional).
Returning customer: auto-recognized via localStorage token.
PWA install prompt after 2nd visit.
Splash: 0.5s branded loading → immediate catalogue.

---

## GST SYSTEM

### Two Modes

```
GST_REGISTERED:   Tax Invoice, CGST+SGST or IGST, INV-YYYY-XXXX
NON_REGISTERED:   Receipt, total only, RCP-YYYY-XXXX
```

Tenant model: gst.isRegistered, gstin, stateCode, defaultRate
Item model: gst.rate (0/5/12/18/28), gst.hsn, gst.isTaxInclusive
calculateGST() handles intra/interstate logic automatically

---

## DELIVERY ENGINE

Near: geolib distance check, pricing: flat|distance-based|free above
Far (Starter+): Shiprocket API, weight-based, auto-book on acceptance
Community: Tower+Block+Flat, no GPS, layout types: towers_only|blocks_only|towers_and_blocks|villas|open_numbering
Block dropdown cascades from tower selection
Click & collect: pickup code (PKP-XXXX)
Scheduled: slot-based (Morning/Afternoon/Evening)
Monthly tab: community credit, settle monthly (Pro+)

### Delivery Status

pending_acceptance → accepted → preparing → out_for_delivery → delivered

---

## OFFERS ENGINE

### Types

percentage, flat, bxgy, first_order, flash_sale

### Conditions

minimumOrderAmount, maxUsesTotal, maxUsesPerCustomer,
firstOrderOnly, activeDays[], flashSaleStartTime/EndTime,
applicableTo: all|category|item
applicableChannels: dine_in|delivery|both
isAutoApplied vs coupon code

---

## REFUND & CANCELLATION

Cancellation: pending (anyone), acknowledged (staff+), preparing (owner only)
Refund types: full | partial | item_level
Methods: razorpay_auto | cash | tab_deduction
Owner must approve all refunds. Online = auto Razorpay API call.

---

## SEARCH & FILTERS

PostgreSQL full-text search: tsvector on name, description, attributes
Filters adapt per business type (veg for food, size for clothing etc.)
Out of stock shown LAST (not hidden) in results.
Quick chips: Veg Only | Available | On Offer | Sort | Filters

---

## REVIEWS & RATINGS

Verified purchasers only (linked to orderId).
One review per customer per order item. 24hr edit window.
Owner can reply. Superadmin can flag/remove.
Business rating = auto-calculated average of all item ratings.

---

## STAFF SHIFTS & ATTENDANCE

Clock in methods: app PIN | GPS check | manual by manager
Auto-calculates: hoursWorked, lateByMins, overtimeMins
Monthly summary per staff available in reports.

---

## REAL-TIME DASHBOARD (Pro+)

Live metrics (Socket.io 30s): revenue, active orders, tables, deliveries
Charts: revenue trend, top items, category revenue, peak hours heatmap,
order type donut, payment mode donut, AOV trend
Customer insights: new vs returning, retention rate, top spenders
Staff performance: orders handled per staff member
P&L: revenue - COGS (from StockMovement×unitCost) - commission - subscription
Exports: PDF (puppeteer) + Excel (exceljs)
Pre-computed + Redis cached — dashboard load < 5ms

---

## WHATSAPP INTEGRATION

NOT for: self_service_cafe, seated_food_only, seated_full_service, seated_self_order
FOR: home_kitchen, cloud_kitchen, food_truck, gated_community, catering,
kirana, boutique, nursery, pharmacy, handicrafts, bakery, stationery

Provider: Interakt (₹2,399/mo)
shouldUseWhatsApp(businessType) checked before every notification

Templates: order confirmation, status updates, new order alert (owner),
monthly invoice, OTP, low stock alert

Owner replies YES/NO via WhatsApp → auto accept/reject order (webhook)

---

## NOTIFICATION SYSTEM

Bull queue (Redis) — fire-and-forget, 3 retries, exponential backoff.
Never blocks order flow.

### Channel Rules

```
Dine-in:   socket + in_app only
Delivery:  socket + in_app + whatsapp + sms
Critical:  always + sms (stock critical, payment fail)
Receipts:  always email
Loyalty:   in_app only (no SMS spam)
Flash sale: push + in_app
Back in stock: push + in_app + sms
```

---

## LOYALTY & REWARDS

### Two Layers

Platform: ₹10 = 1 point, ₹1 per 10 points. Cross-business.
Tenant (Pro+): custom earn rate + redemption value. Business-specific.

### Tiers (Pro+)

SILVER (0-999): 1x | GOLD (1000-4999): 1.5x + free delivery >₹300
PLATINUM (5000+): 2x + always free delivery

awardPoints() called on order.completed event.
Redemption shown at checkout: "You have ₹45 redeemable"

---

## CUSTOMER APP FEATURES

Wishlist: heart icon on items, notifyWhenAvailable flag
Back in stock: push+SMS to wishlisters on re-enable
Reorder: one tap, validates current availability, uses CURRENT prices
Recommendations: order again | popular now | you might like (3 rows)
Recently viewed: Redis only, key: recently_viewed:CUST:TENANT, max 20, 30d TTL

---

## FRANCHISE / CHAIN MANAGEMENT

isChain flag on Tenant. chainConfig: sharedCatalogue, allowBranchPricing, unifiedLoyalty.
Branch managers CAN: disable item locally, override price (if allowed).
Branch managers CANNOT: delete chain items, edit name/description.
getCatalogueForBranch() applies branch overrides on chain catalogue.
Head office sees consolidated chain dashboard with per-branch breakdown.
Loyalty points unified across all chain branches.

---

## SUPERADMIN PANEL

Platform Overview: tenants, GMV, MRR, commission, signups
Businesses: list, impersonate, activate/suspend, plan override
Revenue: MRR breakdown, commission earned/pending
Commission Settlement: generate invoices, mark paid
Customers: cross-business spend data
Notifications: broadcast to all businesses or customers
Settings: commission rates, pricing, feature flags
Moderation: flagged reviews, reported businesses

---

## STATE MANAGEMENT

### Four Layers

1. Redux (in-memory) → current session, real-time
2. AsyncStorage/localStorage → persistent across sessions
3. Redis (server-side) → shared across all users
4. PostgreSQL → source of truth

### What's Persisted

CUSTOMER APP (AsyncStorage):
auth, catalogue (5min stale), cart (never lose),
orderHistory (10min), loyalty (5min), wishlist, recentlyViewed

STAFF WEB (localStorage):
auth, tenantConfig (30min), catalogue (5min)
NOT: tables, activeOrders, KOTs (always from Socket.io)

KDS: localStorage config only. All KOT state from Socket.io.

### Key Patterns

Stale-while-revalidate: serve instantly, refresh in background
RTK Query: keepUnusedDataFor 300 (catalogue), 60 (search), 0 (payments)
Mutations auto-invalidate cache tags
baseQueryWithRefresh: mutex-protected silent token refresh

### Socket.io → Redux (socketMiddleware)

```
table:status:changed    → updateTableStatus()
order:new               → addActiveOrder() + playSound()
kot:created             → addKOT()
kot:ready               → markKOTReady() + showNotification()
inventory:critical      → addInventoryAlert() + playSound()
dashboard:update        → updateDashboardMetrics()
menu:item:unavailable   → markItemUnavailable() in catalogue slice
```

Zero polling anywhere. All real-time via Socket.io events.

---

## SOCKET.IO ROOMS

```
tenant:TENANTID                    ← all staff
tenant:TENANTID:branch:BRANCHID    ← branch staff
tenant:TENANTID:owner              ← owner + managing partners
tenant:TENANTID:dashboard          ← live dashboard
kitchen:TENANTID:BRANCHID:kitchen  ← kitchen KDS
kitchen:TENANTID:BRANCHID:bar      ← bar KDS (Type 3)
session:SESSIONID                  ← customer table session
customer:CUSTOMERID                ← customer all devices
token:TENANTID:BRANCHID            ← Type 1 token display
```

---

## KEY EVENTS (Redis Pub/Sub)

```
ORDER_CREATED          → realtime, notification
ORDER_STATUS_CHANGED   → realtime, inventory (on preparing)
ORDER_COMPLETED        → inventory, loyalty, analytics, commission
PAYMENT_COMPLETED      → notification (receipt)
KOT_CREATED            → realtime (KDS), notification (printer)
KOT_STATUS_CHANGED     → realtime, notification (waiter)
TABLE_CLOSED           → realtime, analytics
STOCK_LOW              → notification
STOCK_CRITICAL         → notification, catalogue (disable items)
ITEM_BACK_IN_STOCK     → loyalty (notify wishlisters)
TENANT_PLAN_CHANGED    → tenant (update gates), realtime (invalidate)
```

---

## FRONTEND PERFORMANCE TARGETS

customer-web: <150KB gzipped | staff-web: <300KB | kds-app: <100KB
All routes: React.lazy() code splitting
All images: lazy-loaded, WebP from Cloudflare CDN
customer-web: PWA service worker for offline catalogue browsing

---

## ENVIRONMENT VARIABLES

```
# Per service
PORT, MONGO_URI, REDIS_URL, NODE_ENV

# identity-service
JWT_SECRET, JWT_REFRESH_SECRET, JWT_CUSTOMER_SECRET, JWT_KDS_SECRET
INTERNAL_API_SECRET   # shared with all services for internal calls
MSG91_API_KEY, MSG91_SENDER_ID

# tenant-service (and all services that call identity-service internally)
IDENTITY_SERVICE_URL  # http://localhost:3001 (dev), http://identity:3001 (prod)
INTERNAL_API_SECRET   # same value as identity-service

# notification-service
INTERAKT_API_KEY, FIREBASE_PROJECT_ID, FIREBASE_PRIVATE_KEY
SENDGRID_API_KEY

# order-service
RAZORPAY_KEY_ID, RAZORPAY_SECRET, RAZORPAY_ROUTE_ENABLED

# delivery-service
SHIPROCKET_EMAIL, SHIPROCKET_PASSWORD

# media-service
CLOUDFLARE_R2_ACCOUNT_ID, CLOUDFLARE_R2_ACCESS_KEY
CLOUDFLARE_R2_SECRET_KEY, CLOUDFLARE_R2_BUCKET, CLOUDFLARE_API_TOKEN
```

---

## CHANGE LOG

```
2026-02-19: Initial architecture — 10 types, universal catalogue
2026-02-19: KOT + KDS system, RBAC + partner system
2026-02-20: Inventory + recipe system
2026-02-20: GST, offers, refunds, reviews, loyalty, WhatsApp
2026-02-20: Superadmin, shifts, search, customer features
2026-02-24: Pivoted to microservices (12 services)
2026-02-24: CDN architecture (Cloudflare + R2)
2026-02-24: State management strategy (Redux + RTK Query)
2026-02-24: Business onboarding wizard (6 steps)
2026-02-24: Franchise/chain management
2026-02-24: Notification system (all channels)
2026-02-24: Customer features (wishlist, reorder, recommendations)
2026-02-25: Menu view/edit mode system (3 contexts)
2026-02-25: Two-step delete flow, waiter PIN unlock
2026-03-19: Registration flow redesign — tenant_id optional, pending_onboarding role
2026-03-19: PATCH /auth/users/:id/tenant — internal endpoint, X-Internal-Secret auth
2026-03-19: tenant-service calls identity-service to assign tenant_id after creation
2026-03-19: Prisma per-service output dirs (src/generated/prisma) — no DLL collision
2026-02-25: Free plan: 50→200 items, Starter: 200→500 items
2026-03-22: CatalogueItem extended: veg_type (veg/vegan/non_veg/egg), meal_type, item_type, course, prep_time_mins, calories, video_url, rating, rating_count
2026-03-22: New catalogue models: ItemOptionGroup+Choice, AddonGroup+Item, ItemAddonGroup, Combo+ComboItem, ItemIngredient
2026-03-22: Public catalogue response now includes combos + item relations (options, addons, ingredients)
2026-03-26: Tenant model extended: city, state, pincode fields added
2026-03-26: tenant-service: Table + Section models added (floor map — branches/:id/tables, branches/:id/sections)
2026-03-26: Table.qr_code @unique removed — base64 QR exceeds PostgreSQL btree 2704-byte limit; uniqueness is inherent (QR encodes unique table ID)
2026-03-26: Identity login: helpful error "Please provide your tenant_id" instead of generic 401 when user exists but no tenant_id given
2026-03-26: catalogue-service: GET /items defaults branch_id to primary branch (is_primary=true) when not provided — fetched from tenant-service, cached 30min in Redis
2026-03-28: order-service built (port 3004) — Order, KOT, OrderStatusHistory, CommissionRecord, DailyCounter models
2026-03-28: order-service: KOT sequential numbering per branch per day (KOT-001...) via DailyCounter atomic upsert
2026-03-28: order-service: GST calculation (inclusive + exclusive), commission on order completion, Razorpay Route placeholder
2026-03-28: order-service: KOT auto-split for seated_full_service (food→kitchen, drink→bar)
2026-03-28: tenant-service: Tenant model extended with kot_ack_mode (auto|kds|printer, default "auto") + kot_ack_delay_secs (default 60)
2026-03-28: order-service: Three KOT ack modes — auto (BullMQ delayed job), kds (manual PATCH status), printer (POST printer-ack endpoint)
2026-03-28: order-service: acknowledgeKot() is idempotent — returns current state if already acknowledged, cancels pending auto-ack job
2026-03-28: order-service: kot_ack_mode fetched from tenant-service at order placement (cached 30min), passed into generateKOTs()
2026-03-28: Docker Redis moved to port 6380 (local Redis 3.0 on 6379 was incompatible with BullMQ which requires Redis ≥ 5.0)
2026-03-28: catalogue-service: ItemIngredient routes built — POST/GET /items/:id/ingredients, PATCH/DELETE /items/:id/ingredients/:ingredient_id
2026-03-28: ItemIngredient.ingredient_id is a cross-service ref to inventory-service Ingredient (no DB FK); quantity+unit per serving stored here
2026-03-28: procurement-service built (port 3013) — Vendor, VendorItem, VendorPreference, BidRequest, BidRequestVendor, Bid, VendorToken, DirectOrder models
2026-03-28: procurement-service: bid ranking algorithm — weighted score (price 40%, lead_time 30%, rating 20%, payment_terms 10%)
2026-03-28: procurement-service: VendorToken magic links — token_type: "bid" | "direct_order", single-use (used_at set on action)
2026-03-28: procurement-service: BullMQ bid-auto-close queue (delayed at bid_close_at) + bid-recurrence queue (repeating job)
2026-03-28: procurement-service: market view — grouped by ingredient, recommended vendor (preferred first, else highest score), 15min Redis cache
2026-03-28: procurement-service: awardBid() creates PurchaseOrder in inventory-service via X-Internal-Secret call
2026-03-28: procurement-service: DirectOrder state machine — pending→confirmed/cancelled, confirmed→dispatched/cancelled, dispatched→delivered
2026-03-28: apps/vendor-portal built (port 5176) — React 18 + Vite + Tailwind + TanStack Query v5, 6 screens, token-based (no login)
```

---

## BUILD ORDER

```
PHASE 1 — FOUNDATION
1.  Docker + docker-compose (all 12 services + PostgreSQL + Redis)
2.  Shared package (eventBus, authenticate middleware, constants)
3.  identity-service: staff auth, customer OTP, JWT, RBAC, PIN unlock
4.  tenant-service: tenant CRUD, branches, feature gates
5.  Kong API gateway config

PHASE 2 — CATALOGUE
6.  catalogue-service: sections, items, variants, attributes
7.  Recipe management on food items
8.  Business presets
9.  Search (PostgreSQL full-text search, tsvector)
10. Menu view/edit context system + 3 contexts
11. Midnight cron jobs

PHASE 3 — STAFF & PARTNERS
12. Staff management (CRUD, RBAC, granular permissions)
13. Partner system (invite, accept, scope middleware)
14. Kitchen duty system
15. Staff shifts + attendance

PHASE 4 — INVENTORY
16. Ingredient CRUD + StockMovement + PurchaseOrder
17. deductStockForOrder() + auto-disable on critical
18. Alert system

PHASE 5 — ORDERS & KOT
19. Table management + Socket.io floor map
20. TableSession system
21. Table confirmation + PIN unlock (shared tablet)
22. KOT generation + routing (kitchen/bar split)
23. Thermal printer integration
24. KDS device registration + setup codes
25. Token system (Type 1)
26. Order management, billing, payment + table close

PHASE 6 — DELIVERY
27. Near delivery (geolib, pricing)
28. Community delivery (Tower+Block+Flat, monthly tab)
29. Far delivery (Shiprocket)
30. Click & collect + scheduled slots
31. Catering advance booking + food truck locations

PHASE 7 — CUSTOMER PLATFORM
32. PlatformCustomer + OTP auth + address book
33. Wishlist + back in stock notify
34. Reorder (one tap)

PHASE 8 — COMMERCE
35. Offers engine (all types) + coupon codes
36. Commission auto-calc + Razorpay Route
37. Refund + cancellation
38. GST calculation + invoice generation

PHASE 9 — NOTIFICATIONS
39. notification-service: Bull queue setup
40. SMS, WhatsApp, Push, Email channels
41. Channel router (business type rules)
42. WhatsApp reply webhook

PHASE 10 — ANALYTICS & LOYALTY
43. Loyalty points engine + tiers + redemption
44. Reviews + ratings
45. analytics-service: pre-computed reports + Redis cache
46. P&L statement + PDF + Excel export

PHASE 11 — REAL-TIME
47. realtime-service (Socket.io + Redis Pub/Sub)
48. socketMiddleware (Redux integration)
49. KDS full-screen app (apps/kds/)
50. Dashboard live metrics broadcast

PHASE 12 — MEDIA
51. media-service: Sharp + WebP + Cloudflare R2
52. Image upload from catalogue builder + edit mode

PHASE 13 — SUPERADMIN
53. superadmin-service: overview, tenant management
54. Commission settlement + invoice generation
55. Platform settings + feature flags + moderation

PHASE 14 — BUSINESS ONBOARDING
56. 6-step wizard endpoints
57. Onboarding state persistence + resume
58. Post-onboarding checklist

PHASE 15 — CHAIN/FRANCHISE
59. isChain + chainConfig on Tenant
60. getCatalogueForBranch() with overrides
61. Chain dashboard (consolidated reporting)

PHASE 16 — FRONTEND APPS
62. Redux store + RTK Query + socketMiddleware
63. AsyncStorage/localStorage persistence configs
64. Customer web PWA
65. Staff POS web (floor map, orders, catalogue builder, edit mode)
66. Superadmin dashboard
67. Staff mobile app (Expo Bare)
68. Customer mobile app (Expo Bare + QR scanner)
```

---

_Universal Local Commerce Platform — Complete Architecture_
_12 microservices · Cloudflare CDN · Global from day 1_
_Last updated: February 25, 2026_

---

## SAVED PLACES (Customer Feature)

Storage: AsyncStorage (local) + PlatformCustomer.savedPlaces[] (server sync)
Size: ~300 bytes per place, max 50 places = ~15KB total (lightweight)
No catalogue cached — only link + metadata stored

What stored per place:
tenantId, slug, name, businessType, logo, url
firstVisitedAt, lastVisitedAt, visitCount
orderCount, lastOrderedAt, isPinned, pinnedAt

Auto-Save: silently on every QR scan / place open
orderCount++: on every completed order at that place
Cap: 50 max — oldest non-pinned removed when exceeded

Sort Priority:

1. Pinned (most recently pinned first)
2. Unpinned: score = (orderCount x10) + (visitCount x2) + recencyScore
   recencyScore: today=20, 3days=15, week=10, month=5, older=1

UI: horizontal scroll grid, frequency dots, pin badge, last card = Scan QR
Long press: pin / remove / share

Cross-device sync: localStorage + server. Login new device merges both.
Handled by: loyalty-service

---

## PAYMENT SYSTEM

Provider Per Region:
India (IN): Razorpay — UPI + cards + wallets + COD + BNPL + EMI
US/Global: Stripe — cards + Apple Pay + Google Pay + ACH + BNPL

Abstraction Layer:
getPaymentProvider(tenantCountry) returns correct provider class
All providers implement: createOrder(), verifyPayment(),
initiateRefund(), getSupportedMethods()

Commission Split:
India: Razorpay Route — auto at checkout
US: Stripe Connect Express — auto at checkout

COD: India only. Conditions: tenant.country===IN + codEnabled + delivery order
Currency: stored per tenant (country, currency, symbol, position)
All DB amounts in smallest unit (paise/cents)

Tenant Payment Accounts:
India: Razorpay linked account (bank+IFSC+PAN, KYC 1-2 days)
US: Stripe Connect Express (Stripe-hosted KYC)
Stored: tenant.paymentAccounts.razorpay / .stripe

---

## PAYMENT SECURITY

Provider handles: PCI-DSS L1, card tokenisation, 3DS, fraud detection
Raw card/UPI data NEVER reaches your servers

Your responsibility:

Signature Verification (NEVER skip):
Razorpay: HMAC-SHA256(orderId|paymentId) vs signature
Stripe: stripe.webhooks.constructEvent() with raw body
Use crypto.timingSafeEqual() — prevents timing attacks
Invalid: reject + log security event

Webhook Idempotency:
Redis key: webhook:EVENTID, TTL 24hr
Skip if already processed — prevents double charges

Rate Limits (Kong):
OTP request: 3/min, 10/hr per IP
OTP verify: 5/min per IP
Payment: 10/min per IP

OTP Security:
Store SHA-256 hash only (never raw)
5 wrong attempts max -> invalidated
5 min expiry, one-time use

JWT:
Access token: 15min, Redux memory only
Refresh token: 30 days, httpOnly cookie
sameSite: strict, secure: true

Infrastructure:
PostgreSQL + Redis: internal Docker network only
All external: HTTPS via Cloudflare
Sensitive fields: [REDACTED] in all logs

Security logging: SecurityLog collection, critical = superadmin alert

---

## TABLE ASSIGNMENT SYSTEM

Model: Flexible
Manager assigns sections before shift (optional)
Any waiter can serve any table
Primary waiter tracked for notifications + tips

Assignment Types:
section_auto: manager assigns section, tables inherit
self_claimed: waiter taps Claim on unassigned table
manager_direct: manager assigns specific table
swap: transfer to another waiter

Floor Map Views:
Manager: all tables, section colors, waiter names, time
Waiter: all tables, own highlighted with star + MINE
Unassigned+occupied: CLAIM? prompt visible to all

Notifications:
Assigned waiter: order placed + KOT ready alerts
All waiters: unassigned table needs attention
All staff: real-time floor map via Socket.io

Tips:
Recorded at billing, linked to assignedWaiter
Modes: cash or UPI
WaiterTipTally: daily aggregation per staff

Shift End Auto-Release:
Cron at shift end per branch timezone
Empty tables: auto-unassigned
Occupied tables: manager alert + reassign prompt

New Models (tenant-service):
Section: { tenant_id, branch_id, name, color, position, is_active } — floor map sections
Table: { tenant_id, branch_id, section_id?, name, capacity, position, qr_code } — per branch
  → routes: POST/GET/PATCH/DELETE /tenants/:id/branches/:bid/tables
  → routes: POST/GET/PATCH/DELETE /tenants/:id/branches/:bid/sections
TableSection (future — waiter assignment): { name, color, tableIds[], assignments[] }
WaiterTipTally (future): { staffId, date, totalTips, tablesServed, ... }

Table Model Additions (future — waiter assignment):
sectionId (already present), assignedWaiter{}, assignmentHistory[], tips{}

---

## UI/UX DESIGN SYSTEM

Philosophy: Professional enterprise SaaS (Linear + Stripe + Vercel feel)

Colors:
Brand: #6366F1 primary, #4F46E5 hover, #818CF8 dark mode
Page bg: #F9FAFB light / #0F1117 dark
Card: #FFFFFF light / #1A1F2E dark
Border: #E5E7EB light / #252B3B dark
Success: #10B981 | Warning: #F59E0B | Error: #EF4444

Typography:
Primary: Inter (variable font)
Mono: JetBrains Mono (prices, codes, IDs)
Scale: 12/14/16/18/20/24/30/36px
Weights: 400/500/600/700

Layout:
Desktop: 240px sidebar + max-1280px content
Mobile: full width, 16px margins
Breakpoint: 1024px

Components:
Buttons: primary/secondary/ghost/danger/icon
Inputs: text/select/toggle/checkbox (all states)
Cards: base/interactive/selected/metric
Badges: status/plan type

Dark Mode: CSS variables (:root vs .dark), localStorage persisted
Animations: 200-250ms ease-out throughout, floating cart slide-up

---

## CUSTOMER PWA NAVIGATION

Two Contexts:

PLATFORM HOME:
Top: hamburger + LocalCommerce + profile icon
Bottom: Home | Explore
Drawer: saved places, discover, support
Profile dropdown: all orders (cross-business), loyalty (platform)

INSIDE A PLACE (after QR scan):
Top: hamburger + Place Name (brand color) + profile icon
Bottom: Home | Menu (+ floating elements)
Drawer: place-specific

Bottom Bar State Machine:
Platform home: Home | Explore
No items in cart: Home | Menu
Items in cart: Home | Menu + floating cart pill
Order placed: Home | Menu + Track tab (with dot)

Floating Cart Pill:
Fixed above bottom bar, full width minus 16px margins
Height 52px, radius 16px, brand-500 bg
Content: cart count + total + View Cart arrow
Slide up on first item, bounce on each add
Disappears when order placed -> Track appears

Side Drawer Inside Place:
280px, slides from left 200ms
Header: cover photo + logo + name + rating + hours
Links: Menu, Our Team (type-adaptive), Offers, Events,
About, Help & Support, Exit Place

Data Scoping:
Order history: place-scoped inside, all orders on platform home
Loyalty: tenant points inside, platform points on home
Profile icon (top right): always personal, never place-scoped

---

## CUSTOMER PWA SCREENS

1. Platform Home
   Greeting, saved places grid (dots + pin badges), scan QR card
   Popular near you, recently visited

2. Catalogue / Menu
   Cover banner, business info, search, filter chips
   Sections (collapsible), item cards with add button
   Floating cart pill on first add

3. Item Detail
   Full image, name, desc, rating, allergens
   Variants (brand selected state)
   Customisation, special instructions
   Reviews (top 3 + see all), recommendations
   Sticky: price + qty control + Add button

4. Cart
   Items + qty controls, coupon input
   Loyalty redemption toggle
   Bill summary (subtotal, discount, points, GST, total)
   Special instructions, Place Order sticky bottom

5. Payment
   Order summary, dynamic payment methods (region-based)
   Razorpay/Stripe SDK handles card UI
   Security badge

6. Order Tracking
   Dine-in: step progress + per-item status
   Delivery: live map + rider info + steps
   Call Waiter / Message Kitchen actions
   Add more items link

7. Order History (place-scoped)
   Orders at [Place Name] header
   Cards with reorder button
   Tenant loyalty points shown below

---

## STAFF POS WEB SCREENS

Layout:
Sidebar: 64px icons (expands 240px on hover)
Top bar: logo + business + branch + profile + notifications
Active: brand-500 left border + brand-50 bg

1. Floor Map
   Color-coded cards (green/amber/red/brand/pulsing)
   Section headers with waiter assignment color
   Unassigned occupied: red exclamation badge
   Quick stats bar
   Tap -> right panel (detail, bill, reassign, close)

2. Active Orders
   Kanban cards per status (pending/preparing/ready/billed)
   Color-coded borders, time elapsed, waiter name
   One-click: Accept / Mark Ready / Serve / Print Bill

3. Catalogue Builder
   View/Edit toggle (permission-gated, menu:edit)
   Edit: drag handles, inline toggles, orange warning banner
   Section: toggle, add, rename, reorder, delete
   Item: toggle, price override, sold out, image, 2-step delete

4. Reports Dashboard
   Metric cards + % change vs yesterday
   Revenue trend chart, top items, payment breakdown
   Staff performance table
   PDF + Excel export buttons

5. Staff Management
   List with shift status badges
   Card: name, role, section, clock-in time
   Actions: Edit, Permissions, More menu
   Invite: email + role + permissions

6. Settings
   Business profile, branches, payment setup,
   QR management, printer, notifications, subscription

---

CHANGE LOG ADDITIONS:
2026-03-03: Saved places (QR history + frequency scoring algorithm)
2026-03-03: Payment system (Razorpay India + Stripe US/Global abstraction)
2026-03-03: Payment security (sig verify, idempotency, OTP, JWT hardening)
2026-03-03: Table assignment (sections, self-claim, swap, tips, auto-release)
2026-03-03: Complete UI/UX design system (tokens, components, dark mode)
2026-03-03: Customer PWA navigation (2 contexts, floating cart, data scoping)
2026-03-03: Customer PWA all 7 screens designed
2026-03-03: Staff POS web all 6 screens designed
2026-04-08: KDS: ErrorBoundary prevents blank screen crash on null order_type field
2026-04-08: KDS: ✕ reject button on KOT cards — POST /kots/:id/reject, auto-cancels order if all KOTs rejected
2026-04-08: order-service: KOT reject flow — updates status to "rejected", publishes KOT_REJECTED, allKotsRejected() cancels parent order
2026-04-08: order-service: requirePermission(permission) middleware — owner roles bypass, others checked against JWT permissions[]
2026-04-08: order-service: GET /summary/daily — real daily report (revenue, orders, top items, payment breakdown, unbilled, active) gated behind reports:view
2026-04-08: order-service: recordPayment() now completes full lifecycle — status→completed, commission, ORDER_STATUS_CHANGED event
2026-04-08: order-service: startup + midnight stale order sweep — pending→silent cancel; confirmed/preparing/ready→ORDER_UNBILLED_ALERT
2026-04-08: realtime-service: KOT_REJECTED → kot:rejected (branch room), ORDER_UNBILLED_ALERT → order:unbilled_alert (owner room)
2026-04-08: apps/web: apiFetch() wrapper — auto-dispatches clearAuth() + redirects /login on any 401
2026-04-08: apps/web: always-visible Logout button in top bar header
2026-04-08: apps/web: permissions[] added to StaffUser, Login response, and authSlice
2026-04-08: apps/web: Orders page — live kanban via Socket.io (order:new, order:status:changed), real API data, billing/checkout modal
2026-04-08: apps/web: Reports page — real daily summary API, today/yesterday/custom tabs, unbilled alert section, payment BarChart, top items table
2026-04-08: apps/web: Layout — Reports nav item hidden for roles without reports:view permission
2026-04-08: apps/web: useSocket — kot:rejected and order:unbilled_alert listeners dispatch error toasts
2026-04-15: Added .claude/agents/ — 14 service-specific agent markdown files for accelerated development
2026-04-15: Added AGENT_CONTEXT.md to each service directory for agent bootstrap context
2026-04-16: ads-service built (port 3015) — Advertiser, AdCampaign, AdCreative, AdImpression, AdClick, Mall, VenueAdRevenue models
2026-04-16: ads-service: getAdsForContext() ad engine — validates placement, filters by schedule/geo/plan, sorts priority DESC
2026-04-16: ads-service: 7 valid placements ONLY — platform_home, order_tracking, post_checkout, social_room, explore_nearby, jukebox_queue, jukebox_player
2026-04-16: ads-service: plan-gated placements — starter(explore_nearby), growth(+order_tracking/post_checkout), premium(all 7), mall_package(all 7)
2026-04-16: ads-service: in-house campaigns always priority 10, bypass plan gates, tenant-scoped
2026-04-16: ads-service: impression tracking (async, revenue split), click tracking (returns redirect_url)
2026-04-16: ads-service: GET /explore — geo-sorted explore feed, featured(priority 8-10) + standard cards
2026-04-16: ads-service: venue revenue aggregates per month (VenueAdRevenue), admin overview endpoint
2026-04-16: customer-web: /explore page — GPS location permission, featured + standard ad cards, distance-sorted feed
2026-04-16: customer-web: NativeAdCard, FeaturedAdCard, StandardAdCard, PreRollAd, HomeAdBanner components in src/components/ads/
2026-04-16: customer-web: useAds() hook — async fetch, fail-silently, IntersectionObserver impression tracking (1s visible)
2026-04-16: customer-web: OrderTracking — 1 NativeAdCard below order steps (placement=order_tracking)
2026-04-16: customer-web: Checkout — post-checkout success screen with horizontal scroll of 3 nearby ads before tracking redirect
2026-04-16: jukebox-player: useJukeboxAds() — fetches 5 ads, rotates every 30s, refreshes every 10min; ad zone in right column of TV screen
2026-04-16: apps/web: Settings → 📢 Promotions tab — create/list/pause in-house promotions, placement checkboxes, POSTs to ads-service

---

## 🤖 CLAUDE CODE — BOOTSTRAP GUIDE

> Use this section to build the entire project from scratch using Claude Code + your API key.
> No manual file creation needed. Claude Code reads this file and does everything.

---

### Prerequisites (one-time, manual)

Install these before using Claude Code:

```bash
# 1. Node.js 22 (via nvm — recommended)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
nvm install 22 && nvm use 22

# 2. pnpm
npm install -g pnpm

# 3. Claude Code
npm install -g @anthropic/claude-code

# 4. Docker Desktop
# Download from: https://www.docker.com/products/docker-desktop/
# Install and launch it. Verify with: docker --version
```

---

### Set Your API Key

```bash
# macOS / Linux
export ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxxxxxx

# Windows (PowerShell)
$env:ANTHROPIC_API_KEY="sk-ant-xxxxxxxxxxxxxxxx"

# To make it permanent, add the export line to your ~/.zshrc or ~/.bashrc
```

Get your key from: https://console.anthropic.com/settings/api-keys

---

### First Time — Project Bootstrap

```bash
# Create the project folder
mkdir -p ~/Projects/ulcp
cd ~/Projects/ulcp

# Copy CLAUDE.md into this folder, then launch Claude Code
claude
```

Once inside Claude Code, paste this prompt:

```
Read CLAUDE.md fully.

Bootstrap Phase 1 of the Universal Local Commerce Platform:

1. Create the full monorepo folder structure (services/, packages/, apps/, infra/)
2. Create root config files: pnpm-workspace.yaml, turbo.json, package.json, .gitignore
3. Build packages/shared with: types, errors, constants, utils, and appConfig (configurable via env)
4. Build services/identity-service completely:
   - package.json, tsconfig.json, .env
   - Prisma schema (User + RefreshToken models)
   - src/lib: logger (Pino), prisma client, redis (ioredis), jwt helpers
   - src/middleware: authenticate.ts (JWT guard)
   - src/routes: auth.routes.ts (register, login, refresh, logout, /me)
   - src/index.ts: Fastify app with helmet, cors, rate-limit
5. Create docker-compose.dev.yml with postgres:16-alpine and redis:7-alpine
6. Run: pnpm install
7. Start Docker databases: docker compose -f docker-compose.dev.yml up -d postgres redis
8. Run Prisma migration (name it "init")
9. Start the identity service and confirm it is running on port 3001
10. Test /health endpoint and show the response

Follow all conventions in CLAUDE.md. Use TypeScript strict mode. No any types.
App name must come from appConfig (env: APP_NAME), not hardcoded.
```

---

### Starting Each New Session

Every time you open a new Claude Code session on this project:

```bash
cd ~/Projects/ulcp
claude
```

Then paste:

```
Read CLAUDE.md and PROGRESS.md.
Tell me what's already built and what's next.
Then let's continue with [Phase X / feature name].
```

---

### Phase-by-Phase Prompts

Copy the exact prompt for the phase you want to build.

---

#### Phase 1 — Foundation (monorepo + identity-service)

```
Read CLAUDE.md fully. Build Phase 1:
- Monorepo: pnpm workspaces + Turborepo
- packages/shared: types, errors, constants, utils, appConfig (env-driven)
- docker-compose.dev.yml: postgres:16 + redis:7
- services/identity-service: Fastify + Prisma + JWT + bcrypt + Redis refresh tokens
  Routes: POST /register /login /refresh /logout GET /me
- Start Postgres + Redis via Docker
- Run prisma migrate (name: init)
- Start the service, test /health
All TypeScript strict. Follow CLAUDE.md conventions.
```

---

#### Phase 2 — Core Commerce

```
Read CLAUDE.md and PROGRESS.md. Build Phase 2:

1. services/tenant-service (port 3002):
   - Tenant onboarding wizard (6 steps, save state at each)
   - Business types (all 10 from CLAUDE.md)
   - Branch management, staff invite (email + SMS)
   - QR code generation per table/branch (qrcode npm)
   - Plan enforcement middleware (check PLAN_ITEM_LIMITS etc)
   - Subscription model (free/starter/pro)
   - All multi-tenant: every query scoped to tenantId

2. services/catalogue-service (port 3003):
   - Sections + items CRUD
   - Variants, modifiers, bundles, recipes
   - Item toggle (available/unavailable), sold-out
   - Drag-and-drop order (via position field)
   - Cloudflare R2 image upload via media-service
   - Redis cache (CATALOGUE_CACHE_TTL_SECS = 300)
   - Cache invalidation on any update (Cloudflare + Redis)
   - Full-text search (PostgreSQL tsvector + GIN index)
   - Plan limit enforcement (PLAN_ITEM_LIMITS)

3. services/order-service (port 3004):
   - Order lifecycle state machine (CLAUDE.md order states)
   - KOT generation + auto-split (food vs drink by business type)
   - Billing: subtotal, GST, discount, loyalty redemption, tips
   - Commission calculation on completion (COMMISSION_RATES)
   - Razorpay Route integration for auto commission split
   - Table session management
   - Redis events for real-time updates

4. services/table-service (port 3009):
   - QR binding to table_id + tenant_id
   - Table sessions (open/close)
   - Floor map state
   - Waiter assignment (section_auto, self_claimed, manager_direct, swap)
   - Tips recording (WaiterTipTally model)
   - Auto-release cron at shift end

Add each service to docker-compose.dev.yml.
Follow all CLAUDE.md conventions. TypeScript strict.
```

---

#### Phase 3 — Payments & Notifications

```
Read CLAUDE.md and PROGRESS.md. Build Phase 3:

1. services/payment-service (port 3005):
   - Razorpay: order create, payment capture, webhook verify
   - Stripe: PaymentIntent, webhook verify
   - Razorpay Route: auto commission split
   - Signature verification (HMAC-SHA256, timingSafeEqual)
   - Webhook idempotency (Redis key: webhook:EVENTID, TTL 24hr)
   - Tips: 5/10/15/custom%, stored as integers (paise/cents)
   - Rate limit: 10 payment requests/min per IP

2. services/notification-service (port 3007):
   - MSG91 for OTP SMS
   - Interakt for WhatsApp (order confirmed, ready, delivered)
   - Firebase FCM for push notifications
   - SendGrid for email (welcome, order receipt)
   - Bull queue (Redis): retry failed notifications 3x with backoff
   - Fire-and-forget pattern: never block order flow
   - OTP: SHA-256 hash stored, 5 min TTL, 5 attempts max, one-time use

Follow CLAUDE.md security rules. TypeScript strict.
```

---

#### Phase 4 — Frontends

```
Read CLAUDE.md and PROGRESS.md. Build Phase 4:

1. apps/web — Staff POS (React 18 + Vite + Tailwind + Redux Toolkit + RTK Query)
   Screens (see CLAUDE.md for full specs):
   - Floor Map (color-coded tables, section headers, right panel)
   - Active Orders (Kanban by status)
   - Catalogue Builder (view/edit toggle, drag-and-drop)
   - Reports Dashboard (metrics, charts, PDF/Excel export)
   - Staff Management (list, invite, permissions)
   - Settings (business, branches, QR, payments, subscription)

2. apps/customer-web — Customer PWA (React 18 + Vite + Tailwind + Redux)
   Screens (see CLAUDE.md for full specs):
   - Platform Home (saved places, scan QR)
   - Catalogue/Menu (sections, search, filters, floating cart pill)
   - Item Detail (variants, customisation, reviews)
   - Cart (qty controls, coupon, loyalty, bill summary)
   - Payment (Razorpay/Stripe dynamic by region)
   - Order Tracking (dine-in steps + delivery map)
   - Order History

3. apps/kds — Kitchen Display System (React + Vite, minimal, no Redux)
   - Live order cards by KOT
   - Item status toggle (pending → preparing → ready)
   - Auto-split: food KDS vs bar KDS
   - Socket.io real-time updates
   - Full-screen TV optimised

Design system from CLAUDE.md: Indigo primary, Inter + JetBrains Mono,
dark mode, Linear/Stripe/Vercel aesthetic.
Use shadcn/ui + Radix UI + Lucide React.
```

---

#### Phase 5 — Analytics, Delivery, Loyalty

```
Read CLAUDE.md and PROGRESS.md. Build Phase 5:

1. services/analytics-service (port 3009):
   - Pre-computed reports (cron every 15 min → Redis cache)
   - Revenue, orders, items, staff performance
   - P&L statement
   - PDF export (puppeteer), Excel export (exceljs)
   - Pro plan gate on advanced analytics

2. services/delivery-service (port 3006):
   - Near delivery (within radius, geolib)
   - Far delivery (Shiprocket API integration)
   - Community delivery (gated community model)
   - Scheduled delivery (date/time slot picker)
   - Food truck mode (location tracking)
   - Rider assignment + live tracking
   - Delivery zone management

3. services/loyalty-service (port 3011):
   - Points earn (on order completion)
   - Points redeem (at cart, partial redemption)
   - Tiers (Bronze/Silver/Gold by lifetime spend)
   - Offers engine (% off, flat off, BOGO, minimum order)
   - Coupons (single use, multi use, expiry)
   - Wishlist (save items across visits)
   - Platform loyalty vs tenant loyalty (separate balances)

TypeScript strict. Follow CLAUDE.md conventions.
```

---

#### Phase 6 — Production Infrastructure

```
Read CLAUDE.md and PROGRESS.md. Build Phase 6:

1. Docker production setup:
   - docker-compose.prod.yml (all 12 services + Kong + PostgreSQL + Redis)
   - Dockerfile for each service (FROM node:22-alpine, multi-stage build)
   - .dockerignore for each service
   - Health checks for all services

2. Kong API Gateway:
   - kong.yml declarative config (no-database mode)
   - Routes: all 12 services via /api/v1/servicename
   - Plugins: JWT verify, rate limiting (100 req/min global, 3/min OTP)
   - CORS, request logging
   - Expose on port 8000

3. GitHub Actions CI/CD (.github/workflows/):
   - ci.yml: lint + test on PR
   - deploy.yml: build Docker images + push to registry + deploy to Hetzner on merge to main
   - Environment secrets: ANTHROPIC_API_KEY, DATABASE_URLs, JWT secrets etc

4. Hetzner server setup scripts (infra/scripts/):
   - server-init.sh: Docker install, firewall rules, swap setup
   - deploy.sh: pull images, docker compose up

5. Monitoring:
   - Health check endpoints on all services (/health)
   - Uptime monitoring config (UptimeRobot or similar)
   - Error alerting to superadmin

TypeScript strict. Follow CLAUDE.md conventions.
```

---

#### Add a New Feature (any time)

```
Read CLAUDE.md and PROGRESS.md.

Add: [describe the feature clearly]

Service(s) affected: [list them]
New models needed: [describe]
New routes needed: [list endpoints]
Frontend changes: [describe UI changes]

Follow all CLAUDE.md conventions.
After building, update PROGRESS.md.
```

---

### PROGRESS.md — Keep This Updated

After each phase, ask Claude Code:

```
Update PROGRESS.md with what we just built.
Mark Phase X as complete.
List what's left and what's next.
```

Create `PROGRESS.md` at the project root. Example format:

```markdown
# PROGRESS.md

## Status

Last updated: [date]

## ✅ Completed

- Phase 1: Monorepo, shared package, identity-service (auth + JWT)

## 🔄 In Progress

- Phase 2: tenant-service (50% done — onboarding wizard complete, QR pending)

## ⏳ Not Started

- Phase 3: payment-service, notification-service
- Phase 4: All frontends
- Phase 5: analytics, delivery, loyalty
- Phase 6: Production infra

## Known Issues

- [list any bugs or blockers]
```

---

### Useful Claude Code Commands

```bash
# Start a session
claude

# Run a file directly
claude "Read CLAUDE.md and tell me what Phase 2 involves"

# Continue last session
claude --continue

# Give Claude Code permission to run commands automatically (less prompts)
claude --dangerously-skip-permissions
```

---

### Tips for Best Results

| Tip                                                        | Why                                                                          |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Always start with "Read CLAUDE.md and PROGRESS.md"         | Grounds Claude in your full architecture                                     |
| One phase at a time                                        | Keeps context focused, avoids mistakes                                       |
| Update PROGRESS.md after each phase                        | Next session starts with accurate context                                    |
| If Claude makes a mistake, say "revert that and try again" | Claude Code can undo its own changes                                         |
| For big phases, break into sub-tasks                       | e.g. "Build just the tenant onboarding wizard first"                         |
| Keep your API key funded                                   | Claude Code uses Claude Sonnet/Opus — monitor usage at console.anthropic.com |

---

_Claude Code reads this file on every session. Keep it updated as the project evolves._
