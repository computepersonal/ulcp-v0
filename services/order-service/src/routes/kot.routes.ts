import { FastifyInstance } from "fastify";
import { z } from "zod";
import { apiSuccess, apiError, AppError } from "@ulcp/shared";
import { authenticateStaffOrKds } from "../middleware/authenticate";
import { formatZodError } from "../lib/zodError";
import {
  findKOTs,
  findKOTById,
  findKOTsByOrderId,
  updateKOTStatus,
  updateKOTItems,
  allKotsRejected,
} from "../repositories/kot.repository";
import { findOrderById, updateOrderStatus, createStatusHistory } from "../repositories/order.repository";
import { acknowledgeKot, maybeCompleteIfPrepaid } from "../services/order.service";
import { redisPublish } from "../lib/redis";
import { logger } from "../lib/logger";
import type { Prisma } from "../generated/prisma";

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

const kotStatusSchema = z.object({
  status: z.enum(["pending", "acknowledged", "preparing", "ready", "served", "rejected"]),
});

const itemStatusSchema = z.object({
  status: z.enum(["pending", "preparing", "ready", "served", "cancelled"]),
});

// ─── Route params interfaces ──────────────────────────────────────────────────

interface BranchParams {
  tenant_id: string;
  branch_id: string;
}

interface KotParams {
  tenant_id: string;
  id: string;
}

interface ItemParams {
  tenant_id: string;
  id: string;
  item_id: string;
}

// ─── Routes ───────────────────────────────────────────────────────────────────

