import { Prisma } from "../generated/prisma";
import { prisma } from "../lib/prisma";

export async function createItem(data: Prisma.CatalogueItemCreateInput) {
  return prisma.catalogueItem.create({ data });
}

export async function countItemsByTenant(tenant_id: string): Promise<number> {
  return prisma.catalogueItem.count({ where: { tenant_id } });
}

export interface ListItemsFilter {
  tenant_id: string;
  section_id?: string;
  branch_id?: string;
  is_available?: boolean;
}

export async function findItems(filter: ListItemsFilter) {
  return prisma.catalogueItem.findMany({
    where: {
      tenant_id: filter.tenant_id,
      ...(filter.section_id ? { section_id: filter.section_id } : {}),
      ...(filter.branch_id
        ? { OR: [{ branch_id: filter.branch_id }, { branch_id: null }] }
        : {}),
      ...(filter.is_available !== undefined ? { is_available: filter.is_available } : {}),
    },
    orderBy: [{ sort_order: "asc" }, { created_at: "asc" }],
  });
}

const itemDetail = {
  option_groups: {
    orderBy: { sort_order: "asc" as const },
    include: { choices: { orderBy: { sort_order: "asc" as const } } },
  },
  addon_groups: {
    include: {
      addon_group: {
        include: { items: { orderBy: { sort_order: "asc" as const } } },
      },
    },
  },
  ingredients: { orderBy: { name: "asc" as const } },
};

export async function findItemById(id: string, tenant_id: string) {
  return prisma.catalogueItem.findFirst({ where: { id, tenant_id }, include: itemDetail });
}

export async function findItemsWithDetail(filter: ListItemsFilter) {
  return prisma.catalogueItem.findMany({
    where: {
      tenant_id: filter.tenant_id,
      ...(filter.section_id ? { section_id: filter.section_id } : {}),
      ...(filter.branch_id
        ? { OR: [{ branch_id: filter.branch_id }, { branch_id: null }] }
        : {}),
      ...(filter.is_available !== undefined ? { is_available: filter.is_available } : {}),
    },
    include: itemDetail,
    orderBy: [{ sort_order: "asc" }, { created_at: "asc" }],
  });
}

export async function updateItem(id: string, data: Prisma.CatalogueItemUpdateInput) {
  return prisma.catalogueItem.update({ where: { id }, data });
}

export async function deleteItem(id: string) {
  return prisma.catalogueItem.delete({ where: { id } });
}

export async function updateItemPositions(
  updates: { id: string; sort_order: number }[],
  tenant_id: string
) {
  return prisma.$transaction(
    updates.map(({ id, sort_order }) =>
      prisma.catalogueItem.updateMany({ where: { id, tenant_id }, data: { sort_order } })
    )
  );
}

/** Full-text search via PostgreSQL tsvector (added by runSearchMigration on startup) */
export async function searchItems(tenant_id: string, q: string, onlyAvailable: boolean) {
  if (onlyAvailable) {
    return prisma.$queryRaw<
      Array<{
        id: string;
        tenant_id: string;
        name: string;
        description: string | null;
        price: number;
        is_available: boolean;
        [key: string]: unknown;
      }>
    >`
      SELECT * FROM catalogue.catalogue_items
      WHERE tenant_id = ${tenant_id}
        AND is_available = true
        AND search_vector @@ plainto_tsquery('english', ${q})
      ORDER BY ts_rank(search_vector, plainto_tsquery('english', ${q})) DESC
      LIMIT 50
    `;
  }
  return prisma.$queryRaw<
    Array<{
      id: string;
      tenant_id: string;
      name: string;
      description: string | null;
      price: number;
      is_available: boolean;
      [key: string]: unknown;
    }>
  >`
    SELECT * FROM catalogue.catalogue_items
    WHERE tenant_id = ${tenant_id}
      AND search_vector @@ plainto_tsquery('english', ${q})
    ORDER BY ts_rank(search_vector, plainto_tsquery('english', ${q})) DESC
    LIMIT 50
  `;
}

/** Reset temporary disabled items at midnight cron */
export async function resetTemporaryDisabledItems(tenant_id?: string) {
  return prisma.catalogueItem.updateMany({
    where: {
      ...(tenant_id ? { tenant_id } : {}),
      is_available: false,
      availability_type: "temporary",
    },
    data: { is_available: true, unavailable_reason: null },
  });
}

/** Remove all daily specials at midnight cron */
export async function clearDailySpecials(tenant_id?: string) {
  return prisma.catalogueItem.updateMany({
    where: {
      ...(tenant_id ? { tenant_id } : {}),
      is_daily_special: true,
    },
    data: { is_daily_special: false },
  });
}

/** Reset all today price overrides at midnight cron */
export async function clearTodayPriceOverrides(tenant_id?: string) {
  return prisma.catalogueItem.updateMany({
    where: {
      ...(tenant_id ? { tenant_id } : {}),
      today_price_override: { not: Prisma.JsonNull },
    },
    data: { today_price_override: Prisma.JsonNull },
  });
}
