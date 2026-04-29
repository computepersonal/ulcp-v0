import { prisma } from "../lib/prisma";
import { Prisma } from "../generated/prisma";

// ── Name normalization & similarity ───────────────────────────────────────────
// Detects duplicates across spelling/plural/case variations.
// "Tomatoes" and "tomato" → same canonical key. "Sugur" → matches "sugar" via edit distance.

const STOP_WORDS = new Set(["fresh", "raw", "dry", "dried", "whole", "ground", "powdered"]);

export function canonicalize(name: string): string {
  let s = name.toLowerCase().trim();
  s = s.replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  // Drop common modifier words so "fresh tomato" ~ "tomato"
  const tokens = s.split(" ").filter((t) => t && !STOP_WORDS.has(t)).map(stem);
  tokens.sort();
  return tokens.join(" ");
}

function stem(word: string): string {
  if (word.length <= 3) return word;
  if (word.endsWith("ies") && word.length > 4) return word.slice(0, -3) + "y";
  if (word.endsWith("es") && word.length > 4) return word.slice(0, -2);
  if (word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1);
  return word;
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const curr = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    prev = curr;
  }
  return prev[b.length];
}

export interface DuplicateMatch {
  id: string;
  name: string;
  category: string;
  unit: string;
  current_stock: number;
  match_type: "exact" | "canonical" | "fuzzy" | "substring";
  score: number; // 1.0 = exact
}

export async function findSimilarIngredients(
  tenant_id: string,
  branch_id: string,
  name: string,
): Promise<DuplicateMatch[]> {
  const trimmed = name.trim();
  if (!trimmed) return [];

  const inputCanon = canonicalize(trimmed);
  const inputLower = trimmed.toLowerCase();

  const all = await prisma.ingredient.findMany({
    where: { tenant_id, branch_id, is_active: true },
    select: { id: true, name: true, category: true, unit: true, current_stock: true },
  });

  const matches: DuplicateMatch[] = [];

  for (const ing of all) {
    const candCanon = canonicalize(ing.name);
    const candLower = ing.name.toLowerCase();

    if (candLower === inputLower) {
      matches.push({ ...ing, match_type: "exact", score: 1 });
      continue;
    }
    if (candCanon && candCanon === inputCanon) {
      matches.push({ ...ing, match_type: "canonical", score: 0.95 });
      continue;
    }
    // Fuzzy on the canonical form (catches typos like "tomatto"/"tomato", "sugur"/"sugar")
    const dist = levenshtein(candCanon, inputCanon);
    const longer = Math.max(candCanon.length, inputCanon.length, 1);
    const ratio = 1 - dist / longer;
    if (dist <= 2 && ratio >= 0.7) {
      matches.push({ ...ing, match_type: "fuzzy", score: ratio });
      continue;
    }
    // Substring (e.g. "tomato" matches existing "cherry tomato")
    if (
      inputCanon.length >= 3 &&
      (candCanon.includes(inputCanon) || inputCanon.includes(candCanon))
    ) {
      matches.push({ ...ing, match_type: "substring", score: 0.6 });
    }
  }

  matches.sort((a, b) => b.score - a.score);
  return matches.slice(0, 5);
}

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
