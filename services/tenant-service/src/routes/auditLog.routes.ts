import { FastifyInstance } from "fastify";
import { apiSuccess, apiError } from "@ulcp/shared";
import { authenticateStaff } from "../middleware/authenticate";
import { listAuditLogs } from "../repositories/auditLog.repository";

const ALLOWED_ROLES = new Set([
  "tenant_owner",
  "primary_owner",
  "managing_partner",
  "branch_manager",
  "platform_superadmin",
]);

type TenantParams = { tenant_id: string };

export async function auditLogRoutes(fastify: FastifyInstance): Promise<void> {
  // GET /tenants/:tenant_id/audit-logs
  fastify.get<{
    Params: TenantParams;
    Querystring: {
      branch_id?: string;
      entity_type?: string;
      actor_id?: string;
      from?: string;
      to?: string;
      page?: string;
      limit?: string;
    };
  }>(
    "/:tenant_id/audit-logs",
    {
      schema: {
        summary: "List audit logs for a tenant",
        tags: ["Audit"],
        params: {
          type: "object",
          properties: { tenant_id: { type: "string" } },
        },
        querystring: {
          type: "object",
          properties: {
            branch_id:   { type: "string" },
            entity_type: { type: "string" },
            actor_id:    { type: "string" },
            from:        { type: "string" },
            to:          { type: "string" },
            page:        { type: "string" },
            limit:       { type: "string" },
          },
        },
      },
      preHandler: [authenticateStaff],
    },
    async (req, reply) => {
      const { tenant_id } = req.params;
      const staff = req.staff!;

      // Role gate
      if (!ALLOWED_ROLES.has(staff.role)) {
        return reply.code(403).send(apiError("You do not have permission to view audit logs"));
      }

      // branch_managers can only see their own branch's logs
      const qs = req.query;
      const branch_id =
        staff.role === "branch_manager"
          ? (staff.branch_id ?? qs.branch_id)
          : qs.branch_id;

      try {
        const result = await listAuditLogs({
          tenant_id,
          branch_id,
          entity_type: qs.entity_type,
          actor_id:    qs.actor_id,
          from:        qs.from,
          to:          qs.to,
          page:        qs.page  ? parseInt(qs.page,  10) : undefined,
          limit:       qs.limit ? parseInt(qs.limit, 10) : undefined,
        });
        return reply.send(apiSuccess(result));
      } catch (err) {
        req.log.error(err);
        return reply.code(500).send(apiError("Failed to fetch audit logs"));
      }
    }
  );
}
