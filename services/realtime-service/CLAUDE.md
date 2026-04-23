# realtime-service — Domain Context

> Platform-wide conventions, tech stack, and coding rules are in the **root CLAUDE.md**.
> This file contains realtime-service-specific domain knowledge only.

---

## SOCKET.IO ROOMS

```
tenant:TENANTID                    ← all staff
tenant:TENANTID:branch:BRANCHID    ← branch staff
tenant:TENANTID:owner              ← owner + managing partners
tenant:TENANTID:dashboard          ← live dashboard
kitchen:TENANTID:BRANCHID:kitchen  ← kitchen KDS
kitchen:TENANTID:BRANCHID:bar      ← bar KDS (Type 3 only)
session:SESSIONID                  ← customer table session
customer:CUSTOMERID                ← customer all devices
token:TENANTID:BRANCHID            ← Type 1 token display
```

---

## KEY EVENTS (Redis Pub/Sub)

This service subscribes to all events below and forwards them to the correct Socket.io rooms.

```
ORDER_CREATED          → realtime, notification
ORDER_STATUS_CHANGED   → realtime, inventory (on preparing)
ORDER_COMPLETED        → inventory, loyalty, analytics, commission
PAYMENT_COMPLETED      → notification (receipt)
KOT_CREATED            → realtime (KDS), notification (printer)
KOT_STATUS_CHANGED     → realtime, notification (waiter)
TABLE_CLOSED           → realtime, analytics
STOCK_LOW              → notification
STOCK_CRITICAL         → notification, catalogue (disable items)
ITEM_BACK_IN_STOCK     → loyalty (notify wishlisters)
TENANT_PLAN_CHANGED    → tenant (update gates), realtime (invalidate)
```

### Socket.io → Redux (socketMiddleware on client)

```
table:status:changed    → updateTableStatus()
order:new               → addActiveOrder() + playSound()
kot:created             → addKOT()
kot:ready               → markKOTReady() + showNotification()
inventory:critical      → addInventoryAlert() + playSound()
dashboard:update        → updateDashboardMetrics()
menu:item:unavailable   → markItemUnavailable() in catalogue slice
```

Zero polling anywhere. All real-time via Socket.io events.
