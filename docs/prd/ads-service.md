# ads-service — PRD

## Overview

The ads-service (port 3015) is the platform's advertising revenue layer. It serves contextual ads at approved touchpoints across the ULCP customer experience — from the explore tab to the post-checkout screen to the jukebox player. The service supports three distinct advertiser types: external businesses advertising near a venue, tenant owners promoting their own venue's offers, and mall operators running cross-venue campaigns. Revenue from ads is split between the platform and the venue where the impression occurred, creating a passive income stream for tenants.

---

## Users / Actors

| Actor | Role |
|---|---|
| External Advertiser (nearby business) | Creates a campaign to reach customers near their location |
| Tenant Owner (in-house) | Creates self-promotional campaigns scoped to their own venue's placements |
| Mall Operator | Creates campaigns targeting all tenants inside a defined geographic mall zone |
| Platform / Superadmin | Manages advertisers, reviews admin overview, settles venue payouts |
| Customer | Sees ads on approved surfaces; clicks generate CPC revenue |
| Superadmin service | Calls `GET /admin/overview` via X-Internal-Secret for platform-level reporting |

---

## Core Features

1. **Ad placement engine** — `getAdsForContext()` returns a ranked list of eligible ads for a given placement. Filters by: active status, campaign date range, current hour and day of week, advertiser plan gating, geo-distance, and ad format. Sorts by priority descending, then CPM rate descending.
2. **7 approved placements** — `platform_home`, `order_tracking`, `post_checkout`, `social_room`, `explore_nearby`, `jukebox_queue`, `jukebox_player`. These are the only surfaces where ads are allowed.
3. **Plan-gated placements** — Advertiser plan determines which placements they can access: Starter → explore_nearby only; Growth → explore_nearby, post_checkout, order_tracking; Premium / Mall Package → all 7 placements.
4. **In-house promotions** — Tenant owners can create self-promotional campaigns without going through the advertiser onboarding. In-house campaigns always have `priority: 10` (highest) and are auto-activated. They are scoped to the tenant and never shown on the explore feed.
5. **Impression tracking** — On each `GET /serve` call, `recordImpression()` is fired asynchronously (non-blocking) for each served ad. Records per-impression revenue split and upserts the monthly venue revenue aggregate.
6. **Click tracking** — `POST /click` records a click event with revenue split and returns the CTA redirect URL.
7. **Revenue split** — Each campaign stores `platform_share_pct` (default 40%) and `venue_share_pct` (default 60%). Revenue per impression and click is split accordingly and stored on both the event record and the monthly aggregate.
8. **Explore feed** — `GET /explore` returns a geo-sorted, priority-ranked feed of ads for the customer-facing Explore tab. Requires lat/lng. Returns `featured` (priority ≥ 8) and `standard` entries. Uses in-process Haversine distance calculation.
9. **Mall management** — Superadmin can define Mall zones (lat/lng/radius) and associate tenant IDs to them. Mall campaigns can target a specific mall.
10. **Advertiser management** — Full CRUD for Advertisers including plan assignment, budget tracking, and campaign creation with creatives in a single call.
11. **Campaign scheduling** — Campaigns have date range, active hours (0–23), and active days of week (0=Sun, 6=Sat).
12. **Analytics** — Venue revenue history (by month), campaign performance (impressions, clicks, CTR, revenue breakdown), and platform-wide admin overview.

---

## API Endpoints

### Ad Delivery (public — no auth required)

| Method | Path | Description |
|---|---|---|
| GET | `/api/v1/ads/serve` | Fetch ads for a placement context. Params: placement (required), tenant_id, branch_id, customer_id, lat, lng, format, limit (1–10, default 2) |
| POST | `/api/v1/ads/click` | Record an ad click. Body: campaign_id, creative_id, impression_id, tenant_id?, customer_id?. Returns redirect_url. |
| GET | `/api/v1/ads/explore` | Geo-sorted explore feed. Params: lat (required), lng (required), radius_m (default 2000m), limit (1–50, default 20) |

### In-House Promotions (tenant-scoped, no JWT guard in code — see Open Questions)

