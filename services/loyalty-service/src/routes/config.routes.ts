import { FastifyInstance } from "fastify";
import { z } from "zod";
import { apiSuccess, apiError } from "@ulcp/shared";
import { formatZodError } from "../lib/zodError";
import { authenticateStaff } from "../middleware/authenticate";
import * as configRepo from "../repositories/loyaltyConfig.repository";

const OWNER_ROLES = new Set(["tenant_owner", "primary_owner", "managing_partner", "platform_superadmin"]);

const updateConfigSchema = z.object({
  earn_rate: z.number().min(0).optional(),
  redemption_value: z.number().int().min(1).optional(),
  min_redemption_points: z.number().int().min(0).optional(),
  signup_bonus_points: z.number().int().min(0).optional(),
  birthday_offer_enabled: z.boolean().optional(),
  birthday_discount_pct: z.number().int().min(1).max(100).optional(),
  tier_silver_threshold: z.number().int().min(0).optional(),
  tier_gold_threshold: z.number().int().min(0).optional(),
  tier_platinum_threshold: z.number().int().min(0).optional(),
});

type TenantParams = { tenant_id: string };

export async function configRoutes(fastify: FastifyInstance): Promise<void> {
  // GET /loyalty/:tenant_id/config
  fastify.get<{ Params: TenantParams }>(
    "/:tenant_id/config",
    {
      schema: {
        summary: "Get loyalty config for tenant",
        tags: ["Loyalty — Config"],
      },
      preHandler: [authenticateStaff],
    },
    async (req, reply) => {
      try {
        const config = await configRepo.getOrCreateConfig(req.params.tenant_id);
        return reply.send(apiSuccess({ config }));
      } catch (err) {
        req.log.error(err);
        return reply.code(500).send(apiError("Failed to load config"));
      }
    }
  );

  // PATCH /loyalty/:tenant_id/config
  fastify.patch<{ Params: TenantParams }>(
    "/:tenant_id/config",
    {
      schema: {
        summary: "Update loyalty config for tenant (owner only)",
        tags: ["Loyalty — Config"],
      },
      preHandler: [authenticateStaff],
    },
    async (req, reply) => {
      if (!OWNER_ROLES.has(req.staff!.role)) {
        return reply.code(403).send(apiError("Only owners can update loyalty config"));
      }
      const body = updateConfigSchema.safeParse(req.body);
      if (!body.success) return reply.code(400).send(apiError(formatZodError(body.error)));
      try {
        const config = await configRepo.updateConfig(req.params.tenant_id, body.data);
        return reply.send(apiSuccess({ config }));
      } catch (err) {
        req.log.error(err);
        return reply.code(500).send(apiError("Failed to update config"));
      }
    }
  );
}
