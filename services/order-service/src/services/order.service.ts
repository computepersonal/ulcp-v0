import { AppError } from "@ulcp/shared";
import {
  createOrder,
  findOrders,
  findOrderById,
  updateOrderStatus,
  updatePaymentStatus,
  createStatusHistory,
  ListOrdersFilter,
} from "../repositories/order.repository";
import {
  createKOT,
  findKOTs,
  findKOTById,
  updateKOTStatus,
} from "../repositories/kot.repository";
import { createCommissionRecord } from "../repositories/commission.repository";
import { nextOrderNumber, nextKotNumber } from "../repositories/counter.repository";
import { redisPublish } from "../lib/redis";
import { logger } from "../lib/logger";
import { Prisma } from "../generated/prisma";
import { scheduleKotAutoAck, cancelKotAutoAck } from "../lib/queue";

// Commission rates from env (fallback to CLAUDE.md constants)
const COMMISSION_RATES: Record<string, number> = {
  free: parseFloat(process.env["COMMISSION_FREE"] ?? "3"),
  starter: parseFloat(process.env["COMMISSION_STARTER"] ?? "2"),
  pro: parseFloat(process.env["COMMISSION_PRO"] ?? "1.5"),
};

// ─── Types ────────────────────────────────────────────────────────────────────

export interface OrderItem {
  id: string;
  name: string;
  price: number; // paise
  quantity: number;
  veg_type?: string;
  gst_rate?: number; // percentage e.g. 5, 12, 18
  is_tax_inclusive?: boolean;
  station?: string; // "kitchen" | "bar"
  variant_name?: string;
  options?: unknown[];
  addons?: unknown[];
}

export interface CreateOrderInput {
  tenant_id: string;
  branch_id: string;
  table_id?: string;
  table_name?: string; // snapshot at time of order — persisted so renames don't affect history
  session_id?: string;
  customer_id?: string;
  type: string; // dine_in | takeaway | delivery
  business_type: string; // determines KOT routing
  kot_ack_mode?: "auto" | "kds" | "printer"; // from tenant config
  kot_ack_delay_secs?: number; // used when mode = "auto"
  items: OrderItem[];
  discount_amount?: number;
  tip_amount?: number;
  notes?: string;
  placed_by: string; // user_id or customer_id of person placing order
}

interface GstBreakdown {
  cgst: number;
  sgst: number;
  igst: number;
}

interface BillResult {
  subtotal: number;
  tax_amount: number;
  discount_amount: number;
  tip_amount: number;
  total: number;
  gst_breakdown: GstBreakdown;
}

// ─── Bill calculation ─────────────────────────────────────────────────────────

function calculateBill(
  items: OrderItem[],
  discount = 0,
  tip = 0
): BillResult {
  let subtotal = 0;
  let tax_amount = 0;
  let cgst = 0;
  let sgst = 0;

  for (const item of items) {
    const itemTotal = item.price * item.quantity;
    subtotal += itemTotal;

    if (item.gst_rate && item.gst_rate > 0) {
      let itemTax: number;

      if (item.is_tax_inclusive) {
        // Extract tax from inclusive price
        const taxable = Math.round((itemTotal * 100) / (100 + item.gst_rate));
        itemTax = itemTotal - taxable;
      } else {
        itemTax = Math.round((itemTotal * item.gst_rate) / 100);
      }

      tax_amount += itemTax;
      // Split equally as CGST + SGST (intrastate — simplified)
      cgst += Math.round(itemTax / 2);
      sgst += Math.round(itemTax / 2);
    }
  }

  const total = Math.max(0, subtotal + tax_amount - discount + tip);

  return {
    subtotal,
    tax_amount,
    discount_amount: discount,
    tip_amount: tip,
    total,
    gst_breakdown: { cgst, sgst, igst: 0 },
  };
}

// ─── KOT generation ───────────────────────────────────────────────────────────

