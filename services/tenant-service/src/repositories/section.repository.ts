import { Prisma } from "../generated/prisma";
import { prisma } from "../lib/prisma";

export async function createSection(data: Prisma.SectionCreateInput) {
  return prisma.section.create({ data });
}

export async function findSectionsByBranch(tenant_id: string, branch_id: string) {
  return prisma.section.findMany({
    where: { tenant_id, branch_id },
    orderBy: { position: "asc" },
  });
}

export async function findSectionById(id: string, tenant_id: string) {
  return prisma.section.findFirst({ where: { id, tenant_id } });
}

export async function updateSection(id: string, data: Prisma.SectionUpdateInput) {
  return prisma.section.update({ where: { id }, data });
}

export async function deleteSection(id: string) {
  return prisma.section.delete({ where: { id } });
}
