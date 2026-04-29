import { prisma } from "../lib/prisma";
import { logger } from "../lib/logger";
import { pushReceiveToInventory } from "./inventorySync.service";
import type { GoodsReceivedNote, GRNItem, PurchaseOrder, POItem } from "../generated/prisma";

export interface CompleteGrnResult {
  grn: GoodsReceivedNote & { items: GRNItem[] };
  inventory_results: Array<{
    ingredient_id: string;
    ok: boolean;
    current_stock?: number;
    average_cost?: number;
    error?: string;
  }>;
  po_status: string;
}

export async function completeGrn(
  grn_id: string,
  tenant_id: string
): Promise<CompleteGrnResult | null> {
  const grn = await prisma.goodsReceivedNote.findFirst({
    where: { id: grn_id, tenant_id },
    include: { items: true, purchase_order: { include: { items: true } } },
  });
  if (!grn) return null;
  if (grn.status === "completed") {
    return { grn, inventory_results: [], po_status: grn.purchase_order.status };
  }

  // Push each line to inventory-service
  const results = await Promise.all(
    grn.items
      .filter((it) => it.received_quantity > 0)
      .map((it) =>
        pushReceiveToInventory({
          tenant_id,
          branch_id: grn.branch_id,
          ingredient_id: it.ingredient_id,
          quantity: it.received_quantity,
          unit_cost: it.unit_price,
          batch_number: it.batch_number,
          expiry_date: it.expiry_date ? it.expiry_date.toISOString() : null,
          reference_id: grn.id,
          reference_type: "grn",
        })
      )
  );

  // Update each PO line received_quantity
  for (const it of grn.items) {
    if (it.po_item_id) {
      await prisma.pOItem.update({
        where: { id: it.po_item_id },
        data: { received_quantity: { increment: it.received_quantity } },
      });
    }
  }

  // Re-fetch PO items to compute new status
  const po = await prisma.purchaseOrder.findFirst({
    where: { id: grn.po_id, tenant_id },
    include: { items: true },
  });
  let new_po_status = po?.status ?? "sent";
  if (po) {
    const allReceived = po.items.every((it) => it.received_quantity >= it.quantity);
    const anyReceived = po.items.some((it) => it.received_quantity > 0);
    if (allReceived) new_po_status = "received";
    else if (anyReceived) new_po_status = "partial";
    if (new_po_status !== po.status) {
      await prisma.purchaseOrder.update({
        where: { id: po.id },
        data: { status: new_po_status },
      });
    }
  }

  // Mark GRN completed
  const updated = await prisma.goodsReceivedNote.update({
    where: { id: grn.id },
    data: { status: "completed" },
    include: { items: true },
  });

  // Update vendor totals
  await prisma.vendor.updateMany({
    where: { id: grn.vendor_id, tenant_id },
    data: { total_orders: { increment: 1 }, total_spent: { increment: grn.total_received_value } },
  });

  logger.info(
    { grn_id, po_id: grn.po_id, items_synced: results.filter((r) => r.ok).length },
    "GRN completed and inventory synced"
  );

  return { grn: updated, inventory_results: results, po_status: new_po_status };
}

export interface ThreeWayMatch {
  status: "matched" | "mismatched";
  warnings: Array<{
    ingredient_id: string;
    ingredient_name: string;
    po_qty: number;
    grn_qty: number;
    bill_qty: number;
    issue: string;
  }>;
}

export function performThreeWayMatch(
  po: PurchaseOrder & { items: POItem[] },
  grn: GoodsReceivedNote & { items: GRNItem[] },
  bill_items: Array<{ ingredient_id: string; quantity: number; unit_price: number; total: number; ingredient_name?: string }>
): ThreeWayMatch {
  const warnings: ThreeWayMatch["warnings"] = [];
  for (const billLine of bill_items) {
    const poLine = po.items.find((p) => p.ingredient_id === billLine.ingredient_id);
    const grnLine = grn.items.find((g) => g.ingredient_id === billLine.ingredient_id);
    const po_qty = poLine?.quantity ?? 0;
    const grn_qty = grnLine?.received_quantity ?? 0;
    const bill_qty = billLine.quantity;
    const issues: string[] = [];
    if (Math.abs(bill_qty - grn_qty) > 0.001) issues.push("bill_qty != grn_qty");
    if (Math.abs(grn_qty - po_qty) > 0.001) issues.push("grn_qty != po_qty");
    if (poLine && Math.abs(billLine.unit_price - poLine.unit_price) > 0) issues.push("unit_price changed");
    if (issues.length > 0) {
      warnings.push({
        ingredient_id: billLine.ingredient_id,
        ingredient_name: billLine.ingredient_name ?? poLine?.ingredient_name ?? "",
        po_qty,
        grn_qty,
        bill_qty,
        issue: issues.join(", "),
      });
    }
  }
  return { status: warnings.length === 0 ? "matched" : "mismatched", warnings };
}
