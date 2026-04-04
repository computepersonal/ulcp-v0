import { prisma } from "../lib/prisma";

const withItems = {
  items: {
    include: {
      item: {
        select: {
          id: true,
          name: true,
          price: true,
          mrp: true,
          images: true,
          is_available: true,
          veg_type: true,
        },
      },
    },
  },
};

export async function findCombosByTenant(tenant_id: string, branch_id?: string) {
  return prisma.combo.findMany({
    where: {
      tenant_id,
      ...(branch_id
        ? { OR: [{ branch_id }, { branch_id: null }] }
        : {}),
    },
    include: withItems,
    orderBy: { sort_order: "asc" },
  });
}

export async function findComboById(id: string, tenant_id: string) {
  return prisma.combo.findFirst({ where: { id, tenant_id }, include: withItems });
}

export async function createCombo(data: {
  tenant_id: string;
  branch_id?: string;
  name: string;
  description?: string;
  image_url?: string;
  price: number;
  mrp?: number;
  sort_order?: number;
  valid_from?: Date;
  valid_till?: Date;
}) {
  return prisma.combo.create({ data, include: withItems });
}

export async function updateCombo(
  id: string,
  data: Partial<{
    name: string;
    description: string | null;
    image_url: string | null;
    price: number;
    mrp: number;
    is_available: boolean;
    sort_order: number;
    valid_from: Date | null;
    valid_till: Date | null;
  }>
) {
  return prisma.combo.update({ where: { id }, data, include: withItems });
}

export async function deleteCombo(id: string) {
  return prisma.combo.delete({ where: { id } });
}

// ─── Combo Items ──────────────────────────────────────────────────────────────

export async function findComboItemById(id: string) {
  return prisma.comboItem.findUnique({ where: { id } });
}

export async function addItemToCombo(data: {
  combo_id: string;
  item_id: string;
  quantity?: number;
  variant_name?: string;
}) {
  return prisma.comboItem.create({ data });
}

export async function updateComboItem(
  id: string,
  data: Partial<{ quantity: number; variant_name: string | null }>
) {
  return prisma.comboItem.update({ where: { id }, data });
}

export async function removeItemFromCombo(combo_item_id: string) {
  return prisma.comboItem.delete({ where: { id: combo_item_id } });
}
