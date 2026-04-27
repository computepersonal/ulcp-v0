# catalogue-service — PRD

**Port:** 3003 | **Last reviewed:** 2026-04-27

---

## Overview

The catalogue-service manages the complete product/menu data for every tenant on the platform. It is designed as a universal catalogue — equally suited for a restaurant menu, a kirana store inventory list, a boutique's clothing collection, or a pharmacy's drug catalogue. The service handles sections (groupings), items (with pricing, variants, stock, food classification, allergens, and ratings), option groups (customizations), add-on groups (reusable upsells), combo/bundle deals, and recipe-to-ingredient links used by the inventory-service for stock deduction. The public catalogue endpoint is served from a Redis cache with a 5-minute TTL and is also cached at the Cloudflare edge — a customer scanning a QR code typically never reaches the origin server.

---

## Users / Actors

| Actor | Context | Capabilities |
|---|---|---|
| Platform customer | `customer` context | Browse and order; disabled items hidden entirely |
| Staff (no menu:edit) | `staff_order` context | See all items including greyed-out unavailable items; cannot edit |
| Staff (with menu:edit) | `staff_edit` context | Full edit controls: toggle, reorder, price override, daily special, delete |
| Staff (with menu:publish) | — | Required for Step 2 of the two-step delete (permanent deletion) |
| Internal services (inventory-service) | X-Internal-Secret or events | Read ingredient data to deduct stock on order |
| Internal services (order-service) | — | Read item prices at order time (caller passes snapshot, not re-read) |
| Tenant owner / manager | Staff JWT | All staff_edit capabilities |

---

## Core Features

1. **Catalogue sections** — group items into labelled sections (e.g. "Starters", "Beverages", "Jeans"). Sections can be branch-specific or shared across all branches. Sections have a display position, description, and availability toggle. Drag-and-drop reorder via bulk PATCH `/reorder`.
2. **Catalogue items** — full-featured product records with pricing (MRP, selling price, offer price + expiry), stock tracking (optional), availability toggle, images (JSON array with primary flag), variants (JSON array), attributes (JSON array, e.g. Size: M), food classification fields (veg_type, meal_type, item_type, course), allergens, nutrition (prep_time_mins, calories), video URL, and a cached rating score.
3. **Item availability toggle** — staff can toggle an item on/off instantly. Availability can be `temporary` (resets at midnight cron) or `permanent`. Unavailability reason captured: sold_out, ingredient_missing, quality_issue, custom.
4. **Today price override** — set a temporary price for today (original price preserved for display). Stored as JSONB on the item; reset at midnight by cron.
5. **Daily specials** — items can be flagged `is_daily_special: true`; auto-removed at midnight by cron.
6. **Drag-and-drop reorder** — bulk PATCH endpoint for items (by `sort_order`) and sections (by `position`).
7. **Public catalogue endpoint** — `GET /api/v1/catalogue/:tenant_id/:branch_id/public` returns sections + items (including option groups, add-on groups, ingredients) + combos. Served from Redis cache (5-min TTL). Only available items are returned in `customer` context. Requires onboarding to be completed before serving to customers.
8. **Full-text search** — `GET /public/search?q=` searches item names, descriptions, and attributes using PostgreSQL tsvector. Staff context shows all items; customer context shows only available.
9. **Context resolution** — every catalogue response includes a `context` field (customer | staff_order | staff_edit) determined by the presence and permissions of the JWT.
10. **Item option groups** — per-item customizations with required/optional flag, min/max selections. Each option has choices with an add-on price. Examples: "Egg Type" (Boiled +₹10, Fried +₹20), "Size" (S/M/L).
11. **Add-on groups** — tenant-level reusable groups of add-on items (e.g. "Sides", "Beverages"). Linked to multiple items via a junction table. Items within a group have individual prices.
12. **Combo / bundle deals** — bundle multiple items at a special price. Combos have their own image, price, MRP (for strikethrough), date range (valid_from / valid_till), and branch scope.
13. **Item ingredients (recipe system)** — links catalogue items to named ingredients with per-serving quantity and unit. `is_critical` flag: if stock = 0 for a critical ingredient, the item should be auto-disabled (triggered via Socket.io from inventory-service). Allergen data is stored here and returned in the public catalogue for customer display.
14. **Two-step delete flow** — Step 1: item disabled + hidden (requires `menu:edit`); Step 2: permanent delete confirmation (requires `menu:publish`). Between steps the item stays disabled and can be restored.
15. **Midnight cron jobs** — per branch timezone: re-enable all temporary-disabled items; remove daily specials; reset all todayPriceOverride fields.
16. **Cache invalidation** — on any item or section update, Redis cache for the tenant/branch catalogue is invalidated. Cloudflare CDN cache purge is also triggered via the Cloudflare API.
17. **Audit logging** — all item and section mutations (created, updated, enabled, disabled, deleted, reordered) are sent to tenant-service's audit log via an `auditClient` library.

