import { Prisma } from "../generated/prisma";
import { prisma } from "../lib/prisma";

export async function createTable(data: Prisma.TableCreateInput) {
  return prisma.table.create({ data });
}

export async function findTablesByBranch(tenant_id: string, branch_id: string) {
  return prisma.table.findMany({
    where: { tenant_id, branch_id },
    orderBy: { position: "asc" },
  });
}

export async function findTableById(id: string, tenant_id: string) {
  return prisma.table.findFirst({ where: { id, tenant_id } });
}

export async function updateTable(id: string, data: Prisma.TableUpdateInput) {
  return prisma.table.update({ where: { id }, data });
}

export async function deleteTable(id: string) {
  return prisma.table.delete({ where: { id } });
}
