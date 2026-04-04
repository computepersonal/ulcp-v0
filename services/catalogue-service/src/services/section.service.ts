import { NotFoundError } from "@ulcp/shared";
import { redis } from "../lib/redis";
import {
  createSection,
  findSectionsByTenant,
  findSectionById,
  updateSection,
  deleteSection,
  updateSectionPositions,
} from "../repositories/section.repository";


export type CreateSectionInput = {
  name: string;
  description?: string;
  position?: number;
  branch_id?: string;
};

export type UpdateSectionInput = Partial<CreateSectionInput> & {
  is_available?: boolean;
};

async function invalidateCache(tenant_id: string) {
  const keys = await redis.keys(`catalogue:${tenant_id}:*`);
  if (keys.length > 0) await redis.del(...keys);
}

export async function createCatalogueSection(tenant_id: string, input: CreateSectionInput) {
  const section = await createSection({
    name: input.name,
    description: input.description,
    position: input.position ?? 0,
    tenant_id,
    ...(input.branch_id ? { branch_id: input.branch_id } : {}),
  });
  await invalidateCache(tenant_id);
  return section;
}

export async function getCatalogueSections(tenant_id: string, branch_id?: string) {
  return findSectionsByTenant(tenant_id, branch_id);
}

export async function updateCatalogueSection(
  tenant_id: string,
  id: string,
  data: UpdateSectionInput
) {
  const section = await findSectionById(id, tenant_id);
  if (!section) throw new NotFoundError("Section not found");
  const updated = await updateSection(id, data);
  await invalidateCache(tenant_id);
  return updated;
}

export async function deleteCatalogueSection(tenant_id: string, id: string) {
  const section = await findSectionById(id, tenant_id);
  if (!section) throw new NotFoundError("Section not found");
  await deleteSection(id);
  await invalidateCache(tenant_id);
}

export async function reorderCatalogueSections(
  tenant_id: string,
  items: { id: string; position: number }[]
) {
  await updateSectionPositions(items, tenant_id);
  await invalidateCache(tenant_id);
}
