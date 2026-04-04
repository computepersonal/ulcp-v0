import { NotFoundError } from "@ulcp/shared";
import { findItemById } from "../repositories/item.repository";
import {
  findCombosByTenant,
  findComboById,
  createCombo,
  updateCombo,
  deleteCombo,
  findComboItemById,
  addItemToCombo,
  updateComboItem,
  removeItemFromCombo,
} from "../repositories/combo.repository";
import { invalidateCache } from "./item.service";

export type CreateComboInput = {
  branch_id?: string;
  name: string;
  description?: string;
  image_url?: string;
  price: number;
  mrp?: number;
  sort_order?: number;
  valid_from?: string;
  valid_till?: string;
};

export type UpdateComboInput = {
  name?: string;
  description?: string | null;
  image_url?: string | null;
  price?: number;
  mrp?: number;
  is_available?: boolean;
  sort_order?: number;
  valid_from?: string | null;
  valid_till?: string | null;
};

export async function getCombos(tenant_id: string, branch_id?: string) {
  return findCombosByTenant(tenant_id, branch_id);
}

export async function getComboById(tenant_id: string, id: string) {
  const combo = await findComboById(id, tenant_id);
  if (!combo) throw new NotFoundError("Combo not found");
  return combo;
}

export async function createCatalogueCombo(tenant_id: string, input: CreateComboInput) {
  const combo = await createCombo({
    tenant_id,
    name: input.name,
    description: input.description,
    image_url: input.image_url,
    price: input.price,
    mrp: input.mrp ?? 0,
    sort_order: input.sort_order ?? 0,
    ...(input.branch_id ? { branch_id: input.branch_id } : {}),
    ...(input.valid_from ? { valid_from: new Date(input.valid_from) } : {}),
    ...(input.valid_till ? { valid_till: new Date(input.valid_till) } : {}),
  });
  await invalidateCache(tenant_id);
  return combo;
}

export async function updateCatalogueCombo(
  tenant_id: string,
  id: string,
  input: UpdateComboInput
) {
  const combo = await findComboById(id, tenant_id);
  if (!combo) throw new NotFoundError("Combo not found");

  const { valid_from, valid_till, ...rest } = input;
  const updated = await updateCombo(id, {
    ...rest,
    ...(valid_from !== undefined
      ? { valid_from: valid_from ? new Date(valid_from) : null }
      : {}),
    ...(valid_till !== undefined
      ? { valid_till: valid_till ? new Date(valid_till) : null }
      : {}),
  });
  await invalidateCache(tenant_id);
  return updated;
}

export async function deleteCatalogueCombo(tenant_id: string, id: string) {
  const combo = await findComboById(id, tenant_id);
  if (!combo) throw new NotFoundError("Combo not found");
  await deleteCombo(id);
  await invalidateCache(tenant_id);
}

// ─── Combo Items ──────────────────────────────────────────────────────────────

export async function addComboItem(
  tenant_id: string,
  combo_id: string,
  data: { item_id: string; quantity?: number; variant_name?: string }
) {
  const combo = await findComboById(combo_id, tenant_id);
  if (!combo) throw new NotFoundError("Combo not found");
  const item = await findItemById(data.item_id, tenant_id);
  if (!item) throw new NotFoundError("Item not found");
  const updated = await addItemToCombo({ combo_id, ...data });
  await invalidateCache(tenant_id);
  return updated;
}

export async function editComboItem(
  tenant_id: string,
  combo_id: string,
  combo_item_id: string,
  data: Partial<{ quantity: number; variant_name: string | null }>
) {
  const combo = await findComboById(combo_id, tenant_id);
  if (!combo) throw new NotFoundError("Combo not found");
  const comboItem = await findComboItemById(combo_item_id);
  if (!comboItem || comboItem.combo_id !== combo_id)
    throw new NotFoundError("Combo item not found");
  return updateComboItem(combo_item_id, data);
}

export async function deleteComboItem(
  tenant_id: string,
  combo_id: string,
  combo_item_id: string
) {
  const combo = await findComboById(combo_id, tenant_id);
  if (!combo) throw new NotFoundError("Combo not found");
  const comboItem = await findComboItemById(combo_item_id);
  if (!comboItem || comboItem.combo_id !== combo_id)
    throw new NotFoundError("Combo item not found");
  await removeItemFromCombo(combo_item_id);
  await invalidateCache(tenant_id);
}
