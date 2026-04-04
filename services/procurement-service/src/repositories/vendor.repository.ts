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
