import { FastifyInstance } from "fastify";
import { z } from "zod";
import { apiSuccess, apiError } from "@ulcp/shared";
import { authenticateStaff } from "../middleware/authenticate";
import { formatZodError } from "../lib/zodError";
import {
  createPurchaseOrder,
  findPurchaseOrders,
  findPurchaseOrderById,
  approvePurchaseOrder,
  markPoSent,
  cancelPurchaseOrder,
} from "../repositories/purchaseOrder.repository";
import type { POStatus } from "../generated/prisma";

const ok = { type: "object" as const, properties: { success: { type: "boolean" as const }, data: { type: "object" as const, additionalProperties: true } } };
const err = { type: "object" as const, properties: { success: { type: "boolean" as const }, error: { type: "string" as const } } };
const errR = { 400: err, 401: err, 403: err, 404: err };

const poItemSchema = z.object({
  ingredient_id: z.string().min(1),
  ingredient_name: z.string().min(1),
  unit: z.string().min(1),
  quantity: z.number().positive(),
  unit_price: z.number().int().min(0),
  tax_rate: z.number().min(0).optional(),
  notes: z.string().optional(),
});

const poCreateSchema = z.object({
  branch_id: z.string().min(1),
  vendor_id: z.string().min(1),
  items: z.array(poItemSchema).min(1),
  delivery_charge: z.number().int().min(0).optional(),
  discount: z.number().int().min(0).optional(),
  payment_terms: z.string().optional(),
  expected_delivery_date: z.string().datetime().optional(),
  delivery_address: z.string().optional(),
  notes: z.string().optional(),
  bid_request_id: z.string().optional(),
  source: z.enum(["manual", "bid", "auto_reorder"]).optional(),
});

const poStatusValues: POStatus[] = ["draft", "pending_approval", "approved", "sent", "partial", "received", "cancelled"];

interface TenantParams { tenant_id: string }
interface PoParams { tenant_id: string; po_id: string }

export async function purchaseOrderRoutes(fastify: FastifyInstance): Promise<void> {
  // POST /:tenant_id/purchase-orders
  fastify.post<{ Params: TenantParams; Body: unknown }>(
    "/:tenant_id/purchase-orders",
    { schema: { summary: "Create a Purchase Order", tags: ["PurchaseOrders"], response: { 201: ok, ...errR } }, preHandler: [authenticateStaff] },
    async (req, reply) => {
      const parsed = poCreateSchema.safeParse(req.body);
      if (!parsed.success) return reply.code(400).send(apiError(formatZodError(parsed.error)));
      const { tenant_id } = req.params;
      const created_by = req.staff?.user_id ?? "system";
      const po = await createPurchaseOrder({
        tenant_id,
        branch_id: parsed.data.branch_id,
        vendor_id: parsed.data.vendor_id,
        items: parsed.data.items,
        delivery_charge: parsed.data.delivery_charge,
        discount: parsed.data.discount,
        payment_terms: parsed.data.payment_terms,
        expected_delivery_date: parsed.data.expected_delivery_date ? new Date(parsed.data.expected_delivery_date) : null,
        delivery_address: parsed.data.delivery_address,
        notes: parsed.data.notes,
        created_by,
        source: parsed.data.source,
        bid_request_id: parsed.data.bid_request_id,
      });
      return reply.code(201).send(apiSuccess({ purchase_order: po }));
    }
  );

  // GET /:tenant_id/purchase-orders
  fastify.get<{ Params: TenantParams; Querystring: { status?: string; vendor_id?: string; from?: string; to?: string; branch_id?: string } }>(
    "/:tenant_id/purchase-orders",
    { schema: { summary: "List Purchase Orders", tags: ["PurchaseOrders"], response: { 200: ok, ...errR } }, preHandler: [authenticateStaff] },
    async (req, reply) => {
      const { tenant_id } = req.params;
      const { status, vendor_id, from, to, branch_id } = req.query;
      const safeStatus = status && (poStatusValues as string[]).includes(status) ? (status as POStatus) : undefined;
      const purchase_orders = await findPurchaseOrders(tenant_id, {
        status: safeStatus,
        vendor_id,
        branch_id,
        from: from ? new Date(from) : undefined,
        to: to ? new Date(to) : undefined,
      });
      return reply.send(apiSuccess({ purchase_orders }));
    }
  );

  // GET /:tenant_id/purchase-orders/:po_id
  fastify.get<{ Params: PoParams }>(
    "/:tenant_id/purchase-orders/:po_id",
    { schema: { summary: "Get PO by id", tags: ["PurchaseOrders"], response: { 200: ok, ...errR } }, preHandler: [authenticateStaff] },
    async (req, reply) => {
      const { tenant_id, po_id } = req.params;
      const po = await findPurchaseOrderById(po_id, tenant_id);
      if (!po) return reply.code(404).send(apiError("Purchase order not found"));
      return reply.send(apiSuccess({ purchase_order: po }));
    }
  );

  // PATCH /:tenant_id/purchase-orders/:po_id/approve
  fastify.patch<{ Params: PoParams }>(
    "/:tenant_id/purchase-orders/:po_id/approve",
    { schema: { summary: "Approve PO", tags: ["PurchaseOrders"], response: { 200: ok, ...errR } }, preHandler: [authenticateStaff] },
    async (req, reply) => {
      const { tenant_id, po_id } = req.params;
      const approver = req.staff?.user_id ?? "system";
      const result = await approvePurchaseOrder(po_id, tenant_id, approver);
      if (result.count === 0) return reply.code(400).send(apiError("PO cannot be approved in current state"));
      const po = await findPurchaseOrderById(po_id, tenant_id);
      return reply.send(apiSuccess({ purchase_order: po }));
    }
  );

  // PATCH /:tenant_id/purchase-orders/:po_id/send
  fastify.patch<{ Params: PoParams }>(
    "/:tenant_id/purchase-orders/:po_id/send",
    { schema: { summary: "Mark PO as sent to vendor", tags: ["PurchaseOrders"], response: { 200: ok, ...errR } }, preHandler: [authenticateStaff] },
    async (req, reply) => {
      const { tenant_id, po_id } = req.params;
      const result = await markPoSent(po_id, tenant_id);
      if (result.count === 0) return reply.code(400).send(apiError("PO must be approved before sending"));
      const po = await findPurchaseOrderById(po_id, tenant_id);
      return reply.send(apiSuccess({ purchase_order: po }));
    }
  );

  // PATCH /:tenant_id/purchase-orders/:po_id/cancel
  fastify.patch<{ Params: PoParams; Body: { reason?: string } }>(
    "/:tenant_id/purchase-orders/:po_id/cancel",
    { schema: { summary: "Cancel PO", tags: ["PurchaseOrders"], response: { 200: ok, ...errR } }, preHandler: [authenticateStaff] },
    async (req, reply) => {
      const { tenant_id, po_id } = req.params;
      const reason = (req.body?.reason ?? "").toString();
      const result = await cancelPurchaseOrder(po_id, tenant_id, reason);
      if (result.count === 0) return reply.code(400).send(apiError("PO cannot be cancelled"));
      const po = await findPurchaseOrderById(po_id, tenant_id);
      return reply.send(apiSuccess({ purchase_order: po }));
    }
  );
}
