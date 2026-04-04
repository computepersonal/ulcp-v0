import { NotFoundError } from "@ulcp/shared";
import { findItemById } from "../repositories/item.repository";
import {
  findIngredientsByItem,
  findIngredientById,
  createIngredient,
  updateIngredient,
  deleteIngredient,
} from "../repositories/ingredient.repository";

export async function getItemIngredients(tenant_id: string, item_id: string) {
  const item = await findItemById(item_id, tenant_id);
  if (!item) throw new NotFoundError("Item not found");
  return findIngredientsByItem(item_id);
}

export async function addIngredient(
  tenant_id: string,
  item_id: string,
  data: {
    name: string;
    calories?: number;
    allergens?: string[];
    is_critical?: boolean;
  }
) {
  const item = await findItemById(item_id, tenant_id);
  if (!item) throw new NotFoundError("Item not found");
  return createIngredient({ tenant_id, item_id, ...data });
}

export async function editIngredient(
  tenant_id: string,
  item_id: string,
  id: string,
  data: Partial<{
    name: string;
    calories: number | null;
    allergens: string[];
    is_critical: boolean;
  }>
) {
  const ingredient = await findIngredientById(id, tenant_id);
  if (!ingredient || ingredient.item_id !== item_id)
    throw new NotFoundError("Ingredient not found");
  return updateIngredient(id, data);
}

export async function removeIngredient(tenant_id: string, item_id: string, id: string) {
  const ingredient = await findIngredientById(id, tenant_id);
  if (!ingredient || ingredient.item_id !== item_id)
    throw new NotFoundError("Ingredient not found");
  await deleteIngredient(id);
}
