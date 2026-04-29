import { logger } from "../lib/logger";
import { prisma } from "../lib/prisma";
import { createPurchaseOrder } from "../repositories/purchaseOrder.repository";

const INVENTORY_URL = process.env["INVENTORY_SERVICE_URL"] ?? "http://localhost:3005";
const INTERNAL_SECRET = process.env["INTERNAL_API_SECRET"] ?? "";
const NOTIFICATION_URL = process.env["NOTIFICATION_SERVICE_URL"] ?? "http://localhost:3007";

export interface AutoReorderTrigger {
  tenant_id: string;
  branch_id: string;
  ingredient_id: string;
}

interface IngredientLite {
  id: string;
  name: string;
  unit: string;
  current_stock: number;
  minimum_stock: number;
  reorder_quantity: number;
}

export async function fetchIngredient(tenant_id: string, branch_id: string, ingredient_id: string): Promise<IngredientLite | null> {
  try {
    const res = await fetch(`${INVENTORY_URL}/api/v1/inventory/${tenant_id}/${branch_id}/ingredients/${ingredient_id}`, {
      headers: { "X-Internal-Secret": INTERNAL_SECRET },
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { success: boolean; data?: { ingredient?: IngredientLite } };
    return body.data?.ingredient ?? null;
  } catch (err) {
    logger.warn({ err, ingredient_id }, "fetchIngredient failed");
    return null;
  }
}

export interface AutoReorderResult {
  action: "po_created" | "bid_request_created" | "no_action";
  po_id?: string;
  bid_request_id?: string;
  reason?: string;
}

export async function handleStockLow(p: AutoReorderTrigger): Promise<AutoReorderResult> {
  const ingredient = await fetchIngredient(p.tenant_id, p.branch_id, p.ingredient_id);
  if (!ingredient) return { action: "no_action", reason: "ingredient_not_found" };
  if (ingredient.current_stock >= ingredient.minimum_stock) {
    return { action: "no_action", reason: "stock_sufficient" };
  }

  const reorder_qty = ingredient.reorder_quantity > 0 ? ingredient.reorder_quantity : Math.max(1, ingredient.minimum_stock * 2);

  // Look for preferred vendor with this ingredient
  const preferred = await prisma.vendorPreference.findFirst({
    where: { tenant_id: p.tenant_id, ingredient_id: p.ingredient_id, is_preferred: true },
  });

  if (preferred) {
    const vendorItem = await prisma.vendorItem.findFirst({
      where: { tenant_id: p.tenant_id, vendor_id: preferred.vendor_id, ingredient_id: p.ingredient_id, is_available: true },
    });
    if (vendorItem) {
      const po = await createPurchaseOrder({
        tenant_id: p.tenant_id,
        branch_id: p.branch_id,
        vendor_id: preferred.vendor_id,
        items: [{
          ingredient_id: ingredient.id,
          ingredient_name: ingredient.name,
          unit: ingredient.unit,
          quantity: Math.max(reorder_qty, vendorItem.min_order_quantity),
          unit_price: vendorItem.unit_price,
        }],
        notes: "Auto-reorder triggered by low stock",
        created_by: "system",
        source: "auto_reorder",
      });
      logger.info({ ingredient_id: p.ingredient_id, po_id: po.id }, "Auto-reorder PO created");
      return { action: "po_created", po_id: po.id };
    }
  }

  // Otherwise create a 4-hour bid request and notify vendors
  const result = await createBidRequestForIngredient({
    tenant_id: p.tenant_id,
    branch_id: p.branch_id,
    ingredient_id: ingredient.id,
    ingredient_name: ingredient.name,
    ingredient_unit: ingredient.unit,
    quantity: reorder_qty,
    close_in_hours: 4,
    title_prefix: "Urgent",
    description: `Auto bid request — current stock ${ingredient.current_stock} ${ingredient.unit}, need ${reorder_qty} ${ingredient.unit}`,
    created_by: "system",
    auto: true,
  });

  return { action: "bid_request_created", bid_request_id: result.bid_request_id };
}

// ─── Reusable: create bid request for a single ingredient + invite all matching vendors ──

export interface CreateBidForIngredientOpts {
  tenant_id: string;
  branch_id: string;
  ingredient_id: string;
  ingredient_name: string;
  ingredient_unit: string;
  quantity: number;
  close_in_hours: number;
  title_prefix?: string;
  description?: string;
  created_by: string;
  auto?: boolean;
}

export interface CreateBidForIngredientResult {
  bid_request_id: string;
  vendors_invited: number;
  whatsapps_sent: number;
}

export async function createBidRequestForIngredient(
  opts: CreateBidForIngredientOpts,
): Promise<CreateBidForIngredientResult> {
  const close_at = new Date(Date.now() + opts.close_in_hours * 60 * 60 * 1000);
  const titlePrefix = opts.title_prefix ?? "Quote request";

  const bidRequest = await prisma.bidRequest.create({
    data: {
      tenant_id: opts.tenant_id,
      branch_id: opts.branch_id,
      title: `${titlePrefix}: ${opts.ingredient_name}${opts.auto ? " (auto)" : ""}`,
      description: opts.description ?? `Quote request for ${opts.quantity} ${opts.ingredient_unit} of ${opts.ingredient_name}`,
      status: "open",
      items: [{
        ingredient_id: opts.ingredient_id,
        ingredient_name: opts.ingredient_name,
        unit: opts.ingredient_unit,
        quantity: opts.quantity,
      }] as unknown as object[],
      bid_open_at: new Date(),
      bid_close_at: close_at,
      created_by: opts.created_by,
    },
  });

  const vendorItems = await prisma.vendorItem.findMany({
    where: { tenant_id: opts.tenant_id, ingredient_id: opts.ingredient_id, is_available: true },
    include: { vendor: true },
    take: 50,
  });

  let whatsapps_sent = 0;
  await Promise.all(vendorItems.map(async (vi) => {
    await prisma.bidRequestVendor.create({
      data: {
        bid_request_id: bidRequest.id,
        vendor_id: vi.vendor_id,
        notified_at: new Date(),
        notification_channel: vi.vendor.contact_whatsapp ? "whatsapp" : "none",
      },
    }).catch(() => undefined);

    if (vi.vendor.contact_whatsapp) {
      const sent = await fetch(`${NOTIFICATION_URL}/api/v1/notifications/whatsapp`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Internal-Secret": INTERNAL_SECRET },
        body: JSON.stringify({
          to: vi.vendor.contact_whatsapp,
          template: "bid_request_invite",
          params: {
            vendor_name: vi.vendor.name,
            item: opts.ingredient_name,
            qty: opts.quantity,
            close_at: close_at.toISOString(),
          },
        }),
      }).then((r) => r.ok).catch((err) => {
        logger.warn({ err, vendor: vi.vendor.id }, "WhatsApp notify failed");
        return false;
      });
      if (sent) whatsapps_sent++;
    }
  }));

  logger.info(
    { ingredient_id: opts.ingredient_id, bid_request_id: bidRequest.id, vendors: vendorItems.length, whatsapps_sent },
    "Bid request created for ingredient",
  );

  return {
    bid_request_id: bidRequest.id,
    vendors_invited: vendorItems.length,
    whatsapps_sent,
  };
}
