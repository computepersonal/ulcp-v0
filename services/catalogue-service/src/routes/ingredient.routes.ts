import { formatZodError } from "../lib/zodError";
import { FastifyInstance } from "fastify";
import { z } from "zod";
import { apiSuccess, apiError, AppError } from "@ulcp/shared";
import { authenticateStaff } from "../middleware/authenticate";
import {
  getItemIngredients,
  addIngredient,
  editIngredient,
  removeIngredient,
} from "../services/ingredient.service";

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

const ALLERGEN_VALUES = [
  "gluten", "dairy", "eggs", "nuts", "peanuts",
  "soy", "fish", "shellfish", "sesame", "mustard",
] as const;

const UNIT_VALUES = ["g", "kg", "ml", "l", "pcs", "tbsp", "tsp", "cup"] as const;

const createIngredientSchema = z.object({
  name:          z.string().min(1),
  calories:      z.number().int().min(0).optional(),
  allergens:     z.array(z.enum(ALLERGEN_VALUES)).optional(),
  is_critical:   z.boolean().optional(),
  ingredient_id: z.string().nullable().optional(),
  quantity:      z.number().positive().nullable().optional(),
  unit:          z.enum(UNIT_VALUES).nullable().optional(),
});

const updateIngredientSchema = z.object({
  name:          z.string().min(1).optional(),
  calories:      z.number().int().min(0).nullable().optional(),
  allergens:     z.array(z.enum(ALLERGEN_VALUES)).optional(),
  is_critical:   z.boolean().optional(),
  ingredient_id: z.string().nullable().optional(),
  quantity:      z.number().positive().nullable().optional(),
  unit:          z.enum(UNIT_VALUES).nullable().optional(),
});

type ItemParams = { tenant_id: string; item_id: string };
type IngredientParams = ItemParams & { ingredient_id: string };

export async function ingredientRoutes(fastify: FastifyInstance): Promise<void> {
  // GET /:item_id/ingredients
  fastify.get<{ Params: ItemParams }>(
    "/",
    {
      schema: {
        summary: "List ingredients for an item",
        tags: ["Item Ingredients"],
        response: { 200: genericOk, ...errResponses },
      },
      preHandler: [authenticateStaff],
    },
    async (req, reply) => {
      try {
        const ingredients = await getItemIngredients(req.params.tenant_id, req.params.item_id);
        return reply.send(apiSuccess({ ingredients }));
      } catch (err) {
        if (err instanceof AppError) return reply.code(err.statusCode).send(apiError(err.message));
        throw err;
      }
    }
  );

  // POST /:item_id/ingredients
  fastify.post<{ Params: ItemParams }>(
    "/",
    {
      schema: {
        summary: "Add an ingredient to an item",
        tags: ["Item Ingredients"],
        body: {
          type: "object",
          required: ["name"],
          properties: {
            name:          { type: "string" },
            calories:      { type: "integer", minimum: 0 },
            allergens:     { type: "array", items: { type: "string" } },
            is_critical:   { type: "boolean" },
            ingredient_id: { type: ["string", "null"] },
            quantity:      { type: ["number", "null"], exclusiveMinimum: 0 },
            unit:          { type: ["string", "null"] },
          },
        },
        response: { 201: genericOk, ...errResponses },
      },
      preHandler: [authenticateStaff],
    },
    async (req, reply) => {
      const body = createIngredientSchema.safeParse(req.body);
      if (!body.success)
        return reply.code(400).send(apiError(formatZodError(body.error)));
      try {
        const ingredient = await addIngredient(
          req.params.tenant_id, req.params.item_id, body.data
        );
        return reply.code(201).send(apiSuccess({ ingredient }));
      } catch (err) {
        if (err instanceof AppError) return reply.code(err.statusCode).send(apiError(err.message));
        throw err;
      }
    }
  );

  // PATCH /:item_id/ingredients/:ingredient_id
  fastify.patch<{ Params: IngredientParams }>(
    "/:ingredient_id",
    {
      schema: {
        summary: "Update an ingredient",
        tags: ["Item Ingredients"],
        response: { 200: genericOk, ...errResponses },
      },
      preHandler: [authenticateStaff],
    },
    async (req, reply) => {
      const body = updateIngredientSchema.safeParse(req.body);
      if (!body.success)
        return reply.code(400).send(apiError(formatZodError(body.error)));
      try {
        const ingredient = await editIngredient(
          req.params.tenant_id, req.params.item_id, req.params.ingredient_id, body.data
        );
        return reply.send(apiSuccess({ ingredient }));
      } catch (err) {
        if (err instanceof AppError) return reply.code(err.statusCode).send(apiError(err.message));
        throw err;
      }
    }
  );

  // DELETE /:item_id/ingredients/:ingredient_id
  fastify.delete<{ Params: IngredientParams }>(
    "/:ingredient_id",
    {
      schema: {
        summary: "Delete an ingredient",
        tags: ["Item Ingredients"],
        response: { 200: genericOk, ...errResponses },
      },
      preHandler: [authenticateStaff],
    },
    async (req, reply) => {
      try {
        await removeIngredient(
          req.params.tenant_id, req.params.item_id, req.params.ingredient_id
        );
        return reply.send(apiSuccess({ message: "Ingredient deleted" }));
      } catch (err) {
        if (err instanceof AppError) return reply.code(err.statusCode).send(apiError(err.message));
        throw err;
      }
    }
  );
}