---

## API Endpoints

### Public (no auth required)
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/v1/catalogue/:tenant_id/:branch_id/public` | None (opt. staff JWT) | Full catalogue for branch; Redis cached 5min |
| GET | `/api/v1/catalogue/:tenant_id/:branch_id/public/search` | None (opt. staff JWT) | Full-text search across items |

### Sections
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/v1/catalogue/:tenant_id/sections` | Staff JWT | Create a section |
| GET | `/api/v1/catalogue/:tenant_id/sections` | Staff JWT | List all sections for tenant |
| PATCH | `/api/v1/catalogue/:tenant_id/sections/reorder` | Staff JWT | Bulk reorder sections |
| PATCH | `/api/v1/catalogue/:tenant_id/sections/:id` | Staff JWT | Update section (name, description, visibility, position) |
| DELETE | `/api/v1/catalogue/:tenant_id/sections/:id` | Staff JWT | Delete section (unlinks items, does not delete them) |

### Items
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/v1/catalogue/:tenant_id/items` | Staff JWT | Create item |
| GET | `/api/v1/catalogue/:tenant_id/items` | Staff JWT | List items (filterable by section_id, branch_id, is_available) |
| PATCH | `/api/v1/catalogue/:tenant_id/items/reorder` | Staff JWT | Bulk reorder items by sort_order |
| GET | `/api/v1/catalogue/:tenant_id/items/:id` | Staff JWT | Get single item |
| PATCH | `/api/v1/catalogue/:tenant_id/items/:id` | Staff JWT | Update item fields |
| PATCH | `/api/v1/catalogue/:tenant_id/items/:id/toggle` | Staff JWT | Toggle availability on/off |
| PATCH | `/api/v1/catalogue/:tenant_id/items/:id/price-override` | Staff JWT | Set today price override |
| DELETE | `/api/v1/catalogue/:tenant_id/items/:id` | Staff JWT | Delete item permanently |

### Item Options
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/v1/catalogue/:tenant_id/items/:item_id/option-groups` | Staff JWT | Create option group |
| GET | `/api/v1/catalogue/:tenant_id/items/:item_id/option-groups` | Staff JWT | List option groups |
| PATCH | `/api/v1/catalogue/:tenant_id/items/:item_id/option-groups/:id` | Staff JWT | Update option group |
| DELETE | `/api/v1/catalogue/:tenant_id/items/:item_id/option-groups/:id` | Staff JWT | Delete option group |
| POST | `/api/v1/catalogue/:tenant_id/items/:item_id/option-groups/:id/choices` | Staff JWT | Add choice to option group |
| PATCH / DELETE | — | Staff JWT | Update/delete individual choices |

### Add-on Groups
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/v1/catalogue/:tenant_id/addon-groups` | Staff JWT | Create add-on group |
| GET | `/api/v1/catalogue/:tenant_id/addon-groups` | Staff JWT | List add-on groups |
| POST | `/api/v1/catalogue/:tenant_id/addon-groups/:id/items` | Staff JWT | Add item to add-on group |
| POST | `/api/v1/catalogue/:tenant_id/items/:item_id/addon-groups/:addon_group_id` | Staff JWT | Link add-on group to item |
| DELETE | `/api/v1/catalogue/:tenant_id/items/:item_id/addon-groups/:addon_group_id` | Staff JWT | Unlink add-on group from item |

### Combos
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/v1/catalogue/:tenant_id/combos` | Staff JWT | Create combo |
| GET | `/api/v1/catalogue/:tenant_id/combos` | Staff JWT | List combos |
| PATCH | `/api/v1/catalogue/:tenant_id/combos/:id` | Staff JWT | Update combo |
| DELETE | `/api/v1/catalogue/:tenant_id/combos/:id` | Staff JWT | Delete combo |

