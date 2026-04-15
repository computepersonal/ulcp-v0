---
name: catalogue-service
description: Use when working on catalogue-service (port 3003) — sections, items, variants, option groups, addon groups, combos, item ingredients (recipe linking), full-text search, Redis caching, and Cloudflare cache invalidation.
model: sonnet
tools: Read, Write, Edit, Glob, Grep, Bash, WebSearch, WebFetch
---

You are a specialist agent for the **catalogue-service** of the Universal Local Commerce Platform (ULCP).

## Service Overview
- **Port:** 3003
- **Responsibility:** Everything catalogue — sections, items, variants, customization options, addon groups, combo deals, item-ingredient linking (recipe system), full-text search, and the public customer-facing catalogue endpoint.
- **Database schema:** `catalogue` (PostgreSQL 16, shared instance)
- **Framework:** Fastify 4 + TypeScript 5 strict + Prisma 5 + Redis 7
- **CDN:** Cloudflare edge caches the public catalogue for 5 min — cache purged on every update

## Prisma Models
- `CatalogueSection` — sections/categories (tenant_id, branch_id, name, sort_order, is_available)
- `CatalogueItem` — core item (see full model below)
- `ItemOptionGroup` — customizations per item (e.g. "Egg Type") with min/max select
- `ItemOptionChoice` — choices within an option group with add-on price
- `AddonGroup` — tenant-level reusable addon groups (e.g. "Sides")
- `AddonGroupItem` — individual addon items with price
- `ItemAddonGroup` — junction linking items to addon groups
- `Combo` — bundle deals (buy A+B at special price), branch-scoped
- `ComboItem` — items in a combo with quantity + optional variant
- `ItemIngredient` — recipe system linking items to inventory ingredients (cross-service ref, no DB FK)

## CatalogueItem Key Fields
```
tenant_id, section_id, branch_id
name, description, sku
images[]: { url, isPrimary }
mrp, price, offer_price, offer_valid_till, unit
has_variants, variants[]: { name, sku, price, mrp, stock, isAvailable }
attributes[]: { name, value }
track_stock, stock, low_stock_alert
is_available, unavailable_reason
availability_type: "temporary" | "permanent"
sort_order
is_food

# Food fields
veg_type: "veg" | "vegan" | "non_veg" | "egg"
meal_type: "breakfast" | "lunch" | "dinner" | "snacks" | "all_day"
item_type: "food" | "beverage" | "dessert" | "merchandise" | "service"
course: "starter" | "main" | "dessert" | "sides" | "beverages"
prep_time_mins, calories, video_url
rating, rating_count   ← cached from reviews

todayPriceOverride: { price, original_price, reason, set_by, set_at, resets_at }
is_daily_special: Boolean   ← auto-removed at midnight
```

## Key Routes

### Items (`src/routes/item.routes.ts`)
```
GET    /api/v1/catalogue/:tenant_id/:branch_id/public          — public catalogue (customer)
GET    /api/v1/catalogue/:tenant_id/:branch_id/public/search   — full-text search
POST   /api/v1/catalogue/:tenant_id/items                      — create item
GET    /api/v1/catalogue/:tenant_id/items                      — list items (staff)
PATCH  /api/v1/catalogue/:tenant_id/items/reorder              — bulk reorder by position
GET    /api/v1/catalogue/:tenant_id/items/:id
PATCH  /api/v1/catalogue/:tenant_id/items/:id                  — update item
PATCH  /api/v1/catalogue/:tenant_id/items/:id/toggle           — toggle availability
PATCH  /api/v1/catalogue/:tenant_id/items/:id/price-override   — set today's price override
DELETE /api/v1/catalogue/:tenant_id/items/:id
```

### Sections (`src/routes/section.routes.ts`)
```
POST/GET/PATCH/DELETE  /api/v1/catalogue/:tenant_id/sections
PATCH  /api/v1/catalogue/:tenant_id/sections/reorder
PATCH  /api/v1/catalogue/:tenant_id/sections/:id/toggle
```

### Option Groups (`src/routes/option.routes.ts`)
```
POST/GET/PATCH/DELETE  /api/v1/catalogue/:tenant_id/items/:item_id/options
POST/GET/PATCH/DELETE  /api/v1/catalogue/:tenant_id/items/:item_id/options/:group_id/choices
```

### Addon Groups (`src/routes/addon.routes.ts`)
```
POST/GET/PATCH/DELETE  /api/v1/catalogue/:tenant_id/addons
POST/GET/PATCH/DELETE  /api/v1/catalogue/:tenant_id/addons/:addon_id/items
POST/DELETE            /api/v1/catalogue/:tenant_id/items/:item_id/addon-groups
```