async function generateKOTs(order_id: string, input: CreateOrderInput) {
  const ackMode = input.kot_ack_mode ?? "auto";
  const delaySecs = input.kot_ack_delay_secs ?? 60;

  async function makeKOT(
    station: string,
    items: OrderItem[]
  ) {
    const kot_number = await nextKotNumber(input.branch_id);
    const kot = await createKOT({
      tenant_id: input.tenant_id,
      branch_id: input.branch_id,
      order: { connect: { id: order_id } },
      kot_number,
      station,
      status: "pending",
      items: items as unknown as Prisma.InputJsonValue,
      table_name: input.table_name ?? null,
    });

    // Apply acknowledgment mode
    if (ackMode === "auto") {
      // Schedule auto-ack job — fires after delay_secs if still pending
      await scheduleKotAutoAck(kot.id, input.tenant_id, delaySecs).catch(
        (err: unknown) => logger.warn({ err, kot_id: kot.id }, "Failed to schedule KOT auto-ack")
      );
    }
    // "kds" → staff taps on KDS — no action needed here
    // "printer" → printer-ack endpoint triggers acknowledgment — no action needed here

    // Publish KOT_CREATED so realtime-service can push to KDS via Socket.io
    await redisPublish(
      "KOT_CREATED",
      JSON.stringify({
        id:          kot.id,
        kot_number:  kot.kot_number,
        tenant_id:   input.tenant_id,
        branch_id:   input.branch_id,
        order_id,
        station,
        status:      "pending",
        items,
        order_type:  input.type ?? "dine_in",
        table_name:  input.table_name ?? null,
        created_at:  kot.created_at,
      })
    ).catch((err: unknown) => logger.warn({ err, kot_id: kot.id }, "Failed to publish KOT_CREATED"));

    return kot;
  }

  // Type 3 (seated_full_service) auto-splits food → kitchen, drink → bar
  if (input.business_type === "seated_full_service") {
    const kitchenItems = input.items.filter((i) => i.station !== "bar");
    const barItems = input.items.filter((i) => i.station === "bar");
    const kots = [];
    if (kitchenItems.length > 0) kots.push(await makeKOT("kitchen", kitchenItems));
    if (barItems.length > 0) kots.push(await makeKOT("bar", barItems));
    return kots;
  }

  // Single KOT for all other business types
  return [await makeKOT("kitchen", input.items)];
}

// ─── Commission handling ──────────────────────────────────────────────────────

async function handleOrderCompleted(
  order_id: string,
  tenant_id: string,
  total: number
): Promise<void> {
  try {
    // Default to free plan rate — in future, fetch from tenant-service
    const plan = "free";
    const rate = COMMISSION_RATES[plan] ?? 3;
    const amount = Math.round((total * rate) / 100);

    await createCommissionRecord({ order_id, tenant_id, rate, amount, plan });

    await redisPublish(
      "ORDER_COMPLETED",
      JSON.stringify({ order_id, tenant_id, total, commission_amount: amount })
    ).catch((err: unknown) =>
      logger.warn({ err }, "Failed to publish ORDER_COMPLETED")
    );
  } catch (err) {
    logger.error({ err, order_id }, "Failed to record commission on completion");
  }
}

// ─── Public service functions ─────────────────────────────────────────────────

export async function placeOrder(input: CreateOrderInput) {
  const bill = calculateBill(
    input.items,
    input.discount_amount ?? 0,
    input.tip_amount ?? 0
  );

  const order_number = await nextOrderNumber(input.branch_id);

  const order = await createOrder({
    tenant_id: input.tenant_id,
    branch_id: input.branch_id,
    table_id: input.table_id,
    table_name: input.table_name,
    session_id: input.session_id,
    customer_id: input.customer_id,
    order_number,
    type: input.type,
    status: "pending",
    items: input.items as unknown as Prisma.InputJsonValue,
    subtotal: bill.subtotal,
    tax_amount: bill.tax_amount,
    discount_amount: bill.discount_amount,
    tip_amount: bill.tip_amount,
    total: bill.total,
    gst_breakdown: bill.gst_breakdown as unknown as Prisma.InputJsonValue,
    payment_status: "pending",
    notes: input.notes,
  });

  const kots = await generateKOTs(order.id, input);

  // Record initial status in history
  await createStatusHistory(order.id, "pending", input.placed_by);

  // Publish event — non-blocking
  const orderItems = input.items as Array<{ quantity?: number }>;
  const item_count = orderItems.reduce((sum, i) => sum + (i.quantity ?? 1), 0);

  await redisPublish(
    "ORDER_CREATED",
    JSON.stringify({
      order_id: order.id,
      tenant_id: input.tenant_id,
      branch_id: input.branch_id,
      order_number,
      // Full snapshot so staff portal can add to kanban without a refetch
      order: {
        id: order.id,
        order_number,
        type: order.type,
        status: "pending",
        total: order.total,
        item_count,
        created_at: order.created_at,
        table_id: order.table_id ?? null,
        kots: kots.map((k) => ({ id: k.id, kot_number: k.kot_number, status: k.status, station: k.station, items: k.items })),
      },
      kots: kots.map((k) => ({
        id: k.id,
        station: k.station,
        kot_number: k.kot_number,
      })),
    })
  ).catch((err: unknown) =>
    logger.warn({ err }, "Failed to publish ORDER_CREATED")
  );

  return { ...order, kots };
}

