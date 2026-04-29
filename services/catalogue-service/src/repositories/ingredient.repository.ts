import { prisma } from "../lib/prisma";

export async function findIngredientsByItem(item_id: string) {
  return prisma.itemIngredient.findMany({ where: { item_id }, orderBy: { name: "asc" } });
}

export async function findIngredientById(id: string, tenant_id: string) {
  return prisma.itemIngredient.findFirst({ where: { id, tenant_id } });
}

export async function createIngredient(data: {
  tenant_id: string;
  item_id: string;
  name: string;
  calories?: number;
  allergens?: string[];
  is_critical?: boolean;
  ingredient_id?: string | null;
  quantity?: number | null;
  unit?: string | null;
}) {
  return prisma.itemIngredient.create({
    data: { ...data, allergens: data.allergens ?? [] },
  });
}

export async function updateIngredient(
  id: string,
  data: Partial<{
    name: string;
    calories: number | null;
    allergens: string[];
    is_critical: boolean;
    ingredient_id: string | null;
    quantity: number | null;
    unit: string | null;
  }>
) {
  return prisma.itemIngredient.update({ where: { id }, data });
}

export async function deleteIngredient(id: string) {
  return prisma.itemIngredient.delete({ where: { id } });
}