### Item Ingredients (Recipe)
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/v1/catalogue/:tenant_id/items/:item_id/ingredients` | Staff JWT | Add ingredient link |
| GET | `/api/v1/catalogue/:tenant_id/items/:item_id/ingredients` | Staff JWT | List ingredients for item |
| PATCH | `/api/v1/catalogue/:tenant_id/items/:item_id/ingredients/:ingredient_id` | Staff JWT | Update ingredient link |
| DELETE | `/api/v1/catalogue/:tenant_id/items/:item_id/ingredients/:ingredient_id` | Staff JWT | Remove ingredient link |

---

## Data Models

### CatalogueSection
- `tenant_id`, `branch_id` (null = all branches), `name`, `description`
- `position` (sort order), `is_available` (toggle to hide entire section)

### CatalogueItem
Key fields:
- `tenant_id`, `branch_id`, `section_id`
- `name`, `description`, `sku`
- `images` — JSON array: `[{ url, isPrimary }]`
- `mrp`, `price`, `offer_price`, `offer_valid_till` — all integers in paise (₹1 = 100 paise)
- `unit` — display unit (plate, kg, piece, litre)
- `has_variants`, `variants` — JSON array: `[{ name, sku, price, mrp, stock, isAvailable }]`
- `attributes` — JSON array: `[{ name, value }]`
- `track_stock`, `stock`, `low_stock_alert`
- `is_available`, `unavailable_reason`, `availability_type` (temporary|permanent)
- `veg_type` (veg|vegan|non_veg|egg), `allergens[]`
- `meal_type` (breakfast|lunch|dinner|snacks|all_day)
- `item_type` (food|beverage|dessert|merchandise|service)
- `course` (starter|main|dessert|sides|beverages)
- `prep_time_mins`, `calories`, `video_url`
- `rating`, `rating_count` — cached from review events
- `is_food`, `is_daily_special`
- `today_price_override` — JSONB: `{ price, original_price, reason, set_by, set_at, resets_at }`
- `sort_order`

### ItemOptionGroup
- `item_id`, `name`, `is_required`, `min_select`, `max_select`, `sort_order`
- Has many `ItemOptionChoice` — `{ name, add_on_price, is_available, sort_order }`

### AddonGroup
- `tenant_id`, `name`, `is_available`, `sort_order`
- Has many `AddonGroupItem` — `{ name, price, mrp, is_available, sort_order }`
- Linked to items via `ItemAddonGroup` junction table

### Combo
- `tenant_id`, `branch_id`, `name`, `description`, `image_url`
- `price` (combo price in paise), `mrp` (sum of individual prices for strikethrough display)
- `valid_from`, `valid_till`
- Has many `ComboItem` — `{ item_id, quantity, variant_name }`

### ItemIngredient
- `item_id`, `name`, `calories`, `allergens` (JSON array of allergen keys)
- `is_critical` — if true and stock = 0 → item should auto-disable
- Note: `ingredient_id` field described in CLAUDE.md is NOT in the Prisma schema — it is missing from the actual schema. The ingredient link to inventory-service is by name only, not by ID reference.

---

## Business Rules

- All monetary values stored as integers in paise (₹1 = 100). Never floats.
- Full catalogue (per tenant/branch) cached in Redis for 5 minutes; also cached at Cloudflare CDN edge for 5 minutes
- Cache invalidated on any item or section mutation (Redis delete + Cloudflare API call)
- Public catalogue is blocked (HTTP 403) if tenant's `onboarding_completed = false`
- In `customer` context: disabled items are hidden entirely; `is_daily_special` items shown normally until midnight cron removes them
- In `staff_order` context: disabled items shown greyed-out with reason; no edit controls
- In `staff_edit` context: all controls shown; requires `menu:edit` JWT permission
- Permanent delete (Step 2) requires `menu:publish` JWT permission
- `GET /items` defaults to the tenant's primary branch when `branch_id` not supplied (fetched from tenant-service, cached 30min)
- Item plan limits enforced at creation: free=200, starter=500, pro=unlimited (checked via shared `planFeatures.ts`)
- Midnight cron runs per branch timezone (not UTC) — important for multi-timezone chains
- Two-step delete: Step 1 disables + hides the item; Step 2 permanently deletes. Between steps the item stays disabled; staff can cancel and keep it disabled without deleting.
- `ingredient_id` cross-service reference to inventory-service — no DB foreign key enforced; integrity is application-level only

---

## Service Dependencies

| Service | Direction | Reason |
|---|---|---|
| tenant-service | Outbound (catalogue → tenant) | Fetch primary branch_id; check onboarding completion for public endpoint; fetch plan for item limit enforcement |
| inventory-service | Inbound (inventory → catalogue) | Reads ItemIngredient data to know which ingredients to deduct on order |
| inventory-service | Inbound (events via Redis) | When critical ingredient stock hits 0 → should auto-disable item via Socket.io (described in CLAUDE.md, trigger mechanism unclear) |
| realtime-service | Inbound (realtime → catalogue) | Forwards ingredient stock events to catalogue for auto-disable |
| loyalty-service | Inbound (loyalty → catalogue) | May read item data for offer engine |
| Redis | Internal | 5-min TTL catalogue cache per `{tenant_id}:{branch_id}`; Cloudflare cache invalidation on mutation |

---

## Current Build Status

**Built and working:**
- Section CRUD (create, read, update, delete, reorder)
- Item CRUD (create, read, update, delete, reorder, toggle, price-override)
- Public catalogue endpoint with Redis cache and context resolution
- Full-text search endpoint
- Item option groups and choices CRUD
- Add-on groups CRUD and item linking
- Combo CRUD
- Item ingredient/recipe CRUD
- Audit logging on all mutations (calls tenant-service auditClient)
- Plan limit enforcement at item creation
- Context resolution (customer / staff_order / staff_edit)
- Onboarding gate on public endpoint

**Stubbed or missing:**
- Midnight cron jobs — described in CLAUDE.md but not visible in route/service files; needs a separate cron worker or BullMQ scheduled job
- Cloudflare cache purge on mutation — described in CLAUDE.md but not confirmed implemented in item.service.ts (only Redis invalidation is mentioned)
- Auto-disable on critical ingredient stock = 0 — the ItemIngredient `is_critical` flag exists but the trigger mechanism (who calls what when inventory hits 0) is not implemented here; it depends on inventory-service + realtime-service coordination
- Rating updates — `rating` and `rating_count` fields exist but no endpoint to update them; described as cached from reviews-service (loyalty-service) but no event handler is visible
- `ingredient_id` cross-reference to inventory-service — field is in CLAUDE.md but absent from the actual Prisma schema; recipe linking by name only currently
- Two-step delete is implemented as a single DELETE call (Step 1 disable + Step 2 delete are not two separate endpoints in the actual routes)
- Variants and attributes are stored as JSON, not as separate relational models — no CRUD endpoints for individual variants

---

## Open Questions / Gaps

1. **Two-step delete gap** — CLAUDE.md describes a two-step delete (disable first, confirm to delete). The actual route is a single `DELETE /:id`. How should the two-step flow work? Via item state `availability_type: "pending_delete"` perhaps? Needs product decision.
2. **ingredient_id missing from schema** — CLAUDE.md says `ItemIngredient.ingredient_id` references the inventory-service. The Prisma schema does not have this field. Items are linked by ingredient name string only. Is this intentional (search by name) or a schema gap?
3. **Auto-disable on critical ingredient** — the `is_critical` flag is stored but there is no implemented path from "inventory hits 0" to "item disabled". Who triggers this? Inventory-service → Redis pub/sub → realtime-service → catalogue-service? This flow is not wired.
4. **Rating update mechanism** — `rating` and `rating_count` exist on CatalogueItem. There is no route or event handler to update these from the loyalty/reviews service. Is this a BullMQ job? A direct HTTP call? Not decided.
5. **Cloudflare purge confirmation** — is Cloudflare cache purge actually called on item updates? It should be in `item.service.ts` but was not confirmed in the code read.
6. **Midnight cron ownership** — which service runs the midnight cron for catalogue resets? The catalogue-service itself (via BullMQ)? A separate cron worker? This is described but not implemented.
7. **Branch-scoped sections** — sections have a `branch_id` field (null = all branches). But `GET /sections` returns all sections for the tenant regardless of branch. Is there filtering logic planned?
8. **Plan gating on edit** — item count limits are enforced at creation but is there enforcement if a tenant downgrades from pro to free and already has >200 items?
9. **Waiter ordering on shared tablet** — described in CLAUDE.md (`POST /auth/staff/pin-unlock`). This PIN unlock endpoint is in identity-service but not visible in the route files read. Is it built?
