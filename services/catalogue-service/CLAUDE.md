# catalogue-service — Domain Context

> Platform-wide conventions, tech stack, and coding rules are in the **root CLAUDE.md**.
> This file contains catalogue-service-specific domain knowledge only.

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

### ItemIngredient Routes

Recipe system — links catalogue items to inventory ingredients with per-serving quantities.
`ingredient_id` is a cross-service reference to inventory-service's Ingredient model (no DB foreign key).

```
POST   /api/v1/catalogue/:tenant_id/items/:item_id/ingredients
GET    /api/v1/catalogue/:tenant_id/items/:item_id/ingredients
PATCH  /api/v1/catalogue/:tenant_id/items/:item_id/ingredients/:ingredient_id
DELETE /api/v1/catalogue/:tenant_id/items/:item_id/ingredients/:ingredient_id
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

Default branch: when `branch_id` not provided, defaults to primary branch (`is_primary=true`),
fetched from tenant-service, cached 30min in Redis.

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

### Context Resolution

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

## SEARCH & FILTERS

PostgreSQL full-text search: tsvector on name, description, attributes
Filters adapt per business type (veg for food, size for clothing etc.)
Out of stock shown LAST (not hidden) in results.
Quick chips: Veg Only | Available | On Offer | Sort | Filters

---

## CACHING

- Full catalogue per tenant: 5min Redis TTL (CATALOGUE_CACHE_TTL_SECS = 300)
- Invalidate on any update: Redis + Cloudflare cache purge via API
- Catalogue API cached at Cloudflare edge — 5min TTL
- Customer QR scan = Cloudflare serves catalogue, NOT origin server