| Method | Path | Description |
|---|---|---|
| POST | `/api/v1/ads/in-house/:tenant_id` | Create in-house promotion (auto-activates, priority 10, type=flat) |
| GET | `/api/v1/ads/in-house/:tenant_id` | List tenant's in-house promotions |
| PATCH | `/api/v1/ads/in-house/:tenant_id/:id` | Update promotion (name, status, placements, dates) |
| DELETE | `/api/v1/ads/in-house/:tenant_id/:id` | Soft-delete (sets status to "ended") |

### Advertiser & Campaign Management (no auth guard — see Open Questions)

| Method | Path | Description |
|---|---|---|
| POST | `/api/v1/ads/advertisers` | Create advertiser account |
| GET | `/api/v1/ads/advertisers` | List all advertisers with campaign count |
| GET | `/api/v1/ads/advertisers/:id` | Get advertiser with campaigns and creatives |
| PATCH | `/api/v1/ads/advertisers/:id` | Update advertiser (name, email, plan, budget, is_active) |
| POST | `/api/v1/ads/advertisers/:id/campaigns` | Create campaign under advertiser |
| GET | `/api/v1/ads/advertisers/:id/campaigns` | List campaigns with creatives and impression/click counts |
| PATCH | `/api/v1/ads/advertisers/:id/campaigns/:cid` | Update campaign (name, status, placements) |
| POST | `/api/v1/ads/advertisers/:id/campaigns/:cid/creatives` | Add creative to campaign |

### Mall Management (no auth guard — see Open Questions)

| Method | Path | Description |
|---|---|---|
| POST | `/api/v1/ads/malls` | Create mall zone |
| GET | `/api/v1/ads/malls` | List all malls |
| PATCH | `/api/v1/ads/malls/:id` | Update mall name or radius |
| POST | `/api/v1/ads/malls/:id/tenants` | Add tenant to mall |

