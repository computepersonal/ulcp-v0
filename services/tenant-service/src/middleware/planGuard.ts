import { FastifyRequest, FastifyReply } from "fastify";
import { PlanTier, ForbiddenError } from "@ulcp/shared";
import { redisGet } from "../lib/redis";
import { prisma } from "../lib/prisma";

const PLAN_ORDER: PlanTier[] = ["free", "starter", "pro", "enterprise"];

function planRank(plan: string): number {
  const idx = PLAN_ORDER.indexOf(plan as PlanTier);
  return idx === -1 ? 0 : idx;
}

/**
 * Middleware factory: ensures tenant's plan is >= required tier.
 * Reads tenant from Redis cache first (key: tenant:config:{tenant_id}), then DB.
 * Expects req.staff to be set by authenticateStaff beforehand.
 */
export function requirePlan(required: PlanTier) {
  return async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (!req.staff) {
      return reply.code(401).send({ success: false, error: "Unauthorized" });
    }

    const tenantId = req.staff.tenant_id;
    if (!tenantId) {
      return reply.code(403).send({ success: false, error: "No tenant assigned yet" });
    }
    let plan: string | null = null;

    // Try Redis cache first
    const cached = await redisGet(`tenant:config:${tenantId}`);
    if (cached) {
      try {
        const parsed = JSON.parse(cached) as { plan?: string };
        plan = parsed.plan ?? null;
      } catch {
        // ignore parse error — fall through to DB
      }
    }

    // Fall back to DB
    if (!plan) {
      const tenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { plan: true },
      });
      plan = tenant?.plan ?? "free";
    }

    if (planRank(plan) < planRank(required)) {
      throw new ForbiddenError(
        `This feature requires the ${required} plan or higher`
      );
    }
  };
}
