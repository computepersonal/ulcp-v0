import { prisma } from "../lib/prisma";
import type { Prisma } from "../generated/prisma";

// ─── BidRequest ───────────────────────────────────────────────────────────────

export async function createBidRequest(data: Prisma.BidRequestCreateInput) {
  return prisma.bidRequest.create({ data, include: { vendor_invites: true } });
}

export async function findBidRequests(tenant_id: string, status?: string) {
  return prisma.bidRequest.findMany({
    where: { tenant_id, ...(status ? { status: status as Prisma.EnumBidRequestStatusFilter } : {}) },
    include: {
      vendor_invites: { include: { vendor: true } },
      bids: { select: { id: true, status: true, vendor_id: true } },
    },
    orderBy: { created_at: "desc" },
  });
}

export async function findBidRequestById(id: string, tenant_id: string) {
  return prisma.bidRequest.findFirst({
    where: { id, tenant_id },
    include: {
      vendor_invites: { include: { vendor: true } },
      bids: { include: { vendor: true } },
      vendor_tokens: true,
    },
  });
}

export async function updateBidRequest(
  id: string,
  tenant_id: string,
  data: Prisma.BidRequestUpdateInput
) {
  return prisma.bidRequest.updateMany({ where: { id, tenant_id }, data });
}

export async function deleteBidRequest(id: string, tenant_id: string) {
  return prisma.bidRequest.deleteMany({ where: { id, tenant_id } });
}

// ─── BidRequestVendor ─────────────────────────────────────────────────────────

export async function addVendorsToBidRequest(bid_request_id: string, vendor_ids: string[]) {
  const data = vendor_ids.map((vendor_id) => ({ bid_request_id, vendor_id }));
  return prisma.bidRequestVendor.createMany({ data, skipDuplicates: true });
}

// ─── VendorToken ──────────────────────────────────────────────────────────────

export async function createVendorToken(data: {
  vendor_id: string;
  bid_request_id?: string;
  direct_order_id?: string;
  token_type: string;
  expires_at: Date;
}) {
  return prisma.vendorToken.create({ data });
}

export async function findVendorToken(token: string) {
  return prisma.vendorToken.findUnique({ where: { token } });
}

export async function markTokenUsed(id: string) {
  return prisma.vendorToken.update({ where: { id }, data: { used_at: new Date() } });
}

// ─── Bid ──────────────────────────────────────────────────────────────────────

export async function createBid(data: Prisma.BidCreateInput) {
  return prisma.bid.create({ data, include: { vendor: true } });
}

export async function findBidsByRequest(bid_request_id: string) {
  return prisma.bid.findMany({
    where: { bid_request_id, status: { not: "withdrawn" } },
    include: { vendor: true },
    orderBy: { submitted_at: "asc" },
  });
}

export async function findBidById(id: string) {
  return prisma.bid.findUnique({ where: { id }, include: { vendor: true, bid_request: true } });
}

export async function updateBidStatus(id: string, status: Prisma.EnumBidStatusFilter) {
  return prisma.bid.update({ where: { id }, data: { status: status as never } });
}

export async function updateAllBidsExcept(
  bid_request_id: string,
  winner_bid_id: string,
  status: string
) {
  return prisma.bid.updateMany({
    where: { bid_request_id, id: { not: winner_bid_id }, status: "submitted" },
    data: { status: status as never },
  });
}
