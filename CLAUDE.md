# Universal Local Commerce Platform — CLAUDE.md

# Complete Architecture Reference for Claude Code Sessions

# Last Updated: April 24, 2026

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

## SERVICE-SPECIFIC CONTEXT FILES

Domain knowledge has been split into per-service CLAUDE.md files.
**When working on a service, read its CLAUDE.md for full domain context.**

```
services/identity-service/CLAUDE.md     ← user systems, JWT, RBAC, security rules
services/tenant-service/CLAUDE.md       ← onboarding wizard, partner system, business types,
                                           table assignment, franchise, staff shifts
services/catalogue-service/CLAUDE.md    ← catalogue model, menu view modes, search, caching
services/order-service/CLAUDE.md        ← KOT system, KDS, table lifecycle, GST, payments
services/inventory-service/CLAUDE.md    ← recipe-to-inventory, ingredient model, stock alerts
services/delivery-service/CLAUDE.md     ← all delivery types (near/far/community/scheduled)
services/notification-service/CLAUDE.md ← channel rules, WhatsApp integration, BullMQ queue
services/loyalty-service/CLAUDE.md      ← loyalty tiers, offers engine, saved places, reviews
services/analytics-service/CLAUDE.md    ← dashboard, P&L, pre-computed reports, exports
services/realtime-service/CLAUDE.md     ← Socket.io rooms, Redis Pub/Sub key events
services/superadmin-service/CLAUDE.md   ← superadmin panel, commission settlement

apps/CLAUDE.md                          ← UI/UX design system, state management, perf targets
apps/customer-web/CLAUDE.md             ← customer PWA navigation + all 7 screens
apps/web/CLAUDE.md                      ← staff POS all 6 screens
```

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
│   │   ├── CLAUDE.md          ← service-specific domain context
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
│   ├── tenant-service/        ← port 3002  (has CLAUDE.md)
│   ├── catalogue-service/     ← port 3003  (has CLAUDE.md)
│   ├── order-service/         ← port 3004  (has CLAUDE.md)
│   ├── inventory-service/     ← port 3005  (has CLAUDE.md)
│   ├── delivery-service/      ← port 3006  (has CLAUDE.md)
│   ├── notification-service/  ← port 3007  (has CLAUDE.md)
│   ├── realtime-service/      ← port 3008  (has CLAUDE.md)
│   ├── analytics-service/     ← port 3009  (has CLAUDE.md)
│   ├── media-service/         ← port 3010
│   ├── loyalty-service/       ← port 3011  (has CLAUDE.md)
│   └── superadmin-service/    ← port 3012  (has CLAUDE.md)
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
    ├── CLAUDE.md              ← shared frontend design system + state management
    ├── superadmin/            ← platform admin panel (React + Vite)
    ├── web/                   ← staff POS (React + Vite)  (has CLAUDE.md)
    ├── kds/                   ← kitchen display (React + Vite, minimal)
    ├── mobile/                ← staff mobile (Expo Bare)
    ├── customer-web/          ← customer QR PWA (React + Vite)  (has CLAUDE.md)
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
2026-02-25: Free plan: 50→200 items, Starter: 200→500 items
2026-03-03: Saved places (QR history + frequency scoring algorithm)
2026-03-03: Payment system (Razorpay India + Stripe US/Global abstraction)
2026-03-03: Payment security (sig verify, idempotency, OTP, JWT hardening)
2026-03-03: Table assignment (sections, self-claim, swap, tips, auto-release)
2026-03-03: Complete UI/UX design system (tokens, components, dark mode)
2026-03-03: Customer PWA navigation (2 contexts, floating cart, data scoping)
2026-03-03: Customer PWA all 7 screens designed
2026-03-03: Staff POS web all 6 screens designed
2026-03-19: Registration flow redesign — tenant_id optional, pending_onboarding role
2026-03-19: PATCH /auth/users/:id/tenant — internal endpoint, X-Internal-Secret auth
2026-03-19: tenant-service calls identity-service to assign tenant_id after creation
2026-03-19: Prisma per-service output dirs (src/generated/prisma) — no DLL collision
2026-03-22: CatalogueItem extended: veg_type, meal_type, item_type, course, prep_time_mins, calories, video_url, rating, rating_count
2026-03-22: New catalogue models: ItemOptionGroup+Choice, AddonGroup+Item, ItemAddonGroup, Combo+ComboItem, ItemIngredient
2026-03-22: Public catalogue response now includes combos + item relations (options, addons, ingredients)
2026-03-26: Tenant model extended: city, state, pincode fields added
2026-03-26: tenant-service: Table + Section models added (floor map)
2026-03-26: Table.qr_code @unique removed — base64 QR exceeds PostgreSQL btree 2704-byte limit
2026-03-26: Identity login: helpful error "Please provide your tenant_id" instead of generic 401
2026-03-26: catalogue-service: GET /items defaults branch_id to primary branch (is_primary=true)
2026-03-28: order-service built (port 3004) — Order, KOT, OrderStatusHistory, CommissionRecord, DailyCounter models
2026-03-28: order-service: KOT sequential numbering per branch per day (KOT-001...) via DailyCounter atomic upsert
2026-03-28: order-service: GST calculation (inclusive + exclusive), commission on order completion
2026-03-28: order-service: KOT auto-split for seated_full_service (food→kitchen, drink→bar)
2026-03-28: tenant-service: kot_ack_mode (auto|kds|printer) + kot_ack_delay_secs added to Tenant model
2026-03-28: order-service: Three KOT ack modes — auto (BullMQ), kds (manual), printer (POST printer-ack)
2026-03-28: order-service: acknowledgeKot() is idempotent — cancels pending auto-ack job
2026-03-28: Docker Redis moved to port 6380 (local Redis 3.0 on 6379 incompatible with BullMQ)
2026-03-28: catalogue-service: ItemIngredient routes built
2026-03-28: procurement-service built (port 3013) — vendors, bids, market view, magic links
2026-03-28: apps/vendor-portal built (port 5176) — React 18 + Vite, token-based, 6 screens
2026-04-08: KDS: ErrorBoundary prevents blank screen crash on null order_type field
2026-04-08: KDS: ✕ reject button on KOT cards — POST /kots/:id/reject, auto-cancels order if all KOTs rejected
2026-04-08: order-service: KOT reject flow — updates status to "rejected", publishes KOT_REJECTED, allKotsRejected() cancels parent order
2026-04-08: order-service: requirePermission(permission) middleware — owner roles bypass, others checked against JWT permissions[]
2026-04-08: order-service: GET /summary/daily — real daily report (revenue, orders, top items, payment breakdown, unbilled, active) gated behind reports:view
2026-04-08: order-service: recordPayment() now completes full lifecycle — status→completed, commission, ORDER_STATUS_CHANGED event
2026-04-08: order-service: startup + midnight stale order sweep — pending→silent cancel; confirmed/preparing/ready→ORDER_UNBILLED_ALERT
2026-04-08: realtime-service: KOT_REJECTED → kot:rejected (branch room), ORDER_UNBILLED_ALERT → order:unbilled_alert (owner room)
2026-04-08: apps/web: apiFetch() wrapper — auto-dispatches clearAuth() + redirects /login on any 401
2026-04-08: apps/web: Orders page — live kanban via Socket.io (order:new, order:status:changed), real API data, billing/checkout modal
2026-04-08: apps/web: Reports page — real daily summary API, today/yesterday/custom tabs, unbilled alert section, payment BarChart, top items table
2026-04-15: Added .claude/agents/ — 14 service-specific agent markdown files for accelerated development
2026-04-15: Added AGENT_CONTEXT.md to each service directory for agent bootstrap context
2026-04-16: ads-service built (port 3015) — Advertiser, AdCampaign, AdCreative, AdImpression, AdClick, Mall, VenueAdRevenue models
2026-04-16: ads-service: 7 valid placements — platform_home, order_tracking, post_checkout, social_room, explore_nearby, jukebox_queue, jukebox_player
2026-04-16: tenant-service: AuditLog model — actor_id, actor_name, actor_role, action, entity_type, entity_id, metadata, branch_id
2026-04-16: tenant-service: POST /sections/:id/rename — atomic rename + cascade to tables in a single Prisma $transaction
2026-04-16: identity-service: JWT payload now includes actor name — buildPayload() includes name, StaffJwtPayload.name in shared types
2026-04-16: apps/web: FloorMap — zone management (add/rename/delete/disable), table disable/enable for service
2026-04-16: apps/web: ActivityLog page — paginated audit log, filter by entity type, date picker, role-gated nav item
2026-04-16: apps/web: Catalogue — full rewrite with real API calls, availability toggle, section management, 2-step delete
2026-04-23: tenant-service: Tenant.setup_tasks (JSONB) — server-persisted post-onboarding checklist, replaces localStorage
2026-04-23: tenant-service: onboarding.service.ts rewritten — Zod validation per step, step ordering enforced, idempotent completion
2026-04-23: apps/web: Login.tsx — fetches onboarding state after login, redirects to /onboard if not completed
2026-04-23: apps/web: Onboard.tsx — full 6-step wizard resumes from server-side step on reload
2026-04-23: apps/web: Setup.tsx — migrated from localStorage to server-side setup_tasks API
2026-04-24: Domain knowledge split into per-service CLAUDE.md files to reduce root file size
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
```

---

### First Time — Project Bootstrap

```bash
mkdir -p ~/Projects/ulcp
cd ~/Projects/ulcp
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

