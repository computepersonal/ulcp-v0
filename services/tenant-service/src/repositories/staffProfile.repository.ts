import { Prisma } from "../generated/prisma";
import { prisma } from "../lib/prisma";

export async function findProfileByUserId(user_id: string, tenant_id: string) {
  return prisma.staffProfile.findFirst({
    where: { user_id, tenant_id },
  });
}

export async function findProfilesByTenant(tenant_id: string, branch_id?: string) {
  return prisma.staffProfile.findMany({
    where: { tenant_id, ...(branch_id ? { branch_id } : {}) },
    orderBy: { created_at: "desc" },
  });
}

export async function createProfile(data: Prisma.StaffProfileUncheckedCreateInput) {
  return prisma.staffProfile.create({ data });
}

export async function updateProfile(
  user_id: string,
  tenant_id: string,
  data: Prisma.StaffProfileUncheckedUpdateInput
) {
  return prisma.staffProfile.updateMany({
    where: { user_id, tenant_id },
    data,
  });
}

export async function upsertProfile(
  user_id: string,
  tenant_id: string,
  data: Omit<Prisma.StaffProfileUncheckedCreateInput, "user_id" | "tenant_id">
) {
  return prisma.staffProfile.upsert({
    where: { user_id },
    create: { user_id, tenant_id, ...data },
    update: data,
  });
}

export async function deleteProfile(user_id: string, tenant_id: string) {
  return prisma.staffProfile.deleteMany({
    where: { user_id, tenant_id },
  });
}
