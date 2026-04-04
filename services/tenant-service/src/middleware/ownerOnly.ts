import { FastifyRequest, FastifyReply } from "fastify";
import { findTenantById } from "../repositories/tenant.repository";

/**
 * Middleware factory: ensures the authenticated user is the owner_user_id
 * of the tenant specified in req.params.id.
 *
 * Place after authenticateStaff in preHandler.
 */
export function requireOwner(tenantParamKey = "id") {
  return async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (!req.staff) {
      return reply.code(401).send({ success: false, error: "Unauthorized" });
    }

    const tenantId = (req.params as Record<string, string>)[tenantParamKey];
    if (!tenantId) {
      return reply.code(400).send({ success: false, error: "Missing tenant id" });
    }

    const tenant = await findTenantById(tenantId);
    if (!tenant) {
      return reply.code(404).send({ success: false, error: "Tenant not found" });
    }

    if (tenant.owner_user_id !== req.staff.user_id) {
      return reply.code(403).send({ success: false, error: "Only the tenant owner can perform this action" });
    }
  };
}
