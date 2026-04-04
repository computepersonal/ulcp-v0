import { AppError } from "@ulcp/shared";
import {
  createDirectOrder,
  findDirectOrderById,
  updateDirectOrder,
} from "../repositories/directOrder.repository";
import { createVendorToken } from "../repositories/bid.repository";
import { findVendorById } from "../repositories/vendor.repository";
import { redisPublish } from "../lib/redis";
import { invalidateMarketCache } from "./market.service";
import { logger } from "../lib/logger";
import type { Prisma } from "../generated/prisma";

const INVENTORY_URL = process.env["INVENTORY_SERVICE_URL"] ?? "http://localhost:3005";
const INTERNAL_SECRET = process.env["INTERNAL_API_SECRET"] ?? "";

export interface DirectOrderItem {
  ingredient_id: string;
  ingredient_name: string;
  quantity: number;
  unit: string;
  unit_price: number;
  notes?: string;
}

export interface CreateDirectOrderInput {
  tenant_id: string;
  branch_id: string;
  vendor_id: string;
  items: DirectOrderItem[];
  expected_delivery_date?: string;
  delivery_notes?: string;
  payment_terms: string;
  created_by: string;
}

export async function placeDirectOrder(input: CreateDirectOrderInput) {
  const vendor = await findVendorById(input.vendor_id, input.tenant_id);
  if (!vendor) throw new AppError("Vendor not found", 404);
  if (!vendor.is_active) throw new AppError("Vendor is not active", 400);

  const total_amount = input.items.reduce(
    (sum, item) => sum + item.unit_price * item.quantity,
    0
  );

  const order = await createDirectOrder({
    tenant_id: input.tenant_id,
    branch_id: input.branch_id,
    vendor: { connect: { id: input.vendor_id } },
    items: input.items as unknown as Prisma.InputJsonValue[],
    total_amount,
    payment_terms: input.payment_terms,
    expected_delivery_date: input.expected_delivery_date
      ? new Date(input.expected_delivery_date)
      : null,
    delivery_notes: input.delivery_notes,
    created_by: input.created_by,
  });

  // Create PO in inventory-service (non-blocking)
  let purchase_order_id: string | null = null;
  try {
    const res = await fetch(
      `${INVENTORY_URL}/api/v1/inventory/${input.tenant_id}/purchase-orders`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Internal-Secret": INTERNAL_SECRET,
        },
        body: JSON.stringify({
          vendor_id: input.vendor_id,
          vendor_name: vendor.name,
          branch_id: input.branch_id,
          source: "direct_order",
          direct_order_id: order.id,
          items: input.items,
          total_amount,
          payment_terms: input.payment_terms,
          expected_delivery_date: input.expected_delivery_date,
        }),
      }
    );
    if (res.ok) {
      const body = (await res.json()) as { data?: { purchase_order?: { id?: string } } };
      purchase_order_id = body.data?.purchase_order?.id ?? null;
      if (purchase_order_id) {
        await updateDirectOrder(order.id, input.tenant_id, { purchase_order_id });
      }
    }
  } catch (err) {
    logger.warn({ err }, "Could not create PO in inventory-service for direct order");
  }

  // Generate vendor token for notification link
  const expires_at = input.expected_delivery_date
    ? new Date(input.expected_delivery_date)
    : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
  const vt = await createVendorToken({
    vendor_id: input.vendor_id,
    direct_order_id: order.id,
    token_type: "direct_order",
    expires_at,
  });

  await invalidateMarketCache(input.tenant_id);

  await redisPublish(
    "DIRECT_ORDER_CREATED",
    JSON.stringify({
      direct_order_id: order.id,
      tenant_id: input.tenant_id,
      vendor_id: input.vendor_id,
      vendor_token: vt.token,
      total_amount,
    })
  ).catch((err: unknown) => logger.warn({ err }, "Failed to publish DIRECT_ORDER_CREATED"));

  return { ...order, purchase_order_id, vendor_token: vt.token };
}

export async function updateDirectOrderStatus(
  id: string,
  tenant_id: string,
  status: string
) {
  const order = await findDirectOrderById(id, tenant_id);
  if (!order) throw new AppError("Direct order not found", 404);

  const allowedTransitions: Record<string, string[]> = {
    pending: ["confirmed", "cancelled"],
    confirmed: ["dispatched", "cancelled"],
    dispatched: ["delivered"],
    delivered: [],
    cancelled: [],
  };

  if (!allowedTransitions[order.status]?.includes(status)) {
    throw new AppError(
      `Cannot transition from ${order.status} to ${status}`,
      400
    );
  }

  const now = new Date();
  const timestamps: Record<string, Date> = {
    confirmed: now,
    dispatched: now,
    delivered: now,
    cancelled: now,
  };
  const timestampFields: Record<string, Prisma.DirectOrderUpdateInput> = {
    confirmed: { confirmed_at: timestamps.confirmed },
    dispatched: { dispatched_at: timestamps.dispatched },
    delivered: { delivered_at: timestamps.delivered },
    cancelled: { cancelled_at: timestamps.cancelled },
  };

  await updateDirectOrder(id, tenant_id, {
    status: status as never,
    ...(timestampFields[status] ?? {}),
  });

  // On delivered: notify inventory-service to update stock
  if (status === "delivered" && order.purchase_order_id) {
    try {
      await fetch(
        `${INVENTORY_URL}/api/v1/inventory/${tenant_id}/purchase-orders/${order.purchase_order_id}/receive`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Internal-Secret": INTERNAL_SECRET,
          },
          body: JSON.stringify({ direct_order_id: id, items: order.items }),
        }
      );
    } catch (err) {
      logger.warn({ err }, "Could not notify inventory-service of delivery");
    }
  }

  await redisPublish(
    "DIRECT_ORDER_STATUS_CHANGED",
    JSON.stringify({ direct_order_id: id, tenant_id, status })
  ).catch((err: unknown) => logger.warn({ err }, "Failed to publish DIRECT_ORDER_STATUS_CHANGED"));

  return findDirectOrderById(id, tenant_id);
}
