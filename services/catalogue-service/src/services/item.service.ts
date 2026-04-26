import { NotFoundError, PlanLimitError } from "@ulcp/shared";
import { PLAN_ITEM_LIMITS } from "@ulcp/shared";
import { redisGet, redisSet } from "../lib/redis";
import { fetchTenantPlan } from "../lib/tenantClient";
import { CATALOGUE_CACHE_TTL_SECS } from "../constants";
import {
  createItem,
  countItemsByTenant,
  findItems,
  findItemsWithDetail,
  findItemById,
  updateItem,
  deleteItem,
  updateItemPositions,
  searchItems,
  type ListItemsFilter,
} from "../repositories/item.repository";
import { findCombosByTenant } from "../repositories/combo.repository";

export type CreateItemInput = {
  section_id?: string;
  branch_id?: string;
  name: string;
  description?: string;
  sku?: string;
  images?: Array<{ url: string; isPrimary: boolean }>;
  mrp?: number;
  price: number;
  offer_price?: number;
  offer_valid_till?: string;
  unit?: string;
  has_variants?: boolean;
  variants?: Array<{
    name: string;
    sku?: string;
    price: number;
    mrp: number;
    stock: number;
    isAvailable: boolean;
  }>;
  attributes?: Array<{ name: string; value: string }>;
  track_stock?: boolean;
  stock?: number;
  low_stock_alert?: number;
  is_food?: boolean;
  sort_order?: number;
  // Food classification
  veg_type?: string;
  meal_type?: string;
  item_type?: string;
  course?: string;
  // Nutrition / media
  prep_time_mins?: number;
  calories?: number;
  video_url?: string;
  // Allergens
  allergens?: string[];
};

export type UpdateItemInput = Omit<
  Partial<CreateItemInput>,
  "section_id" | "offer_price" | "offer_valid_till"
> & {
  section_id?: string | null;
  offer_price?: number | null;
  offer_valid_till?: string | null;
  is_available?: boolean;
  unavailable_reason?: string | null;
  availability_type?: "temporary" | "permanent";
  is_daily_special?: boolean;
};

export type TodayPriceOverride = {
  price: number;
  original_price: number;
  reason: string;
  set_by: string;
  resets_at: string;
};

export async function invalidateCache(tenant_id: string) {
  // Delete all branch-scoped cache keys for this tenant
  const { redis } = await import("../lib/redis");
  const keys = await redis.keys(`catalogue:${tenant_id}:*`);
  if (keys.length > 0) await redis.del(...keys);
}

export async function createCatalogueItem(
  tenant_id: string,
  input: CreateItemInput,
  bearerToken: string
) {
  // Plan limit check
  const plan = await fetchTenantPlan(tenant_id, bearerToken);
  const limit =
    PLAN_ITEM_LIMITS[plan as keyof typeof PLAN_ITEM_LIMITS] ?? Infinity;
  const current = await countItemsByTenant(tenant_id);
  if (current >= limit) {
    throw new PlanLimitError(
      `Item limit reached for ${plan} plan (${limit} items). Upgrade to add more.`
    );
  }

  const item = await createItem({
    tenant_id,
    name: input.name,
    description: input.description,
    sku: input.sku,
    images: input.images ?? [],
    mrp: input.mrp ?? 0,
    price: input.price,
    offer_price: input.offer_price,
    offer_valid_till: input.offer_valid_till
      ? new Date(input.offer_valid_till)
      : undefined,
    unit: input.unit,
    has_variants: input.has_variants ?? false,
    variants: input.variants ?? [],
    attributes: input.attributes ?? [],
    track_stock: input.track_stock ?? false,
    stock: input.stock ?? 0,
    low_stock_alert: input.low_stock_alert ?? 10,
    is_food: input.is_food ?? false,
    sort_order: input.sort_order ?? 0,
    veg_type: input.veg_type,
    meal_type: input.meal_type,
    item_type: input.item_type,
    course: input.course,
    prep_time_mins: input.prep_time_mins,
    calories: input.calories,
    video_url: input.video_url,
    allergens: input.allergens ?? [],
    ...(input.branch_id ? { branch_id: input.branch_id } : {}),
    ...(input.section_id
      ? { section: { connect: { id: input.section_id } } }
      : {}),
  });

  await invalidateCache(tenant_id);
  return item;
}