#### Phase 2 — Core Commerce

```
Read CLAUDE.md, PROGRESS.md, and services/tenant-service/CLAUDE.md. Build Phase 2:

1. services/tenant-service (port 3002):
   - Tenant onboarding wizard (6 steps, save state at each)
   - Business types (all 10 from tenant-service/CLAUDE.md)
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
   - Redis cache (CATALOGUE_CACHE_TTL_SECS = 300)
   - Cache invalidation on any update (Cloudflare + Redis)
   - Full-text search (PostgreSQL tsvector + GIN index)
   - Plan limit enforcement (PLAN_ITEM_LIMITS)

3. services/order-service (port 3004):
   - Order lifecycle state machine
   - KOT generation + auto-split (food vs drink by business type)
   - Billing: subtotal, GST, discount, loyalty redemption, tips
   - Commission calculation on completion (COMMISSION_RATES)
   - Razorpay Route integration for auto commission split
   - Table session management
   - Redis events for real-time updates

Add each service to docker-compose.dev.yml.
Follow all CLAUDE.md conventions. TypeScript strict.
```

#### Phase 3 — Payments & Notifications

```
Read CLAUDE.md, PROGRESS.md, and services/notification-service/CLAUDE.md. Build Phase 3:

1. services/notification-service (port 3007):
   - MSG91 for OTP SMS
   - Interakt for WhatsApp (order confirmed, ready, delivered)
   - Firebase FCM for push notifications
   - SendGrid for email (welcome, order receipt)
   - BullMQ queue (Redis): retry failed notifications 3x with backoff
   - Fire-and-forget pattern: never block order flow
   - OTP: SHA-256 hash stored, 5 min TTL, 5 attempts max, one-time use

Follow CLAUDE.md security rules. TypeScript strict.
```

