import { formatZodError } from "../lib/zodError";
import { FastifyInstance } from "fastify";
import { z } from "zod";
import { apiSuccess, apiError, AppError } from "@ulcp/shared";
import { authenticateStaff } from "../middleware/authenticate";
import { auditLog } from "../lib/auditClient";
import {
  createCatalogueSection,
  getCatalogueSections,
  updateCatalogueSection,
  deleteCatalogueSection,
  reorderCatalogueSections,
} from "../services/section.service";

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

const createSectionSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  position: z.number().int().min(0).optional(),
  branch_id: z.string().optional(),
});

const updateSectionSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  position: z.number().int().min(0).optional(),
  is_available: z.boolean().optional(),
});

const reorderSchema = z.object({
  items: z.array(z.object({ id: z.string(), position: z.number().int() })).min(1),
});

type TenantParams = { tenant_id: string };
type SectionParams = { tenant_id: string; id: string };

export async function sectionRoutes(fastify: FastifyInstance): Promise<void> {
  // POST /catalogue/:tenant_id/sections
  fastify.post<{ Params: TenantParams }>(
    "/",
    {
      schema: {
        summary: "Create a catalogue section",
        tags: ["Catalogue Sections"],
        params: { type: "object", properties: { tenant_id: { type: "string" } } },
        body: {
          type: "object",
          required: ["name"],
          properties: {
            name:        { type: "string" },
            description: { type: "string" },
            position:    { type: "integer", minimum: 0, default: 0 },
            branch_id:   { type: "string", description: "Optional — section for a specific branch only" },
          },
        },
        response: { 201: genericOk, ...errResponses },
      },
      preHandler: [authenticateStaff],
    },
    async (req, reply) => {
      const body = createSectionSchema.safeParse(req.body);
      if (!body.success) {
        return reply.code(400).send(apiError(formatZodError(body.error)));
      }
      try {
        const section = await createCatalogueSection(req.params.tenant_id, body.data);
        auditLog({
          tenant_id:   req.params.tenant_id,
          actor_id:    req.staff!.user_id,
          actor_name:  req.staff!.name,
          actor_role:  req.staff!.role,
          action:      "section.created",
          entity_type: "section",
          entity_id:   section.id,
          entity_name: section.name,
        });
        return reply.code(201).send(apiSuccess({ section }));
      } catch (err) {
        if (err instanceof AppError) return reply.code(err.statusCode).send(apiError(err.message));
        throw err;
      }
    }
  );

  // GET /catalogue/:tenant_id/sections
  fastify.get<{ Params: TenantParams }>(
    "/",
    {
      schema: {
        summary: "List catalogue sections",
        description: "Returns all sections for the tenant (shared + branch-specific). Use the public route for customer-facing menus.",
        tags: ["Catalogue Sections"],
        params: { type: "object", properties: { tenant_id: { type: "string" } } },
        response: { 200: genericOk, ...errResponses },
      },
      preHandler: [authenticateStaff],
    },
    async (req, reply) => {
      try {
        const sections = await getCatalogueSections(req.params.tenant_id);
        return reply.send(apiSuccess({ sections }));
      } catch (err) {
        if (err instanceof AppError) return reply.code(err.statusCode).send(apiError(err.message));
        throw err;
      }
    }
  );

  // PATCH /catalogue/:tenant_id/sections/reorder  — MUST be before /:id
  fastify.patch<{ Params: TenantParams }>(
    "/reorder",
    {
      schema: {
        summary: "Bulk reorder sections",
        tags: ["Catalogue Sections"],
        params: { type: "object", properties: { tenant_id: { type: "string" } } },
        body: {
          type: "object",
          required: ["items"],
          properties: {
            items: {
              type: "array",
              items: {
                type: "object",
                required: ["id", "position"],
                properties: { id: { type: "string" }, position: { type: "integer" } },
              },
            },
          },
        },
        response: { 200: genericOk, ...errResponses },
      },
      preHandler: [authenticateStaff],
    },
    async (req, reply) => {
      const body = reorderSchema.safeParse(req.body);
      if (!body.success) {
        return reply.code(400).send(apiError(formatZodError(body.error)));
      }
      try {
        await reorderCatalogueSections(req.params.tenant_id, body.data.items);
        return reply.send(apiSuccess({ message: "Sections reordered" }));
      } catch (err) {
        if (err instanceof AppError) return reply.code(err.statusCode).send(apiError(err.message));
        throw err;
      }
    }
  );

  // PATCH /catalogue/:tenant_id/sections/:id
  fastify.patch<{ Params: SectionParams }>(
    "/:id",
    {
      schema: {
        summary: "Update a catalogue section",
        tags: ["Catalogue Sections"],
        params: {
          type: "object",
          properties: { tenant_id: { type: "string" }, id: { type: "string" } },
        },
        body: {
          type: "object",
          properties: {
            name:         { type: "string" },
            description:  { type: "string" },
            position:     { type: "integer", minimum: 0 },
            is_available: { type: "boolean" },
          },
        },
        response: { 200: genericOk, ...errResponses },
      },
      preHandler: [authenticateStaff],
    },
    async (req, reply) => {
      const body = updateSectionSchema.safeParse(req.body);
      if (!body.success) {
        return reply.code(400).send(apiError(formatZodError(body.error)));
      }
      try {
        const section = await updateCatalogueSection(req.params.tenant_id, req.params.id, body.data);
        const action = body.data.is_available !== undefined
          ? (body.data.is_available ? "section.shown" : "section.hidden")
          : body.data.name !== undefined ? "section.renamed" : "section.updated";
        auditLog({
          tenant_id:   req.params.tenant_id,
          actor_id:    req.staff!.user_id,
          actor_name:  req.staff!.name,
          actor_role:  req.staff!.role,
          action,
          entity_type: "section",
          entity_id:   section.id,
          entity_name: section.name,
          metadata:    { changes: body.data },
        });
        return reply.send(apiSuccess({ section }));
      } catch (err) {
        if (err instanceof AppError) return reply.code(err.statusCode).send(apiError(err.message));
        throw err;
      }
    }
  );

  // DELETE /catalogue/:tenant_id/sections/:id
  fastify.delete<{ Params: SectionParams }>(
    "/:id",
    {
      schema: {
        summary: "Delete a catalogue section",
        description: "Items in this section will have their section_id set to null (not deleted).",
        tags: ["Catalogue Sections"],
        params: {
          type: "object",
          properties: { tenant_id: { type: "string" }, id: { type: "string" } },
        },
        response: { 200: genericOk, ...errResponses },
      },
      preHandler: [authenticateStaff],
    },
    async (req, reply) => {
      try {
        // Fetch name before deletion for audit log
        const existing = await (await import("../services/section.service")).getCatalogueSections(req.params.tenant_id)
          .then(secs => secs.find(s => s.id === req.params.id));
        await deleteCatalogueSection(req.params.tenant_id, req.params.id);
        auditLog({
          tenant_id:   req.params.tenant_id,
          actor_id:    req.staff!.user_id,
          actor_name:  req.staff!.name,
          actor_role:  req.staff!.role,
          action:      "section.deleted",
          entity_type: "section",
          entity_id:   req.params.id,
          entity_name: existing?.name ?? req.params.id,
        });
        return reply.send(apiSuccess({ message: "Section deleted" }));
      } catch (err) {
        if (err instanceof AppError) return reply.code(err.statusCode).send(apiError(err.message));
        throw err;
      }
    }
  );
}
