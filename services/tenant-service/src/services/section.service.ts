import { NotFoundError, ConflictError } from "@ulcp/shared";
import {
  createSection,
  findSectionsByBranch,
  findSectionById,
  findSectionByName,
  updateSection,
  deleteSection,
} from "../repositories/section.repository";
import { findBranchById } from "../repositories/branch.repository";
import { prisma } from "../lib/prisma";

export type CreateSectionInput = {
  name: string;
  color?: string;
  position?: number;
};

export type UpdateSectionInput = Partial<CreateSectionInput> & {
  is_active?: boolean;
};

export async function createSectionForBranch(
  tenant_id: string,
  branch_id: string,
  input: CreateSectionInput
) {
  const branch = await findBranchById(branch_id, tenant_id);
  if (!branch) throw new NotFoundError("Branch not found");

  const existing = await findSectionByName(tenant_id, branch_id, input.name);
  if (existing) throw new ConflictError("A zone with this name already exists");

  return createSection({
    name: input.name,
    color: input.color ?? "#6366F1",
    position: input.position ?? 0,
    tenant_id,
    branch: { connect: { id: branch_id } },
  });
}

export async function getSectionsForBranch(tenant_id: string, branch_id: string) {
  const branch = await findBranchById(branch_id, tenant_id);
  if (!branch) throw new NotFoundError("Branch not found");
  return findSectionsByBranch(tenant_id, branch_id);
}

export async function updateSectionById(
  tenant_id: string,
  branch_id: string,
  id: string,
  data: UpdateSectionInput
) {
  const section = await findSectionById(id, tenant_id);
  if (!section || section.branch_id !== branch_id) throw new NotFoundError("Section not found");
  return updateSection(id, data);
}

export async function deleteSectionById(
  tenant_id: string,
  branch_id: string,
  id: string
) {
  const section = await findSectionById(id, tenant_id);
  if (!section || section.branch_id !== branch_id) throw new NotFoundError("Section not found");
  return deleteSection(id);
}

/**
 * Rename a section AND rename all tables in that section whose names start
 * with the old section name, replacing the prefix atomically in a transaction.
 */
export async function renameSectionWithTables(
  tenant_id: string,
  branch_id: string,
  id: string,
  newName: string
): Promise<{ section: Awaited<ReturnType<typeof updateSection>>; tablesRenamed: number }> {
  const section = await findSectionById(id, tenant_id);
  if (!section || section.branch_id !== branch_id) throw new NotFoundError("Section not found");

  const duplicate = await findSectionByName(tenant_id, branch_id, newName);
  if (duplicate && duplicate.id !== id) throw new ConflictError("A zone with this name already exists");

  const oldName = section.name;

  // Build regex for prefix replacement (case-insensitive)
  const escapedOld = oldName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const prefixRe = new RegExp(`^${escapedOld}`, "i");

  // Find all tables in this section
  const tables = await prisma.table.findMany({
    where: { tenant_id, branch_id, section_id: id },
    select: { id: true, name: true },
  });

  const toRename = tables.filter((t) => prefixRe.test(t.name));

  // Run everything in a transaction
  const [updatedSection] = await prisma.$transaction([
    prisma.section.update({ where: { id }, data: { name: newName } }),
    ...toRename.map((t) =>
      prisma.table.update({
        where: { id: t.id },
        data: { name: t.name.replace(prefixRe, newName) },
      })
    ),
  ]);

  return { section: updatedSection, tablesRenamed: toRename.length };
}
