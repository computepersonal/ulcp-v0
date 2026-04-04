import { AppError } from "@ulcp/shared";
import {
  findBidRequestById,
  updateBidRequest,
  createVendorToken,
  findBidsByRequest,
  findBidById,
  updateBidStatus,
  updateAllBidsExcept,
} from "../repositories/bid.repository";
import { scheduleBidAutoClose, cancelBidAutoClose } from "../lib/queue";
import { redisPublish } from "../lib/redis";
import { logger } from "../lib/logger";

const INVENTORY_URL = process.env["INVENTORY_SERVICE_URL"] ?? "http://localhost:3005";
const INTERNAL_SECRET = process.env["INTERNAL_API_SECRET"] ?? "";

// ─── Ranking weights & scoring ────────────────────────────────────────────────

const PAYMENT_SCORES: Record<string, number> = {
  advance: 60,
  on_delivery: 80,
  net_7: 85,
  net_15: 90,
  net_30: 100,
};

interface RankingWeights {
  price: number;
  lead_time: number;
  rating: number;
  payment: number;
}

interface ScoredBid {
  bid: Awaited<ReturnType<typeof findBidsByRequest>>[number];
  score: number;
  score_breakdown: {
    price: number;
    lead_time: number;
    rating: number;
    payment: number;
  };
}

export function rankBids(
  bids: Awaited<ReturnType<typeof findBidsByRequest>>,
  weights: RankingWeights
): ScoredBid[] {
  if (bids.length === 0) return [];

  const minTotal = Math.min(...bids.map((b) => b.total_amount));
  const minLead = Math.min(...bids.map((b) => b.lead_time_days));

  const scored = bids.map((bid) => {
    const priceScore = minTotal > 0 ? (minTotal / bid.total_amount) * 100 : 100;
    const leadScore = minLead > 0 ? (minLead / bid.lead_time_days) * 100 : 100;
    const ratingScore = (bid.vendor.rating / 5) * 100;
    const paymentScore = PAYMENT_SCORES[bid.payment_terms] ?? 50;

    const score =
      (priceScore * weights.price) / 100 +
      (leadScore * weights.lead_time) / 100 +
      (ratingScore * weights.rating) / 100 +
      (paymentScore * weights.payment) / 100;

    return {
      bid,
      score: Math.round(score * 10) / 10,
      score_breakdown: {
        price: Math.round((priceScore * weights.price) / 100),
        lead_time: Math.round((leadScore * weights.lead_time) / 100),
        rating: Math.round((ratingScore * weights.rating) / 100),
        payment: Math.round((paymentScore * weights.payment) / 100),
      },
    };
  });

  return scored.sort((a, b) => b.score - a.score);
}

// ─── Open bid request ─────────────────────────────────────────────────────────

export async function openBidRequest(bid_request_id: string, tenant_id: string) {
  const req = await findBidRequestById(bid_request_id, tenant_id);
  if (!req) throw new AppError("Bid request not found", 404);
  if (req.status !== "draft") throw new AppError(`Cannot open bid request in status: ${req.status}`, 400);
  if (!req.bid_close_at) throw new AppError("bid_close_at is required before opening", 400);

  await updateBidRequest(bid_request_id, tenant_id, {
    status: "open",
    bid_open_at: new Date(),
  });

  // Generate a VendorToken per invited vendor
  const tokens: Array<{ vendor_id: string; token: string }> = [];
  for (const invite of req.vendor_invites) {
    const vt = await createVendorToken({
      vendor_id: invite.vendor_id,
      bid_request_id,
      token_type: "bid",
      expires_at: req.bid_close_at,
    });
    tokens.push({ vendor_id: invite.vendor_id, token: vt.token });
  }

  // Schedule auto-close
  await scheduleBidAutoClose(bid_request_id, tenant_id, req.bid_close_at).catch(
    (err: unknown) => logger.warn({ err }, "Failed to schedule bid auto-close")
  );

  await redisPublish(
    "BID_REQUEST_OPENED",
    JSON.stringify({ bid_request_id, tenant_id, tokens })
  ).catch((err: unknown) => logger.warn({ err }, "Failed to publish BID_REQUEST_OPENED"));

  return { bid_request_id, tokens };
}

// ─── Close bid request ────────────────────────────────────────────────────────

