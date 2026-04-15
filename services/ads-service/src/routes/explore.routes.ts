import { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../lib/prisma";

const exploreQuerySchema = z.object({
  lat: z.coerce.number(),
  lng: z.coerce.number(),
  radius_m: z.coerce.number().default(2000),
  limit: z.coerce.number().min(1).max(50).default(20),
});

function distanceM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export default async function exploreRoutes(app: FastifyInstance) {
  // GET /api/v1/ads/explore
  app.get(
    "/explore",
    {
      schema: {
        tags: ["Explore"],
        description: "Get explore tab ad feed sorted by priority + distance",
        querystring: {
          type: "object",
          properties: {
            lat: { type: "number" },
            lng: { type: "number" },
            radius_m: { type: "number" },
            limit: { type: "number" },
          },
          required: ["lat", "lng"],
        },
      },
    },
    async (req, reply) => {
      const parsed = exploreQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        return reply.code(400).send({ success: false, error: parsed.error.errors[0]?.message });
      }
      const { lat, lng, radius_m, limit } = parsed.data;

      const now = new Date();
      const currentHour = now.getHours();
      const currentDay = now.getDay();

      const campaigns = await prisma.adCampaign.findMany({
        where: {
          status: "active",
          starts_at: { lte: now },
          ends_at: { gte: now },
          placements: { has: "explore_nearby" },
        },
        include: {
          creatives: { where: { is_active: true } },
          advertiser: true,
        },
      });

      // Filter by hour, day, geo, plan eligibility
      const eligible = campaigns
        .filter((c) => {
          if (currentHour < c.active_hours_start || currentHour > c.active_hours_end) return false;
          if (c.active_days.length > 0 && !c.active_days.includes(currentDay)) return false;
          if (c.creatives.length === 0) return false;
          // Geo check
          if (c.target_lat && c.target_lng) {
            const dist = distanceM(lat, lng, c.target_lat, c.target_lng);
            if (dist > Math.min(radius_m, c.target_radius_m)) return false;
          }
          return true;
        })
        .map((c) => {
          const creative = c.creatives[0]!;
          const distM = c.target_lat && c.target_lng
            ? Math.round(distanceM(lat, lng, c.target_lat, c.target_lng))
            : null;
          const isFeatured = c.priority >= 8;

          return {
            campaign_id: c.id,
            creative_id: creative.id,
            type: isFeatured ? "featured" : "standard",
            priority: c.priority,
            distance_m: distM,
            advertiser_name: c.advertiser?.name ?? "Sponsored",
            business_category: c.advertiser?.business_category ?? null,
            headline: c.explore_headline ?? creative.headline,
            body: creative.body,
            cta_text: creative.cta_text,
            cta_url: creative.cta_url,
            image_url: creative.image_url,
            logo_url: c.advertiser?.logo_url ?? creative.logo_url,
            brand_color: creative.brand_color,
            explore_offer_expiry: c.explore_offer_expiry,
          };
        });

      // Sort: priority DESC, then distance ASC
      eligible.sort((a, b) => {
        if (b.priority !== a.priority) return b.priority - a.priority;
        const da = a.distance_m ?? 999999;
        const db = b.distance_m ?? 999999;
        return da - db;
      });

      return reply.send({
        success: true,
        data: {
          ads: eligible.slice(0, limit),
          total: eligible.length,
        },
      });
    }
  );
}
