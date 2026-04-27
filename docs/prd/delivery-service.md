# delivery-service — PRD

## Overview

The delivery-service (port 3006) is responsible for managing every form of physical order fulfilment on the ULCP platform. It sits between the order-service and the real world — covering near-radius delivery with configurable pricing, gated-community structured addressing (Tower/Block/Flat), click-and-collect pickup codes, scheduled time-slot delivery, far-distance courier dispatch via Shiprocket, food-truck daily location broadcasts, and Pro+ monthly credit tabs for community residents. As of April 2026, this service is a **stub only** — no `src/` directory exists and no code has been written beyond the `package.json`.

---

## Users / Actors

| Actor | Interaction |
|---|---|
| Tenant owner | Configures delivery zones, pricing models, community layout, slot windows, and Shiprocket credentials |
| Customer (PWA / mobile) | Selects delivery address (map-based or Tower/Block/Flat), chooses a time slot, tracks order status |
| Rider / delivery agent | (Future) Receives assignment, updates location and delivery status |
| order-service | (Future) Creates a delivery record when an order with a delivery type is placed |
| notification-service | (Future) Sends WhatsApp/SMS status updates at each delivery stage |
| Gated community resident (Pro+) | Accumulates orders on a monthly credit tab, settles monthly |

---

## Core Features

The following features are defined in architecture and domain documentation. None are implemented yet.

1. **Near delivery** — Radius-based eligibility check using `geolib`. Three pricing models: `flat` (fixed fee), `distance_based` (per-km rate), `free_above` (free if order total exceeds a threshold).
2. **Far delivery (Starter+)** — Integration with Shiprocket API for inter-city courier. Weight-based pricing. Auto-books a shipment when a delivery order is accepted.
3. **Community delivery** — No GPS required. Customer selects address via structured Tower + Block + Flat dropdowns. Five layout types: `towers_only`, `blocks_only`, `towers_and_blocks`, `villas`, `open_numbering`. Block dropdown cascades from tower selection.
4. **Click and collect** — Customer places an order online and picks it up at the branch. A unique pickup code is generated in the format `PKP-XXXX`.
5. **Scheduled delivery** — Slot-based scheduling with three windows: Morning, Afternoon, Evening. Slots are configured per tenant.
6. **Monthly tab (Pro+)** — Gated-community residents accumulate delivery orders on credit throughout a month and settle with a single payment. Requires the Pro plan.
7. **Catering advance booking** — Minimum-notice period configured per tenant (e.g. 24 hours minimum). Partial payment accepted at booking, remainder on delivery.
8. **Food truck daily location** — Owner sets the truck's current lat/lng each day. Push notifications broadcast the location to nearby customers.
9. **Delivery status state machine** — Orders flow through: `pending_acceptance → accepted → preparing → out_for_delivery → delivered`.
10. **WhatsApp delivery notifications** — Status updates sent to customers for applicable business types (see Business Rules).

---

## API Endpoints

