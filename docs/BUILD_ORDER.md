# ULCP — Build Order

Use this as a reference when bootstrapping or resuming construction of the platform.
See the root `CLAUDE.md` for phase-by-phase Claude Code prompts.

---

```
PHASE 1 — FOUNDATION
1.  Docker + docker-compose (all 15 services + PostgreSQL + Redis)
2.  Shared package (eventBus, authenticate middleware, constants)
3.  identity-service: staff auth, customer OTP, JWT, RBAC, PIN unlock
4.  tenant-service: tenant CRUD, branches, feature gates
5.  Kong API gateway config

PHASE 2 — CATALOGUE
6.  catalogue-service: sections, items, variants, attributes
7.  Recipe management on food items
8.  Business presets
9.  Search (PostgreSQL full-text search, tsvector)
10. Menu view/edit context system + 3 contexts
11. Midnight cron jobs

PHASE 3 — STAFF & PARTNERS
12. Staff management (CRUD, RBAC, granular permissions)
13. Partner system (invite, accept, scope middleware)
14. Kitchen duty system
15. Staff shifts + attendance

PHASE 4 — INVENTORY
16. Ingredient CRUD + StockMovement + PurchaseOrder
17. deductStockForOrder() + auto-disable on critical
18. Alert system

PHASE 5 — ORDERS & KOT
19. Table management + Socket.io floor map
20. TableSession system
21. Table confirmation + PIN unlock (shared tablet)
22. KOT generation + routing (kitchen/bar split)
23. Thermal printer integration
24. KDS device registration + setup codes
25. Token system (Type 1)
26. Order management, billing, payment + table close

PHASE 6 — DELIVERY
27. Near delivery (geolib, pricing)
28. Community delivery (Tower+Block+Flat, monthly tab)
29. Far delivery (Shiprocket)
30. Click & collect + scheduled slots
31. Catering advance booking + food truck locations

PHASE 7 — CUSTOMER PLATFORM
32. PlatformCustomer + OTP auth + address book
33. Wishlist + back in stock notify
34. Reorder (one tap)

PHASE 8 — COMMERCE
35. Offers engine (all types) + coupon codes
36. Commission auto-calc + Razorpay Route
37. Refund + cancellation
38. GST calculation + invoice generation

PHASE 9 — NOTIFICATIONS
39. notification-service: BullMQ queue setup
40. SMS, WhatsApp, Push, Email channels
41. Channel router (business type rules)
42. WhatsApp reply webhook

PHASE 10 — ANALYTICS & LOYALTY
43. Loyalty points engine + tiers + redemption
44. Reviews + ratings
45. analytics-service: pre-computed reports + Redis cache
46. P&L statement + PDF + Excel export

PHASE 11 — REAL-TIME
47. realtime-service (Socket.io + Redis Pub/Sub)
48. socketMiddleware (Redux integration)
49. KDS full-screen app (apps/kds/)
50. Dashboard live metrics broadcast

PHASE 12 — MEDIA
51. media-service: Sharp + WebP + Cloudflare R2
52. Image upload from catalogue builder + edit mode

PHASE 13 — SUPERADMIN
53. superadmin-service: overview, tenant management
54. Commission settlement + invoice generation
55. Platform settings + feature flags + moderation

PHASE 14 — BUSINESS ONBOARDING
56. 6-step wizard endpoints
57. Onboarding state persistence + resume
58. Post-onboarding checklist

PHASE 15 — CHAIN/FRANCHISE
59. isChain + chainConfig on Tenant
60. getCatalogueForBranch() with overrides
61. Chain dashboard (consolidated reporting)

PHASE 16 — FRONTEND APPS
62. Redux store + RTK Query + socketMiddleware
63. AsyncStorage/localStorage persistence configs
64. Customer web PWA
65. Staff POS web (floor map, orders, catalogue builder, edit mode)
66. Superadmin dashboard
67. Staff mobile app (Expo Bare)
68. Customer mobile app (Expo Bare + QR scanner)

PHASE 17 — ADS & JUKEBOX
69. ads-service: campaigns, placements, impression tracking
70. jukebox-service: queue, song requests, billing integration
71. Vendor portal (procurement bid management)
```