export async function closeBidRequest(bid_request_id: string, tenant_id: string) {
  const req = await findBidRequestById(bid_request_id, tenant_id);
  if (!req) throw new AppError("Bid request not found", 404);
  if (req.status !== "open") throw new AppError(`Cannot close bid request in status: ${req.status}`, 400);

  await updateBidRequest(bid_request_id, tenant_id, {
    status: "closed",
    bid_close_at: new Date(),
  });

  await cancelBidAutoClose(bid_request_id).catch(
    (err: unknown) => logger.warn({ err }, "Failed to cancel bid auto-close")
  );

  await redisPublish(
    "BID_REQUEST_CLOSED",
    JSON.stringify({ bid_request_id, tenant_id })
  ).catch((err: unknown) => logger.warn({ err }, "Failed to publish BID_REQUEST_CLOSED"));
}

// ─── Get ranked bids ──────────────────────────────────────────────────────────

export async function getRankedBids(bid_request_id: string, tenant_id: string) {
  const req = await findBidRequestById(bid_request_id, tenant_id);
  if (!req) throw new AppError("Bid request not found", 404);

  const bids = await findBidsByRequest(bid_request_id);
  const weights = req.ranking_weights as unknown as RankingWeights;
  return rankBids(bids, weights);
}

// ─── Award bid ────────────────────────────────────────────────────────────────

export async function awardBid(
  bid_request_id: string,
  bid_id: string,
  tenant_id: string
) {
  const req = await findBidRequestById(bid_request_id, tenant_id);
  if (!req) throw new AppError("Bid request not found", 404);
  if (req.status !== "closed" && req.status !== "open") {
    throw new AppError(`Cannot award bid in status: ${req.status}`, 400);
  }

  const bid = await findBidById(bid_id);
  if (!bid || bid.bid_request_id !== bid_request_id) {
    throw new AppError("Bid not found", 404);
  }
  if (bid.status === "withdrawn") throw new AppError("Cannot award a withdrawn bid", 400);

  // Update bid request
  await updateBidRequest(bid_request_id, tenant_id, {
    status: "awarded",
    awarded_bid_id: bid_id,
    awarded_vendor_id: bid.vendor_id,
  });

  // Update bids
  await updateBidStatus(bid_id, "awarded" as never);
  await updateAllBidsExcept(bid_request_id, bid_id, "rejected");

  // Create PurchaseOrder in inventory-service
  let purchase_order_id: string | null = null;
  try {
    const res = await fetch(
      `${INVENTORY_URL}/api/v1/inventory/${tenant_id}/purchase-orders`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Internal-Secret": INTERNAL_SECRET,
        },
        body: JSON.stringify({
          vendor_id: bid.vendor_id,
          vendor_name: bid.vendor.name,
          branch_id: req.branch_id,
          source: "bid_award",
          bid_request_id,
          bid_id,
          items: bid.items,
          total_amount: bid.total_amount,
          payment_terms: bid.payment_terms,
          expected_delivery_date: bid.valid_until,
        }),
      }
    );
    if (res.ok) {
      const body = (await res.json()) as { data?: { purchase_order?: { id?: string } } };
      purchase_order_id = body.data?.purchase_order?.id ?? null;
    } else {
      logger.warn({ status: res.status }, "inventory-service rejected PO creation on bid award");
    }
  } catch (err) {
    logger.warn({ err }, "Could not create PO in inventory-service — continuing");
  }

  await redisPublish(
    "BID_AWARDED",
    JSON.stringify({ bid_request_id, bid_id, tenant_id, vendor_id: bid.vendor_id, purchase_order_id })
  ).catch((err: unknown) => logger.warn({ err }, "Failed to publish BID_AWARDED"));

  return { bid_request_id, bid_id, vendor_id: bid.vendor_id, purchase_order_id };
}

// ─── Auto-close handler (called by BullMQ worker) ─────────────────────────────

export async function autoCloseBidRequest(bid_request_id: string, tenant_id: string) {
  const req = await findBidRequestById(bid_request_id, tenant_id);
  if (!req || req.status !== "open") return; // already closed/awarded
  await updateBidRequest(bid_request_id, tenant_id, { status: "closed" });
  logger.info({ bid_request_id }, "Bid request auto-closed by scheduler");
  await redisPublish(
    "BID_REQUEST_CLOSED",
    JSON.stringify({ bid_request_id, tenant_id, auto: true })
  ).catch((err: unknown) => logger.warn({ err }, "Failed to publish BID_REQUEST_CLOSED"));
}
