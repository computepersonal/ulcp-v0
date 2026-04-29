import { prisma } from "../lib/prisma";
import type { Prisma, POStatus } from "../generated/prisma";

export interface POItemInput {
  ingredient_id: string;
  ingredient_name: string;
  unit: string;
  quantity: number;
  unit_price: number;
  tax_rate?: number;
  notes?: string;
}

export async function generatePoNumber(tenant_id: string): Promise<string> {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const prefix = `PO-${yyyy}-${mm}-`;
  const last = await prisma.purchaseOrder.findFirst({
    where: { tenant_id, po_number: { startsWith: prefix } },
    orderBy: { po_number: "desc" },
  });
  const seq = last ? parseInt(last.po_number.slice(prefix.length), 10) + 1 : 1;
  return `${prefix}${String(seq).padStart(4, "0")}`;
}

export interface CreatePoInput {
  tenant_id: string;
  branch_id: string;
  vendor_id: string;
  items: POItemInput[];
  delivery_charge?: number;
  discount?: number;
  payment_terms?: string;
  expected_delivery_date?: Date | null;
  delivery_address?: string;
  notes?: string;
  created_by: string;
  source?: string;
  bid_request_id?: string;
}

export async function createPurchaseOrder(input: CreatePoInput) {
  const po_number = await generatePoNumber(input.tenant_id);

  let subtotal = 0;
  let tax_amount = 0;
  const itemRows = input.items.map((it) => {
    const line = Math.round(it.quantity * it.unit_price);
    const tax = it.tax_rate ? Math.round((line * it.tax_rate) / 100) : 0;
    subtotal += line;
    tax_amount += tax;
    return {
      ingredient_id: it.ingredient_id,
      ingredient_name: it.ingredient_name,
      unit: it.unit,
      quantity: it.quantity,
      unit_price: it.unit_price,
      tax_rate: it.tax_rate ?? 0,
      total_price: line + tax,
      notes: it.notes ?? null,
    };
  });
  const delivery = input.delivery_charge ?? 0;
  const discount = input.discount ?? 0;
  const total_amount = subtotal + tax_amount + delivery - discount;

  return prisma.purchaseOrder.create({
    data: {
      tenant_id: input.tenant_id,
      branch_id: input.branch_id,
      po_number,
      vendor_id: input.vendor_id,
      status: "draft",
      subtotal,
      tax_amount,
      delivery_charge: delivery,
      discount,
      total_amount,
      payment_terms: input.payment_terms ?? null,
      expected_delivery_date: input.expected_delivery_date ?? null,
      delivery_address: input.delivery_address ?? null,
      notes: input.notes ?? null,
      created_by: input.created_by,
      source: input.source ?? "manual",
      bid_request_id: input.bid_request_id ?? null,
      items: { create: itemRows },
    },
    include: { items: true, vendor: true },
  });
}

export async function findPurchaseOrders(
  tenant_id: string,
  filters: { status?: POStatus; vendor_id?: string; from?: Date; to?: Date; branch_id?: string } = {}
) {
  return prisma.purchaseOrder.findMany({
    where: {
      tenant_id,
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.vendor_id ? { vendor_id: filters.vendor_id } : {}),
      ...(filters.branch_id ? { branch_id: filters.branch_id } : {}),
      ...(filters.from || filters.to
        ? {
            created_at: {
              ...(filters.from ? { gte: filters.from } : {}),
              ...(filters.to ? { lte: filters.to } : {}),
            },
          }
        : {}),
    },
    include: { items: true, vendor: true },
    orderBy: { created_at: "desc" },
  });
}

export async function findPurchaseOrderById(po_id: string, tenant_id: string) {
  return prisma.purchaseOrder.findFirst({
    where: { id: po_id, tenant_id },
    include: { items: true, vendor: true, grns: { include: { items: true } }, bills: true },
  });
}

export async function approvePurchaseOrder(
  po_id: string,
  tenant_id: string,
  approved_by: string
) {
  return prisma.purchaseOrder.updateMany({
    where: { id: po_id, tenant_id, status: { in: ["draft", "pending_approval"] } },
    data: { status: "approved", approved_by, approved_at: new Date() },
  });
}

export async function markPoSent(po_id: string, tenant_id: string) {
  return prisma.purchaseOrder.updateMany({
    where: { id: po_id, tenant_id, status: "approved" },
    data: { status: "sent", sent_at: new Date() },
  });
}

export async function updatePoStatus(po_id: string, tenant_id: string, status: POStatus) {
  return prisma.purchaseOrder.updateMany({ where: { id: po_id, tenant_id }, data: { status } });
}

export async function cancelPurchaseOrder(po_id: string, tenant_id: string, reason: string) {
  return prisma.purchaseOrder.updateMany({
    where: { id: po_id, tenant_id, status: { notIn: ["received", "cancelled"] } },
    data: { status: "cancelled", cancelled_at: new Date(), cancelled_reason: reason },
  });
}

export async function updatePoItemReceived(
  po_item_id: string,
  delta: number
): Promise<void> {
  await prisma.pOItem.update({
    where: { id: po_item_id },
    data: { received_quantity: { increment: delta } },
  });
}

export type PrismaPoUpdateInput = Prisma.PurchaseOrderUpdateInput;