export async function cancelOrder(
  order_id: string,
  tenant_id: string,
  cancelled_by: string,
  reason: string,
  role: string
) {
  const order = await findOrderById(order_id, tenant_id);
  if (!order) throw new AppError("Order not found", 404);

  if (order.status === "completed" || order.status === "cancelled") {
    throw new AppError(
      `Cannot cancel an order with status: ${order.status}`,
      400
    );
  }

  // Cancellation rules from CLAUDE.md:
  // pending → anyone can cancel
  // confirmed → staff+ (not customer)
  // preparing → owner only
  if (order.status === "confirmed" && role === "customer") {
    throw new AppError("Only staff can cancel a confirmed order", 403);
  }
  if (
    order.status === "preparing" &&
    role !== "tenant_owner" &&
    role !== "platform_superadmin"
  ) {
    throw new AppError(
      "Only the owner can cancel an order that is being prepared",
      403
    );
  }

  const updated = await updateOrderStatus(order_id, "cancelled", {
    cancelled_reason: reason,
    cancelled_by,
  });

  await createStatusHistory(order_id, "cancelled", cancelled_by, reason);

  await redisPublish(
    "ORDER_STATUS_CHANGED",
    JSON.stringify({ order_id, tenant_id, status: "cancelled" })
  ).catch((err: unknown) =>
    logger.warn({ err }, "Failed to publish ORDER_STATUS_CHANGED")
  );

  return updated;
}

export async function changeOrderStatus(
  order_id: string,
  tenant_id: string,
  new_status: string,
  changed_by: string
) {
  const order = await findOrderById(order_id, tenant_id);
  if (!order) throw new AppError("Order not found", 404);

  const updated = await updateOrderStatus(order_id, new_status);
  await createStatusHistory(order_id, new_status, changed_by);

  if (new_status === "completed") {
    await handleOrderCompleted(order_id, tenant_id, order.total);
  }

  await redisPublish(
    "ORDER_STATUS_CHANGED",
    JSON.stringify({ order_id, tenant_id, status: new_status })
  ).catch((err: unknown) =>
    logger.warn({ err }, "Failed to publish ORDER_STATUS_CHANGED")
  );

  return updated;
}

export async function recordPayment(
  order_id: string,
  tenant_id: string,
  payment_method: string
) {
  const order = await findOrderById(order_id, tenant_id);
  if (!order) throw new AppError("Order not found", 404);

  // Mark payment paid
  await updatePaymentStatus(order_id, "paid", payment_method);

  // Mark order completed
  const updated = await updateOrderStatus(order_id, "completed");
  await createStatusHistory(order_id, "completed", "staff", `Payment received via ${payment_method}`);

  // Commission calculation on completion
  await handleOrderCompleted(order_id, tenant_id, order.total);

  await redisPublish(
    "PAYMENT_COMPLETED",
    JSON.stringify({ order_id, tenant_id, branch_id: order.branch_id, payment_method, total: order.total })
  ).catch((err: unknown) =>
    logger.warn({ err }, "Failed to publish PAYMENT_COMPLETED")
  );

  await redisPublish(
    "ORDER_STATUS_CHANGED",
    JSON.stringify({ order_id, tenant_id, branch_id: order.branch_id, status: "completed" })
  ).catch((err: unknown) =>
    logger.warn({ err }, "Failed to publish ORDER_STATUS_CHANGED after payment")
  );

  return updated;
}

export async function getOrderBill(order_id: string, tenant_id: string) {
  const order = await findOrderById(order_id, tenant_id);
  if (!order) throw new AppError("Order not found", 404);

  return {
    order_id: order.id,
    order_number: order.order_number,
    items: order.items,
    subtotal: order.subtotal,
    tax_amount: order.tax_amount,
    discount_amount: order.discount_amount,
    tip_amount: order.tip_amount,
    total: order.total,
    gst_breakdown: order.gst_breakdown,
    payment_status: order.payment_status,
    payment_method: order.payment_method,
  };
}

/**
 * Acknowledge a KOT — used by all 3 modes.
 * - kds: called when chef taps on KDS screen
 * - printer: called by printer-ack endpoint after successful print
 * - auto: called by BullMQ worker after delay
 * Cancels any pending auto-ack job so it doesn't fire again.
 */
export async function acknowledgeKot(kot_id: string, tenant_id: string) {
  const kot = await findKOTById(kot_id, tenant_id);
  if (!kot) throw new AppError("KOT not found", 404);
  if (kot.status !== "pending") {
    // Already acknowledged — idempotent, return current state
    return kot;
  }

  const updated = await updateKOTStatus(kot_id, "acknowledged");

  // Cancel the pending auto-ack job if it exists (for kds/printer modes)
  await cancelKotAutoAck(kot_id).catch(
    (err: unknown) => logger.warn({ err, kot_id }, "Could not cancel auto-ack job")
  );

  await redisPublish(
    "KOT_STATUS_CHANGED",
    JSON.stringify({ kot_id, tenant_id, status: "acknowledged" })
  ).catch((err: unknown) => logger.warn({ err }, "Failed to publish KOT_STATUS_CHANGED"));

  return updated;
}

// Re-export repository functions for use in routes
export { findOrders, findOrderById };
export { findKOTs, findKOTById, updateKOTStatus };
export type { ListOrdersFilter };
