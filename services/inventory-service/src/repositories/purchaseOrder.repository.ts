import { prisma } from "../lib/prisma";
import { Prisma, PurchaseOrderStatus } from "../generated/prisma";

export async function findPurchaseOrders(tenant_id: string, opts: {
  branch_id?: string;
  status?: PurchaseOrderStatus;
  page?: number;
  limit?: number;
}) {
  const { branch_id, status, page = 1, limit = 20 } = opts;
  const where: Prisma.PurchaseOrderWhereInput = {
    tenant_id,
    ...(branch_id ? { branch_id } : {}),
    ...(status ? { status } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.purchaseOrder.findMany({
      where,
      orderBy: { created_at: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.purchaseOrder.count({ where }),
  ]);

  return { items, total, page, limit };
}

export async function findPurchaseOrderById(id: string, tenant_id: string) {
  return prisma.purchaseOrder.findFirst({ where: { id, tenant_id } });
}

export async function createPurchaseOrder(data: Prisma.PurchaseOrderCreateInput) {
  return prisma.purchaseOrder.create({ data });
}

export async function updatePurchaseOrder(id: string, tenant_id: string, data: Prisma.PurchaseOrderUpdateInput) {
  return prisma.purchaseOrder.update({ where: { id }, data });
}

async function getNextPoNumber(tenant_id: string): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `PO-${year}-`;
  const count = await prisma.purchaseOrder.count({
    where: { tenant_id, po_number: { startsWith: prefix } },
  });
  return `${prefix}${String(count + 1).padStart(4, "0")}`;
}

export { getNextPoNumber };
