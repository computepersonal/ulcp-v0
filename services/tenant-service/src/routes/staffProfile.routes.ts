import { FastifyInstance } from "fastify";
import { apiSuccess, apiError, AppError } from "@ulcp/shared";
import { formatZodError } from "../lib/zodError";
import { authenticateStaff } from "../middleware/authenticate";
import {
  getStaffProfile,
  listStaffProfiles,
  upsertStaffProfile,
  deleteStaffProfile,
  staffProfileSchema,
} from "../services/staffProfile.service";

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
  404: { type: "object", properties: { success: { type: "boolean" }, error: { type: "string" } } },
} as const;

type TenantParams = { tenant_id: string };
type UserParams = { tenant_id: string; user_id: string };

/**
 * Staff profile routes — registered at /api/v1/tenants/:tenant_id/staff-profiles
 */
export async function staffProfileRoutes(fastify: FastifyInstance): Promise<void> {
  // GET / — list all staff profiles for tenant
  fastify.get<{ Params: TenantParams; Querystring: { branch_id?: string } }>(
    "/",
    {
      schema: {
        summary: "List staff profiles",
        tags: ["Staff Profile"],
        params: { type: "object", properties: { tenant_id: { type: "string" } } },
        querystring: { type: "object", properties: { branch_id: { type: "string" } } },
        response: { 200: genericOk },
      },
      preHandler: [authenticateStaff],
    },
    async (req, reply) => {
      try {
        const profiles = await listStaffProfiles(req.params.tenant_id, req.query.branch_id);
        return reply.send(apiSuccess({ profiles }));
      } catch (err) {
        if (err instanceof AppError) return reply.code(err.statusCode).send(apiError(err.message));
        throw err;
      }
    }
  );

  // GET /:user_id — get a single staff profile
  fastify.get<{ Params: UserParams }>(
    "/:user_id",
    {
      schema: {
        summary: "Get staff profile by user ID",
        tags: ["Staff Profile"],
        params: {
          type: "object",
          properties: { tenant_id: { type: "string" }, user_id: { type: "string" } },
        },
        response: { 200: genericOk, ...errResponses },
      },
      preHandler: [authenticateStaff],
    },
    async (req, reply) => {
      try {
        const profile = await getStaffProfile(req.params.user_id, req.params.tenant_id);
        return reply.send(apiSuccess({ profile }));
      } catch (err) {
        if (err instanceof AppError) return reply.code(err.statusCode).send(apiError(err.message));
        throw err;
      }
    }
  );

  // PUT /:user_id — create or update staff profile (upsert)
  fastify.put<{ Params: UserParams }>(
    "/:user_id",
    {
      schema: {
        summary: "Create or update staff profile",
        tags: ["Staff Profile"],
        params: {
          type: "object",
          properties: { tenant_id: { type: "string" }, user_id: { type: "string" } },
        },
        body: { type: "object", additionalProperties: true },
        response: { 200: genericOk, ...errResponses },
      },
      preHandler: [authenticateStaff],
    },
    async (req, reply) => {
      const body = staffProfileSchema.safeParse(req.body);
      if (!body.success) {
        return reply.code(400).send(apiError(formatZodError(body.error)));
      }
      try {
        const profile = await upsertStaffProfile(
          req.params.user_id,
          req.params.tenant_id,
          body.data
        );
        return reply.send(apiSuccess({ profile }));
      } catch (err) {
        if (err instanceof AppError) return reply.code(err.statusCode).send(apiError(err.message));
        throw err;
      }
    }
  );

  // DELETE /:user_id — delete staff profile
  fastify.delete<{ Params: UserParams }>(
    "/:user_id",
    {
      schema: {
        summary: "Delete staff profile",
        tags: ["Staff Profile"],
        params: {
          type: "object",
          properties: { tenant_id: { type: "string" }, user_id: { type: "string" } },
        },
        response: { 200: genericOk, ...errResponses },
      },
      preHandler: [authenticateStaff],
    },
    async (req, reply) => {
      try {
        await deleteStaffProfile(req.params.user_id, req.params.tenant_id);
        return reply.send(apiSuccess({ message: "Profile deleted" }));
      } catch (err) {
        if (err instanceof AppError) return reply.code(err.statusCode).send(apiError(err.message));
        throw err;
      }
    }
  );
}
