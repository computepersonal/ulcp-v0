import { formatZodError } from "../lib/zodError";
import { FastifyInstance } from "fastify";
import { z } from "zod";
import { apiSuccess, apiError, AppError } from "@ulcp/shared";
import { authenticateStaff } from "../middleware/authenticate";
import {
  getCombos,
  getComboById,
  createCatalogueCombo,
  updateCatalogueCombo,
  deleteCatalogueCombo,
  addComboItem,
  editComboItem,
  deleteComboItem,
} from "../services/combo.service";

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

const createComboSchema = z.object({
  branch_id:   z.string().optional(),
  name:        z.string().min(1),
  description: z.string().optional(),
  image_url:   z.string().url().optional(),
  price:       z.number().int().min(0),
  mrp:         z.number().int().min(0).optional(),
  sort_order:  z.number().int().min(0).optional(),
  valid_from:  z.string().datetime().optional(),
  valid_till:  z.string().datetime().optional(),
});

const updateComboSchema = z.object({
  name:         z.string().min(1).optional(),
  description:  z.string().nullable().optional(),
  image_url:    z.string().url().nullable().optional(),
  price:        z.number().int().min(0).optional(),
  mrp:          z.number().int().min(0).optional(),
  is_available: z.boolean().optional(),
  sort_order:   z.number().int().min(0).optional(),
  valid_from:   z.string().datetime().nullable().optional(),
  valid_till:   z.string().datetime().nullable().optional(),
});

const addComboItemSchema = z.object({
  item_id:      z.string().min(1),
  quantity:     z.number().int().min(1).optional(),
  variant_name: z.string().optional(),
});

const updateComboItemSchema = z.object({
  quantity:     z.number().int().min(1).optional(),
  variant_name: z.string().nullable().optional(),
});

type TenantParams = { tenant_id: string };
type ComboParams  = { tenant_id: string; combo_id: string };
type ComboItemParams = ComboParams & { combo_item_id: string };

