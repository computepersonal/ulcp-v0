import { prisma } from "../lib/prisma";
import { adjustStock, findIngredientById } from "../repositories/ingredient.repository";
import { redisPublish } from "../lib/redis";
import { logger } from "../lib/logger";

interface OrderItem {
  ingredient_id: string;
  quantity: number;
  unit: string;
}

/**
 * Called when an order moves to "preparing" status.
 * Deducts stock for each ingredient and checks thresholds.
 */
export async function deductStockForOrder(
  tenant_id: string,
  branch_id: string,
  order_id: string,
  items: OrderItem[]
) {
  const alerts: Array<{ ingredient_id: string; name: string; level: "low" | "critical"; stock: number }> = [];
  const disabledItems: string[] = [];

  for (const item of items) {
    const ingredient = await findIngredientById(item.ingredient_id, tenant_id);
    if (!ingredient) {
      logger.warn({ ingredient_id: item.ingredient_id }, "ingredient not found during stock deduction");
      continue;
    }

    const { ingredient: updated } = await adjustStock(
      item.ingredient_id,
      tenant_id,
      branch_id,
      -item.quantity,
      {
        movement_type: "order_deduct",
        reference_id: order_id,
        reference_type: "order",
        unit: item.unit,
      }
    );

    // Check thresholds
    if (ingredient.critical_stock > 0 && updated.current_stock <= ingredient.critical_stock) {
      alerts.push({ ingredient_id: ingredient.id, name: ingredient.name, level: "critical", stock: updated.current_stock });
      if (updated.current_stock <= 0) {
        disabledItems.push(ingredient.id);
      }
    } else if (ingredient.minimum_stock > 0 && updated.current_stock <= ingredient.minimum_stock) {
      alerts.push({ ingredient_id: ingredient.id, name: ingredient.name, level: "low", stock: updated.current_stock });
    }
  }

  // Publish events
  for (const alert of alerts) {
    const channel = alert.level === "critical" ? "STOCK_CRITICAL" : "STOCK_LOW";
    await redisPublish(channel, JSON.stringify({ tenant_id, branch_id, ...alert })).catch(
      (err) => logger.error({ err }, "failed to publish stock alert")
    );
  }

  // Publish item-disable events for catalogue-service
  for (const ingredient_id of disabledItems) {
    await redisPublish("STOCK_CRITICAL_DISABLE", JSON.stringify({ tenant_id, branch_id, ingredient_id })).catch(
      (err) => logger.error({ err }, "failed to publish disable event")
    );
  }

  return { alerts, disabled_ingredients: disabledItems };
}

/**
 * Receive a purchase order — add stock for each item.
 */
export async function receiveStock(
  tenant_id: string,
  branch_id: string,
  po_id: string,
  items: Array<{ ingredient_id: string; quantity: number; unit: string; unit_price: number }>,
  received_by: string
) {
  for (const item of items) {
    const ingredient = await findIngredientById(item.ingredient_id, tenant_id);
    if (!ingredient) continue;

    const { ingredient: updated } = await adjustStock(
      item.ingredient_id,
      tenant_id,
      branch_id,
      item.quantity,
      {
        movement_type: "purchase",
        reference_id: po_id,
        reference_type: "purchase_order",
        unit: item.unit,
        created_by: received_by,
      }
    );

    // If ingredient was critical and is now restocked, publish back-in-stock event
    if (ingredient.current_stock <= ingredient.critical_stock && updated.current_stock > ingredient.critical_stock) {
      await redisPublish("ITEM_BACK_IN_STOCK", JSON.stringify({
        tenant_id,
        branch_id,
        ingredient_id: ingredient.id,
        ingredient_name: ingredient.name,
      })).catch((err) => logger.error({ err }, "failed to publish back-in-stock event"));
    }

    // Update average cost
    if (item.unit_price > 0) {
      const avgCost = ingredient.average_cost > 0
        ? Math.round((ingredient.average_cost + item.unit_price) / 2)
        : item.unit_price;
      await prisma.ingredient.update({
        where: { id: ingredient.id },
        data: {
          last_purchase_price: item.unit_price,
          average_cost: avgCost,
          unit_cost: item.unit_price,
        },
      });
    }
  }
}
