import { formatZodError } from "../lib/zodError";
import { FastifyInstance } from "fastify";
import { z } from "zod";
import { apiSuccess, apiError, AppError } from "@ulcp/shared";
import { authenticateStaff } from "../middleware/authenticate";
import { requireOwner } from "../middleware/ownerOnly";
import {
  invitePartner,
  acceptPartnerInvite,
  listPartners,
  updatePartnerPermissions,
} from "../services/partner.service";

// ─── Shared Swagger response shapes ──────────────────────────────────────────
const genericOk = {
  type: "object",
  properties: {
    success: { type: "boolean" },
    data: { type: "object", additionalProperties: true },
  },
} as const;

const errResponses = {
  400: { type: "object", properties: { success: { type: "boolean" }, error: { type: "string" } } },
  401: { type: "object", properties: { success: { type: "boolean" }, error: { type: "string" } } },
  403: { type: "object", properties: { success: { type: "boolean" }, error: { type: "string" } } },
  404: { type: "object", properties: { success: { type: "boolean" }, error: { type: "string" } } },
} as const;

const invitePartnerSchema = z.object({
  user_id: z.string().min(1),
  role: z.enum([
    "managing_partner",
    "silent_partner",
    "operations_partner",
    "branch_partner",
    "custom_partner",
  ]),
  permissions: z.record(z.boolean()).optional(),
  assigned_branches: z.array(z.string()).optional(),
});

const acceptPartnerSchema = z.object({
  token: z.string().min(1),
  user_id: z.string().min(1),
});

const updatePermissionsSchema = z.object({
  permissions: z.record(z.boolean()),
});

type TenantParams = { tenant_id: string };
type TenantPartnerParams = { tenant_id: string; id: string };

export async function partnerRoutes(fastify: FastifyInstance): Promise<void> {
  // GET /tenants/:tenant_id/partners
  fastify.get<{ Params: TenantParams }>(
    "/",
    {
      schema: {
        summary: "List partners",
        tags: ["Partners"],
        params: { type: "object", properties: { tenant_id: { type: "string" } } },
        response: { 200: genericOk },
      },
      preHandler: [authenticateStaff],
    },
    async (req, reply) => {
      try {
        const partners = await listPartners(req.params.tenant_id);
        return reply.send(apiSuccess({ partners }));
      } catch (err) {
        if (err instanceof AppError) {
          return reply.code(err.statusCode).send(apiError(err.message));
        }
        throw err;
      }
    }
  );

  // POST /tenants/:tenant_id/partners/invite
  fastify.post<{ Params: TenantParams }>(
    "/invite",
    {
      schema: {
        summary: "Invite a partner",
        tags: ["Partners"],
        params: { type: "object", properties: { tenant_id: { type: "string" } } },
        body: {
          type: "object",
          required: ["user_id", "role"],
          properties: {
            user_id: { type: "string" },
            role: {
              type: "string",
              enum: [
                "managing_partner",
                "silent_partner",
                "operations_partner",
                "branch_partner",
                "custom_partner",
              ],
            },
            permissions:       { type: "object" },
            assigned_branches: { type: "array", items: { type: "string" } },
          },
        },
        response: { 201: genericOk, ...errResponses },
      },
      preHandler: [authenticateStaff, requireOwner("tenant_id")],
    },
    async (req, reply) => {
      const body = invitePartnerSchema.safeParse(req.body);
      if (!body.success) {
        return reply
          .code(400)
          .send(apiError(formatZodError(body.error)));
      }
      try {
        const partner = await invitePartner(
          req.params.tenant_id,
          body.data,
          req.staff!.user_id
        );
        return reply.code(201).send(apiSuccess({ partner }));
      } catch (err) {
        if (err instanceof AppError) {
          return reply.code(err.statusCode).send(apiError(err.message));
        }
        throw err;
      }
    }
  );

  // POST /tenants/:tenant_id/partners/accept — accept invite (no auth required)
  fastify.post<{ Params: TenantParams }>(
    "/accept",
    {
      schema: {
        summary: "Accept partner invite",
        tags: ["Partners"],
        security: [],
        params: { type: "object", properties: { tenant_id: { type: "string" } } },
        body: {
          type: "object",
          required: ["token", "user_id"],
          properties: {
            token:   { type: "string" },
            user_id: { type: "string" },
          },
        },
        response: { 200: genericOk, ...errResponses },
      },
    },
    async (req, reply) => {
      const body = acceptPartnerSchema.safeParse(req.body);
      if (!body.success) {
        return reply
          .code(400)
          .send(apiError(formatZodError(body.error)));
      }
      try {
        const partner = await acceptPartnerInvite(
          body.data.token,
          body.data.user_id
        );
        return reply.send(apiSuccess({ partner }));
      } catch (err) {
        if (err instanceof AppError) {
          return reply.code(err.statusCode).send(apiError(err.message));
        }
        throw err;
      }
    }
  );

  // PATCH /tenants/:tenant_id/partners/:id/permissions
  fastify.patch<{ Params: TenantPartnerParams }>(
    "/:id/permissions",
    {
      schema: {
        summary: "Update partner permissions",
        tags: ["Partners"],
        params: {
          type: "object",
          properties: {
            tenant_id: { type: "string" },
            id:        { type: "string" },
          },
        },
        body: {
          type: "object",
          properties: {
            permissions:       { type: "object" },
            assigned_branches: { type: "array", items: { type: "string" } },
          },
        },
        response: { 200: genericOk },
      },
      preHandler: [authenticateStaff],
    },
    async (req, reply) => {
      const body = updatePermissionsSchema.safeParse(req.body);
      if (!body.success) {
        return reply
          .code(400)
          .send(apiError(formatZodError(body.error)));
      }
      try {
        const partner = await updatePartnerPermissions(
          req.params.tenant_id,
          req.params.id,
          body.data.permissions
        );
        return reply.send(apiSuccess({ partner }));
      } catch (err) {
        if (err instanceof AppError) {
          return reply.code(err.statusCode).send(apiError(err.message));
        }
        throw err;
      }
    }
  );
}
