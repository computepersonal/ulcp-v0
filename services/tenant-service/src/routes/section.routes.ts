import { formatZodError } from "../lib/zodError";
import { FastifyInstance } from "fastify";
import { z } from "zod";
import { apiSuccess, apiError, AppError } from "@ulcp/shared";
import { authenticateStaff } from "../middleware/authenticate";
import {
  createSectionForBranch,
  getSectionsForBranch,
  updateSectionById,
  deleteSectionById,
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
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "color must be a hex code e.g. #F59E0B").optional(),
  position: z.number().int().min(0).optional(),
});

const updateSectionSchema = z.object({
  name: z.string().min(1).optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "color must be a hex code e.g. #F59E0B").optional(),
  position: z.number().int().min(0).optional(),
  is_active: z.boolean().optional(),
});

type BranchParams = { tenant_id: string; branch_id: string };
type SectionParams = { tenant_id: string; branch_id: string; id: string };

export async function sectionRoutes(fastify: FastifyInstance): Promise<void> {
  // POST /tenants/:tenant_id/branches/:branch_id/sections
  fastify.post<{ Params: BranchParams }>(
    "/",
    {
      schema: {
        summary: "Create a section",
        description: "Sections group tables on the floor map (e.g. Rooftop, Indoor, Lakeside).",
        tags: ["Sections"],
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
            name:     { type: "string", description: "e.g. Rooftop, Indoor, Lakeside" },
            color:    { type: "string", description: "Hex color for floor map, e.g. #F59E0B" },
            position: { type: "integer", minimum: 0, default: 0 },
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
        const section = await createSectionForBranch(
          req.params.tenant_id,
          req.params.branch_id,
          body.data
        );
        return reply.code(201).send(apiSuccess({ section }));
      } catch (err) {
        if (err instanceof AppError) return reply.code(err.statusCode).send(apiError(err.message));
        throw err;
      }
    }
  );

  // GET /tenants/:tenant_id/branches/:branch_id/sections
  fastify.get<{ Params: BranchParams }>(
    "/",
    {
      schema: {
        summary: "List sections for a branch",
        tags: ["Sections"],
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
        const sections = await getSectionsForBranch(req.params.tenant_id, req.params.branch_id);
        return reply.send(apiSuccess({ sections }));
      } catch (err) {
        if (err instanceof AppError) return reply.code(err.statusCode).send(apiError(err.message));
        throw err;
      }
    }
  );

  // PATCH /tenants/:tenant_id/branches/:branch_id/sections/:id
  fastify.patch<{ Params: SectionParams }>(
    "/:id",
    {
      schema: {
        summary: "Update a section",
        tags: ["Sections"],
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
            name:      { type: "string" },
            color:     { type: "string" },
            position:  { type: "integer", minimum: 0 },
            is_active: { type: "boolean" },
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
        const section = await updateSectionById(
          req.params.tenant_id,
          req.params.branch_id,
          req.params.id,
          body.data
        );
        return reply.send(apiSuccess({ section }));
      } catch (err) {
        if (err instanceof AppError) return reply.code(err.statusCode).send(apiError(err.message));
        throw err;
      }
    }
  );

  // DELETE /tenants/:tenant_id/branches/:branch_id/sections/:id
  fastify.delete<{ Params: SectionParams }>(
    "/:id",
    {
      schema: {
        summary: "Delete a section",
        description: "Tables in this section will have their section_id set to null (not deleted).",
        tags: ["Sections"],
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
        await deleteSectionById(req.params.tenant_id, req.params.branch_id, req.params.id);
        return reply.send(apiSuccess({ message: "Section deleted" }));
      } catch (err) {
        if (err instanceof AppError) return reply.code(err.statusCode).send(apiError(err.message));
        throw err;
      }
    }
  );
}
