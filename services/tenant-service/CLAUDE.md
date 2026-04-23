# tenant-service — Domain Context

> Platform-wide conventions, tech stack, and coding rules are in the **root CLAUDE.md**.
> This file contains tenant-service-specific domain knowledge only.

---

## BUSINESS ONBOARDING (6-step wizard)

```
Step 1: Account (name, mobile, email, password + OTP verify)
Step 2: Business type (visual grid — all types)
Step 3: Profile (name, slug, logo, cover, address, GST toggle)
Step 4: Catalogue (preset sections auto-loaded, add first item)
Step 5: Operations (tables config OR delivery zones)
Step 6: Go Live (QR generated, download/share, checklist)
```

- State saved at every step — resume anytime
- Business preset auto-loads on type selection
- QR code generated immediately on completion
- Post-onboarding checklist: 7 tasks = 30-day Starter trial reward
- Slug auto-generated from name, editable before confirm
- Handled by: tenant-service wizard endpoints

---

## MULTI-OWNER / PARTNER SYSTEM

### Ownership

```
PRIMARY OWNER (1 — permanent, all permissions, cannot be removed)
PARTNERS (unlimited — invited via email+SMS, 48hr expiry)
```

### Partner Roles

```
primary_owner      → everything, permanent
managing_partner   → full ops + financial
silent_partner     → financial visibility only
operations_partner → ops only, no financial
branch_partner     → specific branch(es) only
custom_partner     → fully configurable
```

### Partner Permissions (toggle per partner)

```
revenue, allBranches, assignedBranches[], commissionDetails,
staffManagement, menuEditing, subscriptionBilling,
addRemovePartners, businessSettings
```

partnerScope middleware filters all data by partner permissions.

---

## BUSINESS TYPES — ALL 10

### DINE-IN

**Type 1 — self_service_cafe**
Counter pickup, token system (1-999, resets daily)
Token display: full-screen TV page. KOT → Kitchen only.

**Type 2 — seated_food_only**
Waiter service, food only. Staff confirms table (2 min auto-reject).
Single KOT → Kitchen KDS + Printer.

**Type 3 — seated_full_service**
Food + drinks. KOT AUTO-SPLIT:
food items → Kitchen KDS + Printer
drink items → Bar KDS + Printer (two separate KDS screens)

**Type 4 — seated_self_order**
autoConfirmTable: true. Customer orders via QR, collects themselves.
Single KOT → Kitchen KDS + Printer.

### DELIVERY

**Type 5 — home_kitchen:** delivery only, manual acceptance, WhatsApp QR
**Type 6 — cloud_kitchen:** delivery only, near + far
**Type 7 — restaurant_plus_delivery:** BOTH dine-in + delivery, unified KDS
**Type 8 — catering:** advance booking (min X hrs), partial payment
**Type 9 — food_truck:** daily location set by owner, walk-in + delivery
**Type 10 — gated_community:** community delivery only, monthly tab

### NON-FOOD (Universal Catalogue)

kirana, boutique, nursery, pharmacy, handicrafts,
bakery, stationery, home_kitchen_products, custom

---

## TABLE ASSIGNMENT SYSTEM

Model: Flexible
Manager assigns sections before shift (optional)
Any waiter can serve any table
Primary waiter tracked for notifications + tips

Assignment Types:
- section_auto: manager assigns section, tables inherit
- self_claimed: waiter taps Claim on unassigned table
- manager_direct: manager assigns specific table
- swap: transfer to another waiter

Floor Map Views:
- Manager: all tables, section colors, waiter names, time
- Waiter: all tables, own highlighted with star + MINE
- Unassigned+occupied: CLAIM? prompt visible to all

Notifications:
- Assigned waiter: order placed + KOT ready alerts
- All waiters: unassigned table needs attention
- All staff: real-time floor map via Socket.io

Tips:
- Recorded at billing, linked to assignedWaiter
- Modes: cash or UPI
- WaiterTipTally: daily aggregation per staff

Shift End Auto-Release:
- Cron at shift end per branch timezone
- Empty tables: auto-unassigned
- Occupied tables: manager alert + reassign prompt

Models:
```
Section: { tenant_id, branch_id, name, color, position, is_active }
Table:   { tenant_id, branch_id, section_id?, name, capacity, position, qr_code }
  → routes: POST/GET/PATCH/DELETE /tenants/:id/branches/:bid/tables
  → routes: POST/GET/PATCH/DELETE /tenants/:id/branches/:bid/sections
TableSection (future): { name, color, tableIds[], assignments[] }
WaiterTipTally (future): { staffId, date, totalTips, tablesServed, ... }
```

Note: Table.qr_code has no @unique constraint — base64 QR exceeds PostgreSQL btree 2704-byte limit.
Uniqueness is inherent (QR encodes unique table ID).

---

## FRANCHISE / CHAIN MANAGEMENT

isChain flag on Tenant. chainConfig: sharedCatalogue, allowBranchPricing, unifiedLoyalty.
Branch managers CAN: disable item locally, override price (if allowed).
Branch managers CANNOT: delete chain items, edit name/description.
getCatalogueForBranch() applies branch overrides on chain catalogue.
Head office sees consolidated chain dashboard with per-branch breakdown.
Loyalty points unified across all chain branches.

---

## STAFF SHIFTS & ATTENDANCE

Clock in methods: app PIN | GPS check | manual by manager
Auto-calculates: hoursWorked, lateByMins, overtimeMins
Monthly summary per staff available in reports.

---

## KOT ACK MODE (Tenant Model Field)

`kot_ack_mode`: auto | kds | printer (default "auto")
`kot_ack_delay_secs`: default 60

Default by plan: free → "auto", starter/pro → "kds"
Fetched by order-service at order placement (cached 30min in Redis).
