const BASE = import.meta.env.VITE_API_URL ?? "http://localhost:3013/api/v1/procurement";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...options?.headers },
    ...options,
  });
  const body = (await res.json()) as { success: boolean; data?: T; error?: string };
  if (!body.success) throw new Error(body.error ?? "Request failed");
  return body.data as T;
}

// ── Bid ───────────────────────────────────────────────────────────────────────

export interface BidRequestDetail {
  id: string;
  title: string;
  description?: string;
  items: Array<{ ingredient_id: string; ingredient_name: string; quantity: number; unit: string; notes?: string }>;
  recurrence: string;
  recurrence_day?: string;
  delivery_location?: string;
  delivery_notes?: string;
  bid_close_at?: string;
  status: string;
}

export interface BidTokenResponse {
  bid_request: BidRequestDetail;
  vendor_id: string;
}

export async function getBidRequest(token: string): Promise<BidTokenResponse> {
  return request<BidTokenResponse>(`/vendor/bid-request/${token}`);
}

export interface SubmitBidPayload {
  items: Array<{ ingredient_id: string; unit_price: number; quantity_available: number; notes?: string }>;
  total_amount: number;
  lead_time_days: number;
  valid_until: string;
  payment_terms: string;
  delivery_included: boolean;
  delivery_charge: number;
  notes?: string;
}

export async function submitBid(token: string, payload: SubmitBidPayload): Promise<{ bid: { id: string } }> {
  return request<{ bid: { id: string } }>(`/vendor/bid-request/${token}/bid`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function withdrawBid(bid_id: string): Promise<void> {
  return request<void>(`/vendor/bid/${bid_id}/withdraw`, { method: "PATCH" });
}

// ── Direct Order ──────────────────────────────────────────────────────────────

export interface DirectOrderDetail {
  id: string;
  items: Array<{ ingredient_id: string; ingredient_name: string; quantity: number; unit: string; unit_price: number }>;
  total_amount: number;
  payment_terms: string;
  expected_delivery_date?: string;
  delivery_notes?: string;
  status: string;
  created_at: string;
}

export interface DirectOrderTokenResponse {
  order: DirectOrderDetail;
  vendor: { id: string; name: string };
}

export async function getDirectOrder(token: string): Promise<DirectOrderTokenResponse> {
  return request<DirectOrderTokenResponse>(`/vendor/order/${token}`);
}

export async function respondToDirectOrder(
  token: string,
  accepted: boolean,
  delivery_date?: string,
  decline_reason?: string
): Promise<void> {
  return request<void>(`/vendor/order/${token}/respond`, {
    method: "POST",
    body: JSON.stringify({ accepted, delivery_date, decline_reason }),
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export function formatCurrency(paise: number): string {
  return `₹${(paise / 100).toFixed(2)}`;
}

export function formatDate(iso?: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export function timeUntil(iso?: string): string {
  if (!iso) return "";
  const diff = new Date(iso).getTime() - Date.now();
  if (diff <= 0) return "Expired";
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  if (h >= 24) return `${Math.floor(h / 24)}d ${h % 24}h remaining`;
  return `${h}h ${m}m remaining`;
}
