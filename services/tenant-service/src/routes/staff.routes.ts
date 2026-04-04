import { formatZodError } from "../lib/zodError";
import { FastifyInstance } from "fastify";
import { z } from "zod";
import { apiSuccess, apiError, AppError } from "@ulcp/shared";
import { authenticateStaff } from "../middleware/authenticate";
import {
  inviteStaff,
  acceptStaffInviteByToken,
  listStaffInvites,
  revokeStaffInvite,
} from "../services/staff.service";

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

const inviteStaffSchema = z.object({
  email: z.string().email(),
  role: z.string().min(1),
  permissions: z.array(z.string()).optional(),
  branch_id: z.string().optional(),
});

const acceptInviteSchema = z.object({
  token: z.string().min(1),
});

type TenantParams = { tenant_id: string };
type TenantInviteParams = { tenant_id: string; invite_id: string };

export async function staffRoutes(fastify: FastifyInstance): Promise<void> {
  // GET /tenants/:tenant_id/staff
  fastify.get<{ Params: TenantParams }>(
    "/",
    {
      schema: {
        summary: "List staff invites",
        tags: ["Staff"],
        params: { type: "object", properties: { tenant_id: { type: "string" } } },
        response: { 200: genericOk },
      },
      preHandler: [authenticateStaff],
    },
    async (req, reply) => {
      try {
        const invites = await listStaffInvites(req.params.tenant_id);
        return reply.send(apiSuccess({ invites }));
      } catch (err) {
        if (err instanceof AppError) {
          return reply.code(err.statusCode).send(apiError(err.message));
        }
        throw err;
      }
    }
  );

  // POST /tenants/:tenant_id/staff/invite
  fastify.post<{ Params: TenantParams }>(
    "/invite",
    {
      schema: {
        summary: "Invite staff member",
        tags: ["Staff"],
        params: { type: "object", properties: { tenant_id: { type: "string" } } },
        body: {
          type: "object",
          required: ["email", "role"],
          properties: {
            email:       { type: "string", format: "email" },
            role:        { type: "string" },
            branch_id:   { type: "string" },
            permissions: { type: "array", items: { type: "string" } },
          },
        },
        response: { 201: genericOk, ...errResponses },
      },
      preHandler: [authenticateStaff],
    },
    async (req, reply) => {
      const body = inviteStaffSchema.safeParse(req.body);
      if (!body.success) {
        return reply
          .code(400)
          .send(apiError(formatZodError(body.error)));
      }
      try {
        const invite = await inviteStaff(
          req.params.tenant_id,
          body.data,
          req.staff!.user_id
        );
        return reply.code(201).send(apiSuccess({ invite }));
      } catch (err) {
        if (err instanceof AppError) {
          return reply.code(err.statusCode).send(apiError(err.message));
        }
        throw err;
      }
    }
  );

  // DELETE /tenants/:tenant_id/staff/:invite_id — revoke invite
  fastify.delete<{ Params: TenantInviteParams }>(
    "/:invite_id",
    {
      schema: {
        summary: "Revoke staff invite",
        tags: ["Staff"],
        params: {
          type: "object",
          properties: {
            tenant_id:  { type: "string" },
            invite_id:  { type: "string" },
          },
        },
        response: { 200: genericOk },
      },
      preHandler: [authenticateStaff],
    },
    async (req, reply) => {
      try {
        await revokeStaffInvite(req.params.tenant_id, req.params.invite_id);
        return reply.send(apiSuccess({ message: "Invite revoked" }));
      } catch (err) {
        if (err instanceof AppError) {
          return reply.code(err.statusCode).send(apiError(err.message));
        }
        throw err;
      }
    }
  );

  // POST /tenants/:tenant_id/staff/accept — accept invite (no auth needed)
  fastify.post<{ Params: TenantParams }>(
    "/accept",
    {
      schema: {
        summary: "Accept staff invite",
        tags: ["Staff"],
        security: [],
        params: { type: "object", properties: { tenant_id: { type: "string" } } },
        body: {
          type: "object",
          required: ["token"],
          properties: {
            token: { type: "string" },
          },
        },
        response: { 200: genericOk, ...errResponses },
      },
    },
    async (req, reply) => {
      const body = acceptInviteSchema.safeParse(req.body);
      if (!body.success) {
        return reply
          .code(400)
          .send(apiError(formatZodError(body.error)));
      }
      try {
        const invite = await acceptStaffInviteByToken(body.data.token);
        return reply.send(apiSuccess({ invite }));
      } catch (err) {
        if (err instanceof AppError) {
          return reply.code(err.statusCode).send(apiError(err.message));
        }
        throw err;
      }
    }
  );
}
