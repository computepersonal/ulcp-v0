import { Prisma } from "../generated/prisma";
import { prisma } from "../lib/prisma";

export async function findBranchesByTenant(tenant_id: string) {
  return prisma.branch.findMany({
    where: { tenant_id },
    orderBy: { created_at: "asc" },
  });
}

export async function getPrimaryBranchForTenant(tenant_id: string) {
  const primary = await prisma.branch.findFirst({ where: { tenant_id, is_primary: true } });
  if (primary) return primary;
  // Fall back to first branch
  return prisma.branch.findFirst({ where: { tenant_id }, orderBy: { created_at: "asc" } });
}

export async function findBranchById(id: string, tenant_id: string) {
  return prisma.branch.findFirst({ where: { id, tenant_id } });
}

export async function createBranch(data: Prisma.BranchCreateInput) {
  return prisma.branch.create({ data });
}

export async function updateBranch(
  id: string,
  tenant_id: string,
  data: Prisma.BranchUpdateInput
) {
  return prisma.branch.update({ where: { id, tenant_id } as Prisma.BranchWhereUniqueInput, data });
}

export async function countBranches(tenant_id: string): Promise<number> {
  return prisma.branch.count({ where: { tenant_id, is_active: true } });
}
