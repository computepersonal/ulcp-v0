/**
 * Bridges order-service → catalogue-service (recipes) → inventory-service (deduct).
 * Called when an order moves to "preparing" to auto-deduct ingredient stock.
 */
import { logger } from "./logger";

const CATALOGUE_URL = process.env["CATALOGUE_SERVICE_URL"] ?? "http://localhost:3003";
const INVENTORY_URL = process.env["INVENTORY_SERVICE_URL"] ?? "http://localhost:3005";

interface OrderLineItem {
  id?: string;
  name?: string;
  quantity?: number;
}

interface RecipeRow {
  item_id: string;
  ingredient_id: string | null;
  name: string;
  quantity: number | null;
  unit: string | null;
  is_critical: boolean;
}

/**
 * For a given order, fetch each item's recipe, aggregate by ingredient_id,
 * and call inventory-service to deduct stock + raise threshold alerts.
 *
 * Items without a linked ingredient_id (free-text recipe rows) are skipped
 * — they exist only for allergen/calorie tracking, not for inventory.
 *
 * Fire-and-forget: errors are logged but never thrown to the caller.
 */
export async function deductStockForOrder(input: {
  tenant_id: string;
  branch_id: string;
  order_id: string;
  items: unknown;
}): Promise<void> {
  const { tenant_id, branch_id, order_id, items } = input;

  const secret = process.env["INTERNAL_API_SECRET"];
  if (!secret) {
    logger.warn("INTERNAL_API_SECRET not set — skipping stock deduction");
    return;
  }

  // Build itemId → orderedQty map (snapshot stored as JSON on Order.items)
  const itemQtyMap: Map<string, number> = new Map();
  if (Array.isArray(items)) {
    for (const raw of items as OrderLineItem[]) {
      if (!raw || typeof raw !== "object") continue;
      const id = raw.id;
      const qty = typeof raw.quantity === "number" ? raw.quantity : 1;
      if (typeof id !== "string" || id.length === 0) continue;
      // Skip non-catalogue line items (jukebox songs, custom add-ons)
      if (id.startsWith("li-")) continue;
      itemQtyMap.set(id, (itemQtyMap.get(id) ?? 0) + qty);
    }
  }
  if (itemQtyMap.size === 0) return;

  // Fetch recipes from catalogue-service
  let recipes: Record<string, RecipeRow[]> = {};
  try {
    const res = await fetch(`${CATALOGUE_URL}/api/v1/catalogue/internal/recipes-bulk`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Secret": secret,
      },
      body: JSON.stringify({
        tenant_id,
        item_ids: Array.from(itemQtyMap.keys()),
      }),
    });
    if (!res.ok) {
      logger.warn({ order_id, httpStatus: res.status }, "recipes-bulk fetch failed");
      return;
    }
    const body = (await res.json()) as { data?: { recipes?: Record<string, RecipeRow[]> } };
    recipes = body.data?.recipes ?? {};
  } catch (err) {
    logger.warn({ err, order_id }, "Could not fetch recipes — skipping deduction");
    return;
  }

  // Aggregate by ingredient_id: sum (quantity per serving × ordered qty)
  const aggregate: Map<string, { ingredient_id: string; quantity: number; unit: string }> = new Map();
  for (const [itemId, orderQty] of itemQtyMap.entries()) {
    const rows = recipes[itemId] ?? [];
    for (const row of rows) {
      if (!row.ingredient_id || !row.quantity || row.quantity <= 0) continue;
      const totalQty = row.quantity * orderQty;
      const existing = aggregate.get(row.ingredient_id);
      if (existing) {
        existing.quantity += totalQty;
      } else {
        aggregate.set(row.ingredient_id, {
          ingredient_id: row.ingredient_id,
          quantity: totalQty,
          unit: row.unit ?? "pcs",
        });
      }
    }
  }
  if (aggregate.size === 0) return;

  // Call inventory-service to deduct
  try {
    const res = await fetch(`${INVENTORY_URL}/api/v1/inventory/internal/deduct`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Secret": secret,
      },
      body: JSON.stringify({
        tenant_id,
        branch_id,
        order_id,
        items: Array.from(aggregate.values()),
      }),
    });
    if (!res.ok) {
      logger.warn({ order_id, httpStatus: res.status }, "inventory deduct call failed");
      return;
    }
    logger.info(
      { order_id, ingredient_count: aggregate.size },
      "Stock deducted for order"
    );
  } catch (err) {
    logger.warn({ err, order_id }, "Could not call inventory deduct");
  }
}
