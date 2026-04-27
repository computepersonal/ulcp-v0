# ULCP — Full Change Log

---

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
2026-04-23: apps/web: Login.tsx — fetches onboarding state after login, redirects to /onboard if not completed (owners only)
2026-04-23: apps/web: Onboard.tsx — full 6-step wizard resumes from server-side step on reload; Go to Dashboard always enabled
2026-04-23: apps/web: Setup.tsx — migrated from localStorage to server-side setup_tasks API
2026-04-24: Domain knowledge split into per-service CLAUDE.md files to reduce root file size
2026-04-27: catalogue-service: CatalogueItem.allergens String[] field added (gluten/dairy/eggs/nuts/peanuts/soy/fish/shellfish/sesame/mustard)
2026-04-27: apps/web: Catalogue — allergens multi-select chips in Add/Edit item modals
2026-04-27: tenant-service: Section name uniqueness enforced (case-insensitive) — ConflictError 409 on duplicate
2026-04-27: tenant-service: GET /tenants/internal/names?ids= — batch fetch tenant display names (internal, no auth preHandler)
2026-04-27: identity-service: TENANT_SELECTION_REQUIRED response now includes business_name via batch internal call
2026-04-27: apps/web: Role-based nav — waiters/cashiers/kitchen staff see only Floor Map, Orders, Catalogue
2026-04-27: apps/web: Onboard + ProtectedRoute — /onboard redirect gated to OWNER_ROLES only; waiters always go to /floor-map
2026-04-27: apps/web: FloorMap empty state — owners see add controls, non-owners see "ask your manager" message
2026-04-27: root CLAUDE.md restructured — BOOTSTRAP GUIDE → docs/BOOTSTRAP.md, BUILD ORDER → docs/BUILD_ORDER.md
```
