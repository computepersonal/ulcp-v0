# PROGRESS.md

## Status

Last updated: 2026-04-28

---

## ✅ Phase 1 — Foundation (Complete)

### packages/shared
- `src/config/app.ts` — appConfig (env-driven, APP_NAME etc)
- `src/errors/index.ts` — AppError, ValidationError, AuthError, ForbiddenError, NotFoundError, ConflictError, PlanLimitError
- `src/types/index.ts` — StaffJwtPayload, CustomerJwtPayload, KdsJwtPayload, PinUnlockJwtPayload, ApiResponse, apiSuccess(), apiError()
- `src/constants/` — plans, events, permissions, roles (+ pending_onboarding)
- `src/utils/` — formatCurrency, toMinorUnits, calculateGst, slugify, planFeatures
- `src/events/eventBus.ts` — Redis Pub/Sub publish/subscribe
- `src/middleware/authenticate.ts` — JWT guard (used by all services)

### identity-service (port 3001)
- `POST /api/v1/auth/register` — tenant_id optional, defaults to pending_onboarding role
- `POST /api/v1/auth/login` — email + password + optional tenant_id; helpful error when tenant_id missing but user has one
- `POST /api/v1/auth/refresh` — silent token refresh
- `POST /api/v1/auth/logout` — JWT blacklist via Redis
- `GET  /api/v1/auth/me` — current user profile
- `PATCH /api/v1/auth/users/:id/tenant` — internal (X-Internal-Secret), called by tenant-service
- PIN unlock: short-lived token for shared tablet waiter flow
- JWT payload includes `name` field — used by audit log for actor attribution
- JWT: access 15min (memory) + refresh 30d (Redis, SHA-256 hashed)
- Prisma schema: User, RefreshToken, PlatformCustomer, OtpCode, KdsDevice, SecurityLog

### Infrastructure
- `docker-compose.yml` — postgres:16 (port **5433**) + redis:7 (port 6379)
- pnpm workspaces + Turborepo monorepo
- PostgreSQL schemas: identity, tenant, catalogue (all applied via `prisma db push`)

> **Note:** Local PostgreSQL occupies port 5432. Docker PostgreSQL runs on **5433**.
> All service `.env` files use `localhost:5433`.

---

## ✅ Phase 2 — Core Commerce (Complete)

### tenant-service (port 3002)
- **Tenant CRUD:** create, get, update, delete (`requireOwner` guard), list mine, QR generation
- **Owner flow:** register → POST /tenants → identity-service assigns tenant_id + promotes to tenant_owner
- **Tenant model:** name, slug, business_type (18 types), country, currency, timezone, address, city, state, pincode, phone, email, logo_url, cover_url, gst config, chain config, plan
- **Branches:** CRUD, is_primary tracking, plan limit enforcement (PLAN_BRANCH_LIMITS)
- **Staff:** invite (token, 48hr expiry), accept invite, list, update role/permissions, deactivate
- **Partners:** invite, accept, update permissions (revenue/branches/financial visibility etc), remove
- **Tables:** CRUD per branch, QR code generation (base64 data URL; @unique removed — btree limit); `is_active` field for disabling individual tables for service
- **Floor map Sections:** CRUD per branch, color + position; `POST /:id/rename` atomically renames section + all prefixed tables in a single Prisma `$transaction`
- **Audit Log:** AuditLog model (id, tenant_id, branch_id, actor_id, actor_name, actor_role, action, entity_type, entity_id, entity_name, metadata, created_at) with 5 DB indexes; `createAuditLog()` + `listAuditLogs()` with pagination/filter; `GET /:tenant_id/audit-logs` route (role-gated); table + section routes emit audit events fire-and-forget on every write operation
- **Plan enforcement:** PLAN_ITEM_LIMITS, PLAN_BRANCH_LIMITS, PLAN_STAFF_LIMITS
- **Onboarding wizard:** 6-step state persistence, server-side resume, Zod validation per step, step ordering enforced, completeOnboarding() validates prereqs
- **Setup tasks (post-onboarding):** `setup_tasks` JSONB field on Tenant (server-persisted), GET/PATCH endpoints, replaces localStorage-based checklist
- **Subscription:** updateTenantPlan, transfer ownership
- **Zod errors:** include field path (e.g. "website: Invalid url")

### catalogue-service (port 3003)
- **Sections:** CRUD, reorder (bulk position), branch-scoped or tenant-wide (branch_id null)
- **Items:** full CRUD with:
  - Basic: name, description, sku, images[], mrp, price, offer_price, offer_valid_till, unit
  - Variants: has_variants, variants[] (JSON)
  - Attributes: attributes[] (JSON) — size, color, etc.
  - Stock: track_stock, stock, low_stock_alert
  - Availability: is_available, unavailable_reason, availability_type (temporary/permanent)
  - Food classification: veg_type (veg/vegan/non_veg/egg), meal_type, item_type, course
  - Nutrition/media: prep_time_mins, calories, video_url
  - Rating: rating (Float), rating_count (cached from reviews)
  - Flags: is_food, is_daily_special
  - Today price override (resets midnight via cron)
