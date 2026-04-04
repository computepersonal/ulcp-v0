import { NotFoundError } from "@ulcp/shared";
import { findItemById } from "../repositories/item.repository";
import {
  findOptionGroupsByItem,
  findOptionGroupById,
  createOptionGroup,
  updateOptionGroup,
  deleteOptionGroup,
  findOptionChoiceById,
  createOptionChoice,
  updateOptionChoice,
  deleteOptionChoice,
} from "../repositories/option.repository";

// ─── Option Groups ────────────────────────────────────────────────────────────

export async function getItemOptionGroups(tenant_id: string, item_id: string) {
  const item = await findItemById(item_id, tenant_id);
  if (!item) throw new NotFoundError("Item not found");
  return findOptionGroupsByItem(item_id);
}

export async function addOptionGroup(
  tenant_id: string,
  item_id: string,
  data: {
    name: string;
    is_required?: boolean;
    min_select?: number;
    max_select?: number;
    sort_order?: number;
  }
) {
  const item = await findItemById(item_id, tenant_id);
  if (!item) throw new NotFoundError("Item not found");
  return createOptionGroup({ tenant_id, item_id, ...data });
}

export async function editOptionGroup(
  tenant_id: string,
  group_id: string,
  data: Partial<{
    name: string;
    is_required: boolean;
    min_select: number;
    max_select: number;
    sort_order: number;
  }>
) {
  const group = await findOptionGroupById(group_id, tenant_id);
  if (!group) throw new NotFoundError("Option group not found");
  return updateOptionGroup(group_id, data);
}

export async function removeOptionGroup(tenant_id: string, group_id: string) {
  const group = await findOptionGroupById(group_id, tenant_id);
  if (!group) throw new NotFoundError("Option group not found");
  await deleteOptionGroup(group_id);
}

// ─── Option Choices ───────────────────────────────────────────────────────────

export async function addOptionChoice(
  tenant_id: string,
  group_id: string,
  data: { name: string; add_on_price?: number; is_available?: boolean; sort_order?: number }
) {
  const group = await findOptionGroupById(group_id, tenant_id);
  if (!group) throw new NotFoundError("Option group not found");
  return createOptionChoice({ option_group_id: group_id, ...data });
}

export async function editOptionChoice(
  tenant_id: string,
  group_id: string,
  choice_id: string,
  data: Partial<{ name: string; add_on_price: number; is_available: boolean; sort_order: number }>
) {
  const group = await findOptionGroupById(group_id, tenant_id);
  if (!group) throw new NotFoundError("Option group not found");
  const choice = await findOptionChoiceById(choice_id);
  if (!choice || choice.option_group_id !== group_id)
    throw new NotFoundError("Choice not found");
  return updateOptionChoice(choice_id, data);
}

export async function removeOptionChoice(
  tenant_id: string,
  group_id: string,
  choice_id: string
) {
  const group = await findOptionGroupById(group_id, tenant_id);
  if (!group) throw new NotFoundError("Option group not found");
  const choice = await findOptionChoiceById(choice_id);
  if (!choice || choice.option_group_id !== group_id)
    throw new NotFoundError("Choice not found");
  await deleteOptionChoice(choice_id);
}
