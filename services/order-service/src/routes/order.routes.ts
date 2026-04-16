import { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma";
import { z } from "zod";
import { apiSuccess, apiError, AppError } from "@ulcp/shared";
import { authenticateStaff, authenticateCustomer, requirePermission } from "../middleware/authenticate";
import { formatZodError } from "../lib/zodError";
import {
  placeOrder,
  cancelOrder,
  changeOrderStatus,
  recordPayment,
  getOrderBill,
  findOrders,
  findOrderById,
} from "../services/order.service";
import type { OrderItem } from "../services/order.service";
import { fetchTenantKotConfig } from "../lib/tenantClient";

// ─── Shared schema fragments ──────────────────────────────────────────────────

const genericOk = {
  type: "object" as const,
  properties: {
    success: { type: "boolean" as const },
    data: { type: "object" as const, additionalProperties: true },
  },
};

const errSchema = {
  type: "object" as const,
  properties: {
    success: { type: "boolean" as const },
    error: { type: "string" as const },
  },
};

const errResponses = { 400: errSchema, 401: errSchema, 403: errSchema, 404: errSchema };

// ─── Zod schemas ──────────────────────────────────────────────────────────────

const orderItemSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  price: z.number().int().min(0),
  quantity: z.number().int().min(1),
  veg_type: z.string().optional(),
  gst_rate: z.number().min(0).max(28).optional(),
  is_tax_inclusive: z.boolean().optional(),
  station: z.enum(["kitchen", "bar"]).optional(),
  variant_name: z.string().optional(),
  options: z.array(z.unknown()).optional(),
  addons: z.array(z.unknown()).optional(),
});

const placeOrderSchema = z.object({
  branch_id: z.string().min(1),
  table_id: z.string().optional(),
  table_name: z.string().optional(), // snapshot — caller passes name at time of order
  session_id: z.string().optional(),
  customer_id: z.string().optional(),
  type: z.enum(["dine_in", "takeaway", "delivery"]),
  business_type: z.string().min(1),
  items: z.array(orderItemSchema).min(1),
  discount_amount: z.number().int().min(0).optional(),
  tip_amount: z.number().int().min(0).optional(),
  notes: z.string().optional(),
});

const customerPlaceOrderSchema = z.object({
  tenant_id: z.string().min(1),
  branch_id: z.string().min(1),
  table_id: z.string().optional(),
  session_id: z.string().optional(),
  type: z.enum(["dine_in", "takeaway", "delivery"]).default("dine_in"),
  business_type: z.string().min(1),
  payment_method: z.enum(["upi", "card", "cod", "cash", "online"]).optional(),
  items: z.array(orderItemSchema).min(1),
  notes: z.string().optional(),
});

const updateStatusSchema = z.object({
  status: z.enum([
    "confirmed",
    "preparing",
    "ready",
    "picked_up",
    "delivered",
    "completed",
  ]),
});

const cancelSchema = z.object({
  reason: z.string().min(1),
});

const paymentSchema = z.object({
  payment_method: z.enum(["cash", "upi", "card", "online"]),
});

// ─── Internal endpoint schemas ────────────────────────────────────────────────

const addLineItemSchema = z.object({
  tenant_id: z.string(),
  branch_id: z.string(),
  customer_id: z.string(),
  item: z.object({
    name: z.string(),
    price: z.number().int().min(0),
    type: z.string(),
    reference_id: z.string().optional(),
  }),
});

const removeLineItemSchema = z.object({
  order_id: z.string(),
  line_item_id: z.string(),
});

// ─── Route params interfaces ──────────────────────────────────────────────────

interface TenantParams {
  tenant_id: string;
}

interface OrderParams {
  tenant_id: string;
  id: string;
}

interface OrderListQuery {
  branch_id?: string;
  status?: string;
  type?: string;
  date?: string;
  limit?: string;
  offset?: string;
}

// ─── Routes ───────────────────────────────────────────────────────────────────

