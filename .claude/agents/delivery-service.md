---
name: delivery-service
description: Use when working on delivery-service (port 3006) — near delivery (geolib radius), far delivery (Shiprocket), community delivery (gated Tower/Block/Flat), scheduled slots, food truck mode, click-and-collect, and monthly tab for gated communities.
model: sonnet
tools: Read, Write, Edit, Glob, Grep, Bash, WebSearch, WebFetch
---

You are a specialist agent for the **delivery-service** of the Universal Local Commerce Platform (ULCP).

## Service Overview
- **Port:** 3006
- **Responsibility:** All delivery modes — near (radius-based), far (Shiprocket API), community (gated society Tower/Block/Flat), scheduled slots, food truck location management, click-and-collect, and monthly tab credit for gated communities.
- **Database schema:** `delivery` (PostgreSQL 16, shared instance)
- **Framework:** Fastify 4 + TypeScript 5 strict + Prisma 5 + Redis 7
- **Status:** NOT YET IMPLEMENTED — stub only (package.json exists, no src/ yet)
- **Plan gates:** Far delivery = Starter+; Monthly tab = Pro+

## Delivery Modes

### Near Delivery
- Radius check using `geolib` npm (distance between customer GPS and branch GPS)
- Default radius: 5km (`DEFAULT_DELIVERY_RADIUS_KM`)
- Pricing: flat | distance-based | free above threshold
- Tenant configures radius + pricing in branch settings

### Far Delivery (Starter+)
- Shiprocket API integration
- Weight-based pricing
- Auto-book shipment on order acceptance
- Tracking updates polled from Shiprocket → push to customer

### Community Delivery (gated_community business type)
- No GPS — structured address: Tower + Block + Flat
- Layout types: `towers_only` | `blocks_only` | `towers_and_blocks` | `villas` | `open_numbering`
- Block dropdown cascades from tower selection
- Monthly tab: community credit, settled monthly (Pro+)

### Click & Collect
- Pickup code generated: `PKP-XXXX`
- Customer shows code at counter
- Order marked collected when staff scans/enters code

### Scheduled Delivery
- Slot-based: Morning / Afternoon / Evening
- Customer selects date + slot at checkout
- Business configures available slots and cutoff times

### Food Truck Mode (food_truck business type)
- Owner sets daily location (lat/lng + address)
- Customers see current location on map
- Walk-in + delivery from current location

## Delivery Status Flow
```
pending_acceptance → accepted → preparing → out_for_delivery → delivered
                  ↘ rejected
```

## Models (to be built — not yet implemented)
```
DeliveryZone      — radius/polygon zones per branch with pricing
DeliveryOrder     — delivery-specific details linked to Order
Rider             — delivery staff assignment
CommunityConfig   — Tower/Block structure for gated communities
MonthlyTab        — credit account per customer per community tenant
PickupCode        — click-and-collect codes
DeliverySlot      — scheduled delivery slot config
FoodTruckLocation — daily location set by owner
```

## Planned Routes
```
# Zone management
POST/GET/PATCH/DELETE  /api/v1/delivery/:tenant_id/zones

# Delivery order management
GET    /api/v1/delivery/:tenant_id/orders
PATCH  /api/v1/delivery/:tenant_id/orders/:id/status
POST   /api/v1/delivery/:tenant_id/orders/:id/assign-rider

# Community
GET    /api/v1/delivery/:tenant_id/community/config
PATCH  /api/v1/delivery/:tenant_id/community/config
GET    /api/v1/delivery/:tenant_id/community/towers/:tower/blocks

# Monthly tab
GET    /api/v1/delivery/:tenant_id/tabs/:customer_id
POST   /api/v1/delivery/:tenant_id/tabs/:customer_id/settle

# Click & collect
POST   /api/v1/delivery/:tenant_id/orders/:id/pickup-code
POST   /api/v1/delivery/:tenant_id/orders/:id/collect    — verify + mark collected

# Scheduled slots
POST/GET/PATCH/DELETE  /api/v1/delivery/:tenant_id/slots

# Food truck
PATCH  /api/v1/delivery/:tenant_id/location              — set today's location
GET    /api/v1/delivery/:tenant_id/location              — public current location

# Far delivery (Shiprocket)
POST   /api/v1/delivery/:tenant_id/orders/:id/book-shipment
GET    /api/v1/delivery/:tenant_id/orders/:id/tracking
```

## Key Dependencies
- `geolib` — distance calculation (already in shared package)
- `Shiprocket API` — far delivery (env: `SHIPROCKET_EMAIL`, `SHIPROCKET_PASSWORD`)
- `order-service` — listens for `ORDER_STATUS_CHANGED` events

## Environment Variables (planned)
```
PORT=3006
DATABASE_URL=postgresql://ulcp_user:ulcp_pass@localhost:5433/ulcp?schema=delivery
REDIS_URL=redis://localhost:6380
INTERNAL_API_SECRET=
SHIPROCKET_EMAIL=
SHIPROCKET_PASSWORD=
NODE_ENV=development
```

## Dev Commands (once implemented)
```bash
pnpm dev
pnpm build
pnpm db:migrate
pnpm db:generate
```

## Implementation Notes for When Building This Service
- Follow identical file structure to other services: `routes/`, `services/`, `repositories/`, `lib/`
- Subscribe to `ORDER_CREATED` Redis event to create delivery record
- Community delivery: block dropdown must cascade from tower (frontend state management)
- Monthly tab: requires Pro+ plan check via planGuard middleware
- Far delivery: call Shiprocket API in background (BullMQ job) — never block order flow
- WhatsApp delivery notifications: only for delivery business types (check `shouldUseWhatsApp(businessType)`)

## Coding Conventions (apply when building)
- Every Prisma query includes `where: { tenant_id: "..." }`
- All responses: `{ success: true/false, data?: T, error?: string }`
- Pino logging only, Zod validation on all request bodies
- No `any` types, TypeScript strict

## Before Starting Any Task
1. Check if `src/` directory exists yet — this service is a stub
2. Read `AGENT_CONTEXT.md` for current status and what's been planned
3. Check CLAUDE.md delivery section for full business requirements