### Analytics

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/v1/ads/analytics/venue/:tenant_id` | None | Venue revenue records by month (optional ?month= filter) |
| GET | `/api/v1/ads/analytics/campaign/:campaign_id` | None | Campaign stats: impressions, clicks, CTR, revenue breakdown |
| GET | `/api/v1/ads/revenue/venue/:tenant_id` | None | Venue revenue summary + last 12 months monthly breakdown |
| GET | `/api/v1/ads/admin/overview` | X-Internal-Secret | Platform-wide: advertiser count, active campaigns, total impressions/clicks/CTR/revenue, breakdown by plan |

---

## Data Models

### Advertiser
- `type` — `in_house` / `nearby` / `mall` / `platform`
- `name`, `contact_email`, `contact_phone?`
- `business_category`, `logo_url`, `address`, `city`, `lat`, `lng`
- `tenant_id` (nullable — links to a ULCP tenant when advertiser is a tenant owner)
- `plan` — `starter` / `growth` / `premium` / `mall_package`
- `plan_starts_at`, `plan_ends_at`
- `is_active`, `monthly_budget` (paise), `spent_this_month` (paise)

### AdCampaign
- `advertiser_id` (nullable for in-house), `tenant_id` (nullable for external)
- `name`, `status` — draft / active / paused / ended
- `type` — `in_house` / `nearby` / `mall` / `google_fallback`
- `placements` (String array — subset of the 7 valid placements)
- `target_radius_m`, `target_lat`, `target_lng` — geo targeting
- `target_mall_id`, `target_tenant_ids` (String array)
- `starts_at`, `ends_at`, `active_hours_start` (0–23), `active_hours_end` (0–23), `active_days` (Int array, 0=Sun)
- `pricing_model` — `cpm` / `cpc` / `flat`
- `cpm_rate`, `cpc_rate`, `flat_rate` (all in paise)
- `daily_budget` (paise), `platform_share_pct` (default 40), `venue_share_pct` (default 60)
- `priority` (Int, 1–10 — derived from advertiser plan: starter=4, growth=6, premium=8, mall_package=9; in_house=10)
- `explore_headline` (max 80 chars), `explore_distance_m`, `explore_offer_expiry` — explore-specific display fields

### AdCreative
- `campaign_id`, `format` — `native_card` / `banner` / `pre_roll` / `explore_card` / `jukebox_card`
- `headline` (max 60), `body` (max 150), `cta_text`, `cta_url`
- `image_url`, `logo_url`, `brand_color`, `video_url`
- `skip_after_secs` (default 5 — for pre_roll), `is_active`

### AdImpression
- `campaign_id`, `creative_id`, `tenant_id?`, `branch_id?`, `customer_id?`, `placement`
- `duration_secs` (nullable — for pre_roll view duration tracking)
- `revenue`, `venue_revenue`, `platform_revenue` (all paise)

### AdClick
- `campaign_id`, `creative_id`, `impression_id`
- `tenant_id?`, `customer_id?`
- `revenue`, `venue_revenue`, `platform_revenue` (all paise)

### Mall
- `name`, `address`, `city`, `lat`, `lng`, `radius_m` (default 200m)
- `tenant_ids` (String array — ULCP tenants that belong to this mall)

### VenueAdRevenue
- Composite unique key: `(tenant_id, branch_id, month)` — month as "YYYY-MM" string
- `impressions`, `clicks`, `gross_revenue`, `platform_cut`, `venue_payout` (all paise)
- `settled` (bool), `settled_at` (nullable) — for payout tracking

---

## Business Rules

- **Only 7 placements are valid.** Any request for an unlisted placement returns an empty array (not an error).
- **Placement access is plan-gated for external advertisers:** Starter gets explore_nearby only; Growth adds post_checkout and order_tracking; Premium and Mall Package get all 7.
- **In-house campaigns bypass plan gates.** They always get `priority: 10` and can target any of the 7 placements. They never appear on `explore_nearby` (enforced in the engine).
- **In-house campaigns are always active on creation** (`status: "active"`). External campaigns start as `draft` and must be activated via PATCH.
- **Ads are never shown on:** catalogue pages, cart, checkout form, OTP screens, login, or any staff-facing screen. This is a product rule enforced by the frontend — not enforced server-side.
- Priority tiers: in_house=10, mall_package=9, premium=8, growth=6, starter=4. Higher priority always wins for slot selection.
- Within the same priority tier, ads are sorted by CPM rate descending.
- `recordImpression()` is fire-and-forget (no `await`) to avoid blocking ad delivery latency.
- Revenue per impression = `cpm_rate` value (stored as-is per impression; not divided by 1000 — this may need clarification, see Open Questions).
- Revenue per click = `cpc_rate` value.
- VenueAdRevenue is upserted monthly per `(tenant_id, branch_id, month)`.
- The `settled` flag on VenueAdRevenue exists for monthly payout reconciliation but no settlement workflow is built in this service.
- Daily budget field exists on campaigns but **is not actively enforced** — the engine comment notes it would need spend tracking to implement; `0` is treated as unlimited.
- `spent_this_month` on Advertiser is stored but **not actively incremented** — there is no job or trigger that updates it.
- Campaign creation auto-assigns priority based on the advertiser's plan at creation time. Changing the advertiser's plan does not retroactively update existing campaign priorities.
- Delete on in-house promotions is a soft-delete (sets `status: "ended"`), not a hard delete.
- Explore feed uses Haversine distance calculated in-process (not PostGIS). This may be a performance concern at high volume.

---

## Service Dependencies

| Service | Direction | Purpose |
|---|---|---|
| No runtime service dependencies | — | ads-service is self-contained; it does not call any other service |
| Redis | Internal | Not currently used for caching in ads-service (cache is a pending item) |
| superadmin-service | Inbound | Calls `GET /admin/overview` with X-Internal-Secret |
| Frontend: customer-web | Inbound | `GET /serve` for order_tracking, post_checkout; `GET /explore` for Explore tab |
| Frontend: jukebox-player | Inbound | `GET /serve?placement=jukebox_player` — ad zone in player right column |
| Frontend: staff-web | Inbound | `POST /in-house/:tenant_id` from Settings > Promotions tab |

---

## Current Build Status

**Fully implemented:**
- Ad engine (`getAdsForContext`) with placement validation, schedule filter (hour + day), plan gating, geo filter (Haversine), in-house tenant scoping, format filter
- `GET /serve` — delivers ads, fires async impression recording
- `POST /click` — records click with revenue split, returns redirect URL
- `GET /explore` — geo-sorted explore feed with featured/standard classification
- Impression tracking with platform/venue revenue split
- Click tracking with revenue split
- VenueAdRevenue monthly aggregate (upsert on each impression)
- Advertiser CRUD (create, list, get, update)
- Campaign CRUD (create with advertiser, list, update status/placements)
- Creative creation (one creative per call; no bulk)
- In-house promotion CRUD (create/list/update/soft-delete)
- Mall CRUD + tenant membership management
- Venue analytics (monthly revenue records, summary, last 12 months)
- Campaign analytics (impressions, clicks, CTR, revenue breakdown)
- Admin overview endpoint (X-Internal-Secret gated)

**Not yet built / pending:**
- Click fraud detection (no rate limiting per IP per campaign)
- A/B testing for creatives (no variant tracking)
- Frequency capping (no max impressions per customer per day)
- Daily budget enforcement (field exists, logic not implemented)
- `spent_this_month` increment on Advertiser (field exists, not updated)
- Monthly payout settlement workflow (VenueAdRevenue.settled flag exists, no settlement endpoint)
- Admin UI in superadmin panel for advertiser management
- Redis caching for ad delivery (high-traffic `GET /serve` hits the DB on every request)
- Campaign delete (only status update to "ended" exists for in-house; external campaigns have no delete at all)

---

## Open Questions / Gaps

1. **No authentication on management endpoints** — Advertiser creation, campaign creation, mall management, and in-house promotions have no `preHandler` auth guard in the route files. Any caller with network access can create advertisers or campaigns. Is authentication expected to be enforced by Kong gateway, or should service-level guards be added?

2. **CPM revenue math** — `recordImpression()` stores `cpm_rate` directly as the `revenue` per impression. In standard ad industry terms, CPM means "cost per 1000 impressions" — so the per-impression value should be `cpm_rate / 1000`. Is the current implementation intentional (treating cpm_rate as a per-impression rate), or is this a bug?

3. **`spent_this_month` tracking** — The field exists on Advertiser and `monthly_budget` is set, but nothing increments `spent_this_month` when impressions or clicks are recorded. Budget enforcement cannot work without this. Is this planned for a future sprint?

4. **No campaign delete for external campaigns** — In-house promotions have a soft-delete (`status: "ended"`). External advertiser campaigns have no delete or soft-delete endpoint — only `PATCH /campaigns/:cid` can update status. Is this intentional?

5. **Explore feed geo filtering in-process** — The explore endpoint loads all active `explore_nearby` campaigns from the DB and filters by distance in Node.js memory. At scale (many campaigns) this will degrade. Is there a plan to move to PostGIS or a pre-computed index?

6. **`google_fallback` campaign type** — The `CampaignType` enum includes `google_fallback`, and there is logic to handle it in the explore feed ordering (priority based on plan). However, no endpoint creates a `google_fallback` campaign and there is no documented flow for what Google Fallback means in practice. Is this a future Google Ads integration concept?

7. **Mall campaign placement scoping** — Mall campaigns have access to all 7 placements (same as premium), but there is no enforcement that a mall campaign only appears within a mall's geo-fence when served via `GET /serve` (only the explore endpoint filters by geo at request time). Should `getAdsForContext` for non-explore placements also apply geo filtering for mall campaigns?

8. **`target_tenant_ids` field** — `AdCampaign.target_tenant_ids` exists in the schema (String array) but is not used in the ad engine's filtering logic. What was the intended behavior — show the campaign only to customers at those specific tenants?

9. **Payout settlement flow** — `VenueAdRevenue.settled` and `settled_at` exist for monthly reconciliation, but there is no endpoint to mark records as settled. Does superadmin-service handle this, or does it need a dedicated endpoint in ads-service?

10. **In-house promotions and SaaS plan** — Tenant-created in-house promotions have the highest priority (10) and can target any of the 7 placements. Should the ability to create in-house promotions be gated behind a SaaS plan tier (e.g., Starter+), or available to all tenants including Free?

11. **`AdImpression.duration_secs` for pre-roll** — The field exists to track how long a pre-roll video ad was watched before skip. No client-side mechanism is described for measuring and reporting this duration. How should the frontend report view duration?

12. **Creative management** — There is a `POST /creatives` endpoint to add creatives to a campaign, but no GET to list creatives, no PATCH to update, and no DELETE. Is creative management expected to be done only at campaign creation time?
