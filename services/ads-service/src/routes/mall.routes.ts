import { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma";

const createMallSchema = z.object({
  name: z.string().min(1),
  address: z.string(),
  city: z.string(),
  lat: z.number(),
  lng: z.number(),
  radius_m: z.number().default(200),
  tenant_ids: z.array(z.string()).default([]),
});

export default async function mallRoutes(app: FastifyInstance) {
  app.post(
    "/malls",
    { schema: { tags: ["Malls"] } },
    async (req, reply) => {
      const parsed = createMallSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ success: false, error: parsed.error.errors[0]?.message });
      }
      const mall = await prisma.mall.create({ data: parsed.data });
      return reply.code(201).send({ success: true, data: mall });
    }
  );

  app.get(
    "/malls",
    { schema: { tags: ["Malls"] } },
    async (_req, reply) => {
      const malls = await prisma.mall.findMany({ orderBy: { name: "asc" } });
      return reply.send({ success: true, data: malls });
    }
  );

  app.patch(
    "/malls/:id",
    { schema: { tags: ["Malls"] } },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const body = req.body as Record<string, unknown>;
      const mall = await prisma.mall.update({
        where: { id },
        data: {
          name: typeof body.name === "string" ? body.name : undefined,
          radius_m: typeof body.radius_m === "number" ? body.radius_m : undefined,
        },
      });
      return reply.send({ success: true, data: mall });
    }
  );

  app.post(
    "/malls/:id/tenants",
    { schema: { tags: ["Malls"], description: "Add tenant to mall" } },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const { tenant_id } = req.body as { tenant_id: string };
      if (!tenant_id) return reply.code(400).send({ success: false, error: "tenant_id required" });

      const mall = await prisma.mall.findUnique({ where: { id } });
      if (!mall) return reply.code(404).send({ success: false, error: "Mall not found" });

      if (!mall.tenant_ids.includes(tenant_id)) {
        await prisma.mall.update({
          where: { id },
          data: { tenant_ids: [...mall.tenant_ids, tenant_id] },
        });
      }
      return reply.send({ success: true, data: { mall_id: id, tenant_id } });
    }
  );
}
