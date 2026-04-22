import { prisma } from "../lib/prisma";
import { LoyaltyTier } from "../generated/prisma";

export async function findOrCreateLoyalty(tenantId: string, customerId: string) {
  return prisma.customerLoyalty.upsert({
    where: { tenant_id_customer_id: { tenant_id: tenantId, customer_id: customerId } },
    create: { tenant_id: tenantId, customer_id: customerId },
    update: {},
  });
}

export async function getLoyalty(tenantId: string, customerId: string) {
  return prisma.customerLoyalty.findUnique({
    where: { tenant_id_customer_id: { tenant_id: tenantId, customer_id: customerId } },
  });
}

export async function awardPoints(
  tenantId: string,
  customerId: string,
  points: number,
  spendAmount: number
) {
  return prisma.customerLoyalty.update({
    where: { tenant_id_customer_id: { tenant_id: tenantId, customer_id: customerId } },
    data: {
      points_balance:         { increment: points },
      lifetime_earned_points: { increment: points },
      lifetime_spend:         { increment: spendAmount },
      visits_count:           { increment: 1 },
      orders_count:           { increment: 1 },
      last_visit_at:          new Date(),
    },
  });
}

export async function redeemPoints(tenantId: string, customerId: string, points: number) {
  return prisma.customerLoyalty.update({
    where: { tenant_id_customer_id: { tenant_id: tenantId, customer_id: customerId } },
    data: {
      points_balance:           { decrement: points },
      lifetime_redeemed_points: { increment: points },
    },
  });
}

export async function updateTier(tenantId: string, customerId: string, tier: LoyaltyTier) {
  return prisma.customerLoyalty.update({
    where: { tenant_id_customer_id: { tenant_id: tenantId, customer_id: customerId } },
    data: { tier },
  });
}

export async function updateStaffNotes(tenantId: string, customerId: string, notes: string) {
  return prisma.customerLoyalty.update({
    where: { tenant_id_customer_id: { tenant_id: tenantId, customer_id: customerId } },
    data: { staff_notes: notes },
  });
}

export async function addWalletCredit(tenantId: string, customerId: string, amount: number) {
  return prisma.customerLoyalty.update({
    where: { tenant_id_customer_id: { tenant_id: tenantId, customer_id: customerId } },
    data: { wallet_balance: { increment: amount } },
  });
}

export async function deductWallet(tenantId: string, customerId: string, amount: number) {
  return prisma.customerLoyalty.update({
    where: { tenant_id_customer_id: { tenant_id: tenantId, customer_id: customerId } },
    data: { wallet_balance: { decrement: amount } },
  });
}

export async function listCustomersForTenant(
  tenantId: string,
  opts: { search?: string; tier?: LoyaltyTier; page?: number; limit?: number }
) {
  const page  = Math.max(1, opts.page ?? 1);
  const limit = Math.min(100, opts.limit ?? 25);
  const skip  = (page - 1) * limit;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: Record<string, any> = { tenant_id: tenantId };
  if (opts.tier) where["tier"] = opts.tier;

  const [rows, total] = await Promise.all([
    prisma.customerLoyalty.findMany({ where, orderBy: { last_visit_at: "desc" }, skip, take: limit }),
    prisma.customerLoyalty.count({ where }),
  ]);

  return { rows, total, page, limit };
}

export async function getAllLoyaltyForCustomer(customerId: string) {
  return prisma.customerLoyalty.findMany({
    where: { customer_id: customerId },
    orderBy: { last_visit_at: "desc" },
  });
}
