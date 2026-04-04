import { prisma } from "../lib/prisma";
import type { Prisma } from "../generated/prisma";

export async function createDirectOrder(data: Prisma.DirectOrderCreateInput) {
  return prisma.directOrder.create({ data, include: { vendor: true } });
}

export async function findDirectOrders(
  tenant_id: string,
  filters?: { vendor_id?: string; status?: string; ingredient_id?: string; from?: string; to?: string }
) {
  const where: Prisma.DirectOrderWhereInput = { tenant_id };
  if (filters?.vendor_id) where.vendor_id = filters.vendor_id;
  if (filters?.status) where.status = filters.status as never;
  if (filters?.from || filters?.to) {
    where.created_at = {};
    if (filters.from) where.created_at.gte = new Date(filters.from);
    if (filters.to) where.created_at.lte = new Date(filters.to);
  }

  return prisma.directOrder.findMany({
    where,
    include: { vendor: true },
    orderBy: { created_at: "desc" },
  });
}

export async function findDirectOrderById(id: string, tenant_id: string) {
  return prisma.directOrder.findFirst({
    where: { id, tenant_id },
    include: { vendor: true },
  });
}

export async function updateDirectOrder(
  id: string,
  tenant_id: string,
  data: Prisma.DirectOrderUpdateInput
) {
  return prisma.directOrder.updateMany({ where: { id, tenant_id }, data });
}
