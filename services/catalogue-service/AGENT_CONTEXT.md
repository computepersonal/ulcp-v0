# catalogue-service — Agent Context

> This file is the living knowledge base for the catalogue-service agent.
> Update this file whenever routes, models, or behavior changes.
> Last updated: 2026-04-16

## Current Implementation Status
**FULLY IMPLEMENTED**

## What's Built
- Section CRUD + reorder + toggle
- Item CRUD + bulk reorder
- Item toggle (available/unavailable) with availability_type (temporary/permanent)
- Today price override (resets at midnight via cron)
- Item option groups + choices (customizations)
- Addon groups + items (reusable tenant-level addons)
- Item-addon group linking
- Combo deals + combo items
- Item ingredients (recipe system — cross-service ref to inventory-service)
- Public catalogue endpoint (customer context — disabled items hidden)
- Full-text search (PostgreSQL tsvector + GIN index, applied on startup)
- Redis caching (5min TTL) + cache invalidation on writes
- Default branch resolution (is_primary=true, cached 30min in Redis)
- Plan limit enforcement (item count per plan: free=200, starter=500, pro=∞)
- Menu context system (customer / staff_order / staff_edit)
- Midnight cron: re-enable temporary items, clear daily specials, reset price overrides

## Prisma Models (current)
- CatalogueSection, CatalogueItem
- ItemOptionGroup, ItemOptionChoice
- AddonGroup, AddonGroupItem, ItemAddonGroup
- Combo, ComboItem
- ItemIngredient

## CatalogueItem Extended Fields
```
veg_type: "veg" | "vegan" | "non_veg" | "egg"
meal_type: "breakfast" | "lunch" | "dinner" | "snacks" | "all_day"
item_type: "food" | "beverage" | "dessert" | "merchandise" | "service"
course: "starter" | "main" | "dessert" | "sides" | "beverages"
prep_time_mins, calories, video_url
rating, rating_count (cached from reviews)
```

## Key Routes
```
GET/POST   /api/v1/catalogue/:tenant_id/sections
PATCH/DELETE /api/v1/catalogue/:tenant_id/sections/:id

GET/POST   /api/v1/catalogue/:tenant_id/items
GET/PATCH/DELETE /api/v1/catalogue/:tenant_id/items/:id
PATCH /api/v1/catalogue/:tenant_id/items/:id/toggle
POST  /api/v1/catalogue/:tenant_id/items/:id/price-override

POST/GET   /api/v1/catalogue/:tenant_id/items/:item_id/ingredients
PATCH/DELETE /api/v1/catalogue/:tenant_id/items/:item_id/ingredients/:ingredient_id

GET /api/v1/catalogue/:tenant_id/:branch_id/public          ← customer context
GET /api/v1/catalogue/:tenant_id/public                     ← auto-resolves primary branch
GET /api/v1/catalogue/:tenant_id/:branch_id/public/search?q=
```

## Known Issues / Gotchas
- `ingredient_id` in ItemIngredient is a cross-service reference — **no DB FK** to inventory-service
- Default branch_id when not provided: fetched from tenant-service, cached 30min in Redis key `tenant:{tenant_id}:primary_branch`
- Public endpoint: disabled items are **HIDDEN** (not greyed) in customer context
- Redis default port is **6380** (not 6379)

## Recent Changes
- 2026-03-22: CatalogueItem extended with food classification fields
- 2026-03-22: ItemOptionGroup+Choice, AddonGroup+Item, ItemAddonGroup, Combo+ComboItem, ItemIngredient added
- 2026-03-28: ItemIngredient routes built (recipe system)
- 2026-03-28: GET /items defaults branch_id to primary branch when not provided
- 2026-04-16: Redis default port corrected to 6380

## Environment
- Dev port: 3003
- DB schema: catalogue
- Redis: **port 6380**
- Calls tenant-service for primary branch resolution (cached 30min)

## How to Run Locally
```bash
cd services/catalogue-service
pnpm dev
# Health: GET http://localhost:3003/health
# Swagger: http://localhost:3003/docs
# Public: GET http://localhost:3003/api/v1/catalogue/:tenant_id/:branch_id/public
```

## How to Deploy
```bash
docker compose -f docker-compose.dev.yml up catalogue-service
docker compose -f docker-compose.dev.yml logs -f catalogue-service
```

## Dependencies on Other Services
- **tenant-service** — fetch primary branch_id when not provided in request
- **media-service** — image uploads (client calls media-service directly, catalogue stores resulting URL)
- **inventory-service** — ItemIngredient.ingredient_id is a cross-service ref (no runtime call)

## Pending / TODO
- Business presets (auto-load sections + items by business type on tenant creation)
- Two-step delete flow (disable first requires menu:edit, permanent delete requires menu:publish)
- Franchise/chain catalogue override logic (branch price overrides for chain tenants)
- Unit + E2E tests
