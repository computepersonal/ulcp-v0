import { FastifyInstance } from "fastify";
import { apiSuccess, apiError } from "@ulcp/shared";
import { authenticateStaff } from "../middleware/authenticate";
import { getMarket, getMarketForIngredient, getPriceHistory } from "../services/market.service";

const ok = { type: "object" as const, properties: { success: { type: "boolean" as const }, data: { type: "object" as const, additionalProperties: true } } };
const err = { type: "object" as const, properties: { success: { type: "boolean" as const }, error: { type: "string" as const } } };
const errR = { 400: err, 401: err, 403: err, 404: err };

interface TenantParams { tenant_id: string }
interface IngredientParams { tenant_id: string; ingredient_id: string }
interface HistoryParams { tenant_id: string; ingredient_id: string; vendor_id: string }

export async function marketRoutes(fastify: FastifyInstance): Promise<void> {
  // GET /:tenant_id/market — full market view (all ingredients with vendors)
  fastify.get<{ Params: TenantParams }>(
    "/:tenant_id/market",
    {
      schema: {
        summary: "Market view — all ingredients with vendor comparison (sorted: low stock first)",
        tags: ["Market"],
        response: { 200: ok, ...errR },
      },
      preHandler: [authenticateStaff],
    },
    async (req, reply) => {
      const market = await getMarket(req.params.tenant_id);
      return reply.send(apiSuccess({ market }));
    }
  );

  // GET /:tenant_id/market/:ingredient_id — detailed view for one ingredient
  fastify.get<{ Params: IngredientParams }>(
    "/:tenant_id/market/:ingredient_id",
    {
      schema: {
        summary: "Market view — vendor comparison for a single ingredient",
        tags: ["Market"],
        response: { 200: ok, ...errR },
      },
      preHandler: [authenticateStaff],
    },
    async (req, reply) => {
      const { tenant_id, ingredient_id } = req.params;
      const entry = await getMarketForIngredient(tenant_id, ingredient_id);
      if (!entry) return reply.code(404).send(apiError("No vendors found for this ingredient"));
      return reply.send(apiSuccess({ ingredient: entry }));
    }
  );

  // GET /:tenant_id/market/:ingredient_id/history/:vendor_id — price history
  fastify.get<{ Params: HistoryParams }>(
    "/:tenant_id/market/:ingredient_id/history/:vendor_id",
    {
      schema: {
        summary: "Price history — last 5 orders for this vendor+ingredient combination",
        tags: ["Market"],
        response: { 200: ok, ...errR },
      },
      preHandler: [authenticateStaff],
    },
    async (req, reply) => {
      const { tenant_id, ingredient_id, vendor_id } = req.params;
      const history = await getPriceHistory(tenant_id, ingredient_id, vendor_id);
      return reply.send(apiSuccess({ history }));
    }
  );
}