export async function kotRoutes(fastify: FastifyInstance): Promise<void> {
  // GET /:tenant_id/:branch_id — list KOTs for branch
  fastify.get<{
    Params: BranchParams;
    Querystring: { status?: string };
  }>(
    "/:tenant_id/:branch_id",
    {
      schema: {
        summary: "List KOTs for a branch",
        tags: ["KOT"],
        params: {
          type: "object" as const,
          properties: {
            tenant_id: { type: "string" as const },
            branch_id: { type: "string" as const },
          },
        },
        response: { 200: genericOk, ...errResponses },
      },
      preHandler: [authenticateStaffOrKds],
    },
    async (req, reply) => {
      const { tenant_id, branch_id } = req.params;
      try {
        const kots = await findKOTs(tenant_id, branch_id, req.query.status);
        return reply.send(apiSuccess({ kots }));
      } catch (err) {
        if (err instanceof AppError) {
          return reply.code(err.statusCode).send(apiError(err.message));
        }
        throw err;
      }
    }
  );

  // PATCH /:tenant_id/:id/status — update KOT status
  fastify.patch<{ Params: KotParams; Body: unknown }>(
    "/:tenant_id/:id/status",
    {
      schema: {
        summary: "Update KOT status",
        tags: ["KOT"],
        body: {
          type: "object" as const,
          required: ["status"],
          properties: {
            status: { type: "string" as const, enum: ["pending", "acknowledged", "preparing", "ready", "served"] },
          },
        },
        response: { 200: genericOk, ...errResponses },
      },
      preHandler: [authenticateStaffOrKds],
    },
    async (req, reply) => {
      const parsed = kotStatusSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send(apiError(formatZodError(parsed.error)));
      }

      const { tenant_id, id } = req.params;
      const kot = await findKOTById(id, tenant_id);
      if (!kot) return reply.code(404).send(apiError("KOT not found"));

      try {
        let updated;

        if (parsed.data.status === "acknowledged") {
          // Route through acknowledgeKot — handles cancel of auto-ack job, idempotency, publish
          updated = await acknowledgeKot(id, tenant_id);
        } else {
          updated = await updateKOTStatus(id, parsed.data.status);

          await redisPublish(
            "KOT_STATUS_CHANGED",
            JSON.stringify({
              kot_id: id,
              tenant_id,
              branch_id: kot.branch_id,
              status: parsed.data.status,
            })
          ).catch((err: unknown) =>
            logger.warn({ err }, "Failed to publish KOT_STATUS_CHANGED")
          );

          // Auto-bump: when ALL KOTs for the order reach "served", bump order → "served"
          // (only if order is still in "ready" — don't overwrite completed/cancelled/served)
          if (parsed.data.status === "served") {
            const siblings = await findKOTsByOrderId(kot.order_id, tenant_id);
            const allServed = siblings.length > 0 && siblings.every((k) => k.status === "served");
            if (allServed) {
              const parent = await findOrderById(kot.order_id, tenant_id);
              if (parent && parent.status === "ready") {
                await updateOrderStatus(kot.order_id, "served");
                await createStatusHistory(kot.order_id, "served", "kitchen", "All KOTs served");
                await redisPublish(
                  "ORDER_STATUS_CHANGED",
                  JSON.stringify({
                    order_id: kot.order_id,
                    tenant_id,
                    branch_id: kot.branch_id,
                    status: "served",
                  })
                ).catch((err: unknown) =>
                  logger.warn({ err }, "Failed to publish ORDER_STATUS_CHANGED after KOTs served")
                );
                // Prepaid + served → auto-complete
                await maybeCompleteIfPrepaid(kot.order_id, tenant_id);
              }
            }
          }
        }

        return reply.send(apiSuccess({ kot: updated }));
      } catch (err) {
        if (err instanceof AppError) {
          return reply.code(err.statusCode).send(apiError(err.message));
        }
        throw err;
      }
    }
  );

  // POST /:tenant_id/:id/printer-ack — printer confirms successful print → acknowledge KOT
  fastify.post<{ Params: KotParams; Body: unknown }>(
    "/:tenant_id/:id/printer-ack",
    {
      schema: {
        summary: "Printer acknowledgment — auto-ack KOT after successful print",
        tags: ["KOT"],
        body: {
          type: "object" as const,
          required: ["success"],
          properties: {
            success: { type: "boolean" as const, description: "Whether the print job succeeded" },
            error_message: { type: "string" as const, description: "Error details if print failed" },
          },
        },
        response: { 200: genericOk, ...errResponses },
      },
      preHandler: [authenticateStaffOrKds],
    },
    async (req, reply) => {
      const bodySchema = z.object({
        success: z.boolean(),
        error_message: z.string().optional(),
      });

      const parsed = bodySchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send(apiError(formatZodError(parsed.error)));
      }

      const { tenant_id, id } = req.params;

      if (!parsed.data.success) {
        // Print failed — log alert, KOT stays pending so staff can retry
        logger.warn(
          { kot_id: id, tenant_id, error: parsed.data.error_message },
          "Printer failed to print KOT — acknowledgment skipped, KOT stays pending"
        );
        await redisPublish(
          "KOT_PRINT_FAILED",
          JSON.stringify({ kot_id: id, tenant_id, error: parsed.data.error_message })
        ).catch((err: unknown) =>
          logger.warn({ err }, "Failed to publish KOT_PRINT_FAILED")
        );
        return reply.send(apiSuccess({ acknowledged: false, reason: "print_failed" }));
      }

      try {
        const updated = await acknowledgeKot(id, tenant_id);
        return reply.send(apiSuccess({ acknowledged: true, kot: updated }));
      } catch (err) {
        if (err instanceof AppError) {
          return reply.code(err.statusCode).send(apiError(err.message));
        }
        throw err;
      }
    }
  );

  // POST /:tenant_id/:id/reject — kitchen rejects a KOT
  fastify.post<{ Params: KotParams; Body: unknown }>(
    "/:tenant_id/:id/reject",
    {
      schema: {
        summary: "Kitchen rejects a KOT",
        tags: ["KOT"],
        body: {
          type: "object" as const,
          properties: {
            reason: { type: "string" as const, description: "Why the kitchen rejected this KOT" },
          },
        },
        response: { 200: genericOk, ...errResponses },
      },
      preHandler: [authenticateStaffOrKds],
    },
    async (req, reply) => {
      const { tenant_id, id } = req.params;
      const body = req.body as { reason?: string } | null;
      const reason = body?.reason ?? "Kitchen unable to fulfill";

      const kot = await findKOTById(id, tenant_id);
      if (!kot) return reply.code(404).send(apiError("KOT not found"));

      if (kot.status === "rejected") {
        return reply.send(apiSuccess({ kot, already_rejected: true }));
      }

      try {
        const updated = await updateKOTStatus(id, "rejected");

        // Publish KOT_REJECTED so realtime-service can forward to staff
        await redisPublish(
          "KOT_REJECTED",
          JSON.stringify({
            kot_id: id,
            kot_number: kot.kot_number,
            order_id: kot.order_id,
            tenant_id,
            branch_id: kot.branch_id,
            reason,
          })
        ).catch((err: unknown) =>
          logger.warn({ err }, "Failed to publish KOT_REJECTED")
        );

        // If ALL KOTs for this order are now rejected → auto-cancel the order
        const allRejected = await allKotsRejected(kot.order_id, tenant_id);
        if (allRejected) {
          const { updateOrderStatus, createStatusHistory } = await import("../repositories/order.repository");
          await updateOrderStatus(kot.order_id, "cancelled", {
            cancelled_reason: `Kitchen rejected: ${reason}`,
            cancelled_by: "kitchen",
          });
          await createStatusHistory(kot.order_id, "cancelled", "kitchen", `KOT rejected: ${reason}`);

          await redisPublish(
            "ORDER_STATUS_CHANGED",
            JSON.stringify({
              order_id: kot.order_id,
              tenant_id,
              branch_id: kot.branch_id,
              status: "cancelled",
              reason: `Kitchen rejected: ${reason}`,
            })
          ).catch((err: unknown) =>
            logger.warn({ err }, "Failed to publish ORDER_STATUS_CHANGED after kitchen reject")
          );
        }

        return reply.send(apiSuccess({ kot: updated, order_cancelled: allRejected }));
      } catch (err) {
        if (err instanceof AppError) {
          return reply.code(err.statusCode).send(apiError(err.message));
        }
        throw err;
      }
    }
  );

  // PATCH /:tenant_id/:id/items/:item_id/status — update individual item status within KOT
  fastify.patch<{ Params: ItemParams; Body: unknown }>(
    "/:tenant_id/:id/items/:item_id/status",
    {
      schema: {
        summary: "Update item status within a KOT",
        tags: ["KOT"],
        body: {
          type: "object" as const,
          required: ["status"],
          properties: {
            status: { type: "string" as const, enum: ["pending", "preparing", "ready", "served", "cancelled"] },
          },
        },
        response: { 200: genericOk, ...errResponses },
      },
      preHandler: [authenticateStaffOrKds],
    },
    async (req, reply) => {
      const parsed = itemStatusSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send(apiError(formatZodError(parsed.error)));
      }

      const { tenant_id, id, item_id } = req.params;
      const kot = await findKOTById(id, tenant_id);
      if (!kot) return reply.code(404).send(apiError("KOT not found"));

      try {
        // Update item status within the JSON items array
        const items = (
          kot.items as Array<{ id: string; status?: string }>
        ).map((item) =>
          item.id === item_id
            ? { ...item, status: parsed.data.status }
            : item
        );

        const updated = await updateKOTItems(
          id,
          items as unknown as Prisma.InputJsonValue[]
        );
        return reply.send(apiSuccess({ kot: updated }));
      } catch (err) {
        if (err instanceof AppError) {
          return reply.code(err.statusCode).send(apiError(err.message));
        }
        throw err;
      }
    }
  );
}
