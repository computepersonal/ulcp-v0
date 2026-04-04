import { prisma } from "../lib/prisma";

export interface CreateCommissionInput {
  order_id: string;
  tenant_id: string;
  rate: number;
  amount: number;
  plan: string;
}

export async function createCommissionRecord(data: CreateCommissionInput) {
  return prisma.commissionRecord.create({ data });
}

export async function findUnsettledCommissions(tenant_id: string) {
  return prisma.commissionRecord.findMany({
    where: { tenant_id, settled: false },
    include: { order: { select: { order_number: true, total: true, created_at: true } } },
    orderBy: { created_at: "asc" },
  });
}

export async function markCommissionsSettled(ids: string[]) {
  return prisma.commissionRecord.updateMany({
    where: { id: { in: ids } },
    data: { settled: true },
  });
}
