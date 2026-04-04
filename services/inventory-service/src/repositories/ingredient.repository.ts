import { prisma } from "../lib/prisma";
import { Prisma } from "../generated/prisma";

export async function findIngredients(tenant_id: string, branch_id: string, opts: {
  category?: string;
  search?: string;
  low_stock?: boolean;
  page?: number;
  limit?: number;
}) {
  const { category, search, low_stock, page = 1, limit = 50 } = opts;

  const where: Prisma.IngredientWhereInput = {
    tenant_id,
    branch_id,
    is_active: true,
    ...(category ? { category } : {}),
    ...(search ? { name: { contains: search, mode: "insensitive" } } : {}),
    ...(low_stock ? { current_stock: { lte: prisma.ingredient.fields.minimum_stock as any } } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.ingredient.findMany({
      where,
      orderBy: { name: "asc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.ingredient.count({ where }),
  ]);

  return { items, total, page, limit };
}

export async function findIngredientById(id: string, tenant_id: string) {
  return prisma.ingredient.findFirst({ where: { id, tenant_id, is_active: true } });
}

export async function createIngredient(data: Prisma.IngredientCreateInput) {
  return prisma.ingredient.create({ data });
}

export async function updateIngredient(id: string, tenant_id: string, data: Prisma.IngredientUpdateInput) {
  return prisma.ingredient.update({ where: { id }, data, });
}

export async function deleteIngredient(id: string, tenant_id: string) {
  return prisma.ingredient.update({ where: { id }, data: { is_active: false } });
}

export async function adjustStock(
  ingredient_id: string,
  tenant_id: string,
  branch_id: string,
  delta: number,
  opts: {
    movement_type: string;
    reference_id?: string;
    reference_type?: string;
    notes?: string;
    created_by?: string;
    unit: string;
  }
) {
  return prisma.$transaction(async (tx) => {
    const ingredient = await tx.ingredient.findFirst({
      where: { id: ingredient_id, tenant_id, branch_id },
    });
    if (!ingredient) throw new Error("Ingredient not found");

    const stock_before = ingredient.current_stock;
    const stock_after = Math.max(0, stock_before + delta);

    await tx.ingredient.update({
      where: { id: ingredient_id },
      data: {
        current_stock: stock_after,
        ...(delta > 0 && opts.movement_type === "purchase"
          ? { last_purchase_price: ingredient.unit_cost }
          : {}),
      },
    });

    const movement = await tx.stockMovement.create({
      data: {
        tenant_id,
        branch_id,
        ingredient_id,
        movement_type: opts.movement_type as any,
        quantity: delta,
        unit: opts.unit,
        stock_before,
        stock_after,
        reference_id: opts.reference_id,
        reference_type: opts.reference_type,
        notes: opts.notes,
        created_by: opts.created_by,
      },
    });

    return { ingredient: { ...ingredient, current_stock: stock_after }, movement };
  });
}
