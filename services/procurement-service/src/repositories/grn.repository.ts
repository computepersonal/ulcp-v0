import { prisma } from "../lib/prisma";
import type { GRNStatus } from "../generated/prisma";

export interface GRNItemInput {
  po_item_id?: string | null;
  ingredient_id: string;
  ingredient_name: string;
  unit: string;
  ordered_quantity: number;
  received_quantity: number;
  rejected_quantity?: number;
  rejection_reason?: string;
  unit_price: number;
  batch_number?: string;
  expiry_date?: Date | null;
  quality_check_passed?: boolean;
  notes?: string;
}

export async function generateGrnNumber(tenant_id: string): Promise<string> {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const prefix = `GRN-${yyyy}-${mm}-`;
  const last = await prisma.goodsReceivedNote.findFirst({
    where: { tenant_id, grn_number: { startsWith: prefix } },
    orderBy: { grn_number: "desc" },
  });
  const seq = last ? parseInt(last.grn_number.slice(prefix.length), 10) + 1 : 1;
  return `${prefix}${String(seq).padStart(4, "0")}`;
}

export interface CreateGrnInput {
  tenant_id: string;
  branch_id: string;
  po_id: string;
  vendor_id: string;
  received_by: string;
  vehicle_number?: string;
  driver_name?: string;
  delivery_note_number?: string;
  notes?: string;
  items: GRNItemInput[];
}

export async function createGrn(input: CreateGrnInput) {
  const grn_number = await generateGrnNumber(input.tenant_id);
  const total_received_value = input.items.reduce(
    (sum, it) => sum + Math.round(it.received_quantity * it.unit_price),
    0
  );
  return prisma.goodsReceivedNote.create({
    data: {
      tenant_id: input.tenant_id,
      branch_id: input.branch_id,
      grn_number,
      po_id: input.po_id,
      vendor_id: input.vendor_id,
      status: "draft",
      received_by: input.received_by,
      vehicle_number: input.vehicle_number ?? null,
      driver_name: input.driver_name ?? null,
      delivery_note_number: input.delivery_note_number ?? null,
      notes: input.notes ?? null,
      total_received_value,
      items: {
        create: input.items.map((it) => ({
          po_item_id: it.po_item_id ?? null,
          ingredient_id: it.ingredient_id,
          ingredient_name: it.ingredient_name,
          unit: it.unit,
          ordered_quantity: it.ordered_quantity,
          received_quantity: it.received_quantity,
          rejected_quantity: it.rejected_quantity ?? 0,
          rejection_reason: it.rejection_reason ?? null,
          unit_price: it.unit_price,
          total_price: Math.round(it.received_quantity * it.unit_price),
          batch_number: it.batch_number ?? null,
          expiry_date: it.expiry_date ?? null,
          quality_check_passed: it.quality_check_passed ?? true,
          notes: it.notes ?? null,
        })),
      },
    },
    include: { items: true, vendor: true, purchase_order: { include: { items: true } } },
  });
}

export async function findGrnById(grn_id: string, tenant_id: string) {
  return prisma.goodsReceivedNote.findFirst({
    where: { id: grn_id, tenant_id },
    include: { items: true, vendor: true, purchase_order: { include: { items: true } } },
  });
}

export async function findGrns(tenant_id: string, filters: { po_id?: string; vendor_id?: string } = {}) {
  return prisma.goodsReceivedNote.findMany({
    where: {
      tenant_id,
      ...(filters.po_id ? { po_id: filters.po_id } : {}),
      ...(filters.vendor_id ? { vendor_id: filters.vendor_id } : {}),
    },
    include: { items: true, vendor: true },
    orderBy: { created_at: "desc" },
  });
}

export async function setGrnStatus(grn_id: string, tenant_id: string, status: GRNStatus) {
  return prisma.goodsReceivedNote.updateMany({
    where: { id: grn_id, tenant_id },
    data: { status },
  });
}
