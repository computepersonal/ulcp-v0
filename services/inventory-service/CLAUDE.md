# inventory-service — Domain Context

> Platform-wide conventions, tech stack, and coding rules are in the **root CLAUDE.md**.
> This file contains inventory-service-specific domain knowledge only.

---

## RECIPE-TO-INVENTORY SYSTEM (Starter+)

When order.status → preparing: deductStockForOrder() auto-runs
Deducts ingredient quantities × order qty
Records every deduction in StockMovement
Checks thresholds → sends alerts
Critical ingredient at 0 → item auto-disabled, reverses on restock

### isCritical Flag

If critical ingredient = 0 → all dependent items auto-disabled via Socket.io
Customer sees "Not available today". Reverses when restocked.

### Stock Alerts

minimumStock → LOW (yellow), criticalStock → CRITICAL (red)
Both: Socket.io to staff + critical also SMS

### Ingredient Model

```
tenantId, branchId, name, category, unit
currentStock, minimumStock, criticalStock, maximumStock, reorderQuantity
unitCost, lastPurchasePrice, averageCost
supplier, supplierContact, supplierLeadDays
dailyAverageUsage, weeksOfStockRemaining
```

### Cross-Service Reference

`ingredient_id` in catalogue-service's ItemIngredient model is a cross-service reference
to this service's Ingredient model. There is no database foreign key — the link is enforced
at the application level only.

When inventory-service receives ORDER_STATUS_CHANGED (→ preparing):
1. Read ItemIngredient records from catalogue-service for each ordered item
2. Deduct `quantity × order_qty` from Ingredient.currentStock
3. Record StockMovement entry for every deduction
4. If currentStock ≤ criticalStock → publish STOCK_CRITICAL event
5. If currentStock ≤ minimumStock → publish STOCK_LOW event
6. If is_critical=true and currentStock=0 → publish STOCK_CRITICAL to auto-disable item in catalogue