- **Option Groups:** customizations per item (e.g. "Egg Type" with choices + add_on_price, is_required, min/max_select)
- **Addon Groups:** tenant-level reusable add-ons linked to items via junction table
- **Combos:** bundle deals (A+B at special price), validity dates, branch scoping
- **Ingredients (recipe system):** allergens[], calories, is_critical, ingredient_id (cross-service ref to inventory-service), quantity, unit
  - `POST   /api/v1/catalogue/:tenant_id/items/:item_id/ingredients` — add ingredient to recipe
  - `GET    /api/v1/catalogue/:tenant_id/items/:item_id/ingredients` — list item recipe
  - `PATCH  /api/v1/catalogue/:tenant_id/items/:item_id/ingredients/:ingredient_id` — update qty/unit
  - `DELETE /api/v1/catalogue/:tenant_id/items/:item_id/ingredients/:ingredient_id` — remove from recipe
- **Toggle availability:** temporary (midnight reset) or permanent, with reason
- **Price override:** today only, resets at midnight
- **Reorder:** bulk sort_order update for items + sections
- **Public catalogue:** `GET /:tenant_id/:branch_id/public` — sections + items (with options/addons/ingredients) + combos
- **Three contexts:** customer (hide disabled) | staff_order (show greyed) | staff_edit (full controls)
- **Redis cache:** key `catalogue:{tenant_id}:{branch_id}`, TTL 300s, pattern-deleted on any write
- **Full-text search:** PostgreSQL tsvector + GIN index (idempotent boot migration), `GET /search?q=`
- **Plan limits:** item count per plan (free=200, starter=500, pro=∞)
- **Default branch:** GET /items without branch_id resolves to is_primary branch (30min Redis cache)
- **Midnight cron:** re-enable temporary disabled items, clear daily specials, clear price overrides
- **Error handling:** Prisma P2025 → 400 with cause message, P2002 → 409

---

## ✅ order-service (port 3004) — Complete

- **Models:** Order, KOT, OrderStatusHistory, CommissionRecord, DailyCounter
- **Order routes:**
  - `POST   /api/v1/orders/` — place order (bill calc, KOT generation, Redis events)
  - `GET    /api/v1/orders/:tenant_id` — list orders (filter by branch/status/type/date, comma-separated status)
  - `GET    /api/v1/orders/:tenant_id/:id` — order detail
  - `PATCH  /api/v1/orders/:tenant_id/:id/status` — update status (triggers commission on completed)
  - `POST   /api/v1/orders/:tenant_id/:id/cancel` — cancel with role-based rules
  - `GET    /api/v1/orders/:tenant_id/:id/bill` — bill summary
  - `POST   /api/v1/orders/:tenant_id/:id/payment` — record payment + completes order lifecycle (status→completed, commission, events)
  - `GET    /api/v1/orders/:tenant_id/summary/daily` — daily report (revenue, orders, top items, payment breakdown, unbilled, active) — **requires reports:view permission**
- **KOT routes:**
  - `GET    /api/v1/kots/:tenant_id/:branch_id` — list KOTs for branch (filter by status)
  - `PATCH  /api/v1/kots/:tenant_id/:id/status` — update KOT status (acknowledged routes through acknowledgeKot())
  - `POST   /api/v1/kots/:tenant_id/:id/printer-ack` — printer confirms print job
  - `PATCH  /api/v1/kots/:tenant_id/:id/items/:item_id/status` — update individual item status
  - `POST   /api/v1/kots/:tenant_id/:id/reject` — kitchen rejects KOT; if all KOTs rejected → order auto-cancelled
- **KOT numbering:** sequential per branch per day (KOT-001...) via DailyCounter atomic upsert, resets naturally at midnight
- **KOT auto-split:** `seated_full_service` → food→kitchen KOT, drink→bar KOT; all others → single kitchen KOT
- **KOT reject flow:** POST /reject updates status → "rejected", publishes KOT_REJECTED event; `allKotsRejected()` auto-cancels order if all KOTs rejected
- **GST calculation:** inclusive (extract tax) + exclusive (add tax), CGST+SGST split
- **Commission:** calculated on order.completed — `Math.round((total × rate) / 100)` paise, stored in CommissionRecord
- **Three KOT ack modes** (configured per tenant):
  - `auto` — BullMQ delayed job after `kot_ack_delay_secs` (default 60s)
  - `kds` — manual PATCH status to "acknowledged"
  - `printer` — POST printer-ack on successful print; KOT stays pending on failure
  - All funnel through `acknowledgeKot()` — idempotent, cancels pending BullMQ job
- **kot_ack_mode fetched** from tenant-service at order placement (cached 30min)
- **requirePermission(permission)** middleware — owner roles (tenant_owner, managing_partner etc.) bypass all checks; others verified against JWT permissions[]
- **Stale order sweep** — runs on startup + midnight cron: pending→silent cancel ("never accepted"); confirmed/preparing/ready→ORDER_UNBILLED_ALERT event
- **Redis events:** ORDER_CREATED, ORDER_STATUS_CHANGED, ORDER_COMPLETED, KOT_STATUS_CHANGED, PAYMENT_COMPLETED, KOT_PRINT_FAILED, KOT_REJECTED, ORDER_UNBILLED_ALERT
- **Swagger body schemas:** all POST/PATCH routes show body form in /docs
- **BullMQ worker** started in index.ts with graceful shutdown via stopWorker()

