import { prisma } from "../lib/prisma";
import { logger } from "../lib/logger";

export const VALID_PLACEMENTS = [
  "platform_home",
  "order_tracking",
  "post_checkout",
  "social_room",
  "explore_nearby",
  "jukebox_queue",
  "jukebox_player",
] as const;

export type ValidPlacementTuple = [string, ...string[]];

export type ValidPlacement = (typeof VALID_PLACEMENTS)[number];

// Plans and their allowed placements
const PLAN_PLACEMENTS: Record<string, string[]> = {
  starter: ["explore_nearby"],
  growth: ["explore_nearby", "post_checkout", "order_tracking"],
  premium: [...VALID_PLACEMENTS],
  mall_package: [...VALID_PLACEMENTS],
};

export interface AdContext {
  placement: string;
  tenant_id?: string;
  branch_id?: string;
  customer_id?: string;
  customer_lat?: number;
  customer_lng?: number;
  format?: string;
  limit?: number;
}

export interface ServedAd {
  campaign_id: string;
  creative_id: string;
  format: string;
  headline: string;
  body: string | null;
  cta_text: string;
  cta_url: string;
  image_url: string | null;
  logo_url: string | null;
  brand_color: string | null;
  video_url: string | null;
  skip_after_secs: number;
  advertiser_name: string;
  priority: number;
  // Explore-specific
  explore_headline: string | null;
  explore_distance_m: number | null;
  explore_offer_expiry: Date | null;
}

function distanceM(
  lat1: number, lng1: number,
  lat2: number, lng2: number
): number {
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

export async function getAdsForContext(ctx: AdContext): Promise<ServedAd[]> {
  const {
    placement,
    tenant_id,
    customer_lat,
    customer_lng,
    format,
    limit = 2,
  } = ctx;

  if (!VALID_PLACEMENTS.includes(placement as ValidPlacement)) {
    return [];
  }

  const now = new Date();
  const currentHour = now.getHours();
  const currentDay = now.getDay(); // 0=Sun, 6=Sat

  const campaigns = await prisma.adCampaign.findMany({
    where: {
      status: "active",
      starts_at: { lte: now },
      ends_at: { gte: now },
      placements: { has: placement },
    },
    include: {
      creatives: { where: { is_active: true } },
      advertiser: true,
    },
  });

  const eligible = campaigns.filter((c) => {
    // Hour check
    if (currentHour < c.active_hours_start || currentHour > c.active_hours_end) return false;
    // Day check
    if (c.active_days.length > 0 && !c.active_days.includes(currentDay)) return false;
    // Daily budget check — skip if > 0 (would need spend tracking; for now 0 = unlimited)
    // Placement allowed by plan
    if (c.type === "in_house") {
      // In-house: only show for the matching tenant
      if (tenant_id && c.tenant_id !== tenant_id) return false;
      return true;
    }
    if (c.advertiser) {
      const allowed = PLAN_PLACEMENTS[c.advertiser.plan] ?? [];
      if (!allowed.includes(placement)) return false;
    }
    // Format filter (for pre_roll etc)
    if (format) {
      const hasFormat = c.creatives.some((cr) => cr.format === format);
      if (!hasFormat) return false;
    }
    return true;
  });

  // Geo filter when lat/lng provided
  const geoFiltered = eligible.filter((c) => {
    if (!customer_lat || !customer_lng) return true;
    if (!c.target_lat || !c.target_lng) return true;
    const dist = distanceM(customer_lat, customer_lng, c.target_lat, c.target_lng);
    return dist <= c.target_radius_m;
  });

  // Sort: priority DESC, cpm_rate DESC
  geoFiltered.sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    return b.cpm_rate - a.cpm_rate;
  });

  const result: ServedAd[] = [];
  for (const campaign of geoFiltered.slice(0, limit)) {
    const creative = format
      ? campaign.creatives.find((cr) => cr.format === format)
      : campaign.creatives[0];
    if (!creative) continue;

    result.push({
      campaign_id: campaign.id,
      creative_id: creative.id,
      format: creative.format,
      headline: creative.headline,
      body: creative.body,
      cta_text: creative.cta_text,
      cta_url: creative.cta_url,
      image_url: creative.image_url,
      logo_url: creative.logo_url,
      brand_color: creative.brand_color,
      video_url: creative.video_url,
      skip_after_secs: creative.skip_after_secs,
      advertiser_name: campaign.advertiser?.name ?? "Sponsored",
      priority: campaign.priority,
      explore_headline: campaign.explore_headline,
      explore_distance_m: campaign.explore_distance_m,
      explore_offer_expiry: campaign.explore_offer_expiry,
    });
  }

  return result;
}

export async function recordImpression(
  campaign_id: string,
  creative_id: string,
  placement: string,
  tenant_id?: string,
  branch_id?: string,
  customer_id?: string
): Promise<void> {
  try {
    const campaign = await prisma.adCampaign.findUnique({
      where: { id: campaign_id },
      include: { advertiser: true },
    });
    if (!campaign) return;

    const cpmRevenue = campaign.cpm_rate; // per 1000 impressions; store as fractional for now
    const platformRevenue = Math.round((cpmRevenue * campaign.platform_share_pct) / 100);
    const venueRevenue = Math.round((cpmRevenue * campaign.venue_share_pct) / 100);

    await prisma.adImpression.create({
      data: {
        campaign_id,
        creative_id,
        tenant_id,
        branch_id,
        customer_id,
        placement,
        revenue: cpmRevenue,
        venue_revenue: venueRevenue,
        platform_revenue: platformRevenue,
      },
    });

    // Update venue monthly revenue aggregate
    if (tenant_id && branch_id) {
      const month = now().toISOString().slice(0, 7); // "2026-04"
      await prisma.venueAdRevenue.upsert({
        where: { tenant_id_branch_id_month: { tenant_id, branch_id, month } },
        create: {
          tenant_id,
          branch_id,
          month,
          impressions: 1,
          gross_revenue: cpmRevenue,
          platform_cut: platformRevenue,
          venue_payout: venueRevenue,
        },
        update: {
          impressions: { increment: 1 },
          gross_revenue: { increment: cpmRevenue },
          platform_cut: { increment: platformRevenue },
          venue_payout: { increment: venueRevenue },
        },
      });
    }
  } catch (err) {
    logger.error({ err }, "failed to record impression");
  }
}

export async function recordClick(
  campaign_id: string,
  creative_id: string,
  impression_id: string,
  tenant_id?: string,
  customer_id?: string
): Promise<string> {
  const campaign = await prisma.adCampaign.findUniqueOrThrow({
    where: { id: campaign_id },
    include: { creatives: true },
  });

  const cpcRevenue = campaign.cpc_rate;
  const platformRevenue = Math.round((cpcRevenue * campaign.platform_share_pct) / 100);
  const venueRevenue = Math.round((cpcRevenue * campaign.venue_share_pct) / 100);

  await prisma.adClick.create({
    data: {
      campaign_id,
      creative_id,
      impression_id,
      tenant_id,
      customer_id,
      revenue: cpcRevenue,
      venue_revenue: venueRevenue,
      platform_revenue: platformRevenue,
    },
  });

  const creative = campaign.creatives.find((c) => c.id === creative_id);
  return creative?.cta_url ?? "/explore";
}

function now() {
  return new Date();
}