export async function comboRoutes(fastify: FastifyInstance): Promise<void> {
  // GET /combos
  fastify.get<{ Params: TenantParams; Querystring: { branch_id?: string } }>(
    "/",
    {
      schema: {
        summary: "List combos",
        tags: ["Combos"],
        querystring: {
          type: "object",
          properties: { branch_id: { type: "string" } },
        },
        response: { 200: genericOk, ...errResponses },
      },
      preHandler: [authenticateStaff],
    },
    async (req, reply) => {
      try {
        const combos = await getCombos(req.params.tenant_id, req.query.branch_id);
        return reply.send(apiSuccess({ combos }));
      } catch (err) {
        if (err instanceof AppError) return reply.code(err.statusCode).send(apiError(err.message));
        throw err;
      }
    }
  );

  // GET /combos/:combo_id
  fastify.get<{ Params: ComboParams }>(
    "/:combo_id",
    {
      schema: { summary: "Get a combo", tags: ["Combos"], response: { 200: genericOk, ...errResponses } },
      preHandler: [authenticateStaff],
    },
    async (req, reply) => {
      try {
        const combo = await getComboById(req.params.tenant_id, req.params.combo_id);
        return reply.send(apiSuccess({ combo }));
      } catch (err) {
        if (err instanceof AppError) return reply.code(err.statusCode).send(apiError(err.message));
        throw err;
      }
    }
  );

  // POST /combos
  fastify.post<{ Params: TenantParams }>(
    "/",
    {
      schema: {
        summary: "Create a combo",
        tags: ["Combos"],
        body: {
          type: "object",
          required: ["name", "price"],
          properties: {
            branch_id:   { type: "string" },
            name:        { type: "string" },
            description: { type: "string" },
            image_url:   { type: "string" },
            price:       { type: "integer", minimum: 0 },
            mrp:         { type: "integer", minimum: 0 },
            sort_order:  { type: "integer", minimum: 0 },
            valid_from:  { type: "string", format: "date-time" },
            valid_till:  { type: "string", format: "date-time" },
          },
        },
        response: { 201: genericOk, ...errResponses },
      },
      preHandler: [authenticateStaff],
    },
    async (req, reply) => {
      const body = createComboSchema.safeParse(req.body);
      if (!body.success)
        return reply.code(400).send(apiError(formatZodError(body.error)));
      try {
        const combo = await createCatalogueCombo(req.params.tenant_id, body.data);
        return reply.code(201).send(apiSuccess({ combo }));
      } catch (err) {
        if (err instanceof AppError) return reply.code(err.statusCode).send(apiError(err.message));
        throw err;
      }
    }
  );

  // PATCH /combos/:combo_id
  fastify.patch<{ Params: ComboParams }>(
    "/:combo_id",
    {
      schema: { summary: "Update a combo", tags: ["Combos"], response: { 200: genericOk, ...errResponses } },
      preHandler: [authenticateStaff],
    },
    async (req, reply) => {
      const body = updateComboSchema.safeParse(req.body);
      if (!body.success)
        return reply.code(400).send(apiError(formatZodError(body.error)));
      try {
        const combo = await updateCatalogueCombo(req.params.tenant_id, req.params.combo_id, body.data);
        return reply.send(apiSuccess({ combo }));
      } catch (err) {
        if (err instanceof AppError) return reply.code(err.statusCode).send(apiError(err.message));
        throw err;
      }
    }
  );

  // DELETE /combos/:combo_id
  fastify.delete<{ Params: ComboParams }>(
    "/:combo_id",
    {
      schema: { summary: "Delete a combo", tags: ["Combos"], response: { 200: genericOk, ...errResponses } },
      preHandler: [authenticateStaff],
    },
    async (req, reply) => {
      try {
        await deleteCatalogueCombo(req.params.tenant_id, req.params.combo_id);
        return reply.send(apiSuccess({ message: "Combo deleted" }));
      } catch (err) {
        if (err instanceof AppError) return reply.code(err.statusCode).send(apiError(err.message));
        throw err;
      }
    }
  );

  // ── Combo Items ────────────────────────────────────────────────────────────

  // POST /combos/:combo_id/items
  fastify.post<{ Params: ComboParams }>(
    "/:combo_id/items",
    {
      schema: {
        summary: "Add an item to a combo",
        tags: ["Combos"],
        body: {
          type: "object",
          required: ["item_id"],
          properties: {
            item_id:      { type: "string" },
            quantity:     { type: "integer", minimum: 1 },
            variant_name: { type: "string" },
          },
        },
        response: { 201: genericOk, ...errResponses },
      },
      preHandler: [authenticateStaff],
    },
    async (req, reply) => {
      const body = addComboItemSchema.safeParse(req.body);
      if (!body.success)
        return reply.code(400).send(apiError(formatZodError(body.error)));
      try {
        const comboItem = await addComboItem(req.params.tenant_id, req.params.combo_id, body.data);
        return reply.code(201).send(apiSuccess({ combo_item: comboItem }));
      } catch (err) {
        if (err instanceof AppError) return reply.code(err.statusCode).send(apiError(err.message));
        throw err;
      }
    }
  );

  // PATCH /combos/:combo_id/items/:combo_item_id
  fastify.patch<{ Params: ComboItemParams }>(
    "/:combo_id/items/:combo_item_id",
    {
      schema: { summary: "Update a combo item", tags: ["Combos"], response: { 200: genericOk, ...errResponses } },
      preHandler: [authenticateStaff],
    },
    async (req, reply) => {
      const body = updateComboItemSchema.safeParse(req.body);
      if (!body.success)
        return reply.code(400).send(apiError(formatZodError(body.error)));
      try {
        const comboItem = await editComboItem(
          req.params.tenant_id, req.params.combo_id, req.params.combo_item_id, body.data
        );
        return reply.send(apiSuccess({ combo_item: comboItem }));
      } catch (err) {
        if (err instanceof AppError) return reply.code(err.statusCode).send(apiError(err.message));
        throw err;
      }
    }
  );

  // DELETE /combos/:combo_id/items/:combo_item_id
  fastify.delete<{ Params: ComboItemParams }>(
    "/:combo_id/items/:combo_item_id",
    {
      schema: { summary: "Remove an item from a combo", tags: ["Combos"], response: { 200: genericOk, ...errResponses } },
      preHandler: [authenticateStaff],
    },
    async (req, reply) => {
      try {
        await deleteComboItem(
          req.params.tenant_id, req.params.combo_id, req.params.combo_item_id
        );
        return reply.send(apiSuccess({ message: "Item removed from combo" }));
      } catch (err) {
        if (err instanceof AppError) return reply.code(err.statusCode).send(apiError(err.message));
        throw err;
      }
    }
  );
}
