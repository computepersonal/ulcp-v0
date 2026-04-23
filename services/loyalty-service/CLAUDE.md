# loyalty-service — Domain Context

> Platform-wide conventions, tech stack, and coding rules are in the **root CLAUDE.md**.
> This file contains loyalty-service-specific domain knowledge only.

---

## LOYALTY & REWARDS

### Two Layers

**Platform loyalty:** ₹10 = 1 point, ₹1 per 10 points. Cross-business.
**Tenant loyalty (Pro+):** custom earn rate + redemption value. Business-specific.

### Tiers (Pro+)

```
SILVER   (0–999 pts):   1x multiplier
GOLD     (1000–4999):   1.5x + free delivery on orders >₹300
PLATINUM (5000+ pts):   2x + always free delivery
```

awardPoints() called on order.completed event.
Redemption shown at checkout: "You have ₹45 redeemable"

---

## OFFERS ENGINE

### Types

percentage, flat, bxgy (buy X get Y), first_order, flash_sale

### Conditions

```
minimumOrderAmount, maxUsesTotal, maxUsesPerCustomer,
firstOrderOnly, activeDays[], flashSaleStartTime/EndTime,
applicableTo: all | category | item
applicableChannels: dine_in | delivery | both
isAutoApplied vs coupon code
```

---

## REVIEWS & RATINGS

Verified purchasers only (linked to orderId).
One review per customer per order item. 24hr edit window.
Owner can reply. Superadmin can flag/remove.
Business rating = auto-calculated average of all item ratings.

---

## CUSTOMER APP FEATURES

**Wishlist:** heart icon on items, notifyWhenAvailable flag
**Back in stock:** push+SMS to wishlisters on item re-enable
**Reorder:** one tap, validates current availability, uses CURRENT prices
**Recommendations:** order again | popular now | you might like (3 rows)
**Recently viewed:** Redis only, key: `recently_viewed:CUST:TENANT`, max 20, 30d TTL

---

## SAVED PLACES

Storage: AsyncStorage (local) + PlatformCustomer.savedPlaces[] (server sync)
Size: ~300 bytes per place, max 50 places = ~15KB total

What stored per place:
```
tenantId, slug, name, businessType, logo, url
firstVisitedAt, lastVisitedAt, visitCount
orderCount, lastOrderedAt, isPinned, pinnedAt
```

Auto-Save: silently on every QR scan / place open
orderCount++: on every completed order at that place
Cap: 50 max — oldest non-pinned removed when exceeded

Sort Priority:
1. Pinned (most recently pinned first)
2. Unpinned: score = (orderCount×10) + (visitCount×2) + recencyScore
   recencyScore: today=20, 3days=15, week=10, month=5, older=1

UI: horizontal scroll grid, frequency dots, pin badge, last card = Scan QR
Long press: pin / remove / share

Cross-device sync: localStorage + server. Login new device merges both.
