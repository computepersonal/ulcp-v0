import { FastifyInstance } from "fastify";
import { z } from "zod";
import { apiSuccess, apiError, AppError } from "@ulcp/shared";
import { authenticateStaff } from "../middleware/authenticate";
import { formatZodError } from "../lib/zodError";
import { findDirectOrders, findDirectOrderById } from "../repositories/directOrder.repository";
import { findVendorToken, markTokenUsed } from "../repositories/bid.repository";
import { placeDirectOrder, updateDirectOrderStatus } from "../services/directOrder.service";

const ok = { type: "object" as const, properties: { success: { type: "boolean" as const }, data: { type: "object" as const, additionalProperties: true } } };
const err = { type: "object" as const, properties: { success: { type: "boolean" as const }, error: { type: "string" as const } } };
const errR = { 400: err, 401: err, 403: err, 404: err };

const directOrderSchema = z.object({
  vendor_id: z.string().min(1),
  items: z.array(z.object({
    ingredient_id: z.string(),
    ingredient_name: z.string(),
    quantity: z.number().positive(),
    unit: z.string(),
    unit_price: z.number().int().min(1),
    notes: z.string().optional(),
  })).min(1),
  expected_delivery_date: z.string().datetime().optional(),
  delivery_notes: z.string().optional(),
  payment_terms: z.enum(["advance","on_delivery","net_7","net_15","net_30"]),
  branch_id: z.string().min(1),
});

const statusSchema = z.object({
  status: z.enum(["confirmed","dispatched","delivered","cancelled"]),
  cancelled_reason: z.string().optional(),
});

interface TenantParams { tenant_id: string }
interface OrderParams { tenant_id: string; id: string }
interface TokenParams { token: string }

