import { formatZodError } from "../lib/zodError";
import { FastifyInstance } from "fastify";
import { z } from "zod";
import { apiSuccess, apiError, AppError } from "@ulcp/shared";
import { authenticateStaff } from "../middleware/authenticate";
import {
  createTableForBranch,
  getTablesForBranch,
  updateTableById,
  deleteTableById,
} from "../services/table.service";

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

const createTableSchema = z.object({
  name: z.string().min(1),
  capacity: z.number().int().min(1).optional(),
  position: z.number().int().min(0).optional(),
  section_id: z.string().optional(),
});

const updateTableSchema = z.object({
  name: z.string().min(1).optional(),
  capacity: z.number().int().min(1).optional(),
  position: z.number().int().min(0).optional(),
  is_active: z.boolean().optional(),
  section_id: z.string().nullable().optional(),
});

type BranchParams = { tenant_id: string; branch_id: string };
type TableParams = { tenant_id: string; branch_id: string; id: string };

export async function tableRoutes(fastify: FastifyInstance): Promise<void> {
  // POST /tenants/:tenant_id/branches/:branch_id/tables
  fastify.post<{ Params: BranchParams }>(
    "/",
    {
      schema: {
        summary: "Create a table",
        tags: ["Tables"],
        params: {
          type: "object",
          properties: {
            tenant_id: { type: "string" },
            branch_id: { type: "string" },
          },
        },
        body: {
          type: "object",
          required: ["name"],
          properties: {
            name:       { type: "string", description: "e.g. T1, R1, Window Seat" },
            capacity:   { type: "integer", minimum: 1, default: 2 },
            position:   { type: "integer", minimum: 0, default: 0, description: "Sort order on floor map" },
            section_id: { type: "string", description: "Optional — assign to a section" },
          },
        },
        response: { 201: genericOk, ...errResponses },
      },
      preHandler: [authenticateStaff],
    },
    async (req, reply) => {
      const body = createTableSchema.safeParse(req.body);
      if (!body.success) {
        return reply.code(400).send(apiError(formatZodError(body.error)));
      }
      try {
        const table = await createTableForBranch(
          req.params.tenant_id,
          req.params.branch_id,
          body.data
        );
        return reply.code(201).send(apiSuccess({ table }));
      } catch (err) {
        if (err instanceof AppError) return reply.code(err.statusCode).send(apiError(err.message));
        throw err;
      }
    }
  );

  // GET /tenants/:tenant_id/branches/:branch_id/tables
  fastify.get<{ Params: BranchParams }>(
    "/",
    {
      schema: {
        summary: "List tables for a branch",
        tags: ["Tables"],
        params: {
          type: "object",
          properties: {
            tenant_id: { type: "string" },
            branch_id: { type: "string" },
          },
        },
        response: { 200: genericOk, ...errResponses },
      },
      preHandler: [authenticateStaff],
    },
    async (req, reply) => {
      try {
        const tables = await getTablesForBranch(req.params.tenant_id, req.params.branch_id);
        return reply.send(apiSuccess({ tables }));
      } catch (err) {
        if (err instanceof AppError) return reply.code(err.statusCode).send(apiError(err.message));
        throw err;
      }
    }
  );

  // PATCH /tenants/:tenant_id/branches/:branch_id/tables/:id
  fastify.patch<{ Params: TableParams }>(
    "/:id",
    {
      schema: {
        summary: "Update a table",
        tags: ["Tables"],
        params: {
          type: "object",
          properties: {
            tenant_id: { type: "string" },
            branch_id: { type: "string" },
            id:        { type: "string" },
          },
        },
        body: {
          type: "object",
          properties: {
            name:       { type: "string" },
            capacity:   { type: "integer", minimum: 1 },
            position:   { type: "integer", minimum: 0 },
            is_active:  { type: "boolean" },
            section_id: { type: "string", nullable: true, description: "Set to null to remove from section" },
          },
        },
        response: { 200: genericOk, ...errResponses },
      },
      preHandler: [authenticateStaff],
    },
    async (req, reply) => {
      const body = updateTableSchema.safeParse(req.body);
      if (!body.success) {
        return reply.code(400).send(apiError(formatZodError(body.error)));
      }
      try {
        const table = await updateTableById(
          req.params.tenant_id,
          req.params.branch_id,
          req.params.id,
          body.data
        );
        return reply.send(apiSuccess({ table }));
      } catch (err) {
        if (err instanceof AppError) return reply.code(err.statusCode).send(apiError(err.message));
        throw err;
      }
    }
  );

  // DELETE /tenants/:tenant_id/branches/:branch_id/tables/:id
  fastify.delete<{ Params: TableParams }>(
    "/:id",
    {
      schema: {
        summary: "Delete a table",
        tags: ["Tables"],
        params: {
          type: "object",
          properties: {
            tenant_id: { type: "string" },
            branch_id: { type: "string" },
            id:        { type: "string" },
          },
        },
        response: { 200: genericOk, ...errResponses },
      },
      preHandler: [authenticateStaff],
    },
    async (req, reply) => {
      try {
        await deleteTableById(req.params.tenant_id, req.params.branch_id, req.params.id);
        return reply.send(apiSuccess({ message: "Table deleted" }));
      } catch (err) {
        if (err instanceof AppError) return reply.code(err.statusCode).send(apiError(err.message));
        throw err;
      }
    }
  );
}
