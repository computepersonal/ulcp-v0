import { NotFoundError } from "@ulcp/shared";
import {
  createSection,
  findSectionsByBranch,
  findSectionById,
  updateSection,
  deleteSection,
} from "../repositories/section.repository";
import { findBranchById } from "../repositories/branch.repository";

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
