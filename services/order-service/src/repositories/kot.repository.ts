import { Prisma } from "../generated/prisma";
import { prisma } from "../lib/prisma";

export async function createKOT(data: Prisma.KOTCreateInput) {
  return prisma.kOT.create({ data });
}

export async function findKOTs(
  tenant_id: string,
  branch_id: string,
  status?: string
) {
  return prisma.kOT.findMany({
    where: {
      tenant_id,
      branch_id,
      ...(status ? { status } : {}),
    },
    include: {
      order: {
        select: {
          order_number: true,
          table_id: true,
          type: true,
          status: true,
        },
      },
    },
    orderBy: { created_at: "asc" },
  });
}

export async function findKOTById(id: string, tenant_id: string) {
  return prisma.kOT.findFirst({ where: { id, tenant_id } });
}

export async function updateKOTStatus(id: string, status: string) {
  return prisma.kOT.update({ where: { id }, data: { status } });
}

export async function updateKOTItems(
  id: string,
  items: Prisma.InputJsonValue[]
) {
  return prisma.kOT.update({
    where: { id },
    data: { items: items as Prisma.InputJsonValue },
  });
}