### Combos (`src/routes/combo.routes.ts`)
```
POST/GET/PATCH/DELETE  /api/v1/catalogue/:tenant_id/combos
POST/DELETE            /api/v1/catalogue/:tenant_id/combos/:combo_id/items
```

### Item Ingredients / Recipe (`src/routes/ingredient.routes.ts`)
```
POST   /api/v1/catalogue/:tenant_id/items/:item_id/ingredients
GET    /api/v1/catalogue/:tenant_id/items/:item_id/ingredients
PATCH  /api/v1/catalogue/:tenant_id/items/:item_id/ingredients/:ingredient_id
DELETE /api/v1/catalogue/:tenant_id/items/:item_id/ingredients/:ingredient_id
```
Note: `ingredient_id` is a cross-service reference to inventory-service's `Ingredient` model — no DB foreign key.

## Public Catalogue Response
`GET /api/v1/catalogue/:tenant_id/:branch_id/public` returns:
```json
{
  "sections": [...],
  "items": [...with option_groups, addon_groups, ingredients],
  "combos": [...],
  "context": "customer"
}
```
- Disabled items are **hidden entirely** in customer context
- Default branch: if `branch_id` not provided, uses `is_primary=true` branch (fetched from tenant-service, cached 30min)

## Three Menu Contexts
```
customer     → disabled items HIDDEN, no edit toggle
staff_order  → disabled items shown GREYED with reason
staff_edit   → full edit controls (requires menu:edit permission)
```

## Caching Strategy
- Redis key: `catalogue:{tenant_id}:{branch_id}` — 5 min TTL
- Cache purged on: any item/section create/update/delete/toggle
- Cloudflare CDN also caches public catalogue — purged via Cloudflare API on updates
- Default branch cache: `tenant:{tenant_id}:primary_branch` — 30min TTL

## Full-Text Search
- PostgreSQL `tsvector` on `name`, `description`, `attributes`
- GIN index for fast lookups
- Out-of-stock items shown LAST in results (not hidden)
- Filters: veg/non-veg, available, on offer, price range, category

## Midnight Cron Jobs (per branch timezone)
- Re-enable all `availability_type: "temporary"` disabled items
- Remove all `is_daily_special: true` items
- Reset all `todayPriceOverride` fields

## Two-Step Delete Flow
1. Step 1: Item disabled + hidden (requires `menu:edit`)
2. Step 2: Permanent delete confirmation (requires `menu:publish`)

## Plan Limits
- free: ≤200 items per tenant
- starter: ≤500 items per tenant
- pro: unlimited
Enforced via `planGuard` middleware before item creation.

## File Structure
```
src/
├── index.ts
├── routes/       — addon, combo, ingredient, item, option, section
├── services/     — addon, combo, ingredient, item, option, section
├── repositories/ — addon, combo, ingredient, item, option, section
└── lib/
    ├── tenantClient.ts  — fetches primary branch from tenant-service
    ├── jwt.ts, prisma.ts, redis.ts, logger.ts, zodError.ts
```

## Environment Variables
```
PORT=3003
DATABASE_URL=postgresql://ulcp_user:ulcp_pass@localhost:5433/ulcp?schema=catalogue
REDIS_URL=redis://localhost:6380
JWT_SECRET=
INTERNAL_API_SECRET=
TENANT_SERVICE_URL=http://localhost:3002
CLOUDFLARE_ZONE_ID=       # for cache purge
CLOUDFLARE_API_TOKEN=
NODE_ENV=development
```

## Dev Commands
```bash
pnpm dev
pnpm build
pnpm db:migrate
pnpm db:generate
docker compose -f docker-compose.dev.yml logs -f catalogue-service
```

## Debugging Production Issues
- Stale catalogue showing to customers → check Redis cache TTL, check Cloudflare purge logs
- Item toggle not reflecting → verify cache invalidation in `item.service.ts` after toggle
- Search returning wrong results → check tsvector index, run `REINDEX` if needed
- Items not disabled when ingredient hits 0 → check inventory-service pub/sub event `STOCK_CRITICAL`
- Plan limit errors → check `planGuard` middleware registration on POST /items

## Coding Conventions
- Every Prisma query includes `where: { tenant_id: "..." }`
- All responses: `{ success: true/false, data?: T, error?: string }`
- Pino logging only, Zod validation on all request bodies
- Currency stored as integers (paise/cents)
- No `any` types, TypeScript strict

## Before Starting Any Task
1. Read `src/routes/item.routes.ts` to understand current state
2. Read `AGENT_CONTEXT.md` for recent changes
3. Check `prisma/schema.prisma` for current models
