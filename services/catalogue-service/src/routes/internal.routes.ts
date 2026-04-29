import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import { apiSuccess, apiError } from "@ulcp/shared";
import { prisma } from "../lib/prisma";

const INTERNAL_SECRET = process.env["INTERNAL_API_SECRET"] ?? "";

function requireInternal(req: FastifyRequest, reply: FastifyReply): true | undefined {
  if (!INTERNAL_SECRET || req.headers["x-internal-secret"] !== INTERNAL_SECRET) {
    void reply.status(403).send(apiError("Forbidden"));
    return true;
  }
}

const recipesBulkBody = z.object({
  tenant_id: z.string().min(1),
  item_ids: z.array(z.string().min(1)).min(1).max(200),
});

export async function internalRoutes(app: FastifyInstance): Promise<void> {
  // POST /api/v1/catalogue/internal/recipes-bulk
  // Returns ingredient recipes for the given items, grouped by item_id.
  // Used by order-service when an order moves to "preparing" to compute stock deductions.
  app.post(
    "/recipes-bulk",
    {
      schema: {
        summary: "Bulk fetch ingredients for items (internal)",
        tags: ["Internal"],
        security: [],
        body: {
          type: "object",
          required: ["tenant_id", "item_ids"],
          properties: {
            tenant_id: { type: "string" },
            item_ids: { type: "array", items: { type: "string" } },
          },
        },
      },
    },
    async (req, reply) => {
      const early = requireInternal(req, reply);
      if (early) return;

      const parsed = recipesBulkBody.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send(apiError(parsed.error.errors[0]?.message ?? "Invalid body"));
      }

      const { tenant_id, item_ids } = parsed.data;
      const rows = await prisma.itemIngredient.findMany({
        where: { tenant_id, item_id: { in: item_ids } },
        select: {
          item_id: true,
          ingredient_id: true,
          name: true,
          quantity: true,
          unit: true,
          is_critical: true,
        },
      });

      const recipes: Record<string, typeof rows> = {};
      for (const id of item_ids) recipes[id] = [];
      for (const row of rows) {
        const list = recipes[row.item_id];
        if (list) list.push(row);
      }

      return reply.send(apiSuccess({ recipes }));
    }
  );
}
