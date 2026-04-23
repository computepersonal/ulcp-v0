# delivery-service — Domain Context

> Platform-wide conventions, tech stack, and coding rules are in the **root CLAUDE.md**.
> This file contains delivery-service-specific domain knowledge only.

---

## DELIVERY ENGINE

### Delivery Types

**Near delivery:**
geolib distance check, pricing: flat | distance-based | free above threshold

**Far delivery (Starter+):**
Shiprocket API, weight-based, auto-book on acceptance

**Community delivery:**
Tower+Block+Flat, no GPS required
Layout types: towers_only | blocks_only | towers_and_blocks | villas | open_numbering
Block dropdown cascades from tower selection

**Click & collect:**
Pickup code format: PKP-XXXX

**Scheduled delivery:**
Slot-based: Morning / Afternoon / Evening

**Monthly tab (Pro+):**
Community credit, settle monthly

### Delivery Status Flow

```
pending_acceptance → accepted → preparing → out_for_delivery → delivered
```

### Business Type Mapping

WhatsApp delivery notifications apply to:
home_kitchen, cloud_kitchen, food_truck, gated_community, catering,
kirana, boutique, nursery, pharmacy, handicrafts, bakery, stationery

NOT for dine-in types: self_service_cafe, seated_food_only, seated_full_service, seated_self_order

### Catering (Type 8)

Advance booking with minimum notice (min X hrs configured per tenant).
Partial payment accepted at booking, remainder on delivery.

### Food Truck (Type 9)

Owner sets daily location. Walk-in + delivery both supported.
Location broadcast to nearby customers via push notification.

### Gated Community (Type 10)

Community delivery only. No GPS — address by Tower/Block/Flat selection.
Monthly tab: customer accumulates orders on credit, settled monthly (Pro+).
