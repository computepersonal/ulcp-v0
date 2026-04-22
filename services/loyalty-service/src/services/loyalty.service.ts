import { LoyaltyTier } from "../generated/prisma";
import { logger } from "../lib/logger";
import { redis } from "../lib/redis";
import * as loyaltyRepo from "../repositories/customerLoyalty.repository";
import * as offerRepo from "../repositories/customerOffer.repository";
import * as visitRepo from "../repositories/customerVisit.repository";
import * as configRepo from "../repositories/loyaltyConfig.repository";

const IDENTITY_URL = process.env["IDENTITY_SERVICE_URL"] ?? "http://localhost:3001";
const INTERNAL_SECRET = process.env["INTERNAL_API_SECRET"] ?? "";

// ─── Helpers ────────────────────────────────────────────────────────────────

function determineTier(
  lifetimeSpend: number,
  config: { tier_silver_threshold: number; tier_gold_threshold: number; tier_platinum_threshold: number }
): LoyaltyTier {
  if (lifetimeSpend >= config.tier_platinum_threshold) return "platinum";
  if (lifetimeSpend >= config.tier_gold_threshold) return "gold";
  return "silver";
}

/** Fetch PlatformCustomer from identity-service (cached 5 min) */
export async function fetchCustomerProfile(customerId: string): Promise<{
  id: string;
  mobile: string;
  name: string | null;
  email: string | null;
  birthday: string | null;
  anniversary: string | null;
  preferences: Record<string, unknown> | null;
} | null> {
  const cacheKey = `customer:profile:${customerId}`;
  const cached = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached);

  try {
    const res = await fetch(`${IDENTITY_URL}/api/v1/auth/customers/${customerId}`, {
      headers: { "x-internal-secret": INTERNAL_SECRET },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { success: boolean; data?: { customer: Record<string, unknown> } };
    if (!data.success || !data.data?.customer) return null;
    const c = data.data.customer as {
      id: string; mobile: string; name: string | null; email: string | null;
      birthday: string | null; anniversary: string | null; preferences: Record<string, unknown> | null;
    };
    await redis.set(cacheKey, JSON.stringify(c), "EX", 300);
    return c;
  } catch (err) {
    logger.warn({ err }, "Failed to fetch customer profile from identity-service");
    return null;
  }
}

/** Lookup customer by mobile via identity-service */
export async function findCustomerByMobile(mobile: string): Promise<{
  id: string;
  mobile: string;
  name: string | null;
  email: string | null;
} | null> {
  try {
    const res = await fetch(`${IDENTITY_URL}/api/v1/auth/customers/by-mobile/${encodeURIComponent(mobile)}`, {
      headers: { "x-internal-secret": INTERNAL_SECRET },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { success: boolean; data?: { customer: Record<string, unknown> } };
    if (!data.success || !data.data?.customer) return null;
    return data.data.customer as { id: string; mobile: string; name: string | null; email: string | null };
  } catch (err) {
    logger.warn({ err }, "Failed to lookup customer by mobile");
    return null;
  }
}

// ─── Full Profile (staff POS or customer self) ──────────────────────────────

export async function getFullProfile(tenantId: string, customerId: string, includeStaffNotes: boolean) {
  const [loyalty, customerProfile, activeOffers, visitStats] = await Promise.all([
    loyaltyRepo.findOrCreateLoyalty(tenantId, customerId),
    fetchCustomerProfile(customerId),
    offerRepo.getActiveOffers(tenantId, customerId),
    visitRepo.getVisitStats(tenantId, customerId),
  ]);

  const recentVisits = await visitRepo.getVisitsForCustomer(tenantId, customerId, { limit: 5 });

  return {
    customer: {
      id: customerId,
      name: customerProfile?.name ?? null,
      mobile: customerProfile?.mobile ?? null,
      email: customerProfile?.email ?? null,
      birthday: customerProfile?.birthday ?? null,
      preferences: customerProfile?.preferences ?? null,
    },
    loyalty: {
      points_balance: loyalty.points_balance,
      wallet_balance: loyalty.wallet_balance,
      tier: loyalty.tier,
      visits_count: loyalty.visits_count,
      orders_count: loyalty.orders_count,
      last_visit_at: loyalty.last_visit_at,
      favourite_items: loyalty.favourite_items,
      ...(includeStaffNotes ? { staff_notes: loyalty.staff_notes } : {}),
    },
    active_offers: activeOffers,
    history: {
      total_orders: visitStats.total_orders,
      average_order_value: visitStats.average_order_value,
      last_order_date: visitStats.last_order_date,
      recent_orders: recentVisits.visits,
    },
  };
}

// ─── Award Points (called internally on ORDER_COMPLETED) ────────────────────

export async function handleOrderCompleted(payload: {
  tenant_id: string;
  customer_id: string;
  order_id: string;
  branch_id: string;
  amount_paid: number;
  items_count: number;
}) {
  const config = await configRepo.getOrCreateConfig(payload.tenant_id);
  const loyalty = await loyaltyRepo.findOrCreateLoyalty(payload.tenant_id, payload.customer_id);

  // 1. Create visit record
  await visitRepo.createVisit({
    tenant_id: payload.tenant_id,
    customer_id: payload.customer_id,
    order_id: payload.order_id,
    branch_id: payload.branch_id,
    total_amount: payload.amount_paid,
    items_count: payload.items_count,
  });

  // 2. Award points: earn_rate * amount_paid / 100 (amount is in paise, earn_rate is points per ₹)
  const pointsEarned = Math.floor(config.earn_rate * (payload.amount_paid / 100));

  // 3. Update loyalty aggregates
  const updated = await loyaltyRepo.awardPoints(
    payload.tenant_id,
    payload.customer_id,
    pointsEarned,
    payload.amount_paid
  );

  // 4. Check tier upgrade
  const newTier = determineTier(updated.lifetime_spend, config);
  if (newTier !== loyalty.tier) {
    await loyaltyRepo.updateTier(payload.tenant_id, payload.customer_id, newTier);
    publishEvent("TIER_UPGRADED", {
      tenant_id: payload.tenant_id,
      customer_id: payload.customer_id,
      old_tier: loyalty.tier,
      new_tier: newTier,
    });
  }

  // 5. Check first order → signup bonus
  if (loyalty.orders_count === 0 && config.signup_bonus_points > 0) {
    const alreadyGranted = await offerRepo.hasTriggerOffer(
      payload.tenant_id, payload.customer_id, "signup"
    );
    if (!alreadyGranted) {
      await loyaltyRepo.awardPoints(payload.tenant_id, payload.customer_id, config.signup_bonus_points, 0);
      publishEvent("MILESTONE_REACHED", {
        tenant_id: payload.tenant_id,
        customer_id: payload.customer_id,
        milestone: "first_order",
        bonus_points: config.signup_bonus_points,
      });
    }
  }

  // 6. Check milestone: every 10 orders
  const totalOrders = updated.orders_count;
  if (totalOrders > 0 && totalOrders % 10 === 0) {
    await offerRepo.createOffer({
      tenant_id: payload.tenant_id,
      customer_id: payload.customer_id,
      type: "reward",
      name: `Milestone: ${totalOrders} orders!`,
      description: "Thank you for being a loyal customer",
      value_type: "percentage",
      value: 15,
      trigger: "milestone",
      expires_at: new Date(Date.now() + 30 * 86400000),
      granted_by: "system",
    });
    publishEvent("MILESTONE_REACHED", {
      tenant_id: payload.tenant_id,
      customer_id: payload.customer_id,
      milestone: `${totalOrders}_orders`,
    });
  }

  // 7. Check birthday offer
  await checkAndGrantBirthdayOffer(payload.tenant_id, payload.customer_id, config);

  // 8. Publish points awarded
  publishEvent("LOYALTY_POINTS_AWARDED", {
    tenant_id: payload.tenant_id,
    customer_id: payload.customer_id,
    points: pointsEarned,
    new_balance: updated.points_balance + pointsEarned,
  });

  return { points_earned: pointsEarned, new_balance: updated.points_balance + pointsEarned };
}

// ─── Redeem Points ──────────────────────────────────────────────────────────

export async function redeemPoints(
  tenantId: string,
  customerId: string,
  pointsToRedeem: number,
  orderId: string
) {
  const config = await configRepo.getOrCreateConfig(tenantId);
  const loyalty = await loyaltyRepo.getLoyalty(tenantId, customerId);

  if (!loyalty) throw new Error("Customer loyalty record not found");
  if (pointsToRedeem < config.min_redemption_points) {
    throw new Error(`Minimum redemption is ${config.min_redemption_points} points`);
  }
  if (pointsToRedeem > loyalty.points_balance) {
    throw new Error("Insufficient points balance");
  }

  await loyaltyRepo.redeemPoints(tenantId, customerId, pointsToRedeem);
  const redemptionAmount = pointsToRedeem * config.redemption_value;

  logger.info(
    { tenantId, customerId, orderId, pointsToRedeem, redemptionAmount },
    "Points redeemed"
  );

  return { points_redeemed: pointsToRedeem, redemption_amount_paise: redemptionAmount };
}

// ─── Birthday Offer ─────────────────────────────────────────────────────────

export async function checkAndGrantBirthdayOffer(
  tenantId: string,
  customerId: string,
  config?: Awaited<ReturnType<typeof configRepo.getOrCreateConfig>>
) {
  const cfg = config ?? await configRepo.getOrCreateConfig(tenantId);
  if (!cfg.birthday_offer_enabled) return;

  const customer = await fetchCustomerProfile(customerId);
  if (!customer?.birthday) return;

  const today = new Date();
  const bday = new Date(customer.birthday);
  if (bday.getMonth() !== today.getMonth() || bday.getDate() !== today.getDate()) return;

  const alreadyGranted = await offerRepo.hasTriggerOffer(tenantId, customerId, "birthday");
  if (alreadyGranted) return;

  const endOfDay = new Date(today);
  endOfDay.setHours(23, 59, 59, 999);

  const offer = await offerRepo.createOffer({
    tenant_id: tenantId,
    customer_id: customerId,
    type: "auto_applied",
    name: `${cfg.birthday_discount_pct}% OFF Birthday!`,
    description: "Happy Birthday! This discount is auto-applied at checkout",
    value_type: "percentage",
    value: cfg.birthday_discount_pct,
    trigger: "birthday",
    expires_at: endOfDay,
    auto_apply: true,
    granted_by: "system",
  });

  publishEvent("BIRTHDAY_OFFER_GRANTED", {
    tenant_id: tenantId,
    customer_id: customerId,
    offer_id: offer.id,
  });
}

// ─── Grant Manual Offer ─────────────────────────────────────────────────────

export async function grantOffer(input: {
  tenant_id: string;
  customer_id: string;
  type: "reward" | "wallet_credit";
  name: string;
  description?: string;
  value_type: "percentage" | "flat" | "free_item";
  value: number;
  free_item_id?: string;
  free_item_name?: string;
  min_order_amount?: number;
  expires_at?: string;
  granted_by: string;
}) {
  const offer = await offerRepo.createOffer({
    tenant_id: input.tenant_id,
    customer_id: input.customer_id,
    type: input.type,
    name: input.name,
    description: input.description,
    value_type: input.value_type,
    value: input.value,
    free_item_id: input.free_item_id,
    free_item_name: input.free_item_name,
    min_order_amount: input.min_order_amount,
    trigger: "manual_grant",
    expires_at: input.expires_at ? new Date(input.expires_at) : undefined,
    granted_by: input.granted_by,
  });

  if (input.type === "wallet_credit") {
    await loyaltyRepo.addWalletCredit(input.tenant_id, input.customer_id, input.value);
  }

  publishEvent("OFFER_GRANTED", {
    tenant_id: input.tenant_id,
    customer_id: input.customer_id,
    offer_id: offer.id,
    name: offer.name,
  });

  return offer;
}

// ─── Apply / Revoke Offer ───────────────────────────────────────────────────

export async function applyOffer(tenantId: string, offerId: string, orderId: string) {
  const offer = await offerRepo.getOfferById(offerId);
  if (!offer) throw new Error("Offer not found");
  if (offer.tenant_id !== tenantId) throw new Error("Offer does not belong to this tenant");
  if (offer.status !== "active") throw new Error("Offer is not active");
  if (offer.expires_at && offer.expires_at < new Date()) throw new Error("Offer has expired");

  await offerRepo.markOfferUsed(offerId, orderId);
  return offer;
}

export async function revokeOffer(tenantId: string, offerId: string) {
  const offer = await offerRepo.getOfferById(offerId);
  if (!offer) throw new Error("Offer not found");
  if (offer.tenant_id !== tenantId) throw new Error("Offer does not belong to this tenant");
  if (offer.status !== "used") throw new Error("Offer is not currently applied");

  await offerRepo.markOfferActive(offerId);
  return offer;
}

// ─── Redis Pub/Sub ──────────────────────────────────────────────────────────

function publishEvent(event: string, payload: Record<string, unknown>) {
  redis.publish(event, JSON.stringify(payload)).catch((err: unknown) => {
    logger.warn({ err, event }, "Failed to publish event");
  });
}
