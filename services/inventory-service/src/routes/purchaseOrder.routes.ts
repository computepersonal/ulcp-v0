import { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  findPurchaseOrders,
  findPurchaseOrderById,
  createPurchaseOrder,
  updatePurchaseOrder,
  getNextPoNumber,
} from "../repositories/purchaseOrder.repository";
import { receiveStock } from "../services/stock.service";
import { PurchaseOrderStatus } from "../generated/prisma";

const poItemSchema = z.object({
  ingredient_id: z.string(),
  ingredient_name: z.string(),
  quantity: z.number().positive(),
  unit: z.string(),
  unit_price: z.number().min(0), // paise
  total_price: z.number().min(0), // paise
});

const createPoBody = z.object({
  branch_id: z.string(),
  vendor_id: z.string().optional(),
  vendor_name: z.string().optional(),
  items: z.array(poItemSchema).min(1),
  tax_amount: z.number().min(0).optional().default(0),
  expected_delivery_date: z.string().optional(),
  notes: z.string().optional(),
});

const updatePoBody = z.object({
  status: z.enum(["draft", "sent", "confirmed", "cancelled"]).optional(),
  notes: z.string().optional(),
  expected_delivery_date: z.string().optional(),
  vendor_name: z.string().optional(),
});

export default async function purchaseOrderRoutes(app: FastifyInstance) {
  // GET /:tenant_id/purchase-orders
  app.get("/:tenant_id/purchase-orders", {
    schema: {
      tags: ["Purchase Orders"],
      params: { type: "object", properties: { tenant_id: { type: "string" } }, required: ["tenant_id"] },
      querystring: { type: "object", properties: { branch_id: { type: "string" }, status: { type: "string" }, page: { type: "number" }, limit: { type: "number" } } },
    },
  }, async (req, reply) => {
    const { tenant_id } = req.params as { tenant_id: string };
    const query = req.query as { branch_id?: string; status?: PurchaseOrderStatus; page?: number; limit?: number };

    const result = await findPurchaseOrders(tenant_id, query);
    return reply.send({ success: true, data: result });
  });

  // GET /:tenant_id/purchase-orders/:id
  app.get("/:tenant_id/purchase-orders/:id", {
    schema: { tags: ["Purchase Orders"] },
  }, async (req, reply) => {
    const { tenant_id, id } = req.params as { tenant_id: string; id: string };
    const po = await findPurchaseOrderById(id, tenant_id);
    if (!po) return reply.status(404).send({ success: false, error: "Purchase order not found" });
    return reply.send({ success: true, data: { purchase_order: po } });
  });

  // POST /:tenant_id/purchase-orders
  app.post("/:tenant_id/purchase-orders", {
    schema: {
      tags: ["Purchase Orders"],
      body: {
        type: "object",
        required: ["branch_id", "items"],
        properties: {
          branch_id: { type: "string" },
          vendor_id: { type: "string" },
          vendor_name: { type: "string" },
          items: { type: "array", items: { type: "object" } },
          tax_amount: { type: "number" },
          expected_delivery_date: { type: "string" },
          notes: { type: "string" },
        },
      },
    },
  }, async (req, reply) => {
    const { tenant_id } = req.params as { tenant_id: string };
    const parsed = createPoBody.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ success: false, error: parsed.error.errors[0]?.message });

    const { branch_id, items, tax_amount = 0, expected_delivery_date, notes, vendor_id, vendor_name } = parsed.data;

    const subtotal = items.reduce((s, i) => s + i.total_price, 0);
    const total = subtotal + tax_amount;
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
      expected_delivery_date: expected_delivery_date ? new Date(expected_delivery_date) : undefined,
      notes,
    });

    return reply.status(201).send({ success: true, data: { purchase_order: po } });
  });

  // PATCH /:tenant_id/purchase-orders/:id
  app.patch("/:tenant_id/purchase-orders/:id", {
    schema: {
      tags: ["Purchase Orders"],
      body: {
        type: "object",
        properties: {
          status: { type: "string", enum: ["draft", "sent", "confirmed", "cancelled"] },
          notes: { type: "string" },
          expected_delivery_date: { type: "string" },
        },
      },
    },
  }, async (req, reply) => {
    const { tenant_id, id } = req.params as { tenant_id: string; id: string };
    const parsed = updatePoBody.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ success: false, error: parsed.error.errors[0]?.message });

    const existing = await findPurchaseOrderById(id, tenant_id);
    if (!existing) return reply.status(404).send({ success: false, error: "Purchase order not found" });
    if (existing.status === "received" || existing.status === "cancelled") {
      return reply.status(400).send({ success: false, error: `Cannot update a ${existing.status} purchase order` });
    }

    const po = await updatePurchaseOrder(id, tenant_id, {
      ...parsed.data,
      ...(parsed.data.expected_delivery_date ? { expected_delivery_date: new Date(parsed.data.expected_delivery_date) } : {}),
    });

    return reply.send({ success: true, data: { purchase_order: po } });
  });

  // POST /:tenant_id/purchase-orders/:id/receive — mark as received + add stock
  app.post("/:tenant_id/purchase-orders/:id/receive", {
    schema: {
      tags: ["Purchase Orders"],
      body: {
        type: "object",
        required: ["received_by"],
        properties: {
          received_by: { type: "string" },
          notes: { type: "string" },
        },
      },
    },
  }, async (req, reply) => {
    const { tenant_id, id } = req.params as { tenant_id: string; id: string };
    const { received_by, notes } = req.body as { received_by: string; notes?: string };

    const po = await findPurchaseOrderById(id, tenant_id);
    if (!po) return reply.status(404).send({ success: false, error: "Purchase order not found" });
    if (po.status === "received") return reply.status(400).send({ success: false, error: "Already received" });
    if (po.status === "cancelled") return reply.status(400).send({ success: false, error: "Purchase order is cancelled" });

    const items = po.items as Array<{ ingredient_id: string; quantity: number; unit: string; unit_price: number }>;

    await receiveStock(tenant_id, po.branch_id, id, items, received_by);

    const updated = await updatePurchaseOrder(id, tenant_id, {
      status: "received",
      received_at: new Date(),
      received_by,
      ...(notes ? { notes } : {}),
    });

    return reply.send({ success: true, data: { purchase_order: updated } });
  });
}