> **Infrastructure note:** Docker Redis moved to port **6380** (local Redis 3.0 on 6379 incompatible with BullMQ which requires Redis ≥ 5.0). All `.env` files updated to `redis://localhost:6380`.

---

## ✅ procurement-service (port 3013) — Complete (ERP Phase 1)

- **Prisma schema (ERP v1 — `procurement-erp-v1`):**
  - Original models: Vendor (extended), VendorItem, VendorPreference, BidRequest, BidRequestVendor, Bid, VendorToken, DirectOrder
  - **New ERP models:** PurchaseOrder, POItem, GoodsReceivedNote, GRNItem, VendorBill, VendorPayment
  - **New enums:** VendorStatus, POStatus, GRNStatus, BillStatus, PaymentMethod
  - **Vendor model extended** with: pan, bank_account, bank_ifsc, bank_name, preferred_items[], credit_days, credit_limit, outstanding_balance, total_orders, total_spent, status (VendorStatus), documents (Json)
  - Unique constraints: `@@unique([tenant_id, po_number])`, `@@unique([tenant_id, grn_number])`, `@@unique([tenant_id, internal_ref])`, `@@unique([tenant_id, vendor_id, bill_number])`, `@@unique([tenant_id, payment_number])`
  - Numbered IDs per tenant: PO-YYYY-MM-XXXX, GRN-YYYY-MM-XXXX, BILL-YYYY-MM-XXXX, PAY-YYYY-MM-XXXX (4-digit zero-padded)
- **Vendor routes:**
  - `POST/GET  /api/v1/procurement/:tenant_id/vendors` — create, list vendors
  - `GET/PATCH/DELETE /api/v1/procurement/:tenant_id/vendors/:id` — detail, update, delete
  - `POST/GET  /api/v1/procurement/:tenant_id/vendors/:id/items` — add/list vendor items
  - `PATCH/DELETE /:tenant_id/vendors/:id/items/:item_id` — update/remove vendor item
  - `POST/GET/DELETE /:tenant_id/preferences` — vendor preferences per ingredient
- **Bid request routes:**
  - `POST/GET  /api/v1/procurement/:tenant_id/bid-requests` — create, list bid requests
  - `GET/PATCH/DELETE /:tenant_id/bid-requests/:id` — detail, update, delete (draft only)
  - `POST /:tenant_id/bid-requests/:id/open` — open for bidding, creates vendor tokens, schedules auto-close
  - `POST /:tenant_id/bid-requests/:id/close` — manually close
  - `GET  /:tenant_id/bid-requests/:id/bids/ranked` — ranked bids with score
  - `POST /:tenant_id/bid-requests/:id/award/:bid_id` — award bid, creates PO in inventory-service
  - `POST /:tenant_id/bid-requests/:id/invite` — invite additional vendors
- **Direct order routes:**
  - `POST/GET  /api/v1/procurement/:tenant_id/direct-orders` — create, list direct orders
  - `GET/DELETE /:tenant_id/direct-orders/:id` — detail, cancel
  - `PATCH /:tenant_id/direct-orders/:id/status` — update status (confirmed/dispatched/delivered/cancelled)
- **Market view routes:**
  - `GET /api/v1/procurement/:tenant_id/market` — all vendors grouped by ingredient, recommended vendor, 15min Redis cache
  - `GET /api/v1/procurement/:tenant_id/market/:ingredient_id/history` — price history (last 5 delivered orders per vendor)
- **Vendor-facing (no JWT — token-based):**
  - `GET  /api/v1/procurement/vendor/bid-request/:token` — view bid request details
  - `POST /api/v1/procurement/vendor/bid-request/:token/bid` — submit bid (marks token used)
  - `PATCH /api/v1/procurement/vendor/bid/:bid_id/withdraw` — withdraw bid
  - `GET  /api/v1/procurement/vendor/order/:token` — view direct order
  - `POST /api/v1/procurement/vendor/order/:token/respond` — accept/decline direct order
- **Bid ranking algorithm:** weighted score (price 40%, lead_time 30%, rating 20%, payment_terms 10%)
- **BullMQ:** bid auto-close queue (delayed job at bid_close_at), bid recurrence queue (repeating job)
- **Redis events:** BID_REQUEST_OPENED, BID_AWARDED, DIRECT_ORDER_CREATED
- **Internal service calls:** inventory-service for PurchaseOrder creation on bid award + direct order delivery
- **Purchase Order routes** (ERP Phase 1):
  - `POST /api/v1/procurement/:tenant_id/purchase-orders` — create PO (line totals, tax, delivery, discount → total_amount)
  - `GET  /api/v1/procurement/:tenant_id/purchase-orders` — list with filters (status, vendor_id, branch_id, from/to)
  - `GET  /api/v1/procurement/:tenant_id/purchase-orders/:po_id` — detail with items
  - `PATCH /api/v1/procurement/:tenant_id/purchase-orders/:po_id/approve` — only draft/pending_approval
  - `PATCH /api/v1/procurement/:tenant_id/purchase-orders/:po_id/send` — only approved
  - `PATCH /api/v1/procurement/:tenant_id/purchase-orders/:po_id/cancel`
