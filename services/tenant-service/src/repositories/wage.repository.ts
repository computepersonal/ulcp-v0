import { prisma } from "../lib/prisma";

export async function findWagesByUser(user_id: string, tenant_id: string) {
  return prisma.staffWage.findMany({
    where: { user_id, tenant_id },
    orderBy: { effective_from: "desc" },
  });
}

export async function findCurrentWage(user_id: string, tenant_id: string) {
  return prisma.staffWage.findFirst({
    where: {
      user_id,
      tenant_id,
      effective_to: null, // open-ended = current
    },
    orderBy: { effective_from: "desc" },
  });
}

export async function createWage(data: {
  tenant_id: string;
  user_id: string;
  wage_type: string;
  amount: number;
  currency?: string;
  effective_from: Date;
  effective_to?: Date;
  notes?: string;
}) {
  return prisma.staffWage.create({ data });
}

export async function updateWage(id: string, tenant_id: string, data: {
  wage_type?: string;
  amount?: number;
  effective_from?: Date;
  effective_to?: Date;
  notes?: string;
}) {
  return prisma.staffWage.updateMany({
    where: { id, tenant_id },
    data: { ...data, updated_at: new Date() },
  });
}

export async function deleteWage(id: string, tenant_id: string) {
  return prisma.staffWage.deleteMany({ where: { id, tenant_id } });
}