export async function directOrderRoutes(fastify: FastifyInstance): Promise<void> {
  // POST /:tenant_id/direct-orders
  fastify.post<{ Params: TenantParams; Body: unknown }>(
    "/:tenant_id/direct-orders",
    {
      schema: {
        summary: "Place a direct order with a vendor",
        tags: ["Direct Orders"],
        body: {
          type: "object" as const,
          required: ["vendor_id","items","payment_terms","branch_id"],
          properties: {
            vendor_id: { type: "string" as const },
            branch_id: { type: "string" as const },
            items: { type: "array" as const, items: { type: "object" as const, required:["ingredient_id","ingredient_name","quantity","unit","unit_price"], properties: { ingredient_id:{type:"string"as const}, ingredient_name:{type:"string"as const}, quantity:{type:"number"as const}, unit:{type:"string"as const}, unit_price:{type:"integer"as const,description:"Price per unit in paise"}, notes:{type:"string"as const} } } },
            expected_delivery_date: { type: "string" as const, format: "date-time" },
            delivery_notes: { type: "string" as const },
            payment_terms: { type: "string" as const, enum: ["advance","on_delivery","net_7","net_15","net_30"] },
          },
        },
        response: { 201: ok, ...errR },
      },
      preHandler: [authenticateStaff],
    },
    async (req, reply) => {
      const parsed = directOrderSchema.safeParse(req.body);
      if (!parsed.success) return reply.code(400).send(apiError(formatZodError(parsed.error)));
      try {
        const order = await placeDirectOrder({
          ...parsed.data,
          tenant_id: req.params.tenant_id,
          created_by: req.staff!.user_id,
        });
        return reply.code(201).send(apiSuccess({ order }));
      } catch (e) {
        if (e instanceof AppError) return reply.code(e.statusCode).send(apiError(e.message));
        throw e;
      }
    }
  );

  // GET /:tenant_id/direct-orders
  fastify.get<{ Params: TenantParams; Querystring: { vendor_id?: string; status?: string; ingredient_id?: string; from?: string; to?: string } }>(
    "/:tenant_id/direct-orders",
    { schema: { summary: "List direct orders", tags: ["Direct Orders"], response:{200:ok,...errR} }, preHandler:[authenticateStaff] },
    async (req, reply) => {
      const orders = await findDirectOrders(req.params.tenant_id, req.query);
      return reply.send(apiSuccess({ orders }));
    }
  );

  // GET /:tenant_id/direct-orders/:id
  fastify.get<{ Params: OrderParams }>(
    "/:tenant_id/direct-orders/:id",
    { schema: { summary: "Get direct order detail", tags: ["Direct Orders"], response:{200:ok,...errR} }, preHandler:[authenticateStaff] },
    async (req, reply) => {
      const order = await findDirectOrderById(req.params.id, req.params.tenant_id);
      if (!order) return reply.code(404).send(apiError("Order not found"));
      return reply.send(apiSuccess({ order }));
    }
  );

  // PATCH /:tenant_id/direct-orders/:id/status
  fastify.patch<{ Params: OrderParams; Body: unknown }>(
    "/:tenant_id/direct-orders/:id/status",
    {
      schema: {
        summary: "Update direct order status",
        tags: ["Direct Orders"],
        body: { type:"object"as const, required:["status"], properties:{status:{type:"string"as const,enum:["confirmed","dispatched","delivered","cancelled"]},cancelled_reason:{type:"string"as const}} },
        response:{200:ok,...errR},
      },
      preHandler:[authenticateStaff],
    },
    async (req, reply) => {
      const parsed = statusSchema.safeParse(req.body);
      if (!parsed.success) return reply.code(400).send(apiError(formatZodError(parsed.error)));
      try {
        const order = await updateDirectOrderStatus(req.params.id, req.params.tenant_id, parsed.data.status);
        return reply.send(apiSuccess({ order }));
      } catch (e) {
        if (e instanceof AppError) return reply.code(e.statusCode).send(apiError(e.message));
        throw e;
      }
    }
  );

  // ── Vendor-facing: view direct order via token ─────────────────────────────

  fastify.get<{ Params: TokenParams }>(
    "/vendor/order/:token",
    { schema: { summary: "Vendor: view direct order via notification link", tags: ["Vendor Portal"] } },
    async (req, reply) => {
      const vt = await findVendorToken(req.params.token);
      if (!vt || vt.token_type !== "direct_order") return reply.code(404).send(apiError("Invalid token"));
      if (vt.expires_at < new Date()) return reply.code(410).send(apiError("This link has expired"));
      if (!vt.direct_order_id) return reply.code(404).send(apiError("Invalid token"));

      const order = await findDirectOrderById(vt.direct_order_id, "");
      if (!order) return reply.code(404).send(apiError("Order not found"));

      return reply.send(apiSuccess({
        order: {
          id: order.id,
          items: order.items,
          total_amount: order.total_amount,
          payment_terms: order.payment_terms,
          expected_delivery_date: order.expected_delivery_date,
          delivery_notes: order.delivery_notes,
          status: order.status,
          created_at: order.created_at,
        },
        vendor: {
          id: order.vendor.id,
          name: order.vendor.name,
        },
      }));
    }
  );

  // Vendor confirms/declines direct order via token
  fastify.post<{ Params: TokenParams; Body: unknown }>(
    "/vendor/order/:token/respond",
    {
      schema: {
        summary: "Vendor: confirm or decline a direct order",
        tags: ["Vendor Portal"],
        body: { type:"object"as const, required:["accepted"], properties:{accepted:{type:"boolean"as const},delivery_date:{type:"string"as const,format:"date-time"},decline_reason:{type:"string"as const}} },
      },
    },
    async (req, reply) => {
      const parsed = z.object({
        accepted: z.boolean(),
        delivery_date: z.string().datetime().optional(),
        decline_reason: z.string().optional(),
      }).safeParse(req.body);
      if (!parsed.success) return reply.code(400).send(apiError(formatZodError(parsed.error)));

      const vt = await findVendorToken(req.params.token);
      if (!vt || vt.token_type !== "direct_order") return reply.code(404).send(apiError("Invalid token"));
      if (vt.expires_at < new Date()) return reply.code(410).send(apiError("Link expired"));
      if (vt.used_at) return reply.code(409).send(apiError("Already responded to this order"));
      if (!vt.direct_order_id) return reply.code(404).send(apiError("Invalid token"));

      const order = await findDirectOrderById(vt.direct_order_id, "");
      if (!order) return reply.code(404).send(apiError("Order not found"));

      try {
        const newStatus = parsed.data.accepted ? "confirmed" : "cancelled";
        await updateDirectOrderStatus(vt.direct_order_id, order.tenant_id, newStatus);
        await markTokenUsed(vt.id);
        return reply.send(apiSuccess({ accepted: parsed.data.accepted, order_id: vt.direct_order_id }));
      } catch (e) {
        if (e instanceof AppError) return reply.code(e.statusCode).send(apiError(e.message));
        throw e;
      }
    }
  );
}