- **Goods Received Note (GRN) routes:**
  - `POST /api/v1/procurement/:tenant_id/grns` — create draft (validates PO not cancelled/received)
  - `GET  /api/v1/procurement/:tenant_id/grns` + `GET /:grn_id` — list/detail
  - `POST /api/v1/procurement/:tenant_id/grns/:grn_id/complete` — **GRN → Inventory sync**: pushes each line to inventory `PATCH /internal/ingredients/:id/receive`, increments po_item.received_quantity, recomputes PO status (allReceived→received, anyReceived→partial), increments vendor.total_orders + total_spent
- **Vendor Bills routes:**
  - `POST /api/v1/procurement/:tenant_id/bills` — create with **3-way match**: if PO+GRN provided, calls `performThreeWayMatch(po, grn, bill_items)` comparing qty triplets; mismatched + override_match=false returns 400; overridden sets three_way_match_status="overridden"; on success increments vendor.outstanding_balance
  - `GET  /api/v1/procurement/:tenant_id/bills` — list with filters (status, vendor_id, due_within_days)
  - `GET  /api/v1/procurement/:tenant_id/bills/due` (default 7 days)
  - `GET  /api/v1/procurement/:tenant_id/bills/overdue` — lazy updates status to overdue
  - `POST /api/v1/procurement/:tenant_id/bills/:bill_id/pay` — records VendorPayment in `prisma.$transaction`: creates payment, updates bill (amount_paid, amount_due, status: partially_paid/paid), decrements vendor.outstanding_balance
- **Spend Report:**
  - `GET /api/v1/procurement/:tenant_id/spend/summary?from=&to=` — total_billed, total_paid, outstanding, open_purchase_orders, top_vendors (top 10), spend_by_category (parsed bill items)
- **Auto-reorder:**
  - `POST /api/v1/procurement/:tenant_id/auto-reorder/trigger` (staff)
  - `POST /api/v1/procurement/internal/auto-reorder` (X-Internal-Secret)
  - Strategy: stock<min → preferred vendor + vendor_item exists → direct PO (source="auto_reorder") | otherwise → 4hr bid request + invites all vendors with vendor_items + WhatsApp notify via notification-service
- **Vendor Portal routes** (token-based, `prefix: /api/v1/procurement/portal`):
  - `GET/PATCH /:token/me` — my profile (resolveVendorFromToken via VendorToken table)
  - `GET /:token/invoices` — bills + totals
  - `GET/POST /:token/catalog` + `PATCH/DELETE /:token/catalog/:item_id` — vendor's catalog items (VendorItem CRUD)
  - `GET /:token/orders` — direct orders + purchase orders
- **Inventory cross-service sync:**
  - **inventory-service:** new `PATCH /api/v1/inventory/internal/ingredients/:id/receive` (X-Internal-Secret) — calls `adjustStock(quantity, "purchase")`, computes rolling weighted average `newAvg = (oldAvg * oldStock + unit_cost * quantity) / newStock`, updates last_purchase_price + unit_cost + average_cost; returns `{ingredient_id, current_stock, average_cost, last_purchase_price}`

## ✅ apps/vendor-portal — Complete

- **React 18 + Vite + Tailwind CSS + TanStack Query v5**
- **Running on port 5176**
- **Screens:**
  - `BidLanding` — view bid request details, items table, deadline countdown, recurrence badge
  - `BidSubmit` — per-item pricing, delivery toggle, terms, grand total calc, confirm modal
  - `BidConfirmed` — success state, bid summary, withdraw button with confirmation modal
  - `BidResult` — awarded vs rejected result notification with next steps
  - `DirectOrderView` — view direct order items, accept with delivery date or decline with reason
  - `DirectOrderDone` — post-response confirmation screen
  - **Portal screens (ERP Phase 1):**
    - `MyProfile` (`/vendor/portal/:token`) — vendor stats card (rating, total_orders, total_earned, outstanding) + 3 sections (Contact, Address, Tax & Banking) with editable fields, Save button
    - `MyInvoices` (`/vendor/portal/:token/invoices`) — totals (billed/paid/outstanding) + bills table with status pills; exports `PortalNav` shared by all 3 portal pages
    - `MyCatalog` (`/vendor/portal/:token/catalog`) — items table + Add/Edit modals (ingredient_id, name, unit, unit_price, min_order_quantity, lead_time_days, is_available)
- **Token-based auth** — no login required, magic links via URL token param
- **All amounts:** API in paise, display in ₹
- **TypeScript compiles clean** (strict mode, noUnusedLocals/Params)

---

## ✅ inventory-service (port 3005) — Complete

