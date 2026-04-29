import { prisma } from "../lib/prisma";
import { Prisma } from "../generated/prisma";
import type { BillStatus, PaymentMethod } from "../generated/prisma";

export interface BillItemInput {
  ingredient_id: string;
  ingredient_name: string;
  quantity: number;
  unit_price: number;
  total: number;
}

export async function generateBillRef(tenant_id: string): Promise<string> {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const prefix = `BILL-${yyyy}-${mm}-`;
  const last = await prisma.vendorBill.findFirst({
    where: { tenant_id, internal_ref: { startsWith: prefix } },
    orderBy: { internal_ref: "desc" },
  });
  const seq = last ? parseInt(last.internal_ref.slice(prefix.length), 10) + 1 : 1;
  return `${prefix}${String(seq).padStart(4, "0")}`;
}

export async function generatePaymentNumber(tenant_id: string): Promise<string> {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const prefix = `PAY-${yyyy}-${mm}-`;
  const last = await prisma.vendorPayment.findFirst({
    where: { tenant_id, payment_number: { startsWith: prefix } },
    orderBy: { payment_number: "desc" },
  });
  const seq = last ? parseInt(last.payment_number.slice(prefix.length), 10) + 1 : 1;
  return `${prefix}${String(seq).padStart(4, "0")}`;
}

export interface CreateBillInput {
  tenant_id: string;
  branch_id: string;
  bill_number: string;
  vendor_id: string;
  po_id?: string | null;
  grn_id?: string | null;
  bill_date: Date;
  due_date: Date;
  subtotal: number;
  tax_amount?: number;
  delivery_charge?: number;
  discount?: number;
  total_amount: number;
  items: BillItemInput[];
  attachment_url?: string;
  notes?: string;
  three_way_match_status?: string;
  match_warnings?: Prisma.InputJsonValue;
  created_by: string;
}

export async function createBill(input: CreateBillInput) {
  const internal_ref = await generateBillRef(input.tenant_id);
  return prisma.vendorBill.create({
    data: {
      tenant_id: input.tenant_id,
      branch_id: input.branch_id,
      bill_number: input.bill_number,
      internal_ref,
      vendor_id: input.vendor_id,
      po_id: input.po_id ?? null,
      grn_id: input.grn_id ?? null,
      status: "awaiting_approval",
      bill_date: input.bill_date,
      due_date: input.due_date,
      subtotal: input.subtotal,
      tax_amount: input.tax_amount ?? 0,
      delivery_charge: input.delivery_charge ?? 0,
      discount: input.discount ?? 0,
      total_amount: input.total_amount,
      amount_paid: 0,
      amount_due: input.total_amount,
      items: input.items as unknown as Prisma.InputJsonValue,
      attachment_url: input.attachment_url ?? null,
      notes: input.notes ?? null,
      three_way_match_status: input.three_way_match_status ?? "pending",
      match_warnings: input.match_warnings ?? Prisma.JsonNull,
      created_by: input.created_by,
    },
  });
}

export async function findBillById(bill_id: string, tenant_id: string) {
  return prisma.vendorBill.findFirst({
    where: { id: bill_id, tenant_id },
    include: { vendor: true, payments: true, purchase_order: true },
  });
}

export async function findBills(
  tenant_id: string,
  filters: { status?: BillStatus; vendor_id?: string; due_within_days?: number; overdue?: boolean } = {}
) {
  const where: Prisma.VendorBillWhereInput = { tenant_id };
  if (filters.status) where.status = filters.status;
  if (filters.vendor_id) where.vendor_id = filters.vendor_id;
  if (filters.due_within_days !== undefined) {
    const now = new Date();
    const horizon = new Date(now.getTime() + filters.due_within_days * 24 * 60 * 60 * 1000);
    where.due_date = { gte: now, lte: horizon };
    where.status = { notIn: ["paid", "cancelled"] };
  }
  if (filters.overdue) {
    where.due_date = { lt: new Date() };
    where.status = { notIn: ["paid", "cancelled"] };
  }
  return prisma.vendorBill.findMany({
    where,
    include: { vendor: true, payments: true },
    orderBy: { due_date: "asc" },
  });
}

export async function updateBillStatus(bill_id: string, tenant_id: string, status: BillStatus) {
  return prisma.vendorBill.updateMany({ where: { id: bill_id, tenant_id }, data: { status } });
}

export async function approveBill(bill_id: string, tenant_id: string, approved_by: string) {
  return prisma.vendorBill.updateMany({
    where: { id: bill_id, tenant_id, status: "awaiting_approval" },
    data: { status: "approved", approved_by, approved_at: new Date() },
  });
}

export interface RecordPaymentInput {
  tenant_id: string;
  vendor_id: string;
  bill_id?: string | null;
  amount: number;
  method: PaymentMethod;
  payment_date?: Date;
  reference_number?: string;
  notes?: string;
  created_by: string;
}

export async function recordPayment(input: RecordPaymentInput) {
  const payment_number = await generatePaymentNumber(input.tenant_id);
  return prisma.$transaction(async (tx) => {
    const payment = await tx.vendorPayment.create({
      data: {
        tenant_id: input.tenant_id,
        vendor_id: input.vendor_id,
        bill_id: input.bill_id ?? null,
        payment_number,
        amount: input.amount,
        method: input.method,
        payment_date: input.payment_date ?? new Date(),
        reference_number: input.reference_number ?? null,
        notes: input.notes ?? null,
        created_by: input.created_by,
      },
    });

    if (input.bill_id) {
      const bill = await tx.vendorBill.findFirst({
        where: { id: input.bill_id, tenant_id: input.tenant_id },
      });
      if (bill) {
        const new_paid = bill.amount_paid + input.amount;
        const new_due = bill.total_amount - new_paid;
        let new_status = bill.status;
        if (new_due <= 0) new_status = "paid";
        else if (new_paid > 0) new_status = "partially_paid";
        await tx.vendorBill.update({
          where: { id: bill.id },
          data: { amount_paid: new_paid, amount_due: Math.max(0, new_due), status: new_status },
        });
      }
    }

    await tx.vendor.updateMany({
      where: { id: input.vendor_id, tenant_id: input.tenant_id },
      data: { outstanding_balance: { decrement: input.amount } },
    });

    return payment;
  });
}
