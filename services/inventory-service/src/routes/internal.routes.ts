import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import { deductStockForOrder, receiveStock } from "../services/stock.service";
import { createPurchaseOrder, getNextPoNumber, updatePurchaseOrder, findPurchaseOrderById } from "../repositories/purchaseOrder.repository";
import { logger } from "../lib/logger";

const INTERNAL_SECRET = process.env.INTERNAL_API_SECRET ?? "";

function requireInternal(req: FastifyRequest, reply: FastifyReply): true | undefined {
  if (req.headers["x-internal-secret"] !== INTERNAL_SECRET) {
    void reply.status(403).send({ success: false, error: "Forbidden" });
    return true;
  }
}

const deductBody = z.object({
  tenant_id: z.string(),
  branch_id: z.string(),
  order_id: z.string(),
  items: z.array(z.object({
    ingredient_id: z.string(),
    quantity: z.number(),
    unit: z.string(),
  })),
});

const createPoBody = z.object({
  tenant_id: z.string(),
  branch_id: z.string(),
  vendor_id: z.string().optional(),
  vendor_name: z.string().optional(),
  items: z.array(z.object({
    ingredient_id: z.string(),
    ingredient_name: z.string(),
    quantity: z.number(),
    unit: z.string(),
    unit_price: z.number(),
    total_price: z.number(),
  })),
  subtotal: z.number(),
  total: z.number(),
  tax_amount: z.number().optional().default(0),
  expected_delivery_date: z.string().optional(),
  notes: z.string().optional(),
});

export default async function internalRoutes(app: FastifyInstance) {
  // POST /internal/deduct — called by order-service when order → preparing
  app.post("/internal/deduct", {
    schema: {
      tags: ["Internal"],
      headers: { type: "object", properties: { "x-internal-secret": { type: "string" } } },
      body: {
        type: "object",
        required: ["tenant_id", "branch_id", "order_id", "items"],
        properties: {
          tenant_id: { type: "string" },
          branch_id: { type: "string" },
          order_id: { type: "string" },
          items: { type: "array", items: { type: "object" } },
        },
      },
    },
  }, async (req, reply) => {
    const early = requireInternal(req, reply);
    if (early) return;

    const parsed = deductBody.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ success: false, error: parsed.error.errors[0]?.message });

    const { tenant_id, branch_id, order_id, items } = parsed.data;
    try {
      const result = await deductStockForOrder(tenant_id, branch_id, order_id, items);
      return reply.send({ success: true, data: result });
    } catch (err) {
      logger.error({ err }, "deductStockForOrder error");
      return reply.status(500).send({ success: false, error: "Stock deduction failed" });
    }
  });

  // POST /internal/purchase-orders — called by procurement-service on bid award / direct order
  app.post("/internal/purchase-orders", {
    schema: {
      tags: ["Internal"],
      headers: { type: "object", properties: { "x-internal-secret": { type: "string" } } },
      body: {
        type: "object",
        required: ["tenant_id", "branch_id", "items", "subtotal", "total"],
        properties: {
          tenant_id: { type: "string" },
          branch_id: { type: "string" },
          vendor_id: { type: "string" },
          vendor_name: { type: "string" },
          items: { type: "array", items: { type: "object" } },
          subtotal: { type: "number" },
          total: { type: "number" },
        },
      },
    },
  }, async (req, reply) => {
    const early = requireInternal(req, reply);
    if (early) return;

    const parsed = createPoBody.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ success: false, error: parsed.error.errors[0]?.message });

    const { tenant_id, branch_id, vendor_id, vendor_name, items, subtotal, total, tax_amount = 0, expected_delivery_date, notes } = parsed.data;

    const po_number = await getNextPoNumber(tenant_id);
    const po = await createPurchaseOrder({
      tenant_id,
      branch_id,
      po_number,
      vendor_id,
      vendor_name,
      items,
      subtotal,
      tax_amount,
      total,
      status: "sent",
      expected_delivery_date: expected_delivery_date ? new Date(expected_delivery_date) : undefined,
      notes,
    });

    return reply.status(201).send({ success: true, data: { purchase_order: po } });
  });

  // POST /internal/purchase-orders/:id/receive — called by procurement-service on direct order delivered
  app.post("/internal/purchase-orders/:id/receive", {
    schema: {
      tags: ["Internal"],
      headers: { type: "object", properties: { "x-internal-secret": { type: "string" } } },
      body: {
        type: "object",
        required: ["tenant_id", "received_by"],
        properties: {
          tenant_id: { type: "string" },
          received_by: { type: "string" },
        },
      },
    },
  }, async (req, reply) => {
    const early = requireInternal(req, reply);
    if (early) return;

    const { id } = req.params as { id: string };
    const { tenant_id, received_by } = req.body as { tenant_id: string; received_by: string };

    const po = await findPurchaseOrderById(id, tenant_id);
    if (!po) return reply.status(404).send({ success: false, error: "Purchase order not found" });
    if (po.status === "received") return reply.send({ success: true, data: { message: "Already received" } });

    const items = po.items as Array<{ ingredient_id: string; quantity: number; unit: string; unit_price: number }>;
    await receiveStock(tenant_id, po.branch_id, id, items, received_by);
    const updated = await updatePurchaseOrder(id, tenant_id, { status: "received", received_at: new Date(), received_by });

    return reply.send({ success: true, data: { purchase_order: updated } });
  });
}