- **Prisma schema:** Ingredient, StockMovement, PurchaseOrder, DailyUsageSummary
- **Ingredient routes:**
  - `GET    /api/v1/inventory/:tenant_id/:branch_id/ingredients` — list (filter by category, search, low_stock)
  - `GET    /api/v1/inventory/:tenant_id/:branch_id/ingredients/:id` — detail
  - `POST   /api/v1/inventory/:tenant_id/:branch_id/ingredients` — create
  - `PATCH  /api/v1/inventory/:tenant_id/:branch_id/ingredients/:id` — update
  - `DELETE /api/v1/inventory/:tenant_id/:branch_id/ingredients/:id` — soft-delete
  - `POST   /api/v1/inventory/:tenant_id/:branch_id/ingredients/:id/adjust` — manual stock adjustment
  - `GET    /api/v1/inventory/:tenant_id/:branch_id/ingredients/:id/movements` — stock movement history
- **Purchase order routes:**
  - `GET    /api/v1/inventory/:tenant_id/purchase-orders` — list (filter by branch, status)
  - `GET    /api/v1/inventory/:tenant_id/purchase-orders/:id` — detail
  - `POST   /api/v1/inventory/:tenant_id/purchase-orders` — create
  - `PATCH  /api/v1/inventory/:tenant_id/purchase-orders/:id` — update status/notes
  - `POST   /api/v1/inventory/:tenant_id/purchase-orders/:id/receive` — mark received + add stock
- **Internal routes (X-Internal-Secret):**
  - `POST /api/v1/inventory/internal/deduct` — called by order-service when order→preparing
  - `POST /api/v1/inventory/internal/purchase-orders` — called by procurement-service on bid award
  - `POST /api/v1/inventory/internal/purchase-orders/:id/receive` — called by procurement-service on direct order delivered
  - `PATCH /api/v1/inventory/internal/ingredients/:id/receive` — called by procurement-service GRN complete; adjusts stock + rolling weighted average cost + last_purchase_price
- **Stock service:** `deductStockForOrder()` deducts per item, checks thresholds, publishes STOCK_LOW / STOCK_CRITICAL / STOCK_CRITICAL_DISABLE / ITEM_BACK_IN_STOCK events
- **receiveStock():** adds stock, updates average cost, publishes ITEM_BACK_IN_STOCK if restocked past critical threshold
- **PO numbering:** PO-YYYY-XXXX sequential per tenant per year
- **Movement types:** purchase, order_deduct, manual_add, manual_remove, waste, transfer_in, transfer_out, opening

---

## ✅ notification-service (port 3007) — Complete

- **BullMQ queue** "notifications" — 3 retries, custom exponential backoff (1s/5s/30s)
- **4 channels:** email (SendGrid), SMS (MSG91), push (Firebase FCM), WhatsApp (Interakt)
  - All run in dev mode (log only) when API keys not set or DEV_MODE=true
  - Template rendering: `{{key}}` placeholder replacement in all channels
- **OTP service:**
  - `sendOtp()` — rate limited (3/hr per phone, Redis INCR), SHA-256 hash stored, 5min TTL
  - `verifyOtp()` — max 5 attempts, `crypto.timingSafeEqual()` for constant-time comparison
  - DEV_MODE: OTP logged to console so you can test without SMS API
- **Router service:** `getChannelsForEvent(event, businessType)` — correct channels per event
  - `shouldUseWhatsApp(businessType)` — true for home_kitchen, cloud_kitchen, food_truck, gated_community, catering, kirana, boutique, nursery, pharmacy, handicrafts, bakery, stationery
- **Redis pub/sub subscriber** (dedicated connection): handles ORDER_CREATED, ORDER_COMPLETED, PAYMENT_COMPLETED, STOCK_LOW, STOCK_CRITICAL, BID_REQUEST_OPENED, BID_AWARDED, DIRECT_ORDER_CREATED
- **HTTP routes** (all require X-Internal-Secret):
  - `POST /api/v1/notify/email|sms|push|whatsapp` — queue specific channel job
  - `POST /api/v1/notify/send` — smart router (auto-picks channels by event + business_type)
  - `GET  /api/v1/notify/queue/status` — BullMQ stats (waiting/active/completed/failed/delayed)
  - `POST /api/v1/notify/otp/send` — send OTP (rate-limited)
  - `POST /api/v1/notify/otp/verify` — verify OTP (max 5 attempts)
- Swagger at `/docs`, health at `/health`
- Dockerfile created for container deployment

---

## ✅ realtime-service (port 3008) — Complete

- **Socket.io** (v4) attached to Fastify's underlying HTTP server (post-`listen()`)
- **JWT auth middleware** — verifies Bearer token on every socket connection
- **Auto-join rooms** on connect based on JWT payload:
  - All staff → `tenant:{id}`, owners/managing_partners → `tenant:{id}:owner` + `tenant:{id}:dashboard`
  - Branch staff → `tenant:{id}:branch:{bid}`
  - Kitchen roles (head_chef, sous_chef, line_cook, kitchen_helper) → `kitchen:{id}:{bid}:kitchen`
  - Bartenders → `kitchen:{id}:{bid}:bar`
  - Customers → `customer:{id}`
