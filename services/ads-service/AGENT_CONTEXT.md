# ads-service — Agent Context

> This file is the living knowledge base for the ads-service agent.
> Update this file whenever routes, models, or behavior changes.
> Last updated: 2026-04-16

## Current Implementation Status
**FULLY IMPLEMENTED**

## What's Built
- Ad placement engine: `getAdsForContext()` — validates placement, filters schedule/geo/plan, sorts priority DESC
- 7 valid placements: `platform_home`, `order_tracking`, `post_checkout`, `social_room`, `explore_nearby`, `jukebox_queue`, `jukebox_player`
- Plan-gated placements: starter → [explore_nearby], growth → [explore_nearby, post_checkout, order_tracking], premium/mall_package → all 7
- In-house campaign CRUD (tenant self-promotion, priority 10, bypass plan gates)
- Advertiser CRUD + AdCampaign CRUD + AdCreative CRUD
- `GET /serve` — serves ads by context, fires `recordImpression()` async (non-blocking)
- `POST /click` — records click, returns `redirect_url`
- `GET /explore` — geo-sorted explore feed (lat/lng required), featured (priority ≥ 8) + standard
- Impression tracking with platform/venue revenue split (platform_share_pct / venue_share_pct)
- Click tracking with revenue split
- VenueAdRevenue monthly aggregate (upserted on each impression)
- Mall management (Mall + tenant membership)
- Analytics: venue revenue history, campaign performance (impressions, clicks, CTR), admin overview
- Priority tiers: in_house=10, mall_package=9, premium=8, growth=6, starter=4
- Haversine geo-filter: campaigns with target_lat/lng/radius_m only shown in range
- Schedule filter: active_hours_start/end (0-23), active_days (0=Sun..6=Sat)

## Prisma Models (current)
- Advertiser (AdvertiserType: external | in_house | mall_operator; AdPlan: starter | growth | premium | mall_package)
- AdCampaign (CampaignStatus, CampaignType, PricingModel; placements String[])
- AdCreative (AdFormat: banner | native | video | pre_roll | explore_card)
- AdImpression (revenue, venue_revenue, platform_revenue per impression)
- AdClick (revenue, venue_revenue, platform_revenue per click)
- Mall (name, lat, lng, radius_m, tenant_ids String[])
- VenueAdRevenue (tenant_id + branch_id + month composite key — monthly aggregate)

## Route Prefix
All routes under `/api/v1/ads`

## Key Routes
```
GET  /serve?placement=&tenant_id=&branch_id=&customer_id=&format=&limit=   ← main ad delivery
POST /click { campaign_id, creative_id, impression_id, tenant_id?, customer_id? }
GET  /explore?lat=&lng=&limit=

POST /in-house/:tenant_id        ← create in-house promo (JWT required)
GET  /in-house/:tenant_id        ← list tenant's promos
PATCH/DELETE /in-house/:tenant_id/:id

GET  /advertisers                ← X-Internal-Secret
POST /advertisers
POST /advertisers/:id/campaigns  ← create campaign + creative in one call
GET/PATCH/DELETE /campaigns/:id

GET  /analytics/venue/:tenant_id?month=
GET  /analytics/campaign/:campaign_id
GET  /revenue/venue/:tenant_id
GET  /admin/overview             ← X-Internal-Secret only

POST/GET /malls
PATCH /malls/:id
POST /malls/:id/tenants
```

## Ad Placement Golden Rule
**NEVER** show ads on: catalogue pages, cart, checkout form, OTP screens, login, or any staff-facing screen.
**ONLY** allowed on the 7 approved placements above.

## Known Issues / Gotchas
- `recordImpression()` is called without `await` — intentionally fire-and-forget to not block ad delivery
- Revenue stored in paise (smallest unit) — same as all currency in the platform
- `VALID_PLACEMENTS` is `as const` tuple — use `[...VALID_PLACEMENTS] as unknown as [string, ...string[]]` for Zod enum
- In-house campaigns always have `type: "in_house"` and `priority: 10` — never overrideable by API caller
- Mall campaigns bypass plan placement gates — they always get all 7 placements

## Recent Changes
- 2026-04-16: Service fully built (port 3015)
- 2026-04-16: 7 valid placements defined
- 2026-04-16: Plan-gated placement engine
- 2026-04-16: Impression + click tracking with revenue split
- 2026-04-16: VenueAdRevenue monthly aggregate
- 2026-04-16: Explore feed endpoint

## Environment
- Dev port: 3015
- DB schema: ads
- Prisma client output: `src/generated/prisma`
- Fastify v4 (same as all other services)
- Zod v3 (same as other services on Fastify v4)

## How to Run Locally
```bash
cd services/ads-service
pnpm dev
# Health: GET http://localhost:3015/health
# Swagger: http://localhost:3015/docs
# Test serve: GET http://localhost:3015/api/v1/ads/serve?placement=explore_nearby&limit=2
```

## How to Deploy
```bash
docker compose -f docker-compose.dev.yml up ads-service
docker compose -f docker-compose.dev.yml logs -f ads-service
```

## Dependencies on Other Services
- **No hard runtime dependencies** — ads-service is self-contained
- Frontend reads from ads-service directly via `GET /serve` and `GET /explore`
- staff-web Settings > Promotions tab POSTs to `POST /in-house/:tenant_id`
- jukebox-player fetches from `GET /serve?placement=jukebox_player`
- customer-web OrderTracking fetches `placement=order_tracking`
- customer-web Checkout fetches `placement=post_checkout` on success screen
- customer-web Explore page fetches `GET /explore?lat=&lng=`

## Frontend Integration
```typescript
// useAds() hook (customer-web/src/components/ads/useAds.ts)
// Fails silently — never throws to UI
// Uses IntersectionObserver for impression tracking (1s at 50% visibility)
// AbortController cleanup on unmount

// useJukeboxAds() hook (jukebox-player)
// Rotates 5 ads every 30s, refreshes from API every 10min
```

## Pending / TODO
- Click fraud detection (rate limit clicks per IP per campaign)
- A/B testing framework for creatives
- Frequency capping (max impressions per customer per day)
- Campaign budget tracking (daily spend against budget)
- Admin UI in superadmin panel for advertiser management
