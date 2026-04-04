import { Prisma } from "../generated/prisma";
import { prisma } from "../lib/prisma";

export async function findInviteByToken(invite_token: string) {
  return prisma.staffInvite.findUnique({ where: { invite_token } });
}

export async function createStaffInvite(data: Prisma.StaffInviteCreateInput) {
  return prisma.staffInvite.create({ data });
}

export async function acceptStaffInvite(invite_token: string) {
  return prisma.staffInvite.update({
    where: { invite_token },
    data: { accepted_at: new Date() },
  });
}

export async function findInvitesByTenant(tenant_id: string) {
  return prisma.staffInvite.findMany({
    where: { tenant_id },
    orderBy: { created_at: "desc" },
  });
}

export async function findInviteById(id: string, tenant_id: string) {
  return prisma.staffInvite.findFirst({ where: { id, tenant_id } });
}

export async function deleteStaffInvite(id: string, tenant_id: string) {
  return prisma.staffInvite.deleteMany({ where: { id, tenant_id } });
}
