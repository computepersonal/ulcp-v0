import { prisma } from "../lib/prisma";

export async function getOrCreateConfig(tenantId: string) {
  return prisma.loyaltyConfig.upsert({
    where: { tenant_id: tenantId },
    create: { tenant_id: tenantId },
    update: {},
  });
}

export interface UpdateConfigInput {
  earn_rate?: number;
  redemption_value?: number;
  min_redemption_points?: number;
  signup_bonus_points?: number;
  birthday_offer_enabled?: boolean;
  birthday_discount_pct?: number;
  tier_silver_threshold?: number;
  tier_gold_threshold?: number;
  tier_platinum_threshold?: number;
}

export async function updateConfig(tenantId: string, data: UpdateConfigInput) {
  return prisma.loyaltyConfig.upsert({
    where: { tenant_id: tenantId },
    create: { tenant_id: tenantId, ...data },
    update: data,
  });
}