export async function getCatalogueItems(filter: ListItemsFilter) {
  return findItems(filter);
}

export async function getPublicCatalogue(tenant_id: string, branch_id: string) {
  // Cache key includes branch so each branch gets its own cache entry
  const cacheKey = `catalogue:${tenant_id}:${branch_id}`;
  const cached = await redisGet(cacheKey);
  if (cached) {
    try {
      return JSON.parse(cached) as unknown;
    } catch {
      // fall through to DB
    }
  }

  const { findSectionsByTenant } = await import("../repositories/section.repository");

  const [catalogueSections, items, combos] = await Promise.all([
    findSectionsByTenant(tenant_id, branch_id),
    findItemsWithDetail({ tenant_id, branch_id, is_available: true }),
    findCombosByTenant(tenant_id, branch_id),
  ]);

  const result = {
    sections: catalogueSections.filter((s) => s.is_available),
    items,
    combos: combos.filter((c) => c.is_available),
    context: "customer" as const,
  };

  await redisSet(cacheKey, JSON.stringify(result), CATALOGUE_CACHE_TTL_SECS);
  return result;
}

export async function getCatalogueItemById(tenant_id: string, id: string) {
  const item = await findItemById(id, tenant_id);
  if (!item) throw new NotFoundError("Item not found");
  return item;
}

export async function updateCatalogueItem(
  tenant_id: string,
  id: string,
  data: UpdateItemInput
) {
  const item = await findItemById(id, tenant_id);
  if (!item) throw new NotFoundError("Item not found");

  const { section_id, offer_valid_till, ...rest } = data;

  const prismaData = {
    ...rest,
    ...(offer_valid_till !== undefined
      ? { offer_valid_till: offer_valid_till ? new Date(offer_valid_till) : null }
      : {}),
    ...(section_id === null
      ? { section: { disconnect: true } }
      : section_id !== undefined
        ? { section: { connect: { id: section_id } } }
        : {}),
  };

  const updated = await updateItem(id, prismaData);
  await invalidateCache(tenant_id);
  return updated;
}

export async function toggleItemAvailability(tenant_id: string, id: string) {
  const item = await findItemById(id, tenant_id);
  if (!item) throw new NotFoundError("Item not found");

  const updated = await updateItem(id, {
    is_available: !item.is_available,
    // When re-enabling, clear the reason
    ...(item.is_available ? {} : { unavailable_reason: null }),
  });
  await invalidateCache(tenant_id);
  return updated;
}

export async function setTodayPriceOverride(
  tenant_id: string,
  id: string,
  override: TodayPriceOverride
) {
  const item = await findItemById(id, tenant_id);
  if (!item) throw new NotFoundError("Item not found");

  const updated = await updateItem(id, { today_price_override: override as never });
  await invalidateCache(tenant_id);
  return updated;
}

export async function deleteCatalogueItem(tenant_id: string, id: string) {
  const item = await findItemById(id, tenant_id);
  if (!item) throw new NotFoundError("Item not found");
  await deleteItem(id);
  await invalidateCache(tenant_id);
}

export async function reorderCatalogueItems(
  tenant_id: string,
  items: { id: string; sort_order: number }[]
) {
  await updateItemPositions(items, tenant_id);
  await invalidateCache(tenant_id);
}

export async function searchCatalogueItems(
  tenant_id: string,
  q: string,
  onlyAvailable: boolean
) {
  return searchItems(tenant_id, q, onlyAvailable);
}
