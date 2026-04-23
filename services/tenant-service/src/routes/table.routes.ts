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
import { findTableById, updateTable } from "../repositories/table.repository";
import { prisma } from "../lib/prisma";
import { createAuditLog } from "../repositories/auditLog.repository";
import { logger } from "../lib/logger";

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
  status: z.enum(['available', 'occupied', 'billed', 'pending_confirmation']).optional(),
});

type BranchParams = { tenant_id: string; branch_id: string };
type TableParams = { tenant_id: string; branch_id: string; id: string };

export async function tableRoutes(fastify: FastifyInstance): Promise<void> {
  // GET /tenants/:tenant_id/branches/:branch_id/tables/public/:id — public table info (for QR scan)
  fastify.get<{ Params: TableParams }>(
    "/public/:id",
    { schema: { summary: "Get public table info (no auth)", tags: ["Tables"] } },
    async (req, reply) => {
      const table = await findTableById(req.params.id, req.params.tenant_id);
      if (!table) {
        return reply.code(404).send(apiError("Table not found"));
      }
      // Check zone status if table has a section
      let zoneActive = true;
      if (table.section_id) {
        const section = await prisma.section.findFirst({
          where: { id: table.section_id, tenant_id: req.params.tenant_id },
          select: { is_active: true, name: true },
        });
        if (section && !section.is_active) zoneActive = false;
      }
      return reply.send(apiSuccess({
        id: table.id,
        name: table.name,
        capacity: table.capacity,
        is_active: table.is_active,
        zone_active: zoneActive,
        can_order: table.is_active && zoneActive,
      }));
    }
  );

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
        createAuditLog({
          tenant_id:   req.params.tenant_id,
          branch_id:   req.params.branch_id,
          actor_id:    req.staff!.user_id,
          actor_name:  req.staff!.name,
          actor_role:  req.staff!.role,
          action:      "table.created",
          entity_type: "table",
          entity_id:   table.id,
          entity_name: table.name,
          metadata: { capacity: table.capacity, section_id: table.section_id ?? null },
        }).catch((e: unknown) => logger.warn({ e }, "audit log write failed"));
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
        // Fetch current state before update for audit context
        const current = (await getTablesForBranch(req.params.tenant_id, req.params.branch_id))
          .find((t) => t.id === req.params.id);

        const table = await updateTableById(
          req.params.tenant_id,
          req.params.branch_id,
          req.params.id,
          body.data
        );

        // Determine what changed and emit the right action
        if (current) {
          const d = body.data;
          if (d.capacity !== undefined && d.capacity !== current.capacity) {
            createAuditLog({
              tenant_id:   req.params.tenant_id,
              branch_id:   req.params.branch_id,
              actor_id:    req.staff!.user_id,
              actor_role:  req.staff!.role,
              action:      "table.capacity_changed",
              entity_type: "table",
              entity_id:   table.id,
              entity_name: table.name,
              metadata: { from: current.capacity, to: d.capacity },
            }).catch((e: unknown) => logger.warn({ e }, "audit log write failed"));
          }
          if ("section_id" in d && d.section_id !== current.section_id) {
            createAuditLog({
              tenant_id:   req.params.tenant_id,
              branch_id:   req.params.branch_id,
              actor_id:    req.staff!.user_id,
              actor_role:  req.staff!.role,
              action:      "table.zone_changed",
              entity_type: "table",
              entity_id:   table.id,
              entity_name: table.name,
              metadata: {
                from_zone: current.section_id ?? null,
                to_zone:   d.section_id ?? null,
                old_name:  current.name,
                new_name:  table.name,
              },
            }).catch((e: unknown) => logger.warn({ e }, "audit log write failed"));
          } else if (d.name !== undefined && d.name !== current.name) {
            createAuditLog({
              tenant_id:   req.params.tenant_id,
              branch_id:   req.params.branch_id,
              actor_id:    req.staff!.user_id,
              actor_role:  req.staff!.role,
              action:      "table.renamed",
              entity_type: "table",
              entity_id:   table.id,
              entity_name: table.name,
              metadata: { from: current.name, to: table.name },
            }).catch((e: unknown) => logger.warn({ e }, "audit log write failed"));
          }
        }

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
        // Snapshot name before deletion for audit record
        const current = (await getTablesForBranch(req.params.tenant_id, req.params.branch_id))
          .find((t) => t.id === req.params.id);

        await deleteTableById(req.params.tenant_id, req.params.branch_id, req.params.id);

        createAuditLog({
          tenant_id:   req.params.tenant_id,
          branch_id:   req.params.branch_id,
          actor_id:    req.staff!.user_id,
          actor_name:  req.staff!.name,
          actor_role:  req.staff!.role,
          action:      "table.deleted",
          entity_type: "table",
          entity_id:   req.params.id,
          entity_name: current?.name ?? req.params.id,
          metadata: {
            capacity:   current?.capacity ?? null,
            section_id: current?.section_id ?? null,
          },
        }).catch((e: unknown) => logger.warn({ e }, "audit log write failed"));

        return reply.send(apiSuccess({ message: "Table deleted" }));
      } catch (err) {
        if (err instanceof AppError) return reply.code(err.statusCode).send(apiError(err.message));
        throw err;
      }
    }
  );

  // PATCH /tenants/:tenant_id/branches/:branch_id/tables/:id/status — internal: update table status
  // Secured by X-Internal-Secret header (service-to-service only)
  fastify.patch<{ Params: TableParams; Body: { status: string } }>(
    "/:id/status",
    {
      schema: {
        summary: "Update table status (internal)",
        tags: ["Tables"],
      },
    },
    async (req, reply) => {
      const internalSecret = req.headers["x-internal-secret"] as string | undefined;
      if (!internalSecret || internalSecret !== process.env["INTERNAL_API_SECRET"]) {
        return reply.code(403).send(apiError("Forbidden"));
      }

      const { status } = req.body ?? {};
      const validStatuses = ["available", "occupied", "billed", "pending_confirmation"];
      if (!status || !validStatuses.includes(status)) {
        return reply.code(400).send(apiError("Invalid status"));
      }

      const table = await findTableById(req.params.id, req.params.tenant_id);
      if (!table || table.branch_id !== req.params.branch_id) {
        return reply.code(404).send(apiError("Table not found"));
      }

      const updated = await updateTable(req.params.id, { status });
      return reply.send(apiSuccess({ table: updated }));
    }
  );
}
