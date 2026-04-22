import { prisma } from "../lib/prisma";
import { OfferStatus, OfferType, OfferValueType, OfferTrigger } from "../generated/prisma";

export interface CreateOfferInput {
  tenant_id: string;
  customer_id: string;
  type: OfferType;
  name: string;
  description?: string;
  value_type: OfferValueType;
  value: number;
  free_item_id?: string;
  free_item_name?: string;
  min_order_amount?: number;
  trigger: OfferTrigger;
  expires_at?: Date;
  auto_apply?: boolean;
  granted_by?: string;
}

export async function createOffer(input: CreateOfferInput) {
  return prisma.customerOffer.create({ data: input });
}

export async function getActiveOffers(tenantId: string, customerId: string) {
  return prisma.customerOffer.findMany({
    where: {
      tenant_id: tenantId,
      customer_id: customerId,
      status: "active",
      OR: [
        { expires_at: null },
        { expires_at: { gte: new Date() } },
      ],
    },
    orderBy: { created_at: "desc" },
  });
}

export async function getOffersByStatus(
  tenantId: string,
  customerId: string,
  status?: OfferStatus
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: Record<string, any> = { tenant_id: tenantId, customer_id: customerId };
  if (status) where["status"] = status;
  return prisma.customerOffer.findMany({ where, orderBy: { created_at: "desc" } });
}

export async function getOfferById(id: string) {
  return prisma.customerOffer.findUnique({ where: { id } });
}

export async function markOfferUsed(offerId: string, orderId: string) {
  return prisma.customerOffer.update({
    where: { id: offerId },
    data: { status: "used", used_at: new Date(), used_on_order_id: orderId },
  });
}

export async function markOfferActive(offerId: string) {
  return prisma.customerOffer.update({
    where: { id: offerId },
    data: { status: "active", used_at: null, used_on_order_id: null },
  });
}

export async function expireOffers() {
  const result = await prisma.customerOffer.updateMany({
    where: {
      status: "active",
      expires_at: { lt: new Date() },
    },
    data: { status: "expired" },
  });
  return result.count;
}

export async function getExpiringOffers(withinHours: number) {
  const now = new Date();
  const deadline = new Date(now.getTime() + withinHours * 3600000);
  return prisma.customerOffer.findMany({
    where: {
      status: "active",
      expires_at: { gte: now, lte: deadline },
    },
  });
}

export async function countActiveOffers(tenantId: string, customerId: string) {
  return prisma.customerOffer.count({
    where: {
      tenant_id: tenantId,
      customer_id: customerId,
      status: "active",
      OR: [{ expires_at: null }, { expires_at: { gte: new Date() } }],
    },
  });
}

export async function hasTriggerOffer(
  tenantId: string,
  customerId: string,
  trigger: OfferTrigger
) {
  const count = await prisma.customerOffer.count({
    where: {
      tenant_id: tenantId,
      customer_id: customerId,
      trigger,
      status: { in: ["active", "used"] },
    },
  });
  return count > 0;
}