export async function orderRoutes(fastify: FastifyInstance): Promise<void> {
  // POST /customer — place an order as a customer (customer JWT)
  fastify.post<{ Body: unknown }>(
    "/customer",
    {
      schema: {
        summary: "Place an order (customer)",
        tags: ["Orders"],
        body: {
          type: "object" as const,
          required: ["tenant_id", "branch_id", "business_type", "items"],
          properties: {
            tenant_id: { type: "string" as const },
            branch_id: { type: "string" as const },
            table_id: { type: "string" as const },
            session_id: { type: "string" as const },
            type: { type: "string" as const, enum: ["dine_in", "takeaway", "delivery"] },
            business_type: { type: "string" as const },
            payment_method: { type: "string" as const, enum: ["upi", "card", "cod", "cash", "online"] },
            items: {
              type: "array" as const,
              minItems: 1,
              items: {
                type: "object" as const,
                required: ["id", "name", "price", "quantity"],
                properties: {
                  id: { type: "string" as const },
                  name: { type: "string" as const },
                  price: { type: "integer" as const },
                  quantity: { type: "integer" as const, minimum: 1 },
                  variant_name: { type: "string" as const },
                  station: { type: "string" as const, enum: ["kitchen", "bar"] },
                },
              },
            },
            notes: { type: "string" as const },
          },
        },
        response: { 201: genericOk, ...errResponses },
      },
      preHandler: [authenticateCustomer],
    },
    async (req, reply) => {
      const parsed = customerPlaceOrderSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send(apiError(formatZodError(parsed.error)));
      }

      const customer_id = req.customer?.customer_id;
      if (!customer_id) {
        return reply.code(401).send(apiError("Unauthorized"));
      }

      try {
        const kotConfig = await fetchTenantKotConfig(
          parsed.data.tenant_id,
          ""
        ).catch(() => ({ kot_ack_mode: "auto" as const, kot_ack_delay_secs: 60, plan: "free" }));

        const order = await placeOrder({
          tenant_id: parsed.data.tenant_id,
          branch_id: parsed.data.branch_id,
          table_id: parsed.data.table_id,
          session_id: parsed.data.session_id,
          customer_id,
          type: parsed.data.type,
          business_type: parsed.data.business_type,
          items: parsed.data.items as OrderItem[],
          notes: parsed.data.notes,
          placed_by: customer_id,
          kot_ack_mode: kotConfig.kot_ack_mode,
          kot_ack_delay_secs: kotConfig.kot_ack_delay_secs,
        });

        return reply.code(201).send(apiSuccess({ id: order.id, order }));
      } catch (err) {
        if (err instanceof AppError) {
          return reply.code(err.statusCode).send(apiError(err.message));
        }
        throw err;
      }
    }
  );

  // POST / — place a new order
  fastify.post<{ Body: unknown }>(
    "/",
    {
      schema: {
        summary: "Place a new order",
        tags: ["Orders"],
        body: {
          type: "object" as const,
          required: ["branch_id", "type", "business_type", "items"],
          properties: {
            branch_id: { type: "string" as const },
            table_id: { type: "string" as const },
            session_id: { type: "string" as const },
            customer_id: { type: "string" as const },
            type: { type: "string" as const, enum: ["dine_in", "takeaway", "delivery"] },
            business_type: { type: "string" as const, description: "e.g. seated_food_only, seated_full_service, self_service_cafe" },
            items: {
              type: "array" as const,
              minItems: 1,
              items: {
                type: "object" as const,
                required: ["id", "name", "price", "quantity"],
                properties: {
                  id: { type: "string" as const },
                  name: { type: "string" as const },
                  price: { type: "integer" as const, description: "Price in paise (₹1 = 100)" },
                  quantity: { type: "integer" as const, minimum: 1 },
                  veg_type: { type: "string" as const },
                  gst_rate: { type: "number" as const, description: "GST % e.g. 5, 12, 18" },
                  is_tax_inclusive: { type: "boolean" as const },
                  station: { type: "string" as const, enum: ["kitchen", "bar"] },
                  variant_name: { type: "string" as const },
                },
              },
            },
            discount_amount: { type: "integer" as const, description: "Discount in paise" },
            tip_amount: { type: "integer" as const, description: "Tip in paise" },
            notes: { type: "string" as const },
          },
        },
        response: { 201: genericOk, ...errResponses },
      },
      preHandler: [authenticateStaff],
    },
    async (req, reply) => {
      const parsed = placeOrderSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send(apiError(formatZodError(parsed.error)));
      }

      const tenant_id = req.staff?.tenant_id;
      if (!tenant_id) {
        return reply
          .code(403)
          .send(apiError("No tenant associated with token"));
      }

      try {
        // Fetch KOT ack config from tenant-service (cached 30min)
        const authHeader = req.headers["authorization"] ?? "";
        const kotConfig = await fetchTenantKotConfig(tenant_id, authHeader.replace("Bearer ", "")).catch(
          () => ({ kot_ack_mode: "auto" as const, kot_ack_delay_secs: 60, plan: "free" })
        );

        const order = await placeOrder({
          ...parsed.data,
          tenant_id,
          placed_by: req.staff!.user_id,
          items: parsed.data.items as OrderItem[],
          kot_ack_mode: kotConfig.kot_ack_mode,
          kot_ack_delay_secs: kotConfig.kot_ack_delay_secs,
        });
        return reply.code(201).send(apiSuccess({ order }));
      } catch (err) {
        if (err instanceof AppError) {
          return reply.code(err.statusCode).send(apiError(err.message));
        }
        throw err;
      }
    }
  );

  // GET /:tenant_id/summary/daily — daily sales summary + unbilled orders
  fastify.get<{ Params: TenantParams; Querystring: { date?: string; branch_id?: string } }>(
    "/:tenant_id/summary/daily",
    {
      schema: {
        summary: "Daily sales summary with unbilled orders",
        tags: ["Orders"],
        response: { 200: genericOk, ...errResponses },
      },
      preHandler: [requirePermission("reports:view")],
    },
    async (req, reply) => {
      const { tenant_id } = req.params;
      const { date, branch_id } = req.query;

      // Default to today in UTC
      const targetDate = date ?? new Date().toISOString().slice(0, 10);
      const dayStart = new Date(`${targetDate}T00:00:00.000Z`);
      const dayEnd = new Date(`${targetDate}T23:59:59.999Z`);

      const branchFilter = branch_id ? { branch_id } : {};

      try {
        const [completed, cancelled, unbilled, active] = await Promise.all([
          // Completed (paid) orders for the day
          prisma.order.findMany({
            where: { tenant_id, ...branchFilter, status: "completed", created_at: { gte: dayStart, lte: dayEnd } },
            select: { id: true, order_number: true, total: true, payment_method: true, created_at: true, type: true, items: true },
          }),
          // Cancelled orders for the day
          prisma.order.findMany({
            where: { tenant_id, ...branchFilter, status: "cancelled", created_at: { gte: dayStart, lte: dayEnd } },
            select: { id: true, order_number: true, total: true, cancelled_reason: true, created_at: true },
          }),
          // Unbilled: auto-cancelled with reason containing "unbilled" or "never billed"
          prisma.order.findMany({
            where: {
              tenant_id, ...branchFilter,
              status: "cancelled",
              cancelled_reason: { contains: "never billed" },
              created_at: { gte: dayStart, lte: dayEnd },
            },
            select: { id: true, order_number: true, total: true, cancelled_reason: true, created_at: true, items: true },
          }),
          // Still active orders right now (not yet completed/cancelled)
          prisma.order.findMany({
            where: { tenant_id, ...branchFilter, status: { in: ["pending", "confirmed", "preparing", "ready"] } },
            select: { id: true, order_number: true, total: true, status: true, created_at: true },
          }),
        ]);

        const totalRevenue = completed.reduce((s, o) => s + o.total, 0);
        const totalOrders = completed.length;
        const avgOrder = totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0;

        // Payment method breakdown
        const paymentBreakdown = completed.reduce<Record<string, number>>((acc, o) => {
          const method = o.payment_method ?? "unknown";
          acc[method] = (acc[method] ?? 0) + 1;
          return acc;
        }, {});

        // Top items by quantity
        const itemMap = new Map<string, { name: string; quantity: number; revenue: number }>();
        for (const order of completed) {
          const items = order.items as Array<{ name?: string; price?: number; quantity?: number }>;
          for (const item of items) {
            const name = item.name ?? "Unknown";
            const existing = itemMap.get(name) ?? { name, quantity: 0, revenue: 0 };
            existing.quantity += item.quantity ?? 1;
            existing.revenue += (item.price ?? 0) * (item.quantity ?? 1);
            itemMap.set(name, existing);
          }
        }
        const topItems = [...itemMap.values()]
          .sort((a, b) => b.quantity - a.quantity)
          .slice(0, 10);

        return reply.send(apiSuccess({
          date: targetDate,
          summary: { totalRevenue, totalOrders, avgOrder, paymentBreakdown },
          unbilled,
          active,
          cancelled_count: cancelled.length,
          topItems,
        }));
      } catch (err) {
        if (err instanceof AppError) {
          return reply.code(err.statusCode).send(apiError(err.message));
        }
        throw err;
      }
    }
  );

  // GET /:tenant_id — list orders
  fastify.get<{ Params: TenantParams; Querystring: OrderListQuery }>(
    "/:tenant_id",
    {
      schema: {
        summary: "List orders for tenant",
        tags: ["Orders"],
        params: {
          type: "object" as const,
          properties: { tenant_id: { type: "string" as const } },
        },
        response: { 200: genericOk, ...errResponses },
      },
      preHandler: [authenticateStaff],
    },
    async (req, reply) => {
      const { tenant_id } = req.params;
      const { branch_id, status, type, date, limit, offset } = req.query;

      try {
        const result = await findOrders({
          tenant_id,
          branch_id,
          status,
          type,
          date,
          limit: limit ? parseInt(limit, 10) : 50,
          offset: offset ? parseInt(offset, 10) : 0,
        });
        return reply.send(apiSuccess(result));
      } catch (err) {
        if (err instanceof AppError) {
          return reply.code(err.statusCode).send(apiError(err.message));
        }
        throw err;
      }
    }
  );

  // GET /:tenant_id/:id — get order detail
  fastify.get<{ Params: OrderParams }>(
    "/:tenant_id/:id",
    {
      schema: {
        summary: "Get order detail",
        tags: ["Orders"],
        response: { 200: genericOk, ...errResponses },
      },
      preHandler: [authenticateStaff],
    },
    async (req, reply) => {
      const { tenant_id, id } = req.params;
      try {
        const order = await findOrderById(id, tenant_id);
        if (!order) return reply.code(404).send(apiError("Order not found"));
        return reply.send(apiSuccess({ order }));
      } catch (err) {
        if (err instanceof AppError) {
          return reply.code(err.statusCode).send(apiError(err.message));
        }
        throw err;
      }
    }
  );

  // PATCH /:tenant_id/:id/status — update status
  fastify.patch<{ Params: OrderParams; Body: unknown }>(
    "/:tenant_id/:id/status",
    {
      schema: {
        summary: "Update order status",
        tags: ["Orders"],
        body: {
          type: "object" as const,
          required: ["status"],
          properties: {
            status: { type: "string" as const, enum: ["confirmed", "preparing", "ready", "picked_up", "delivered", "completed"] },
          },
        },
        response: { 200: genericOk, ...errResponses },
      },
      preHandler: [authenticateStaff],
    },
    async (req, reply) => {
      const parsed = updateStatusSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send(apiError(formatZodError(parsed.error)));
      }

      const { tenant_id, id } = req.params;
      try {
        const order = await changeOrderStatus(
          id,
          tenant_id,
          parsed.data.status,
          req.staff!.user_id
        );
        return reply.send(apiSuccess({ order }));
      } catch (err) {
        if (err instanceof AppError) {
          return reply.code(err.statusCode).send(apiError(err.message));
        }
        throw err;
      }
    }
  );

  // POST /:tenant_id/:id/cancel — cancel order
  fastify.post<{ Params: OrderParams; Body: unknown }>(
    "/:tenant_id/:id/cancel",
    {
      schema: {
        summary: "Cancel an order",
        tags: ["Orders"],
        body: {
          type: "object" as const,
          required: ["reason"],
          properties: {
            reason: { type: "string" as const },
          },
        },
        response: { 200: genericOk, ...errResponses },
      },
      preHandler: [authenticateStaff],
    },
    async (req, reply) => {
      const parsed = cancelSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send(apiError(formatZodError(parsed.error)));
      }

      const { tenant_id, id } = req.params;
      try {
        const order = await cancelOrder(
          id,
          tenant_id,
          req.staff!.user_id,
          parsed.data.reason,
          req.staff!.role
        );
        return reply.send(apiSuccess({ order }));
      } catch (err) {
        if (err instanceof AppError) {
          return reply.code(err.statusCode).send(apiError(err.message));
        }
        throw err;
      }
    }
  );

  // GET /:tenant_id/:id/bill — bill summary
  fastify.get<{ Params: OrderParams }>(
    "/:tenant_id/:id/bill",
    {
      schema: {
        summary: "Get bill summary for order",
        tags: ["Orders"],
        response: { 200: genericOk, ...errResponses },
      },
      preHandler: [authenticateStaff],
    },
    async (req, reply) => {
      const { tenant_id, id } = req.params;
      try {
        const bill = await getOrderBill(id, tenant_id);
        return reply.send(apiSuccess({ bill }));
      } catch (err) {
        if (err instanceof AppError) {
          return reply.code(err.statusCode).send(apiError(err.message));
        }
        throw err;
      }
    }
  );

  // POST /:tenant_id/:id/payment — record payment
  fastify.post<{ Params: OrderParams; Body: unknown }>(
    "/:tenant_id/:id/payment",
    {
      schema: {
        summary: "Record payment for order",
        tags: ["Orders"],
        body: {
          type: "object" as const,
          required: ["payment_method"],
          properties: {
            payment_method: { type: "string" as const, enum: ["cash", "upi", "card", "online"] },
          },
        },
        response: { 200: genericOk, ...errResponses },
      },
      preHandler: [authenticateStaff],
    },
    async (req, reply) => {
      const parsed = paymentSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send(apiError(formatZodError(parsed.error)));
      }

      const { tenant_id, id } = req.params;
      try {
        const order = await recordPayment(
          id,
          tenant_id,
          parsed.data.payment_method
        );
        return reply.send(apiSuccess({ order }));
      } catch (err) {
        if (err instanceof AppError) {
          return reply.code(err.statusCode).send(apiError(err.message));
        }
        throw err;
      }
    }
  );

  // ─── Internal endpoints (X-Internal-Secret protected) ─────────────────────

  // POST /internal/add-line-item — jukebox billing: add a line item to an order
  fastify.post<{ Body: unknown }>(
    "/internal/add-line-item",
    {
      schema: {
        summary: "Internal: add a line item to an active order (e.g. jukebox song)",
        tags: ["Internal"],
        body: {
          type: "object" as const,
          required: ["tenant_id", "branch_id", "customer_id", "item"],
          properties: {
            tenant_id: { type: "string" as const },
            branch_id: { type: "string" as const },
            customer_id: { type: "string" as const },
            item: {
              type: "object" as const,
              required: ["name", "price", "type"],
              properties: {
                name: { type: "string" as const },
                price: { type: "integer" as const, description: "Price in paise" },
                type: { type: "string" as const, description: "e.g. jukebox_song" },
                reference_id: { type: "string" as const },
              },
            },
          },
        },
        response: { 201: genericOk, 403: errSchema },
      },
    },
    async (request, reply) => {
      const internalSecret = request.headers["x-internal-secret"];
      if (internalSecret !== process.env["INTERNAL_API_SECRET"]) {
        return reply.code(403).send(apiError("Forbidden"));
      }

      const parsed = addLineItemSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send(apiError(formatZodError(parsed.error)));
      }

      const data = parsed.data;
      // Placeholder: in a full implementation this would find/create an active order
      // for the customer+branch and append a line item.
      const mockOrderId = `jukebox-${data.tenant_id}-${Date.now()}`;
      const mockLineItemId = `li-${Date.now()}`;

      return reply.code(201).send(
        apiSuccess({ order_id: mockOrderId, line_item_id: mockLineItemId })
      );
    }
  );

  // POST /internal/remove-line-item — jukebox refund: remove a line item from an order
  fastify.post<{ Body: unknown }>(
    "/internal/remove-line-item",
    {
      schema: {
        summary: "Internal: remove a line item from an order (e.g. jukebox cancellation refund)",
        tags: ["Internal"],
        body: {
          type: "object" as const,
          required: ["order_id", "line_item_id"],
          properties: {
            order_id: { type: "string" as const },
            line_item_id: { type: "string" as const },
          },
        },
        response: { 200: genericOk, 403: errSchema },
      },
    },
    async (request, reply) => {
      const internalSecret = request.headers["x-internal-secret"];
      if (internalSecret !== process.env["INTERNAL_API_SECRET"]) {
        return reply.code(403).send(apiError("Forbidden"));
      }

      const parsed = removeLineItemSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send(apiError(formatZodError(parsed.error)));
      }

      return reply.send(apiSuccess({ refunded: true }));
    }
  );
}