**No endpoints are implemented.** The following are the planned endpoints based on the AGENT_CONTEXT.md and domain documentation.

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/health` | None | Service health check |
| POST | `/api/v1/delivery/zones` | JWT (owner) | Create a delivery zone for a branch |
| GET | `/api/v1/delivery/zones/:branch_id` | JWT (staff) | Get delivery zone config for a branch |
| POST | `/api/v1/delivery/orders` | JWT / internal | Create a delivery record linked to an order |
| PATCH | `/api/v1/delivery/orders/:id/status` | JWT (staff/rider) | Advance delivery status |
| GET | `/api/v1/delivery/orders/:id` | JWT | Get delivery order details |
| POST | `/api/v1/delivery/pickup-codes` | Internal | Generate a PKP-XXXX click-and-collect code |
| GET | `/api/v1/delivery/slots/:branch_id` | None | Get available delivery slots for a branch |
| POST | `/api/v1/delivery/community/config` | JWT (owner) | Set community layout (towers, blocks, flat ranges) |
| GET | `/api/v1/delivery/community/config/:branch_id` | None | Get community address structure |
| POST | `/api/v1/delivery/food-truck/location` | JWT (owner) | Set today's food truck location |
| GET | `/api/v1/delivery/food-truck/location/:tenant_id` | None | Get current food truck location |
| GET | `/api/v1/delivery/tab/:customer_id` | JWT (customer) | Get monthly tab balance and history (Pro+) |

> All paths are speculative — the service has not been built. This table should be treated as a design starting point, not a contract.

---

## Data Models

No Prisma schema exists. The following models are planned per the AGENT_CONTEXT.md:

### DeliveryZone (planned)
Fields: `tenant_id`, `branch_id`, `radius_km`, `pricing_model` (`flat | distance_based | free_above`), `flat_fee` (paise), `per_km_rate` (paise), `free_above_amount` (paise).

### DeliveryOrder (planned)
Fields: `tenant_id`, `branch_id`, `order_id` (cross-service ref to order-service), `delivery_type` (enum), `status` (state machine), `address_snapshot` (JSON), `rider_id`, `pickup_code`, `estimated_delivery_at`, `delivered_at`.

### CommunityConfig (planned)
Fields: `tenant_id`, `branch_id`, `layout_type` (`towers_only | blocks_only | towers_and_blocks | villas | open_numbering`), `towers` (JSON array), `blocks` (JSON array), `flat_range_start`, `flat_range_end`.

### DeliverySlot (planned)
Fields: `tenant_id`, `branch_id`, `label` (`Morning | Afternoon | Evening`), `start_time`, `end_time`, `cutoff_time` (latest order time to make this slot), `is_active`.

### MonthlyTab (planned — Pro+)
Fields: `tenant_id`, `branch_id`, `customer_id`, `month`, `year`, `total_amount` (paise), `settled_at`, `settlement_reference`.

### PickupCode (planned)
Fields: `tenant_id`, `branch_id`, `order_id`, `code` (`PKP-XXXX`), `expires_at`, `used_at`.

### FoodTruckLocation (planned)
Fields: `tenant_id`, `date`, `latitude`, `longitude`, `address_label`.

### Rider (planned)
Fields: `tenant_id`, `name`, `phone`, `is_active`, `current_lat`, `current_lng`, `last_location_at`.

---

## Business Rules

- **Near delivery**: customer's delivery address must be within the configured radius. Distance check uses the `geolib` npm library.
- **Far delivery** is a Starter+ feature. Requires `SHIPROCKET_EMAIL` and `SHIPROCKET_PASSWORD` env vars.
- **Monthly tab** is a Pro+ feature. Customer cannot exceed a configured credit limit before settlement.
- **WhatsApp delivery notifications apply to**: `home_kitchen`, `cloud_kitchen`, `food_truck`, `gated_community`, `catering`, `kirana`, `boutique`, `nursery`, `pharmacy`, `handicrafts`, `bakery`, `stationery`.
- **WhatsApp does NOT apply to dine-in types**: `self_service_cafe`, `seated_food_only`, `seated_full_service`, `seated_self_order`.
- **Click and collect**: the pickup code format is `PKP-XXXX` (4 alphanumeric characters).
- **Catering**: minimum notice period is configured per tenant. Partial payment (amount TBD) is accepted at booking; the remainder is collected on delivery.
- **Community delivery**: the Block dropdown in the UI must cascade from the selected Tower — this is a UI contract the delivery-service must support via its `CommunityConfig` data shape.
- **Food truck**: owner sets one location per day. Walk-in and near-delivery are both supported simultaneously.
- **Delivery status** is the service-owned state machine. order-service tracks the order-level status; delivery-service tracks the delivery-leg status independently.
- All monetary values stored as integers in paise.

---

## Service Dependencies

| Dependency | Direction | Reason |
|---|---|---|
| order-service | Inbound call | Creates a delivery record when an order is placed with a delivery type |
| notification-service | Outbound call | Triggers WhatsApp/SMS/push notifications at each delivery status change |
| realtime-service | Outbound event | Publishes delivery status events for staff Socket.io updates |
| geolib (npm) | Library | Distance calculation for near-delivery eligibility |
| Shiprocket API | External | Far-delivery shipment booking and tracking (Starter+) |
| identity-service | JWT validation | Authenticates staff and owner requests |
| PostgreSQL | Database | Will own a `delivery` schema |
| Redis | Pub/Sub + cache | Delivery status events, food truck location cache |

---

## Current Build Status

**Nothing is implemented.** The service directory contains only:
- `package.json` (minimal, no runtime dependencies installed)
- `CLAUDE.md` (domain context)
- `AGENT_CONTEXT.md` (agent bootstrap notes)
- `node_modules/` (only `@ulcp/shared` workspace dependency)

There is no `src/`, no Prisma schema, no Dockerfile (not yet), and no running service on port 3006.

The AGENT_CONTEXT.md defines this priority build order:
1. Near delivery (flat fee + distance-based pricing) — highest value
2. Community delivery (Tower+Block+Flat)
3. Click and collect (PKP-XXXX codes)
4. Scheduled delivery slots
5. Far delivery via Shiprocket (Starter+)
6. Food truck daily location
7. Monthly tab (Pro+)

---

## Open Questions / Gaps

1. **Who owns delivery status vs. order status?** The order-service has its own status machine (`pending → confirmed → preparing → ready → completed`). Does the delivery-service maintain a separate status or does it update order-service status as deliveries progress?
2. **Rider management**: Is a rider a staff member (from tenant-service) or a separate entity managed solely by the delivery-service? What app do riders use?
3. **Real-time rider tracking**: Is live GPS tracking of the rider to the customer a V1 requirement or deferred?
4. **Shiprocket webhook handling**: When Shiprocket delivers a shipment update, which service receives the webhook callback? Does it come to delivery-service and propagate via events?
5. **Monthly tab settlement flow**: How is settlement triggered — is it a cron job, manual owner action, or a payment link sent to the customer?
6. **Community layout source of truth**: Is the community layout configured in tenant-service (which already has Section/Table models) or in delivery-service?
7. **Click and collect expiry**: When does a PKP code expire? What happens if the customer never picks up?
8. **Catering partial payment amount**: What percentage or fixed amount is collected at booking? Is this configurable per tenant?
9. **Food truck push notification**: What triggers the "truck is here" push to nearby customers — the owner manually setting location, or an automated time trigger?
10. **Delivery pricing vs. GST**: Should the delivery fee be subject to GST? If so, which rate, and does it appear on the invoice?
11. **Free delivery threshold**: For the `free_above` pricing model, is the threshold applied to the subtotal, the total, or a specific item category total?
