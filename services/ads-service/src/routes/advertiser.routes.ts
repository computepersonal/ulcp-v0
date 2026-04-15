import { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { VALID_PLACEMENTS } from "../services/ad-engine.service";

const createAdvertiserSchema = z.object({
  type: z.enum(["in_house", "nearby", "mall", "platform"]),
  name: z.string().min(1),
  contact_email: z.string().email(),
  contact_phone: z.string().optional(),
  business_category: z.string().optional(),
  logo_url: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
  tenant_id: z.string().optional(),
  plan: z.enum(["starter", "growth", "premium", "mall_package"]).default("starter"),
  monthly_budget: z.number().default(0),
});

const createCampaignSchema = z.object({
  name: z.string().min(1),
  type: z.enum(["in_house", "nearby", "mall", "google_fallback"]),
  placements: z.array(z.enum([...VALID_PLACEMENTS] as unknown as [string, ...string[]])).min(1),
  target_radius_m: z.number().default(500),
  target_lat: z.number().optional(),
  target_lng: z.number().optional(),
  target_mall_id: z.string().optional(),
  starts_at: z.string().datetime(),
  ends_at: z.string().datetime(),
  active_hours_start: z.number().min(0).max(23).default(0),
  active_hours_end: z.number().min(0).max(23).default(23),
  active_days: z.array(z.number().min(0).max(6)).default([0, 1, 2, 3, 4, 5, 6]),
  pricing_model: z.enum(["cpm", "cpc", "flat"]),
  cpm_rate: z.number().default(0),
  cpc_rate: z.number().default(0),
  flat_rate: z.number().default(0),
  daily_budget: z.number().default(0),
  explore_headline: z.string().max(80).optional(),
  explore_distance_m: z.number().optional(),
  explore_offer_expiry: z.string().datetime().optional(),
});

const createCreativeSchema = z.object({
  format: z.enum(["native_card", "banner", "pre_roll", "explore_card", "jukebox_card"]),
  headline: z.string().max(60),
  body: z.string().max(150).optional(),
  cta_text: z.string(),
  cta_url: z.string().url(),
  image_url: z.string().optional(),
  logo_url: z.string().optional(),
  brand_color: z.string().optional(),
  video_url: z.string().optional(),
  skip_after_secs: z.number().default(5),
});

function getPriorityForPlan(plan: string): number {
  const map: Record<string, number> = {
    starter: 4,
    growth: 6,
    premium: 8,
    mall_package: 9,
  };
  return map[plan] ?? 4;
}

export default async function advertiserRoutes(app: FastifyInstance) {
  // POST /api/v1/ads/advertisers
  app.post(
    "/advertisers",
    { schema: { tags: ["Advertisers"] } },
    async (req, reply) => {
      const parsed = createAdvertiserSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ success: false, error: parsed.error.errors[0]?.message });
      }
      const advertiser = await prisma.advertiser.create({ data: parsed.data });
      return reply.code(201).send({ success: true, data: advertiser });
    }
  );

  // GET /api/v1/ads/advertisers
  app.get(
    "/advertisers",
    { schema: { tags: ["Advertisers"] } },
    async (req, reply) => {
      const advertisers = await prisma.advertiser.findMany({
        orderBy: { created_at: "desc" },
        include: { _count: { select: { campaigns: true } } },
      });
      return reply.send({ success: true, data: advertisers });
    }
  );

  // GET /api/v1/ads/advertisers/:id
  app.get(
    "/advertisers/:id",
    { schema: { tags: ["Advertisers"] } },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const advertiser = await prisma.advertiser.findUnique({
        where: { id },
        include: { campaigns: { include: { creatives: true } } },
      });
      if (!advertiser) return reply.code(404).send({ success: false, error: "Advertiser not found" });
      return reply.send({ success: true, data: advertiser });
    }
  );

  // PATCH /api/v1/ads/advertisers/:id
  app.patch(
    "/advertisers/:id",
    { schema: { tags: ["Advertisers"] } },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const body = req.body as Record<string, unknown>;
      const advertiser = await prisma.advertiser.update({
        where: { id },
        data: {
          name: typeof body.name === "string" ? body.name : undefined,
          contact_email: typeof body.contact_email === "string" ? body.contact_email : undefined,
          plan: typeof body.plan === "string" ? (body.plan as "starter" | "growth" | "premium" | "mall_package") : undefined,
          is_active: typeof body.is_active === "boolean" ? body.is_active : undefined,
          monthly_budget: typeof body.monthly_budget === "number" ? body.monthly_budget : undefined,
          plan_starts_at: typeof body.plan_starts_at === "string" ? new Date(body.plan_starts_at) : undefined,
          plan_ends_at: typeof body.plan_ends_at === "string" ? new Date(body.plan_ends_at) : undefined,
        },
      });
      return reply.send({ success: true, data: advertiser });
    }
  );

  // POST /api/v1/ads/advertisers/:id/campaigns
  app.post(
    "/advertisers/:id/campaigns",
    { schema: { tags: ["Campaigns"] } },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const advertiser = await prisma.advertiser.findUnique({ where: { id } });
      if (!advertiser) return reply.code(404).send({ success: false, error: "Advertiser not found" });

      const parsed = createCampaignSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ success: false, error: parsed.error.errors[0]?.message });
      }
      const d = parsed.data;

      const campaign = await prisma.adCampaign.create({
        data: {
          advertiser_id: id,
          name: d.name,
          type: d.type,
          status: "draft",
          placements: d.placements,
          target_radius_m: d.target_radius_m,
          target_lat: d.target_lat,
          target_lng: d.target_lng,
          target_mall_id: d.target_mall_id,
          starts_at: new Date(d.starts_at),
          ends_at: new Date(d.ends_at),
          active_hours_start: d.active_hours_start,
          active_hours_end: d.active_hours_end,
          active_days: d.active_days,
          pricing_model: d.pricing_model,
          cpm_rate: d.cpm_rate,
          cpc_rate: d.cpc_rate,
          flat_rate: d.flat_rate,
          daily_budget: d.daily_budget,
          priority: getPriorityForPlan(advertiser.plan),
          explore_headline: d.explore_headline,
          explore_distance_m: d.explore_distance_m,
          explore_offer_expiry: d.explore_offer_expiry ? new Date(d.explore_offer_expiry) : undefined,
        },
      });
      return reply.code(201).send({ success: true, data: campaign });
    }
  );

  // GET /api/v1/ads/advertisers/:id/campaigns
  app.get(
    "/advertisers/:id/campaigns",
    { schema: { tags: ["Campaigns"] } },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const campaigns = await prisma.adCampaign.findMany({
        where: { advertiser_id: id },
        include: { creatives: true, _count: { select: { impressions: true, clicks: true } } },
        orderBy: { created_at: "desc" },
      });
      return reply.send({ success: true, data: campaigns });
    }
  );

  // PATCH /api/v1/ads/advertisers/:id/campaigns/:cid
  app.patch(
    "/advertisers/:id/campaigns/:cid",
    { schema: { tags: ["Campaigns"] } },
    async (req, reply) => {
      const { cid } = req.params as { id: string; cid: string };
      const body = req.body as Record<string, unknown>;
      const campaign = await prisma.adCampaign.update({
        where: { id: cid },
        data: {
          name: typeof body.name === "string" ? body.name : undefined,
          status: typeof body.status === "string" ? (body.status as "draft" | "active" | "paused" | "ended") : undefined,
          placements: Array.isArray(body.placements) ? (body.placements as string[]) : undefined,
        },
      });
      return reply.send({ success: true, data: campaign });
    }
  );

  // POST /api/v1/ads/advertisers/:id/campaigns/:cid/creatives
  app.post(
    "/advertisers/:id/campaigns/:cid/creatives",
    { schema: { tags: ["Creatives"] } },
    async (req, reply) => {
      const { cid } = req.params as { id: string; cid: string };
      const parsed = createCreativeSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ success: false, error: parsed.error.errors[0]?.message });
      }
      const creative = await prisma.adCreative.create({
        data: { campaign_id: cid, ...parsed.data },
      });
      return reply.code(201).send({ success: true, data: creative });
    }
  );
}
