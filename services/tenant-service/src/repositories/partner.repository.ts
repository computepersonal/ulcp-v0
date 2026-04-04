import { Prisma } from "../generated/prisma";
import { prisma } from "../lib/prisma";

export async function findPartnersByTenant(tenant_id: string) {
  return prisma.partner.findMany({
    where: { tenant_id },
    orderBy: { created_at: "desc" },
  });
}

export async function findPartnerByToken(invite_token: string) {
  return prisma.partner.findUnique({ where: { invite_token } });
}

export async function findPartnerById(id: string, tenant_id: string) {
  return prisma.partner.findFirst({ where: { id, tenant_id } });
}

export async function createPartner(data: Prisma.PartnerCreateInput) {
  return prisma.partner.create({ data });
}

export async function updatePartner(
  id: string,
  tenant_id: string,
  data: Prisma.PartnerUpdateInput
) {
  return prisma.partner.updateMany({ where: { id, tenant_id }, data });
}
