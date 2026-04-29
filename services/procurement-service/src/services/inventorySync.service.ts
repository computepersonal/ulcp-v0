import { logger } from "../lib/logger";

const INVENTORY_URL = process.env["INVENTORY_SERVICE_URL"] ?? "http://localhost:3005";
const INTERNAL_SECRET = process.env["INTERNAL_API_SECRET"] ?? "";

export interface ReceivePayload {
  tenant_id: string;
  branch_id: string;
  ingredient_id: string;
  quantity: number;
  unit_cost: number; // paise per unit
  batch_number?: string | null;
  expiry_date?: string | null;
  reference_id?: string;
  reference_type?: string;
}

export interface ReceiveResult {
  ok: boolean;
  ingredient_id: string;
  current_stock?: number;
  average_cost?: number;
  error?: string;
}

export async function pushReceiveToInventory(p: ReceivePayload): Promise<ReceiveResult> {
  try {
    const url = `${INVENTORY_URL}/api/v1/inventory/internal/ingredients/${p.ingredient_id}/receive`;
    const res = await fetch(url, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Secret": INTERNAL_SECRET,
      },
      body: JSON.stringify({
        tenant_id: p.tenant_id,
        branch_id: p.branch_id,
        quantity: p.quantity,
        unit_cost: p.unit_cost,
        batch_number: p.batch_number ?? null,
        expiry_date: p.expiry_date ?? null,
        reference_id: p.reference_id ?? null,
        reference_type: p.reference_type ?? "grn",
      }),
    });
    const body = (await res.json().catch(() => ({}))) as {
      success?: boolean;
      data?: { current_stock?: number; average_cost?: number };
      error?: string;
    };
    if (!res.ok || !body.success) {
      logger.warn({ ingredient_id: p.ingredient_id, error: body.error }, "Inventory receive failed");
      return { ok: false, ingredient_id: p.ingredient_id, error: body.error ?? `HTTP ${res.status}` };
    }
    return {
      ok: true,
      ingredient_id: p.ingredient_id,
      current_stock: body.data?.current_stock,
      average_cost: body.data?.average_cost,
    };
  } catch (err) {
    logger.error({ err, ingredient_id: p.ingredient_id }, "Inventory sync error");
    return { ok: false, ingredient_id: p.ingredient_id, error: (err as Error).message };
  }
}
