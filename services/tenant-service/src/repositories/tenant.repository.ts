import { Prisma } from "../generated/prisma";
import { prisma } from "../lib/prisma";

export async function findTenantById(id: string) {
  return prisma.tenant.findUnique({ where: { id } });
}

export async function findTenantBySlug(slug: string) {
  return prisma.tenant.findUnique({ where: { slug } });
}

export async function createTenant(data: Prisma.TenantCreateInput) {
  return prisma.tenant.create({ data });
}

export async function updateTenant(id: string, data: Prisma.TenantUpdateInput) {
  return prisma.tenant.update({ where: { id }, data });
}

export async function findTenantsByOwner(owner_user_id: string) {
  return prisma.tenant.findMany({
    where: { owner_user_id },
    orderBy: { created_at: "desc" },
  });
}
