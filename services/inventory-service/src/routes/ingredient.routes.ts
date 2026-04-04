import { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  findIngredients,
  findIngredientById,
  createIngredient,
  updateIngredient,
  deleteIngredient,
  adjustStock,
} from "../repositories/ingredient.repository";
import { prisma } from "../lib/prisma";

const createIngredientBody = z.object({
  name: z.string().min(1),
  category: z.string().min(1),
  unit: z.string().min(1),
  current_stock: z.number().min(0).optional().default(0),
  minimum_stock: z.number().min(0).optional().default(0),
  critical_stock: z.number().min(0).optional().default(0),
  maximum_stock: z.number().min(0).optional().default(0),
  reorder_quantity: z.number().min(0).optional().default(0),
  unit_cost: z.number().min(0).optional().default(0),
  supplier: z.string().optional(),
  supplier_contact: z.string().optional(),
  supplier_lead_days: z.number().int().min(0).optional().default(0),
});

const updateIngredientBody = createIngredientBody.partial();

const adjustStockBody = z.object({
  delta: z.number(),
  movement_type: z.enum(["manual_add", "manual_remove", "waste", "transfer_in", "transfer_out", "opening"]),
  notes: z.string().optional(),
  reference_id: z.string().optional(),
});

export default async function ingredientRoutes(app: FastifyInstance) {
  // GET /:tenant_id/:branch_id/ingredients
  app.get("/:tenant_id/:branch_id/ingredients", {
    schema: {
      tags: ["Ingredients"],
      params: { type: "object", properties: { tenant_id: { type: "string" }, branch_id: { type: "string" } }, required: ["tenant_id", "branch_id"] },
      querystring: { type: "object", properties: { category: { type: "string" }, search: { type: "string" }, low_stock: { type: "boolean" }, page: { type: "number" }, limit: { type: "number" } } },
    },
  }, async (req, reply) => {
    const { tenant_id, branch_id } = req.params as { tenant_id: string; branch_id: string };
    const query = req.query as { category?: string; search?: string; low_stock?: boolean; page?: number; limit?: number };

    // For low_stock, we handle it differently since Prisma can't compare two fields directly
    let result;
    if (query.low_stock) {
      const ingredients = await prisma.ingredient.findMany({
        where: { tenant_id, branch_id, is_active: true },
      });
      const filtered = ingredients.filter(i => i.minimum_stock > 0 && i.current_stock <= i.minimum_stock);
      result = { items: filtered, total: filtered.length, page: 1, limit: filtered.length };
    } else {
      result = await findIngredients(tenant_id, branch_id, query);
    }

    return reply.send({ success: true, data: result });
  });

  // GET /:tenant_id/:branch_id/ingredients/:id
  app.get("/:tenant_id/:branch_id/ingredients/:id", {
    schema: { tags: ["Ingredients"] },
  }, async (req, reply) => {
    const { tenant_id, branch_id, id } = req.params as { tenant_id: string; branch_id: string; id: string };
    const ingredient = await findIngredientById(id, tenant_id);
    if (!ingredient || ingredient.branch_id !== branch_id) return reply.status(404).send({ success: false, error: "Ingredient not found" });
    return reply.send({ success: true, data: { ingredient } });
  });

  // POST /:tenant_id/:branch_id/ingredients
  app.post("/:tenant_id/:branch_id/ingredients", {
    schema: {
      tags: ["Ingredients"],
      body: {
        type: "object",
        required: ["name", "category", "unit"],
        properties: {
          name: { type: "string" }, category: { type: "string" }, unit: { type: "string" },
          current_stock: { type: "number" }, minimum_stock: { type: "number" },
          critical_stock: { type: "number" }, unit_cost: { type: "number" },
          supplier: { type: "string" }, supplier_lead_days: { type: "number" },
        },
      },
    },
  }, async (req, reply) => {
    const { tenant_id, branch_id } = req.params as { tenant_id: string; branch_id: string };
    const parsed = createIngredientBody.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ success: false, error: parsed.error.errors[0]?.message });

    const ingredient = await createIngredient({
      tenant_id,
      branch_id,
      ...parsed.data,
    });

    return reply.status(201).send({ success: true, data: { ingredient } });
  });

  // PATCH /:tenant_id/:branch_id/ingredients/:id
  app.patch("/:tenant_id/:branch_id/ingredients/:id", {
    schema: {
      tags: ["Ingredients"],
      body: {
        type: "object",
        properties: {
          name: { type: "string" }, category: { type: "string" }, unit: { type: "string" },
          minimum_stock: { type: "number" }, critical_stock: { type: "number" },
          maximum_stock: { type: "number" }, reorder_quantity: { type: "number" },
          unit_cost: { type: "number" }, supplier: { type: "string" },
        },
      },
    },
  }, async (req, reply) => {
    const { tenant_id, branch_id, id } = req.params as { tenant_id: string; branch_id: string; id: string };
    const parsed = updateIngredientBody.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ success: false, error: parsed.error.errors[0]?.message });

    const existing = await findIngredientById(id, tenant_id);
    if (!existing || existing.branch_id !== branch_id) return reply.status(404).send({ success: false, error: "Ingredient not found" });

    const ingredient = await updateIngredient(id, tenant_id, parsed.data);
    return reply.send({ success: true, data: { ingredient } });
  });

  // DELETE /:tenant_id/:branch_id/ingredients/:id
  app.delete("/:tenant_id/:branch_id/ingredients/:id", {
    schema: { tags: ["Ingredients"] },
  }, async (req, reply) => {
    const { tenant_id, branch_id, id } = req.params as { tenant_id: string; branch_id: string; id: string };
    const existing = await findIngredientById(id, tenant_id);
    if (!existing || existing.branch_id !== branch_id) return reply.status(404).send({ success: false, error: "Ingredient not found" });

    await deleteIngredient(id, tenant_id);
    return reply.send({ success: true, data: { message: "Ingredient deactivated" } });
  });

  // POST /:tenant_id/:branch_id/ingredients/:id/adjust — manual stock adjustment
  app.post("/:tenant_id/:branch_id/ingredients/:id/adjust", {
    schema: {
      tags: ["Stock"],
      body: {
        type: "object",
        required: ["delta", "movement_type"],
        properties: {
          delta: { type: "number" },
          movement_type: { type: "string", enum: ["manual_add", "manual_remove", "waste", "transfer_in", "transfer_out", "opening"] },
          notes: { type: "string" },
        },
      },
    },
  }, async (req, reply) => {
    const { tenant_id, branch_id, id } = req.params as { tenant_id: string; branch_id: string; id: string };
    const parsed = adjustStockBody.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ success: false, error: parsed.error.errors[0]?.message });

    const existing = await findIngredientById(id, tenant_id);
    if (!existing || existing.branch_id !== branch_id) return reply.status(404).send({ success: false, error: "Ingredient not found" });

    const result = await adjustStock(id, tenant_id, branch_id, parsed.data.delta, {
      movement_type: parsed.data.movement_type,
      notes: parsed.data.notes,
      reference_id: parsed.data.reference_id,
      unit: existing.unit,
    });

    return reply.send({ success: true, data: result });
  });

  // GET /:tenant_id/:branch_id/ingredients/:id/movements
  app.get("/:tenant_id/:branch_id/ingredients/:id/movements", {
    schema: { tags: ["Stock"] },
  }, async (req, reply) => {
    const { tenant_id, branch_id, id } = req.params as { tenant_id: string; branch_id: string; id: string };
    const query = req.query as { page?: number; limit?: number };
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;

    const [movements, total] = await Promise.all([
      prisma.stockMovement.findMany({
        where: { tenant_id, branch_id, ingredient_id: id },
        orderBy: { created_at: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.stockMovement.count({ where: { tenant_id, branch_id, ingredient_id: id } }),
    ]);

    return reply.send({ success: true, data: { movements, total, page, limit } });
  });
}
