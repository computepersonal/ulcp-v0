import { FastifyInstance } from "fastify";
import { z } from "zod";
import { apiSuccess, apiError, AppError } from "@ulcp/shared";
import { formatZodError } from "../lib/zodError";
import { getInviteByToken, acceptStaffInviteByToken } from "../services/staff.service";

const acceptSchema = z.object({
  token: z.string().min(1),
  name: z.string().min(1, "Name is required"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

const genericOk = {
  type: "object",
  properties: {
    success: { type: "boolean" },
    data: { type: "object", additionalProperties: true },
  },
} as const;

const errResponses = {
  400: { type: "object", properties: { success: { type: "boolean" }, error: { type: "string" } } },
  404: { type: "object", properties: { success: { type: "boolean" }, error: { type: "string" } } },
  409: { type: "object", properties: { success: { type: "boolean" }, error: { type: "string" } } },
} as const;

/**
 * Public (no auth) invite endpoints — registered at /api/v1/staff-invite
 * These don't need tenant_id in the URL because the token is globally unique.
 */
export async function staffInvitePublicRoutes(fastify: FastifyInstance): Promise<void> {
  // GET /staff-invite/validate/:token — check if token is valid, return invite details
  fastify.get<{ Params: { token: string } }>(
    "/validate/:token",
    {
      schema: {
        summary: "Validate a staff invite token (public)",
        tags: ["Staff Invite"],
        security: [],
        params: { type: "object", properties: { token: { type: "string" } } },
        response: { 200: genericOk, ...errResponses },
      },
    },
    async (req, reply) => {
      try {
        const invite = await getInviteByToken(req.params.token);
        return reply.send(apiSuccess({ invite }));
      } catch (err) {
        if (err instanceof AppError) {
          return reply.code(err.statusCode).send(apiError(err.message));
        }
        throw err;
      }
    }
  );

  // POST /staff-invite/accept — accept invite, create identity User
  fastify.post(
    "/accept",
    {
      schema: {
        summary: "Accept staff invite and create account (public)",
        tags: ["Staff Invite"],
        security: [],
        body: {
          type: "object",
          required: ["token", "name", "password"],
          properties: {
            token: { type: "string" },
            name: { type: "string" },
            password: { type: "string", minLength: 8 },
          },
        },
        response: { 200: genericOk, ...errResponses },
      },
    },
    async (req, reply) => {
      const body = acceptSchema.safeParse(req.body);
      if (!body.success) {
        return reply.code(400).send(apiError(formatZodError(body.error)));
      }
      try {
        const result = await acceptStaffInviteByToken(body.data);
        return reply.send(apiSuccess(result));
      } catch (err) {
        if (err instanceof AppError) {
          return reply.code(err.statusCode).send(apiError(err.message));
        }
        throw err;
      }
    }
  );
}
