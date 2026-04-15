import { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma";

export default async function analyticsRoutes(app: FastifyInstance) {
  // GET /api/v1/ads/analytics/venue/:tenant_id
  app.get(
    "/analytics/venue/:tenant_id",
    { schema: { tags: ["Analytics"] } },
    async (req, reply) => {
      const { tenant_id } = req.params as { tenant_id: string };
      const { month } = req.query as { month?: string };

      const where = month
        ? { tenant_id, month }
        : { tenant_id };

      const records = await prisma.venueAdRevenue.findMany({
        where,
        orderBy: { month: "desc" },
      });

      return reply.send({ success: true, data: records });
    }
  );

  // GET /api/v1/ads/analytics/campaign/:campaign_id
  app.get(
    "/analytics/campaign/:campaign_id",
    { schema: { tags: ["Analytics"] } },
    async (req, reply) => {
      const { campaign_id } = req.params as { campaign_id: string };

      const [impressions, clicks, campaign] = await Promise.all([
        prisma.adImpression.count({ where: { campaign_id } }),
        prisma.adClick.count({ where: { campaign_id } }),
        prisma.adCampaign.findUnique({
          where: { id: campaign_id },
          include: { advertiser: true },
        }),
      ]);

      if (!campaign) return reply.code(404).send({ success: false, error: "Campaign not found" });

      const totalRevenue = await prisma.adImpression.aggregate({
        where: { campaign_id },
        _sum: { revenue: true, platform_revenue: true, venue_revenue: true },
      });

      return reply.send({
        success: true,
        data: {
          campaign_id,
          name: campaign.name,
          status: campaign.status,
          impressions,
          clicks,
          ctr: impressions > 0 ? ((clicks / impressions) * 100).toFixed(2) + "%" : "0%",
          total_revenue: totalRevenue._sum.revenue ?? 0,
          platform_revenue: totalRevenue._sum.platform_revenue ?? 0,
          venue_revenue: totalRevenue._sum.venue_revenue ?? 0,
        },
      });
    }
  );

  // GET /api/v1/ads/revenue/venue/:tenant_id
  app.get(
    "/revenue/venue/:tenant_id",
    { schema: { tags: ["Analytics"] } },
    async (req, reply) => {
      const { tenant_id } = req.params as { tenant_id: string };

      const summary = await prisma.venueAdRevenue.groupBy({
        by: ["tenant_id"],
        where: { tenant_id },
        _sum: {
          impressions: true,
          clicks: true,
          gross_revenue: true,
          platform_cut: true,
          venue_payout: true,
        },
      });

      const monthly = await prisma.venueAdRevenue.findMany({
        where: { tenant_id },
        orderBy: { month: "desc" },
        take: 12,
      });

      return reply.send({
        success: true,
        data: {
          summary: summary[0] ?? null,
          monthly,
        },
      });
    }
  );

  // GET /api/v1/ads/admin/overview (superadmin only)
  app.get(
    "/admin/overview",
    { schema: { tags: ["Admin"] } },
    async (req, reply) => {
      const internalSecret = req.headers["x-internal-secret"];
      if (internalSecret !== process.env.INTERNAL_API_SECRET) {
        return reply.code(403).send({ success: false, error: "Forbidden" });
      }

      const [totalAdvertisers, activeCampaigns, totalImpressions, totalClicks] = await Promise.all([
        prisma.advertiser.count({ where: { is_active: true } }),
        prisma.adCampaign.count({ where: { status: "active" } }),
        prisma.adImpression.count(),
        prisma.adClick.count(),
      ]);

      const revenueAgg = await prisma.adImpression.aggregate({
        _sum: { revenue: true, platform_revenue: true, venue_revenue: true },
      });

      const byPlan = await prisma.advertiser.groupBy({
        by: ["plan"],
        _count: { id: true },
        where: { is_active: true },
      });

      return reply.send({
        success: true,
        data: {
          advertisers: totalAdvertisers,
          active_campaigns: activeCampaigns,
          impressions: totalImpressions,
          clicks: totalClicks,
          ctr: totalImpressions > 0 ? ((totalClicks / totalImpressions) * 100).toFixed(2) + "%" : "0%",
          total_revenue: revenueAgg._sum.revenue ?? 0,
          platform_revenue: revenueAgg._sum.platform_revenue ?? 0,
          venue_revenue: revenueAgg._sum.venue_revenue ?? 0,
          by_plan: byPlan,
        },
      });
    }
  );
}
