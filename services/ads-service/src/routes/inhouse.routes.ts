import { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { VALID_PLACEMENTS } from "../services/ad-engine.service";

const createInHouseSchema = z.object({
  name: z.string().min(1),
  headline: z.string().max(60),
  body: z.string().max(150).optional(),
  cta_text: z.string().optional(),
  cta_url: z.string().optional(),
  image_url: z.string().optional(),
  logo_url: z.string().optional(),
  brand_color: z.string().optional(),
  placements: z.array(z.enum([...VALID_PLACEMENTS] as unknown as [string, ...string[]])).min(1),
  starts_at: z.string().datetime(),
  ends_at: z.string().datetime(),
  active_hours_start: z.number().min(0).max(23).default(0),
  active_hours_end: z.number().min(0).max(23).default(23),
  active_days: z.array(z.number().min(0).max(6)).default([0, 1, 2, 3, 4, 5, 6]),
});

export default async function inHouseRoutes(app: FastifyInstance) {
  // POST /api/v1/ads/in-house/:tenant_id
  app.post(
    "/in-house/:tenant_id",
    { schema: { tags: ["In-House Ads"], description: "Create in-house promotion" } },
    async (req, reply) => {
      const { tenant_id } = req.params as { tenant_id: string };
      const parsed = createInHouseSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ success: false, error: parsed.error.errors[0]?.message });
      }
      const d = parsed.data;

      const campaign = await prisma.adCampaign.create({
        data: {
          tenant_id,
          name: d.name,
          type: "in_house",
          status: "active",
          placements: d.placements,
          starts_at: new Date(d.starts_at),
          ends_at: new Date(d.ends_at),
          active_hours_start: d.active_hours_start,
          active_hours_end: d.active_hours_end,
          active_days: d.active_days,
          pricing_model: "flat",
          priority: 10, // in_house always highest priority
          creatives: {
            create: {
              format: "native_card",
              headline: d.headline,
              body: d.body,
              cta_text: d.cta_text,
              cta_url: d.cta_url,
              image_url: d.image_url,
              logo_url: d.logo_url,
              brand_color: d.brand_color,
            },
          },
        },
        include: { creatives: true },
      });

      return reply.code(201).send({ success: true, data: campaign });
    }
  );

  // GET /api/v1/ads/in-house/:tenant_id
  app.get(
    "/in-house/:tenant_id",
    { schema: { tags: ["In-House Ads"] } },
    async (req, reply) => {
      const { tenant_id } = req.params as { tenant_id: string };
      const campaigns = await prisma.adCampaign.findMany({
        where: { tenant_id, type: "in_house" },
        include: { creatives: true },
        orderBy: { created_at: "desc" },
      });
      return reply.send({ success: true, data: campaigns });
    }
  );

  // PATCH /api/v1/ads/in-house/:tenant_id/:id
  app.patch(
    "/in-house/:tenant_id/:id",
    { schema: { tags: ["In-House Ads"] } },
    async (req, reply) => {
      const { tenant_id, id } = req.params as { tenant_id: string; id: string };
      const body = req.body as Record<string, unknown>;

      const existing = await prisma.adCampaign.findFirst({
        where: { id, tenant_id, type: "in_house" },
      });
      if (!existing) return reply.code(404).send({ success: false, error: "Promotion not found" });

      const updated = await prisma.adCampaign.update({
        where: { id },
        data: {
          name: typeof body.name === "string" ? body.name : undefined,
          status: typeof body.status === "string" ? (body.status as "active" | "paused" | "ended") : undefined,
          placements: Array.isArray(body.placements) ? (body.placements as string[]) : undefined,
          starts_at: typeof body.starts_at === "string" ? new Date(body.starts_at) : undefined,
          ends_at: typeof body.ends_at === "string" ? new Date(body.ends_at) : undefined,
        },
        include: { creatives: true },
      });
      return reply.send({ success: true, data: updated });
    }
  );

  // DELETE /api/v1/ads/in-house/:tenant_id/:id
  app.delete(
    "/in-house/:tenant_id/:id",
    { schema: { tags: ["In-House Ads"] } },
    async (req, reply) => {
      const { tenant_id, id } = req.params as { tenant_id: string; id: string };
      const existing = await prisma.adCampaign.findFirst({
        where: { id, tenant_id, type: "in_house" },
      });
      if (!existing) return reply.code(404).send({ success: false, error: "Promotion not found" });

      await prisma.adCampaign.update({
        where: { id },
        data: { status: "ended" },
      });
      return reply.send({ success: true, data: { id } });
    }
  );
}
