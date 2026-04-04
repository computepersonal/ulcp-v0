import { prisma } from "../lib/prisma";

const withItems = { items: { orderBy: { sort_order: "asc" as const } } };

export async function findAddonGroupsByTenant(tenant_id: string) {
  return prisma.addonGroup.findMany({
    where: { tenant_id },
    include: withItems,
    orderBy: { sort_order: "asc" },
  });
}

export async function findAddonGroupById(id: string, tenant_id: string) {
  return prisma.addonGroup.findFirst({ where: { id, tenant_id }, include: withItems });
}

export async function createAddonGroup(data: {
  tenant_id: string;
  name: string;
  sort_order?: number;
}) {
  return prisma.addonGroup.create({ data, include: withItems });
}

export async function updateAddonGroup(
  id: string,
  data: Partial<{ name: string; is_available: boolean; sort_order: number }>
) {
  return prisma.addonGroup.update({ where: { id }, data, include: withItems });
}

export async function deleteAddonGroup(id: string) {
  return prisma.addonGroup.delete({ where: { id } });
}

// ─── Addon Group Items ────────────────────────────────────────────────────────

export async function findAddonGroupItemById(id: string) {
  return prisma.addonGroupItem.findUnique({ where: { id } });
}

export async function createAddonGroupItem(data: {
  addon_group_id: string;
  name: string;
  price?: number;
  mrp?: number;
  sort_order?: number;
}) {
  return prisma.addonGroupItem.create({ data });
}

export async function updateAddonGroupItem(
  id: string,
  data: Partial<{
    name: string;
    price: number;
    mrp: number;
    is_available: boolean;
    sort_order: number;
  }>
) {
  return prisma.addonGroupItem.update({ where: { id }, data });
}

export async function deleteAddonGroupItem(id: string) {
  return prisma.addonGroupItem.delete({ where: { id } });
}

// ─── Item ↔ AddonGroup links ──────────────────────────────────────────────────

export async function findAddonGroupsForItem(item_id: string) {
  return prisma.itemAddonGroup.findMany({
    where: { item_id },
    include: { addon_group: { include: withItems } },
  });
}

export async function linkAddonGroupToItem(item_id: string, addon_group_id: string) {
  return prisma.itemAddonGroup.create({ data: { item_id, addon_group_id } });
}

export async function unlinkAddonGroupFromItem(item_id: string, addon_group_id: string) {
  return prisma.itemAddonGroup.deleteMany({ where: { item_id, addon_group_id } });
}

export async function isAddonGroupLinkedToItem(item_id: string, addon_group_id: string) {
  const link = await prisma.itemAddonGroup.findUnique({
    where: { item_id_addon_group_id: { item_id, addon_group_id } },
  });
  return link !== null;
}
