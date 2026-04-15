# catalogue-service — Agent Context

> This file is the living knowledge base for the catalogue-service agent.
> Update this file whenever routes, models, or behavior changes.
> Last updated: 2026-04-15

## Current Implementation Status
**FULLY IMPLEMENTED**

## What's Built
- Section CRUD + reorder + toggle
- Item CRUD + bulk reorder
- Item toggle (available/unavailable) with availability_type (temporary/permanent)
- Today price override (resets at midnight)
- Item option groups + choices (customizations)
- Addon groups + items (reusable tenant-level addons)
- Item-addon group linking
- Combo deals + combo items
- Item ingredients (recipe system — cross-service ref to inventory-service)
- Public catalogue endpoint (customer context — hidden disabled items)
- Full-text search (PostgreSQL tsvector)
- Redis caching (5min TTL) + Cloudflare cache invalidation
- Default branch resolution (is_primary=true, cached 30min)
- Plan limit enforcement (item count per plan)
- Menu context system (customer / staff_order / staff_edit)

## Prisma Models (current)
- CatalogueSection, CatalogueItem, ItemOptionGroup, ItemOptionChoice
- AddonGroup, AddonGroupItem, ItemAddonGroup
- Combo, ComboItem, ItemIngredient

## CatalogueItem Extended Fields (added 2026-03-22)
- veg_type: "veg" | "vegan" | "non_veg" | "egg"
- meal_type: "breakfast" | "lunch" | "dinner" | "snacks" | "all_day"
- item_type: "food" | "beverage" | "dessert" | "merchandise" | "service"
- course: "starter" | "main" | "dessert" | "sides" | "beverages"
- prep_time_mins, calories, video_url
- rating, rating_count (cached from reviews)

## Known Issues / Gotchas
- ingredient_id in ItemIngredient is a cross-service reference — NO database FK to inventory-service
- Default branch_id when not provided: fetches from tenant-service, cached 30min in Redis key `tenant:{tenant_id}:primary_branch`
- Public endpoint: disabled items are HIDDEN (not just greyed) in customer context

## Recent Changes
- 2026-03-22: CatalogueItem extended with food classification fields
- 2026-03-22: ItemOptionGroup+Choice, AddonGroup+Item, ItemAddonGroup, Combo+ComboItem, ItemIngredient models added
- 2026-03-22: Public catalogue response now includes combos + item relations
- 2026-03-28: ItemIngredient routes built (recipe system)
- 2026-03-28: GET /items defaults branch_id to primary branch when not provided

## Environment
- Dev port: 3003
- DB schema: catalogue
- Calls tenant-service for primary branch resolution

## How to Run Locally
```bash
cd services/catalogue-service
pnpm dev
# Health: GET http://localhost:3003/health
# Public catalogue: GET http://localhost:3003/api/v1/catalogue/:tenant_id/:branch_id/public
```

## How to Run Tests
```bash
# No tests written yet
```

## How to Deploy
```bash
docker compose -f docker-compose.dev.yml up catalogue-service
docker compose -f docker-compose.dev.yml logs -f catalogue-service
```

## Pending / TODO
- Midnight cron jobs (re-enable temporary, remove daily specials, reset price overrides)
- Two-step delete flow implementation
- Business presets (auto-load sections by business type)
- Franchise/chain catalogue override logic
- Unit + E2E tests
