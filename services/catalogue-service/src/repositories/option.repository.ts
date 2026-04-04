import { prisma } from "../lib/prisma";

const withChoices = { choices: { orderBy: { sort_order: "asc" as const } } };

export async function findOptionGroupsByItem(item_id: string) {
  return prisma.itemOptionGroup.findMany({
    where: { item_id },
    include: withChoices,
    orderBy: { sort_order: "asc" },
  });
}

export async function findOptionGroupById(id: string, tenant_id: string) {
  return prisma.itemOptionGroup.findFirst({
    where: { id, tenant_id },
    include: withChoices,
  });
}

export async function createOptionGroup(data: {
  tenant_id: string;
  item_id: string;
  name: string;
  is_required?: boolean;
  min_select?: number;
  max_select?: number;
  sort_order?: number;
}) {
  return prisma.itemOptionGroup.create({ data, include: withChoices });
}

export async function updateOptionGroup(
  id: string,
  data: Partial<{
    name: string;
    is_required: boolean;
    min_select: number;
    max_select: number;
    sort_order: number;
  }>
) {
  return prisma.itemOptionGroup.update({ where: { id }, data, include: withChoices });
}

export async function deleteOptionGroup(id: string) {
  return prisma.itemOptionGroup.delete({ where: { id } });
}

// ─── Choices ──────────────────────────────────────────────────────────────────

export async function findOptionChoiceById(id: string) {
  return prisma.itemOptionChoice.findUnique({ where: { id } });
}

export async function createOptionChoice(data: {
  option_group_id: string;
  name: string;
  add_on_price?: number;
  is_available?: boolean;
  sort_order?: number;
}) {
  return prisma.itemOptionChoice.create({ data });
}

export async function updateOptionChoice(
  id: string,
  data: Partial<{
    name: string;
    add_on_price: number;
    is_available: boolean;
    sort_order: number;
  }>
) {
  return prisma.itemOptionChoice.update({ where: { id }, data });
}

export async function deleteOptionChoice(id: string) {
  return prisma.itemOptionChoice.delete({ where: { id } });
}
