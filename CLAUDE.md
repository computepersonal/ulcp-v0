# Universal Local Commerce Platform — CLAUDE.md

# Complete Architecture Reference for Claude Code Sessions

# Last Updated: April 27, 2026

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

> Full history: [docs/CHANGELOG.md](docs/CHANGELOG.md)

```
2026-04-16: ads-service built (port 3015) — campaigns, placements, impression/click tracking
2026-04-16: tenant-service: AuditLog model added; POST /sections/:id/rename (atomic + cascade)
2026-04-16: identity-service: JWT payload includes actor name
2026-04-16: apps/web: FloorMap zone management, ActivityLog page, Catalogue full rewrite
2026-04-23: tenant-service: Tenant.setup_tasks (JSONB), onboarding rewritten with Zod + step ordering
2026-04-23: apps/web: Login/Onboard/Setup migrated to server-side onboarding state
2026-04-24: Domain knowledge split into per-service CLAUDE.md files
2026-04-27: catalogue-service: CatalogueItem.allergens String[] field (10 common allergens)
2026-04-27: apps/web: allergens multi-select chips in Add/Edit item modals
2026-04-27: tenant-service: Section name uniqueness enforced (case-insensitive, ConflictError 409)
2026-04-27: tenant-service: GET /tenants/internal/names?ids= — batch fetch for login picker
2026-04-27: apps/web: Role-based nav — waiters/kitchen staff see only Floor Map, Orders, Catalogue
2026-04-27: apps/web: /onboard redirect gated to OWNER_ROLES; waiters always go to /floor-map
2026-04-27: apps/web: FloorMap empty state — owners see add controls, others see manager message
2026-04-27: root CLAUDE.md restructured — Bootstrap → docs/BOOTSTRAP.md, Build Order → docs/BUILD_ORDER.md
2026-05-20: tenant-service: onboarding wizard 6→7 steps — Step 6 Staff inserted before Go Live (step6Schema + step7Schema)
2026-05-20: apps/web: Onboard wizard deep-links to /floor-map (Step 5) and /staff (Step 6); FloorMap/Staff show "← Back to onboarding" banner via onboarding_*_return localStorage keys
2026-05-20: apps/web: Step 7 Go Live checklist queries catalogue items, branch sections, and staff endpoints to mark items done in real time
2026-05-20: apps/web: FloorMap empty state now requires a floor zone before any table can be added; AddTableModal makes zone required
2026-05-20: apps/web: Settings — new 📺 KDS tab generates 6-digit setup codes (10-min expiry, countdown) for kitchen / bar displays
2026-05-20: apps/web: ProtectedRoute — /floor-map and /staff added to ONBOARDING_PASSTHROUGH so wizard deep-links work pre-completion
2026-05-20: services (6): dev script migrated from ts-node-dev → tsx watch (analytics, delivery, inventory, order, procurement, superadmin); tsx added as root devDep
2026-05-20: .claude/settings.local.json removed from tracking and gitignored — per-developer permission allowlist
```

---

## BUILD ORDER

> Full phase-by-phase list: [docs/BUILD_ORDER.md](docs/BUILD_ORDER.md)

```
Phase 1  — Foundation (identity, tenant, shared pkg, Docker)
Phase 2  — Catalogue (sections, items, search, caching)
Phase 3  — Staff & Partners (RBAC, shifts, invites)
Phase 4  — Inventory (ingredients, stock, purchase orders)
Phase 5  — Orders & KOT (floor map, KDS, billing, payments)
Phase 6  — Delivery (near/far/community/scheduled)
Phase 7  — Customer Platform (OTP auth, wishlist, reorder)
Phase 8  — Commerce (offers, commission, GST, refunds)
Phase 9  — Notifications (SMS/WhatsApp/push/email, BullMQ)
Phase 10 — Analytics & Loyalty (P&L, reports, tiers)
Phase 11 — Real-time (Socket.io, Redis pub/sub, KDS app)
Phase 12 — Media (Sharp, WebP, Cloudflare R2)
Phase 13 — Superadmin (platform panel, settlements)
Phase 14 — Business Onboarding (6-step wizard, checklist)
Phase 15 — Chain/Franchise (multi-branch, consolidated reports)
Phase 16 — Frontend Apps (staff POS, customer PWA, mobile)
Phase 17 — Ads & Jukebox
```

---

## BOOTSTRAP GUIDE

> Full setup instructions and phase prompts: [docs/BOOTSTRAP.md](docs/BOOTSTRAP.md)

```bash
# Quick start
cd ~/Projects/ulcp && claude
# Then: "Read CLAUDE.md and PROGRESS.md. Tell me what's built and what's next."
```

Service slash commands: `/identity` `/tenant` `/catalogue` `/order` `/inventory`
`/delivery` `/notification` `/realtime` `/analytics` `/media` `/loyalty`
`/superadmin` `/procurement` `/jukebox` `/ads`

---

_Universal Local Commerce Platform — Complete Architecture_
_15 microservices · Cloudflare CDN · Global from day 1_
_Last updated: April 27, 2026_