- **Client events:** `join:room`, `leave:room`, `ping` (returns pong)
- **Room validation:** only prefixes: tenant:, kitchen:, session:, customer:, token: are allowed
- **Redis pub/sub subscriber** (dedicated connection): subscribes to all 15 event channels:
  - ORDER_CREATED → `order:new`, ORDER_STATUS_CHANGED → `order:status:changed`, ORDER_COMPLETED → `order:completed`
  - KOT_CREATED → `kot:created` (routes to kitchen or bar by station), KOT_STATUS_CHANGED → `kot:status:changed` + `kot:ready` (if ready)
  - TABLE_STATUS_CHANGED/TABLE_CLOSED → `table:status:changed`
  - STOCK_LOW → `inventory:low` (owner room), STOCK_CRITICAL → `inventory:critical` (tenant room)
  - ITEM_BACK_IN_STOCK → `menu:item:available`, MENU_ITEM_UNAVAILABLE → `menu:item:unavailable`
  - DASHBOARD_UPDATE → `dashboard:update`, TOKEN_DISPLAY_UPDATE → `token:update`
  - PAYMENT_COMPLETED → `payment:completed`, TENANT_PLAN_CHANGED → `tenant:plan:changed`
  - KOT_REJECTED → `kot:rejected` (branch room — notifies floor staff + owner)
  - ORDER_UNBILLED_ALERT → `order:unbilled:alert` (owner room — stale confirmed/preparing/ready orders)
- **HTTP routes:**
  - `GET /health` — includes live `connections` count
  - `GET /api/v1/realtime/stats` — total connections + room list with sizes + uptime
  - `POST /api/v1/realtime/broadcast` (X-Internal-Secret) — manual broadcast to any room
- Swagger at `/docs`
- Dockerfile created

---

## ✅ media-service (port 3010) — Complete

- **Image processing:** Sharp — 3 WebP sizes per upload:
  - thumb: 150×150 cover, quality 80
  - medium: 600×600 inside, quality 85
  - full: 1200×1200 inside, quality 90
- **Supported formats:** JPEG, JPG, PNG, WebP, GIF
- **Max file size:** 10MB
- **Storage:**
  - DEV_MODE=true → local disk at `uploads/{tenant_id}/{uuid}-{size}.webp`, served via @fastify/static
  - Prod → Cloudflare R2 via @aws-sdk/client-s3 (endpoint: `{account_id}.r2.cloudflarestorage.com`)
- **HTTP routes** (require X-Internal-Secret or Bearer JWT):
  - `POST /api/v1/media/upload` — single file upload, returns thumb/medium/full URLs + key
  - `POST /api/v1/media/upload/multiple` — up to 5 files, returns array
  - `DELETE /api/v1/media/:tenant_id/*` — deletes all 3 size variants
  - `GET /uploads/:tenant_id/:filename` — serves local files (dev only, @fastify/static)
- Multipart via @fastify/multipart (stream-based, no temp files for single upload)
- Redis connected (available for rate limiting)
- Swagger at `/docs`, health at `/health` (shows storage: "local" or "cloudflare-r2")
- Dockerfile created (with vips/libvips for Alpine)

---

## ✅ Phase 4 — Frontend Apps (Complete)

### apps/kds — Kitchen Display System (port 5175)
- React 18 + Vite + TypeScript + Tailwind CSS (v3)
- **SetupScreen:** 6-digit code entry, POSTs to tenant-service `/kds/verify-setup-code`, saves config to localStorage
- **KdsScreen:** Full KDS display
  - Fetches active KOTs from order-service on mount
  - Socket.io connection to realtime-service (room: `kitchen:{tenant}:{branch}:{station}`)
  - Live clock (1s update), elapsed time (30s update per card)
  - Card colors: white < 70% target → blue < 100% → orange < 150% → red+pulse overdue
  - Per-item status toggle (tap row to cycle pending→preparing→ready)
  - ACKNOWLEDGE / ALL READY / SERVED / **REJECT** action buttons
  - REJECT button — PATCHes `/kots/:tenant_id/:id/reject`, removes card from view
  - SERVED removes card with animation
  - Web Audio API tones: newKot (3-note ascending), overdue (2-note descending), allClear (single tone)
  - Settings overlay (3s long-press gear icon): sound toggle, target time, Reset Device, Reload
  - Empty state "All clear!" with allClear sound
  - **ErrorBoundary** wraps the full KDS screen — crash shows "KDS Error" message with Reload button instead of blank screen
- **TypeScript:** strict, clean compile (noUnusedLocals + noUnusedParameters)

### apps/customer-web — Customer PWA (port 5174)
- React 19 + Vite v8 + TypeScript + Tailwind CSS v4 (`@tailwindcss/vite` plugin, CSS-first config)
- **vite-plugin-pwa:** autoUpdate, manifest, service worker with StaleWhileRevalidate for catalogue + CacheFirst for images
- **Redux:** auth slice (OTP token + customer profile, localStorage persist) + cart slice (multi-tenant clear)
- **Ad components** (`src/components/ads/`):
  - `useAds(ctx)` — React hook, fetches from ads-service, AbortController cleanup, fails silently
  - `NativeAdCard` — IntersectionObserver impression (1s at 50% visibility), brand color left border, dismissable
  - `ExploreAdCard` (`FeaturedAdCard` + `StandardAdCard`) — geo-aware cards with distance badge
  - `PreRollAd` — full-screen overlay, countdown timer, skip button after `skip_after_secs`, auto-complete
