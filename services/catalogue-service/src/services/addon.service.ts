import { NotFoundError, ConflictError } from "@ulcp/shared";
import { findItemById } from "../repositories/item.repository";
import {
  findAddonGroupsByTenant,
  findAddonGroupById,
  createAddonGroup,
  updateAddonGroup,
  deleteAddonGroup,
  findAddonGroupItemById,
  createAddonGroupItem,
  updateAddonGroupItem,
  deleteAddonGroupItem,
  findAddonGroupsForItem,
  linkAddonGroupToItem,
  unlinkAddonGroupFromItem,
  isAddonGroupLinkedToItem,
} from "../repositories/addon.repository";

// ─── Addon Groups (tenant-level) ──────────────────────────────────────────────

export async function getTenantAddonGroups(tenant_id: string) {
  return findAddonGroupsByTenant(tenant_id);
}

export async function createTenantAddonGroup(
  tenant_id: string,
  data: { name: string; sort_order?: number }
) {
  return createAddonGroup({ tenant_id, ...data });
}

export async function updateTenantAddonGroup(
  tenant_id: string,
  id: string,
  data: Partial<{ name: string; is_available: boolean; sort_order: number }>
) {
  const group = await findAddonGroupById(id, tenant_id);
  if (!group) throw new NotFoundError("Addon group not found");
  return updateAddonGroup(id, data);
}

export async function deleteTenantAddonGroup(tenant_id: string, id: string) {
  const group = await findAddonGroupById(id, tenant_id);
  if (!group) throw new NotFoundError("Addon group not found");
  await deleteAddonGroup(id);
}

// ─── Addon Group Items ────────────────────────────────────────────────────────

export async function addItemToAddonGroup(
  tenant_id: string,
  group_id: string,
  data: { name: string; price?: number; mrp?: number; sort_order?: number }
) {
  const group = await findAddonGroupById(group_id, tenant_id);
  if (!group) throw new NotFoundError("Addon group not found");
  return createAddonGroupItem({ addon_group_id: group_id, ...data });
}

export async function editAddonGroupItem(
  tenant_id: string,
  group_id: string,
  item_id: string,
  data: Partial<{ name: string; price: number; mrp: number; is_available: boolean; sort_order: number }>
) {
  const group = await findAddonGroupById(group_id, tenant_id);
  if (!group) throw new NotFoundError("Addon group not found");
  const item = await findAddonGroupItemById(item_id);
  if (!item || item.addon_group_id !== group_id) throw new NotFoundError("Addon item not found");
  return updateAddonGroupItem(item_id, data);
}

export async function removeAddonGroupItem(
  tenant_id: string,
  group_id: string,
  item_id: string
) {
  const group = await findAddonGroupById(group_id, tenant_id);
  if (!group) throw new NotFoundError("Addon group not found");
  const item = await findAddonGroupItemById(item_id);
  if (!item || item.addon_group_id !== group_id) throw new NotFoundError("Addon item not found");
  await deleteAddonGroupItem(item_id);
}

// ─── Item ↔ AddonGroup links ──────────────────────────────────────────────────

export async function getItemAddonGroups(tenant_id: string, item_id: string) {
  const item = await findItemById(item_id, tenant_id);
  if (!item) throw new NotFoundError("Item not found");
  return findAddonGroupsForItem(item_id);
}

export async function attachAddonGroupToItem(
  tenant_id: string,
  item_id: string,
  addon_group_id: string
) {
  const item = await findItemById(item_id, tenant_id);
  if (!item) throw new NotFoundError("Item not found");
  const group = await findAddonGroupById(addon_group_id, tenant_id);
  if (!group) throw new NotFoundError("Addon group not found");
  const alreadyLinked = await isAddonGroupLinkedToItem(item_id, addon_group_id);
  if (alreadyLinked) throw new ConflictError("Addon group already linked to this item");
  return linkAddonGroupToItem(item_id, addon_group_id);
}

export async function detachAddonGroupFromItem(
  tenant_id: string,
  item_id: string,
  addon_group_id: string
) {
  const item = await findItemById(item_id, tenant_id);
  if (!item) throw new NotFoundError("Item not found");
  await unlinkAddonGroupFromItem(item_id, addon_group_id);
}
