import { prisma } from "../lib/prisma";
import { redis } from "../lib/redis";
import { logger } from "../lib/logger";

const MARKET_CACHE_TTL = 900; // 15 min

interface MarketVendorEntry {
  vendor_id: string;
  vendor_name: string;
  rating: number;
  unit_price: number;
  min_order_quantity: number;
  lead_time_days: number;
  is_available: boolean;
  is_preferred: boolean;
}

interface MarketEntry {
  ingredient_id: string;
  ingredient_name: string;
  unit: string;
  categories: string[];
  vendors: MarketVendorEntry[];
  recommended_vendor_id: string | null;
}

function scoreVendorEntry(v: MarketVendorEntry, allEntries: MarketVendorEntry[]): number {
  const minPrice = Math.min(...allEntries.map((e) => e.unit_price));
  const minLead = Math.min(...allEntries.map((e) => e.lead_time_days));
  const priceScore = minPrice > 0 ? (minPrice / v.unit_price) * 100 : 100;
  const leadScore = minLead > 0 ? (minLead / v.lead_time_days) * 100 : 100;
  const ratingScore = (v.rating / 5) * 100;
  return (priceScore * 0.4) + (leadScore * 0.3) + (ratingScore * 0.3);
}

export async function getMarket(tenant_id: string): Promise<MarketEntry[]> {
  const cacheKey = `market:${tenant_id}`;
  const cached = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached) as MarketEntry[];

  // All vendor items for this tenant grouped by ingredient
  const items = await prisma.vendorItem.findMany({
    where: { tenant_id, is_available: true, vendor: { is_active: true } },
    include: { vendor: true },
    orderBy: { unit_price: "asc" },
  });

  // Get preferred vendors for tenant
  const prefs = await prisma.vendorPreference.findMany({
    where: { tenant_id, is_preferred: true },
  });
  const prefSet = new Set(prefs.map((p) => `${p.vendor_id}:${p.ingredient_id}`));

  // Group by ingredient
  const map = new Map<string, MarketEntry>();
  for (const item of items) {
    const existing = map.get(item.ingredient_id) ?? {
      ingredient_id: item.ingredient_id,
      ingredient_name: item.ingredient_name,
      unit: item.unit,
      categories: item.vendor.categories,
      vendors: [],
      recommended_vendor_id: null,
    };
    existing.vendors.push({
      vendor_id: item.vendor_id,
      vendor_name: item.vendor.name,
      rating: item.vendor.rating,
      unit_price: item.unit_price,
      min_order_quantity: item.min_order_quantity,
      lead_time_days: item.lead_time_days,
      is_available: item.is_available,
      is_preferred: prefSet.has(`${item.vendor_id}:${item.ingredient_id}`),
    });
    map.set(item.ingredient_id, existing);
  }

  // Compute recommended vendor per ingredient
  const result: MarketEntry[] = [];
  for (const entry of map.values()) {
    if (entry.vendors.length > 0) {
      // Preferred vendor first if exists, otherwise best score
      const preferred = entry.vendors.find((v) => v.is_preferred);
      if (preferred) {
        entry.recommended_vendor_id = preferred.vendor_id;
      } else {
        const scored = entry.vendors.map((v) => ({
          vendor_id: v.vendor_id,
          score: scoreVendorEntry(v, entry.vendors),
        }));
        scored.sort((a, b) => b.score - a.score);
        entry.recommended_vendor_id = scored[0]?.vendor_id ?? null;
      }
    }
    result.push(entry);
  }

  await redis.set(cacheKey, JSON.stringify(result), "EX", MARKET_CACHE_TTL);
  return result;
}

export async function getMarketForIngredient(
  tenant_id: string,
  ingredient_id: string
): Promise<MarketEntry | null> {
  const all = await getMarket(tenant_id);
  return all.find((e) => e.ingredient_id === ingredient_id) ?? null;
}

export async function invalidateMarketCache(tenant_id: string): Promise<void> {
  await redis.del(`market:${tenant_id}`);
  logger.debug({ tenant_id }, "Market cache invalidated");
}

// ─── Price history per vendor per ingredient ──────────────────────────────────

export async function getPriceHistory(
  tenant_id: string,
  ingredient_id: string,
  vendor_id: string
) {
  const orders = await prisma.directOrder.findMany({
    where: {
      tenant_id,
      vendor_id,
      status: "delivered",
    },
    orderBy: { delivered_at: "desc" },
    take: 10,
  });

  interface OrderItem {
    ingredient_id: string;
    unit_price: number;
    quantity: number;
  }

  const history: Array<{ date: Date; unit_price: number; quantity: number }> = [];
  for (const order of orders) {
    const items = order.items as unknown as OrderItem[];
    const match = items.find((i) => i.ingredient_id === ingredient_id);
    if (match) {
      history.push({
        date: order.delivered_at ?? order.created_at,
        unit_price: match.unit_price,
        quantity: match.quantity,
      });
    }
  }
  return history.slice(0, 5);
}
