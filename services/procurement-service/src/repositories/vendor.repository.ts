import { prisma } from "../lib/prisma";
import type { Prisma } from "../generated/prisma";

export async function createVendor(data: Prisma.VendorCreateInput) {
  return prisma.vendor.create({ data });
}

export async function findVendors(tenant_id: string, filters?: { category?: string; is_active?: boolean }) {
  return prisma.vendor.findMany({
    where: {
      tenant_id,
      ...(filters?.category ? { categories: { has: filters.category } } : {}),
      ...(filters?.is_active !== undefined ? { is_active: filters.is_active } : {}),
    },
    include: { vendor_items: true },
    orderBy: { name: "asc" },
  });
}

export async function findVendorById(id: string, tenant_id: string) {
  return prisma.vendor.findFirst({
    where: { id, tenant_id },
    include: { vendor_items: true },
  });
}

export async function updateVendor(id: string, tenant_id: string, data: Prisma.VendorUpdateInput) {
  return prisma.vendor.updateMany({ where: { id, tenant_id }, data });
}

export async function deleteVendor(id: string, tenant_id: string) {
  return prisma.vendor.deleteMany({ where: { id, tenant_id } });
}

// ─── VendorItems ──────────────────────────────────────────────────────────────

export async function createVendorItem(data: Prisma.VendorItemCreateInput) {
  return prisma.vendorItem.create({ data });
}

export async function findVendorItems(vendor_id: string, tenant_id: string) {
  return prisma.vendorItem.findMany({ where: { vendor_id, tenant_id } });
}

export async function updateVendorItem(id: string, vendor_id: string, data: Prisma.VendorItemUpdateInput) {
  return prisma.vendorItem.updateMany({ where: { id, vendor_id }, data });
}

export async function deleteVendorItem(id: string, vendor_id: string) {
  return prisma.vendorItem.deleteMany({ where: { id, vendor_id } });
}

// ─── VendorPreference ─────────────────────────────────────────────────────────

export async function upsertVendorPreference(
  tenant_id: string,
  vendor_id: string,
  ingredient_id: string,
  is_preferred: boolean
) {
  return prisma.vendorPreference.upsert({
    where: { tenant_id_vendor_id_ingredient_id: { tenant_id, vendor_id, ingredient_id } },
    create: { tenant_id, vendor_id, ingredient_id, is_preferred },
    update: { is_preferred },
  });
}

export async function findPreferredVendors(tenant_id: string, ingredient_id: string) {
  return prisma.vendorPreference.findMany({
    where: { tenant_id, ingredient_id, is_preferred: true },
  });
}

// ─── Vendor profile + ledger ──────────────────────────────────────────────────

export async function updateVendorProfile(
  vendor_id: string,
  tenant_id: string,
  data: Prisma.VendorUpdateInput
) {
  return prisma.vendor.updateMany({ where: { id: vendor_id, tenant_id }, data });
}

export async function getVendorLedger(vendor_id: string, tenant_id: string) {
  const vendor = await prisma.vendor.findFirst({ where: { id: vendor_id, tenant_id } });
  if (!vendor) return null;

  const [bills, payments, recentPOs] = await Promise.all([
    prisma.vendorBill.findMany({
      where: { tenant_id, vendor_id },
      orderBy: { bill_date: "desc" },
      take: 100,
    }),
    prisma.vendorPayment.findMany({
      where: { tenant_id, vendor_id },
      orderBy: { payment_date: "desc" },
      take: 100,
    }),
    prisma.purchaseOrder.findMany({
      where: { tenant_id, vendor_id },
      orderBy: { created_at: "desc" },
      take: 20,
    }),
  ]);

  const total_billed = bills.reduce((sum, b) => sum + b.total_amount, 0);
  const total_paid = payments.reduce((sum, p) => sum + p.amount, 0);
  const outstanding = bills
    .filter((b) => b.status !== "paid" && b.status !== "cancelled")
    .reduce((sum, b) => sum + b.amount_due, 0);

  return {
    vendor,
    summary: {
      total_billed,
      total_paid,
      outstanding,
      total_orders: vendor.total_orders,
      total_spent: vendor.total_spent,
      credit_limit: vendor.credit_limit,
      credit_days: vendor.credit_days,
    },
    bills,
    payments,
    recent_pos: recentPOs,
  };
}