- **Screens:**
  - `Home` — greeting, saved places horizontal scroll (from localStorage), business type chips, bottom nav
  - `Catalogue` — fetches tenant by slug → fetches public catalogue, section collapse, veg filter, ADD button, FloatingCart, auto-saves to saved_places
  - `ItemDetail` — full image, variants selector, option groups, special instructions, sticky add to cart
  - `Cart` — qty controls, coupon (mock reject), bill summary (subtotal + 5% GST), OTP modal trigger
  - `Checkout` — UPI/Card/COD selection, POST to order-service; on success shows **post-checkout success screen** (🎉 Order Confirmed! + 3 `post_checkout` NativeAdCards horizontal scroll + "Track My Order →" button)
  - `OrderTracking` — vertical timeline steps, Socket.io live order:status:changed, **`order_tracking` NativeAdCard** shown below steps
  - `Explore` — `navigator.geolocation` on mount, fetches `GET /api/v1/ads/explore?lat=&lng=&limit=20`, renders up to 2 `FeaturedAdCard` + `StandardAdCard` list; added to React Router at `/explore`
- **OtpModal:** phone → 6-digit input, 45s resend countdown, sets Redux auth on success
- **FloatingCart:** fixed above bottom nav, bounce on add, hidden when cart empty
- **Ad placement policy enforced:** NEVER on catalogue/cart/checkout form/OTP/login; ONLY on 7 specific approved placements
- **TypeScript:** strict, clean compile

### apps/web — Staff POS (port 5173)
- React 19 + Vite v8 + TypeScript + Tailwind CSS v4
- **Redux:** auth slice (staff JWT + user profile + `permissions: string[]`) + ui slice (notifications + sidebar)
- **`apiFetch` wrapper:** auto-attaches `Authorization: Bearer <token>` from Redux store to all fetch calls
- **Layout:** 64px collapsed / 240px hover sidebar (lucide-react icons), top bar with branch info, `<Outlet />` routing
  - **Permission-gated Reports nav:** `canViewReports(user)` helper — owner roles bypass check, others need `reports:view` in JWT `permissions[]`; Reports link hidden from cashier/waiter/etc.
  - **Activity Log nav** — shown to tenant_owner, managing_partner, branch_manager, operations_partner, reports_analyst only
- **ProtectedRoute:** redirects to /login if no token; gates on `onboardingCompleted === false` → redirects to /onboard
- **Onboarding gate:** Login checks onboarding state after auth; ProtectedRoute enforces it; Layout shows amber setup banner until setup tasks done
- **ToastContainer:** fixed top-right, auto-dismiss 4s, info/success/warning/error colors
- **useSocket hook:** Socket.io connects on login, dispatches toasts for order:new, kot:ready, inventory:critical
- **Screens:**
  - `Login` — email + password + optional tenant_id, POSTs to identity-service; `permissions[]` captured from JWT and stored in Redux
  - `FloorMap` — stats bar, section tabs with ··· zone management menu (fixed-position dropdown), table grid (color coded), right panel detail + actions
    - **Zone management:** add zone, rename (cascades to table names via atomic backend), delete (tables move to general floor), disable/enable (orange banner, blocks Open Table)
    - **Table management:** delete with sequential zone renumber, move between zones (renumbers source zone), disable/enable individual tables for service, table card shows orange "table closed" when inactive
    - Uses real tenant-service API throughout (no demo fallback)
  - `ActivityLog` — paginated audit log (25/page), filter by entity type (Tables/Zones/Reservations), date picker, action badge with color coding (green=created, red=deleted, blue=changed, purple=moved), actor name + role, relative + absolute timestamps
  - `Orders` — 4-column Kanban (pending/confirmed/preparing/ready), live via Socket.io `order:new` + `order:status:changed`, PATCH status via order-service, optimistic update, demo data fallback
  - `Catalogue` — add section modal, add item modal (name, price, description, section assignment, food/veg classification), availability toggle per item (real PATCH to catalogue-service), section hide/show/rename/delete, delete item with confirm; empty state with action buttons
  - `Reports` — fetches real daily summary from order-service `/orders/:tenant_id/summary/daily`, date tabs, metric cards, Recharts LineChart (revenue trend), top items table, PDF/Excel export buttons
  - `Staff` — table with status badges, Invite Staff modal (email + role)
  - `Procurement` — 7 tabs (ERP Phase 1 rewrite): **Purchase Orders** (POTab — list, approve, send, cancel), **Receiving (GRN)** (GRNTab + ReceiveModal — create draft, complete to trigger inventory sync), **Bills** (BillsTab — filter all/due/overdue, approve, PayModal records VendorPayment with method + ref), **Vendors** (enhanced VendorsTab — GSTIN, orders, total_spent, outstanding, rating, status), **Spend Report** (SpendTab — top vendors, spend_by_category), **Bids** + **Market** (existing). All tabs hit `${procurementUrl}/api/v1/procurement/${tenant}/...`. StatusPill maps all enum values (POStatus / GRNStatus / BillStatus / VendorStatus) to colored badges
  - `Settings` — 5 tabs: Business (profile from Redux), Branches, QR Codes (placeholder grid), Subscription (plan usage meters + upgrade), **Promotions** (in-house ad campaigns — list, create, pause/activate)
- **TypeScript:** strict, clean compile

