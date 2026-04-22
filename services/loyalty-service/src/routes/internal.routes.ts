import { FastifyInstance } from "fastify";
import { z } from "zod";
import { apiSuccess, apiError } from "@ulcp/shared";
import { formatZodError } from "../lib/zodError";
import * as loyaltyService from "../services/loyalty.service";

const INTERNAL_SECRET = process.env["INTERNAL_API_SECRET"] ?? "";

const awardPointsSchema = z.object({
  tenant_id: z.string().min(1),
  customer_id: z.string().min(1),
  order_id: z.string().min(1),
  branch_id: z.string().min(1),
  amount_paid: z.number().int().min(0),
  items_count: z.number().int().min(1),
});

const redeemPointsSchema = z.object({
  tenant_id: z.string().min(1),
  customer_id: z.string().min(1),
  points_to_redeem: z.number().int().min(1),
  order_id: z.string().min(1),
});

export async function internalRoutes(fastify: FastifyInstance): Promise<void> {
  // Verify internal secret for all routes in this scope
  fastify.addHook("preHandler", async (req, reply) => {
    const secret = req.headers["x-internal-secret"];
    if (!INTERNAL_SECRET || secret !== INTERNAL_SECRET) {
      return reply.code(401).send(apiError("Unauthorized"));
    }
  });

  // POST /loyalty/internal/award-points — called by order-service on ORDER_COMPLETED
  fastify.post(
    "/award-points",
    {
      schema: {
        summary: "Award points for completed order (internal)",
        tags: ["Loyalty — Internal"],
        hide: true,
      },
    },
    async (req, reply) => {
      const body = awardPointsSchema.safeParse(req.body);
      if (!body.success) return reply.code(400).send(apiError(formatZodError(body.error)));
      try {
        const result = await loyaltyService.handleOrderCompleted(body.data);
        return reply.send(apiSuccess(result));
      } catch (err) {
        req.log.error(err);
        return reply.code(500).send(apiError("Failed to award points"));
      }
    }
  );

  // POST /loyalty/internal/redeem-points — called by order-service at checkout
  fastify.post(
    "/redeem-points",
    {
      schema: {
        summary: "Redeem points at checkout (internal)",
        tags: ["Loyalty — Internal"],
        hide: true,
      },
    },
    async (req, reply) => {
      const body = redeemPointsSchema.safeParse(req.body);
      if (!body.success) return reply.code(400).send(apiError(formatZodError(body.error)));
      try {
        const result = await loyaltyService.redeemPoints(
          body.data.tenant_id,
          body.data.customer_id,
          body.data.points_to_redeem,
          body.data.order_id
        );
        return reply.send(apiSuccess(result));
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to redeem points";
        return reply.code(400).send(apiError(msg));
      }
    }
  );
}
