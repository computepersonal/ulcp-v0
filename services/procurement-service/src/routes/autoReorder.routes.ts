import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import { apiSuccess, apiError } from "@ulcp/shared";
import { authenticateStaff } from "../middleware/authenticate";
import { formatZodError } from "../lib/zodError";
import { handleStockLow } from "../services/autoReorder.service";

const ok = { type: "object" as const, properties: { success: { type: "boolean" as const }, data: { type: "object" as const, additionalProperties: true } } };
const err = { type: "object" as const, properties: { success: { type: "boolean" as const }, error: { type: "string" as const } } };
const errR = { 400: err, 401: err, 403: err, 404: err };

const INTERNAL_SECRET = process.env["INTERNAL_API_SECRET"] ?? "";

const triggerSchema = z.object({
  branch_id: z.string().min(1),
  ingredient_id: z.string().min(1),
});

interface TenantParams { tenant_id: string }

function requireInternal(req: FastifyRequest, reply: FastifyReply): true | undefined {
  if (req.headers["x-internal-secret"] !== INTERNAL_SECRET) {
    void reply.status(403).send({ success: false, error: "Forbidden" });
    return true;
  }
}

export async function autoReorderRoutes(fastify: FastifyInstance): Promise<void> {
  // POST /:tenant_id/auto-reorder/trigger — staff manual trigger
  fastify.post<{ Params: TenantParams; Body: unknown }>(
    "/:tenant_id/auto-reorder/trigger",
    { schema: { summary: "Manually trigger auto-reorder for a low ingredient", tags: ["AutoReorder"], response: { 200: ok, ...errR } }, preHandler: [authenticateStaff] },
    async (req, reply) => {
      const parsed = triggerSchema.safeParse(req.body);
      if (!parsed.success) return reply.code(400).send(apiError(formatZodError(parsed.error)));
      const { tenant_id } = req.params;
      const result = await handleStockLow({ tenant_id, ...parsed.data });
      return reply.send(apiSuccess(result));
    }
  );

  // POST /internal/auto-reorder — internal endpoint called by inventory-service on STOCK_LOW
  fastify.post<{ Body: unknown }>(
    "/internal/auto-reorder",
    { schema: { summary: "Internal auto-reorder hook", tags: ["AutoReorder"], response: { 200: ok, ...errR } } },
    async (req, reply) => {
      const early = requireInternal(req, reply);
      if (early) return;
      const body = z.object({
        tenant_id: z.string(),
        branch_id: z.string(),
        ingredient_id: z.string(),
      }).safeParse(req.body);
      if (!body.success) return reply.code(400).send(apiError(formatZodError(body.error)));
      const result = await handleStockLow(body.data);
      return reply.send(apiSuccess(result));
    }
  );
}