---

---

## ✅ apps/jukebox-player (port 5177) — Complete

- React 18 + Vite + TypeScript + Tailwind CSS
- **Screens:** PlayerScreen (now-playing, queue, QR tip code)
- **Ad zone** (right column, below QR code):
  - `useJukeboxAds(tenant_id, branch_id)` hook — fetches `placement=jukebox_player&limit=5`
  - Rotates through ads every 30 seconds via `setInterval`
  - Refreshes from API every 10 minutes
  - Shows: ad image, advertiser name, headline with brand-color left border
- **vite.config.ts** — configured for port 5177

---

## ✅ ads-service (port 3015) — Complete

- **Prisma schema:** Advertiser, AdCampaign, AdCreative, AdImpression, AdClick, Mall, VenueAdRevenue
- **Enums:** AdvertiserType (external/in_house/mall_operator), AdPlan (starter/growth/premium/mall_package), CampaignStatus, CampaignType, PricingModel, AdFormat (banner/native/video/pre_roll/explore_card)
- **7 valid placements:** `platform_home`, `order_tracking`, `post_checkout`, `social_room`, `explore_nearby`, `jukebox_queue`, `jukebox_player`
- **Ad engine (`ad-engine.service.ts`):**
  - `getAdsForContext(ctx)` — validates placement, queries active campaigns, filters by active_hours/active_days, plan-gated placements (starter→explore_nearby only; premium/mall→all), geo-filter via Haversine, sorts priority DESC + cpm_rate DESC
  - `recordImpression()` — computes platform_share_pct / venue_share_pct split, upserts VenueAdRevenue monthly aggregate
  - `recordClick()` — records click with revenue split, returns creative cta_url
  - `PLAN_PLACEMENTS` map: starter→[explore_nearby], growth→[explore, post_checkout, order_tracking], premium/mall→all
  - Priority: in_house=10, mall_package=9, premium=8, growth=6, starter=4
- **Routes** (all under `/api/v1/ads`):
  - `GET  /serve?placement=&tenant_id=&branch_id=&customer_id=&format=&limit=` — serves ads, fires recordImpression() async
  - `POST /click` — records click, returns `{ redirect_url }`
  - `GET  /explore?lat=&lng=&limit=` — geo-sorted explore_nearby ads (FeaturedAdCard if priority≥8, StandardAdCard otherwise)
  - **In-house routes** (tenant-scoped, JWT required):
    - `POST/GET /in-house/:tenant_id` — create/list in-house promos (type always "in_house", priority 10)
    - `GET/PATCH/DELETE /in-house/:tenant_id/:id` — detail, pause/activate, delete
  - **Advertiser routes** (X-Internal-Secret):
    - `POST/GET /advertisers` — create/list advertisers
    - `POST /advertisers/:advertiser_id/campaigns` — create campaign with creative
    - `GET/PATCH/DELETE /campaigns/:id` — manage campaign
  - **Analytics routes** (X-Internal-Secret or reports:view):
    - `GET /analytics/venue/:tenant_id?month=` — VenueAdRevenue records
    - `GET /analytics/campaign/:campaign_id` — impressions, clicks, CTR, revenue split
    - `GET /revenue/venue/:tenant_id` — summary + 12-month history
    - `GET /admin/overview` — platform-wide (X-Internal-Secret)
  - **Mall routes** (X-Internal-Secret):
    - `POST/GET /malls` — create/list malls
    - `PATCH /malls/:id` — update name/radius
    - `POST /malls/:id/tenants` — add tenant to mall
- **Ad placement golden rule:** NEVER on catalogue, cart, checkout form, OTP, login, or any staff screen; ONLY on 7 approved placements
- **Docker:** ads-service container added to docker-compose.yml (port 3015, schema=ads, DEV_MODE=true)
- **TypeScript:** strict, clean compile

---

## 🔜 Next

- delivery-service (port 3006)
- Phase 5: analytics-service (3009), loyalty-service (3011)

---

## ⏳ Not Started

- delivery-service (3006)
- analytics-service (3009)
- loyalty-service (3011)
- superadmin-service (3012)
- social-room features (pre-roll ads — `social_room` placement ready in ads-service)
- Chain/franchise features (isChain, getCatalogueForBranch with overrides, chain dashboard)
- Phase 6: Production infra (Docker prod, Kong gateway, CI/CD, Hetzner deployment)

---

## Known Issues / Notes

- Local PostgreSQL on port 5432 — Docker Postgres on **5433** — all `.env` files use `localhost:5433`
- Local Redis on port 6379 (v3.0, incompatible with BullMQ) — Docker Redis on **6380** — all `.env` files use `redis://localhost:6380`
- Token expiry is 15 min — re-login frequently during testing
- All prices in paise (₹1 = 100 paise)
- `section_id` in item creation must match current DB (IDs reset on `prisma db push --force-reset`)
- Stop services before running `prisma db push` — ts-node-dev locks DLL on Windows
- Each service has Prisma client output at `src/generated/prisma/` to avoid DLL collision
- `prisma migrate dev` requires interactive TTY — use `prisma db push` for dev schema changes
- Business type is validated in Swagger enum but Zod schema accepts any string — tighten if needed
