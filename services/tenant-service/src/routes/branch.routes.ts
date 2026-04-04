import { formatZodError } from "../lib/zodError";
import { FastifyInstance } from "fastify";
import { z } from "zod";
import { apiSuccess, apiError, AppError } from "@ulcp/shared";
import { authenticateStaff } from "../middleware/authenticate";

const INTERNAL_SECRET = process.env["INTERNAL_API_SECRET"] ?? "";
import {
  listBranches,
  createBranchForTenant,
  updateBranchForTenant,
  softDeleteBranch,
} from "../services/branch.service";

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

const createBranchSchema = z.object({
  name: z.string().min(1),
  address: z.string().optional(),
  phone: z.string().optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
  timezone: z.string().optional(),
  printer_ip: z.string().optional(),
  delivery_radius_km: z.number().positive().optional(),
});

const updateBranchSchema = createBranchSchema
  .extend({ is_active: z.boolean().optional() })
  .partial();

type BranchRouteParams = { tenant_id: string };
type BranchByIdParams = { tenant_id: string; id: string };

export async function branchRoutes(fastify: FastifyInstance): Promise<void> {
  // GET /tenants/:tenant_id/branches
  fastify.get<{ Params: BranchRouteParams }>(
    "/",
    {
      schema: {
        summary: "List branches",
        tags: ["Branches"],
        params: { type: "object", properties: { tenant_id: { type: "string" } } },
        response: { 200: genericOk },
      },
      // Allow internal services (catalogue, order, etc.) via x-internal-secret
      // Staff JWT also accepted for regular staff access
      preHandler: [async (req, reply) => {
        const secret = req.headers["x-internal-secret"];
        if (INTERNAL_SECRET && secret === INTERNAL_SECRET) return; // internal call — skip JWT
        return authenticateStaff(req, reply);
      }],
    },
    async (req, reply) => {
      try {
        const branches = await listBranches(req.params.tenant_id);
        return reply.send(apiSuccess({ branches }));
      } catch (err) {
        if (err instanceof AppError) {
          return reply.code(err.statusCode).send(apiError(err.message));
        }
        throw err;
      }
    }
  );

  // POST /tenants/:tenant_id/branches
  fastify.post<{ Params: BranchRouteParams }>(
    "/",
    {
      schema: {
        summary: "Create branch",
        tags: ["Branches"],
        params: { type: "object", properties: { tenant_id: { type: "string" } } },
        body: {
          type: "object",
          required: ["name"],
          properties: {
            name:                { type: "string" },
            address:             { type: "string" },
            phone:               { type: "string" },
            lat:                 { type: "number" },
            lng:                 { type: "number" },
            timezone:            { type: "string" },
            printer_ip:          { type: "string" },
            delivery_radius_km:  { type: "number" },
          },
        },
        response: { 201: genericOk, ...errResponses },
      },
      preHandler: [authenticateStaff],
    },
    async (req, reply) => {
      const body = createBranchSchema.safeParse(req.body);
      if (!body.success) {
        return reply
          .code(400)
          .send(apiError(formatZodError(body.error)));
      }
      try {
        const branch = await createBranchForTenant(
          req.params.tenant_id,
          body.data
        );
        return reply.code(201).send(apiSuccess({ branch }));
      } catch (err) {
        if (err instanceof AppError) {
          return reply.code(err.statusCode).send(apiError(err.message));
        }
        throw err;
      }
    }
  );

  // PATCH /tenants/:tenant_id/branches/:id
  fastify.patch<{ Params: BranchByIdParams }>(
    "/:id",
    {
      schema: {
        summary: "Update branch",
        tags: ["Branches"],
        params: {
          type: "object",
          properties: { tenant_id: { type: "string" }, id: { type: "string" } },
        },
        body: { type: "object" },
        response: { 200: genericOk },
      },
      preHandler: [authenticateStaff],
    },
    async (req, reply) => {
      const body = updateBranchSchema.safeParse(req.body);
      if (!body.success) {
        return reply
          .code(400)
          .send(apiError(formatZodError(body.error)));
      }
      try {
        const branch = await updateBranchForTenant(
          req.params.tenant_id,
          req.params.id,
          body.data
        );
        return reply.send(apiSuccess({ branch }));
      } catch (err) {
        if (err instanceof AppError) {
          return reply.code(err.statusCode).send(apiError(err.message));
        }
        throw err;
      }
    }
  );

  // DELETE /tenants/:tenant_id/branches/:id — soft delete
  fastify.delete<{ Params: BranchByIdParams }>(
    "/:id",
    {
      schema: {
        summary: "Deactivate branch",
        tags: ["Branches"],
        params: {
          type: "object",
          properties: { tenant_id: { type: "string" }, id: { type: "string" } },
        },
        response: { 200: genericOk },
      },
      preHandler: [authenticateStaff],
    },
    async (req, reply) => {
      try {
        await softDeleteBranch(req.params.tenant_id, req.params.id);
        return reply.send(apiSuccess({ message: "Branch deactivated" }));
      } catch (err) {
        if (err instanceof AppError) {
          return reply.code(err.statusCode).send(apiError(err.message));
        }
        throw err;
      }
    }
  );
}