#### Phase 4 — Frontends

```
Read CLAUDE.md, PROGRESS.md, apps/CLAUDE.md, apps/web/CLAUDE.md, apps/customer-web/CLAUDE.md. Build Phase 4:

1. apps/web — Staff POS (React 18 + Vite + Tailwind + Redux Toolkit + RTK Query)
   (screen specs in apps/web/CLAUDE.md)

2. apps/customer-web — Customer PWA (React 18 + Vite + Tailwind + Redux)
   (screen specs in apps/customer-web/CLAUDE.md)

3. apps/kds — Kitchen Display System (React + Vite, minimal, no Redux)
   - Live order cards by KOT, item status toggle, Socket.io real-time, full-screen TV

Design system: Indigo primary, Inter + JetBrains Mono, dark mode.
Use shadcn/ui + Radix UI + Lucide React.
```

#### Phase 5 — Analytics, Delivery, Loyalty

```
Read CLAUDE.md, PROGRESS.md, and the relevant service CLAUDE.md files. Build Phase 5:

1. services/analytics-service (port 3009) — see services/analytics-service/CLAUDE.md
2. services/delivery-service (port 3006) — see services/delivery-service/CLAUDE.md
3. services/loyalty-service (port 3011) — see services/loyalty-service/CLAUDE.md

TypeScript strict. Follow CLAUDE.md conventions.
```

#### Phase 6 — Production Infrastructure

```
Read CLAUDE.md and PROGRESS.md. Build Phase 6:

1. docker-compose.prod.yml (all services + Kong + PostgreSQL + Redis)
2. Dockerfile for each service (FROM node:22-alpine, multi-stage build)
3. Kong API Gateway: kong.yml declarative config, all routes, JWT + rate limiting plugins
4. GitHub Actions CI/CD: ci.yml (lint+test on PR), deploy.yml (build+push+deploy on main)
5. Hetzner setup scripts: server-init.sh, deploy.sh
6. Health check endpoints on all services (/health)

TypeScript strict. Follow CLAUDE.md conventions.
```

#### Add a New Feature (any time)

```
Read CLAUDE.md and PROGRESS.md.
Also read the CLAUDE.md for each affected service.

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

---

### Useful Claude Code Commands

```bash
claude                              # start a session
claude --continue                   # continue last session
claude --dangerously-skip-permissions  # fewer prompts
```

### Service Slash Commands

Use these to jump directly into a service agent:

```
/identity    /tenant     /catalogue   /order
/inventory   /delivery   /notification /realtime
/analytics   /media      /loyalty     /superadmin
/procurement /jukebox
```

---

### Tips for Best Results

| Tip | Why |
| --- | --- |
| Always start with "Read CLAUDE.md and PROGRESS.md" | Grounds Claude in your full architecture |
| For service work, also read the service CLAUDE.md | Full domain context without loading everything |
| One phase at a time | Keeps context focused, avoids mistakes |
| Update PROGRESS.md after each phase | Next session starts with accurate context |
| Use /identity, /order etc. slash commands | Jumps directly into the right service agent |

---

_Universal Local Commerce Platform — Complete Architecture_
_13 microservices · Cloudflare CDN · Global from day 1_
_Last updated: April 23, 2026_
