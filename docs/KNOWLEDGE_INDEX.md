# ULCP — Knowledge Index

> Ground-truth map of the codebase, built by reading the code (not just the docs).
> Generated: 2026-10-27 · Base: `f8dcc51` (origin/main, 2026-06-18) · Plus uncommitted per-item KOT work (see §8).
>
> **Where docs disagree with code, code wins — see §9 "Doc drift".**

---

## 1. What this is

Multi-tenant, QR-first POS + commerce platform for any local business (restaurants first; kirana,
boutique, pharmacy etc. are modelled but the onboarding UI only enables dine-in today).
pnpm + Turborepo monorepo: Fastify 4 / Prisma 5 / TypeScript (CJS) services, React + Vite frontends.

**Primary flow (built end-to-end):**
Owner registers → 6-step onboarding → builds catalogue + floor map → customer scans table QR →
customer PWA opens table session → places order (pay_now / pay_later) → order-service creates KOTs →
KDS accepts/rejects items → order ready → staff bills table (single order or table-bill) →
commission recorded, loyalty points awarded, stock deducted via recipes.

---

## 2. Where to look (doc map)

| Doc | Use for |
|---|---|
| [README.md](../README.md) | New-machine setup guide, ports, credentials, `pnpm start` |
| [scripts/setup.ps1](../scripts/setup.ps1) / [scripts/start-all.ps1](../scripts/start-all.ps1) | One-time setup / daily one-shot start (`pnpm start`, `pnpm stop`) |
| [CLAUDE.md](../CLAUDE.md) | Architecture intent, coding rules (⚠ plan names/prices outdated) |
| [PROGRESS.md](../PROGRESS.md) | Build log up to 2026-04-28 (⚠ stale — see §9) |
| [docs/CHANGELOG.md](CHANGELOG.md) | Dated change history |
| [docs/BUILD_ORDER.md](BUILD_ORDER.md) | Original 17-phase plan |
| [docs/BOOTSTRAP.md](BOOTSTRAP.md) | Setup + phase prompts |
| [docs/prd/*.md](prd/) | Per-service PRDs (all 15, incl. unbuilt ones) |
| `services/*/CLAUDE.md` | Domain rules (missing for jukebox, ads, procurement, media) |
| `services/*/AGENT_CONTEXT.md` | Agent bootstrap context (every service) |
| [apps/CLAUDE.md](../apps/CLAUDE.md), [apps/web/CLAUDE.md](../apps/web/CLAUDE.md), [apps/customer-web/CLAUDE.md](../apps/customer-web/CLAUDE.md) | Frontend design system + screen specs |
| `.claude/agents/*.md`, `.claude/commands/*.md` | 14 per-service subagents + slash commands (`/order`, `/tenant`, …) |
| [insomnia/](../insomnia/) | `ulcp-p0-e2e.json` end-to-end API collection, identity collection |

---

## 3. Build status at a glance

| Service | Port | Status | DB schema | Notes |
|---|---|---|---|---|
| identity | 3001 | ✅ built | `identity` | staff auth, customer OTP (fixed `123456` in dev) |
| tenant | 3002 | ✅ built | `tenant` | largest service (15 route files, 19 models) |
| catalogue | 3003 | ✅ built | `catalogue` | midnight cron |
| order | 3004 | ✅ built | `order_svc` | KOT, billing, BullMQ auto-ack |
| inventory | 3005 | ✅ built | `inventory` | ⚠ staff routes unauthenticated |
| delivery | 3006 | ❌ stub (package.json + docs only) | — | |
| notification | 3007 | 🟡 built, channels log-only | none | real SendGrid/MSG91/Interakt calls commented out; no FCM code |
| realtime | 3008 | ✅ built | none | + `/social` namespace + trivia |
| analytics | 3009 | ❌ stub | — | Reports page uses order-service daily summary instead |
| media | 3010 | ✅ built | none | local disk in dev, R2 in prod |
| loyalty | 3011 | ✅ built (PROGRESS says not started) | `loyalty` | no Dockerfile, not in docker-compose |
| superadmin | 3012 | ❌ stub | — | |
| procurement | 3013 | ✅ built (ERP phase 1) | `procurement` | |
| jukebox | 3014 | ✅ built (undocumented in PROGRESS) | `public` ⚠ (no `?schema=`) | |
| ads | 3015 | ✅ built | `ads` | |

| App | Dev port | Status |
|---|---|---|
| `apps/web` — staff POS | 5173 | ✅ |
| `apps/vendor-portal` | 5176 | ✅ (magic-link tokens) |
| `apps/kds` | 5177 | ✅ |
| `apps/jukebox-player` | 5178 | ✅ |
| `apps/customer-web` — customer PWA | 5180 | ✅ |
| `apps/superadmin`, `mobile`, `customer-mobile`, `customer-pwa`, `merchant-dashboard` | — | ❌ empty (package.json only) |

**Infra:** `docker-compose.dev.yml` (Postgres 16 on **5433**, Redis 7 on **6380**, + 11 services).
`kong.yml` and `docker-compose.prod.yml` **do not exist** yet. No CI. Not deployed.

---

## 4. Local dev cheatsheet

- **New machine:** `scripts/setup.ps1` (prereqs, `.env` from `.env.example`, install, containers, db push).
- **Daily:** `pnpm start` (Docker → containers → free ports → only implemented packages → health table), `pnpm stop`.
  `pnpm start -Setup` after pulling schema changes. Raw `pnpm dev` also starts the stubs, which crash.
- Services run with `tsx watch` (migrated from ts-node-dev in `6363b3f`).
- Postgres `localhost:5433`, Redis `redis://localhost:6380` (local Redis 3.0 on 6379 is too old for BullMQ).
  tenant-service's code default is 6379 — relies on `.env`.
- Schema changes: `prisma db push` (not `migrate dev` — needs TTY). **Stop services first** (Windows DLL lock).
  Each service generates its client to `src/generated/prisma/`.
- Access token 15 min; web app auto-refreshes on 401 via `apiFetch` mutex; customer-web does **not** refresh.
- All money in paise. Swagger at `/docs` on most services; `/health` on all.
- Commits: husky enforces Conventional Commits. ⚠ `pnpm save` (`scripts/save.sh`) does `git add . && commit --no-verify && push origin main`.
- `scripts/seed-jukebox.sql` seeds jukebox songs.

---

## 5. Services — reference

Auth legend: **JWT** staff bearer · **CUST** customer JWT · **KDS** device JWT · **IS** `X-Internal-Secret` · **TOK** URL token · **PUB** none.

### identity-service (3001)
- Models: `User`, `RefreshToken`, `PlatformCustomer`, `OtpCode`, `KdsDevice` (unused), `SecurityLog` (unused).
- Routes `/api/v1/auth`: register, login (multi-tenant → `TENANT_SELECTION_REQUIRED` with business names), refresh, logout (Redis blacklist), me, users list; internal: `users/:id/tenant|role`, `internal/register-staff`, `internal/users/:id/deactivate`.
- Customer: `customer/otp/send|verify` (PUB), `customer/me`, `customer/social-profile` (CUST); `/customers/:id`, `/customers/by-mobile/:m` (IS).
- Calls tenant `internal/names`. No events.

### tenant-service (3002) — control plane
- Models: Tenant (18 business types, plan, `kot_ack_mode`, `dine_in_billing_mode` pay_later|pay_now, onboarding_step, `setup_tasks` JSONB), Branch, Partner, StaffInvite, StaffProfile, StaffWage, ShiftTemplate, ShiftAssignment, Attendance, LeaveType/Balance/Request, Section, Table, TableSession, Subscription, Reservation, AuditLog, KdsSetupCode.
- Routes (under `/api/v1/tenants[/:tenant_id[/branches/:branch_id]]`): tenant CRUD + `by-slug/:slug` (PUB) + `internal/names` (IS) + plan/transfer-ownership/QR; branches; staff + invites (`/api/v1/staff-invite` PUB); partners; sections (+ atomic `rename`); tables (+ `public/:id`, `:id/status` IS); **sessions** (open via QR/staff, confirm, bill, close); **reservations** (conflict check); **staff-profiles**; **hr** (wages, shifts, schedule, attendance clock-in/out, leave types/balances/requests); onboarding (`/api/v1/onboarding/:tid` step/complete/setup-tasks); subscription (upgrade/addon, 1-month trial); audit-logs; **kds** (generate-code, verify-setup-code → 365-day device JWT, codes, devices).
- Logic: `onboarding.service.ts` (strict step order), `session.service.ts` (auto vs staff confirm by business type), `section.service.ts` (rename cascade), `middleware/planGuard.ts` (exists, **unused**).
- Calls identity (role/tenant assignment, staff registration). Publishes no events.

### catalogue-service (3003)
- Models: CatalogueSection, CatalogueItem (variants, attributes, veg_type, allergens[], GST, today-price override, availability), ItemOptionGroup/Choice, AddonGroup/AddonGroupItem/ItemAddonGroup, Combo/ComboItem, ItemIngredient (recipe → inventory ingredient).
- Routes `/api/v1/catalogue/:tenant_id/…`: sections (+reorder), items (+toggle, price-override, reorder, `public`, `public/search`), options, addons, combos, ingredients; `internal/recipes-bulk` (IS).
- Redis `catalogue:{tenant}:{branch}` 300s; tsvector search; midnight cron resets.
- Calls tenant (default branch, plan) + audit-log. **Doesn't consume `STOCK_CRITICAL_DISABLE`.**

### order-service (3004)
- Models: Order, KOT, OrderStatusHistory, CommissionRecord, DailyCounter.
- Order routes `/api/v1/orders`: `POST /` (staff), `POST /customer` (CUST), list/detail/status/cancel/bill/payment, `summary/daily` (`reports:view`), `table-bill/:t/:b/:table[/pay]`, `customer/table-bill/:table`, `customer/:t/:id/payment` (**dev stub for Razorpay**), `internal/add-line-item|remove-line-item` (IS — used by jukebox).
- KOT routes `/api/v1/kots`: list by branch, status, printer-ack, reject, `items/:item_id/status`.
- Logic (`order.service.ts` ~1050 lines): per-item GST incl/excl, CGST/SGST 50/50; KOT split kitchen/bar only for `seated_full_service`; KOT numbers via DailyCounter; ack modes auto (BullMQ `kot-auto-ack`) / kds / printer; stock deduction via catalogue recipes-bulk → inventory deduct; stale-order sweep at boot + midnight.
- Commission: rates free 3 / premium 2 / allinone 1.5 %, **but plan hardcoded `"free"`** (`order.service.ts:210`).
- Publishes: ORDER_CREATED, ORDER_STATUS_CHANGED, ORDER_COMPLETED, ORDER_ITEM_ADDED/REMOVED, ORDER_UNBILLED_ALERT, KOT_CREATED, KOT_STATUS_CHANGED, KOT_REJECTED, KOT_ITEM_REJECTED, KOT_PRINT_FAILED, PAYMENT_COMPLETED, TABLE_PAYMENT_COMPLETED.

### inventory-service (3005)
- Models: Ingredient (min/critical/max/reorder thresholds, avg cost), StockMovement (8 types), PurchaseOrder, DailyUsageSummary (unused).
- Routes `/api/v1/inventory`: `:t/:b/ingredients` CRUD + adjust + movements + check-duplicate; `:t/purchase-orders` + receive; internal: deduct, purchase-orders, receive, `ingredients/:id/receive` (weighted avg cost).
- Publishes STOCK_LOW, STOCK_CRITICAL, STOCK_CRITICAL_DISABLE (no consumer), ITEM_BACK_IN_STOCK.

### procurement-service (3013)
- Models (14): Vendor, VendorItem, VendorPreference, BidRequest, BidRequestVendor, Bid, VendorToken, DirectOrder, PurchaseOrder, POItem, GoodsReceivedNote, GRNItem, VendorBill, VendorPayment.
- Routes `/api/v1/procurement/:t/…`: vendors (+items, profile, ledger, preferred), bid-requests (+`for-ingredient`, open/close/ranked/award/vendors), direct-orders, purchase-orders (approve/send/cancel), **`grn`** (+complete → inventory sync), bills (due/overdue/approve/pay with 3-way match), market, spend/summary, auto-reorder; vendor TOK routes `/vendor/*` and `/portal/:token/*`.
- Bid score: price 40 / lead time 30 / rating 20 / payment terms 10. BullMQ `bid-auto-close`; `bid-recurrence` is a placeholder (TODO `src/index.ts:136`).
- Publishes BID_REQUEST_OPENED/CLOSED, BID_AWARDED.

### loyalty-service (3011)
- Models: CustomerLoyalty, CustomerOffer, CustomerVisit, LoyaltyConfig. Tiers silver/gold/platinum by **lifetime spend** (0 / ₹1000 / ₹5000).
- Routes `/api/v1/loyalty`: staff (customer lookup by id/mobile, notes, offers grant/apply/revoke, customers list), config (owner PATCH), customer (`:t/me`, `me/all`, history, offers), internal `award-points`, `redeem-points`.
- Subscribes ORDER_COMPLETED; crons: hourly offer expiry, 2-hourly expiring-soon, 06:00 birthdays; every 10th order → 15% offer.
- Publishes LOYALTY_POINTS_AWARDED, TIER_UPGRADED, MILESTONE_REACHED, BIRTHDAY_OFFER_GRANTED, OFFER_GRANTED, OFFER_EXPIRING_SOON (nobody consumes).

### jukebox-service (3014)
- Models: JukeboxConfig (one per tenant; price/song 2000 paise), JukeboxQueue, JukeboxHistory, Song (YouTube/Spotify catalogue).
- Routes `/api/v1/jukebox`: config + songs (+bulk via oEmbed) + search; `:t/:b/queue` add/status/cancel/history; player `pair` (6-digit code) + `next|finished|heartbeat` (X-Player-Token).
- Bills songs via order `internal/add-line-item`. Publishes JUKEBOX_SONG_STARTED/ENDED, JUKEBOX_QUEUE_UPDATED.

### ads-service (3015)
- Models: Advertiser, AdCampaign, AdCreative, AdImpression, AdClick, Mall, VenueAdRevenue.
- 7 placements: platform_home, order_tracking, post_checkout, social_room, explore_nearby, jukebox_queue, jukebox_player. **Never** on catalogue/cart/checkout/OTP/login/staff screens.
- Engine: plan→placements, active hours/days, Haversine geo, priority then CPM; 40/60 platform/venue revenue split; `daily_budget` not enforced.
- Routes `/api/v1/ads`: serve, click, explore, in-house, advertisers/campaigns/creatives, malls, analytics, revenue, `admin/overview` (IS).

### notification-service (3007)
- `/api/v1/notify/{email,sms,push,whatsapp,send,queue/status,otp/send,otp/verify}` — all IS.
- BullMQ `notifications` (3 tries, 1s/5s/30s). Channel router by event + business type (`shouldUseWhatsApp`).
- Subscribes ORDER_CREATED/COMPLETED, PAYMENT_COMPLETED, STOCK_LOW/CRITICAL, BID_REQUEST_OPENED, BID_AWARDED, DIRECT_ORDER_CREATED (never published).

### realtime-service (3008)
- Socket.io; auth accepts staff / customer / KDS JWTs. Auto-rooms: `tenant:{id}`, `tenant:{id}:owner|dashboard`, `tenant:{id}:branch:{bid}`, `kitchen:{t}:{b}:{kitchen|bar}`, `customer:{id}`, `order:{id}`. Allowed join prefixes: tenant, kitchen, session, customer, token, order.
- Subscribes to 21 Redis channels → socket events (`order:new`, `order:status:changed`, `kot:created`, `kot:status:changed`, `kot:ready`, `kot:rejected`, `kot:item:rejected`, `table:status:changed`, `inventory:low|critical`, `menu:item:available|unavailable`, `payment:completed`, `order:unbilled_alert`, `jukebox:now_playing|queue_updated|song_ended`, …).
- **`/social` namespace** (`src/social.ts`): table-level social room — presence, chat, DMs, reactions, polls, actions, announcements, bot; **trivia** (`src/trivia.ts`, 10 JSON packs). HTTP `GET /api/v1/social/:t/:b/active`.

### media-service (3010)
- `POST /api/v1/media/upload[/multiple]`, `DELETE /api/v1/media/:t/*`, `GET /api/v1/media/link-preview?url=`.
- Sharp → WebP thumb 150 / medium 600 / full 1200.

### packages/shared
- `constants/plans.ts` — **source of truth for plans** (see §7), `ADDONS`, `PLAN_FEATURES`.
- `constants/roles.ts` — 20 roles; `constants/permissions.ts` — 35 permissions + `PRESET_ROLE_PERMISSIONS`.
- `constants/events.ts` — only 11 events; most events (KOT_REJECTED, jukebox, loyalty, bid…) are raw strings in services.
- `types` — Staff/Customer(`customer_id`)/Kds/PinUnlock JWT payloads, `apiSuccess/apiError`.
- `utils` — currency, gst, planFeatures (`hasFeature`/`assertFeature`), slugify. `events/eventBus.ts` exists but services use their own ioredis clients. No shared auth middleware (each service has its own).

---

## 6. Frontend apps — reference

### apps/web — Staff POS (5173)
React 19, Vite 8, Tailwind 4, RTK (plain `fetch` via `lib/apiFetch.ts` — **no RTK Query** despite apps/CLAUDE.md).
Redux: `auth` (persisted `staff_auth`), `ui`. Socket via `hooks/useSocket.ts` (toasts).

| Route | Page | What it does |
|---|---|---|
| `/login`, `/register`, `/invite/:token` | Login, Register, InviteAccept | auth + multi-tenant picker; staff invite accept |
| `/onboard`, `/setup` | Onboard, Setup | 6-step wizard (dine-in only); post-onboarding checklist |
| `/floor-map` | FloorMap | zones, tables, sessions (open/confirm/bill/close) |
| `/new-order` | NewOrder | staff-placed dine-in/takeaway order |
| `/orders` | Orders | kanban pending/preparing/ready/served, checkout, table-bill, prepaid completion |
| `/catalogue` | Catalogue | sections, items, allergens, recipes, **combos** |
| `/reports` | Reports | daily summary (order-service), BarChart |
| `/staff` | Staff | team, invites, shifts, attendance, leaves, wages |
| `/inventory` | Inventory | ingredients, low stock, movements, "Get Quotes" → procurement |
| `/procurement` | Procurement | POs, GRN, bills, vendors, spend (Bids/Market tabs are placeholders) |
| `/reservations` | Reservations | CRUD by date |
| `/customers` | Customers | loyalty CRM + CustomerProfileModal |
| `/activity` | ActivityLog | audit log |
| `/settings` | Settings | Business, Branches (hardcoded), QR, **KDS** (uncommitted), Subscription, Promotions, Jukebox, billing mode |

Role gating (nav only — **no route-level guard**): everyone → Floor Map/Orders/Catalogue; Reports → owners or `reports:view`;
Reservations/Customers/Staff → managers; Inventory/Procurement/Settings → owners; Activity → owners + branch_manager.

### apps/customer-web — Customer PWA (5180)
React 19, Vite 8, Tailwind 4, vite-plugin-pwa. Redux `auth` (persisted `customer_auth`, no refresh), `cart` (not persisted).
Routes: `/` (Home or GuestLanding), `/place/:slug` (Catalogue + session + social overlay `?tab=social`), `/item/:id`, `/cart`, `/checkout` (pay_now / pay_later),
`/order/:id` (tracking), `/rewards` (loyalty), `/orders` (history from localStorage), `/explore` (geo ads).
Contexts: `SocialContext` (socket `/social`), `JukeboxContext`. Components: FloatingOrderTracker, MyProfilePanel (email OTP), ExploreDrawer, social/ (14 components), jukebox/, ads/.

### apps/kds (5177)
SetupScreen (6-digit pairing → `kds_config` in localStorage) → KdsScreen (socket room `kitchen:{t}:{b}:{station}`, sounds, per-item accept/reject — uncommitted).

### apps/vendor-portal (5176)
TanStack Query; token routes `/vendor/bid/:token/*`, `/vendor/order/:token/*`, `/vendor/portal/:token[/invoices|/catalog]`.

### apps/jukebox-player
Pairing → PlayerScreen (YouTube IFrame / Spotify embed, polls next/finished/heartbeat, rotating `jukebox_player` ads, QR).

---

## 7. Business rules (as implemented)

**Plans** (`packages/shared/src/constants/plans.ts`) — differ from CLAUDE.md:

| | free | premium | allinone |
|---|---|---|---|
| Price ₹/mo | 500 (₹0 first month) | 1000 | 2500 |
| Items / branches / staff | 200 / 1 / 5 | 500 / 3 / 20 | ∞ |
| Commission | 3% | 2% | 1.5% |
| Adds | — | jukebox, socialRoom, inventory, kds | + procurement, advertising, loyaltyTiers, customerCRM |

Add-ons: social_jukebox, inventory_procurement, customer_crm, advertising (₹500 = 50000 paise). Feature gates exist (`planGuard`, `hasFeature`) but are **not enforced** on routes.

**Order lifecycle (current, incl. uncommitted):** `pending → preparing → ready → served → completed` (+ `cancelled`). `confirmed` is being removed.
KDS accepts/rejects each item → all decided ⇒ KOT acknowledged/rejected; all KOTs rejected ⇒ order cancelled; all items ready ⇒ KOT ready ⇒ order ready.

**Table lifecycle:** `available → pending_confirmation → occupied → billed → available`; TableSession `pending_confirmation|open|billed|closed`.

**Billing modes:** `dine_in_billing_mode` pay_later (tab, staff bills at end) vs pay_now (prepaid; staff just completes).

**Event flow:** service → Redis Pub/Sub → realtime (sockets) / notification / loyalty. Cross-service HTTP uses `X-Internal-Secret`.

---

## 8. Uncommitted work in progress (as of 2026-10-27)

16 files, ~+1000/−180 — "per-item KOT accept/reject + KDS pairing UI":
- **order-service** — `setKotItemStatus()`, `KOT_ITEM_REJECTED`, `bumpOrderToPreparingFromKitchen`, 409 if staff jumps ahead of KDS, `confirmed` removed, repo `updateKOTStatusAndItems`.
- **tenant `kds.routes.ts`** — auth fix (`req.staff`), new devices list/unpair.
- **realtime** — `kot:item:rejected` to branch/owner/`order:{id}` rooms.
- **apps/kds** — per-item ✓/✕ with reason modal; **apps/web** Orders/FloorMap/NewOrder status changes; **customer-web** rejected-item card in tracking.
- **Settings KDS tab** — upstream `6363b3f` added a simpler `KdsTab`; merged by keeping the local `KDSTab` (branch picker, paired devices + unpair, pending codes) under upstream's "📺 KDS" label.
- Open question: when an order turns ready, code sets the table to `billed` — looks unintended.

---

## 9. Doc drift (docs vs code)

| Topic | Docs say | Code says |
|---|---|---|
| Plans | free/starter/pro, ₹0/999/2499 | free/premium/allinone, ₹500/1000/2500 |
| Service count | memory: 12 | 15 dirs, 12 implemented |
| loyalty, social room | "not started" | fully built |
| jukebox backend | not described | built (3014) |
| Ports | customer-web 5174, KDS 5175 | 5180, 5177 |
| Settings tabs | 5 | 7–8 |
| Orders kanban | pending/confirmed/preparing/ready | pending/preparing/ready/served |
| Procurement GRN path | `/grns` | `/grn` |
| Ads advertiser routes | IS-protected | unauthenticated |
| Frontend data layer | RTK Query + `baseQueryWithRefresh` | plain fetch |
| Shared middleware | `packages/shared/src/middleware/authenticate.ts` | not present; per-service |
| Gateway / prod | kong.yml, docker-compose.prod.yml | neither exists |
| Env var | `MONGO_URI` | `DATABASE_URL` (Postgres) |

---

## 10. Known bugs & risks (verified or high-confidence)

**Security**
1. inventory-service ingredient & purchase-order routes have **no auth**.
2. jukebox config/songs routes have **no auth**; customer token is decoded but not verified.
3. ads advertiser/campaign/mall/analytics routes are public.
4. media `checkAuth` accepts any `Bearer …` without verifying; link-preview SSRF guard misses 169.254.x / 0.0.0.0 / IPv6.
5. No `jwt.tenant_id === :tenant_id` check in tenant (staffHr, staffProfile, reservation, session, onboarding), loyalty staff routes, procurement.
6. apps/web hides pages only in nav — URLs reachable by any role.
7. Unpairing a KDS device doesn't revoke its 365-day JWT. Hardcoded fallback JWT secrets in jukebox/social.

**Correctness**
8. Commission always uses `free` rate (`order.service.ts:210`).
9. jukebox reads `payload.customerId` but JWT has `customer_id` (`jukebox.routes.ts:19`) → songs never billed, per-user limit and cancel ownership skipped.
10. procurement auto-reorder calls `/api/v1/notifications/whatsapp`; real path is `/api/v1/notify/whatsapp` (`autoReorder.service.ts:167`).
11. Loyalty: possible double award (subscriber + internal route, no order_id idempotency); signup bonus double-counts visits; `new_balance` double-counts.
12. `STOCK_CRITICAL_DISABLE` and `DIRECT_ORDER_CREATED` have no producer/consumer pair → auto-disable of items never happens.
13. Customer cart coupon is a mock that always rejects; GST hardcoded 5% in cart; cart not persisted.
14. `VITE_CUSTOMER_WEB_URL` defaults to 5174 (customer-web is 5180) — QR links wrong without env. (`VITE_KDS_URL` default fixed → 5177.)
15. ~~jukebox-player `--port 5177` collides with KDS~~ — fixed (now 5178).
16. loyalty-service Redis subscriber uses its subscriber connection for normal commands ("Connection in subscriber mode" errors).
17. Pre-existing TypeScript errors (runtime unaffected; `tsx` doesn't typecheck): web 18, customer-web 42, order 2, tenant 6.

**Not implemented:** Razorpay (payment is a dev stub), real SMS/WhatsApp/email/push sending, delivery, analytics, superadmin, mobile apps, Kong, prod compose, CI/CD.

---

## 11. Suggested next steps

1. Commit the per-item KOT work (decide on the table→`billed` behaviour first).
2. Security pass: auth on inventory/jukebox/ads/media, tenant-id guard middleware, route-level role guards in apps/web.
3. Fix quick bugs #8–#10, #14–#15.
4. Refresh PROGRESS.md + CLAUDE.md plan section from this index.
5. Then the roadmap: payments (Razorpay) → delivery-service → analytics-service → superadmin.
