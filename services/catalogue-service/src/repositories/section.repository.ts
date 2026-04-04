import { Prisma } from "../generated/prisma";
import { prisma } from "../lib/prisma";

export async function createSection(data: Prisma.CatalogueSectionCreateInput) {
  return prisma.catalogueSection.create({ data });
}

export async function findSectionsByTenant(tenant_id: string, branch_id?: string) {
  return prisma.catalogueSection.findMany({
    where: {
      tenant_id,
      ...(branch_id ? { OR: [{ branch_id }, { branch_id: null }] } : {}),
    },
    orderBy: { position: "asc" },
  });
}

export async function findSectionById(id: string, tenant_id: string) {
  return prisma.catalogueSection.findFirst({ where: { id, tenant_id } });
}

export async function updateSection(id: string, data: Prisma.CatalogueSectionUpdateInput) {
  return prisma.catalogueSection.update({ where: { id }, data });
}

export async function deleteSection(id: string) {
  return prisma.catalogueSection.delete({ where: { id } });
}

export async function updateSectionPositions(
  updates: { id: string; position: number }[],
  tenant_id: string
) {
  return prisma.$transaction(
    updates.map(({ id, position }) =>
      prisma.catalogueSection.updateMany({ where: { id, tenant_id }, data: { position } })
    )
  );
}
