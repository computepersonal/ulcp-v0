import { Prisma } from "../generated/prisma";
import { prisma } from "../lib/prisma";

export async function createOrder(data: Prisma.OrderCreateInput) {
  return prisma.order.create({
    data,
    include: { kots: true },
  });
}

export interface ListOrdersFilter {
  tenant_id: string;
  branch_id?: string;
  status?: string;
  type?: string;
  date?: string; // "2026-03-28" — filter by created_at date
  limit?: number;
  offset?: number;
}

export async function findOrders(filter: ListOrdersFilter) {
  const where: Prisma.OrderWhereInput = {
    tenant_id: filter.tenant_id,
    ...(filter.branch_id ? { branch_id: filter.branch_id } : {}),
    ...(filter.status ? { status: filter.status } : {}),
    ...(filter.type ? { type: filter.type } : {}),
    ...(filter.date
      ? {
          created_at: {
            gte: new Date(`${filter.date}T00:00:00.000Z`),
            lt: new Date(`${filter.date}T23:59:59.999Z`),
          },
        }
      : {}),
  };

  const [orders, total] = await Promise.all([
    prisma.order.findMany({
      where,
      include: { kots: true },
      orderBy: { created_at: "desc" },
      take: filter.limit ?? 50,
      skip: filter.offset ?? 0,
    }),
    prisma.order.count({ where }),
  ]);

  return { orders, total };
}

export async function findOrderById(id: string, tenant_id: string) {
  return prisma.order.findFirst({
    where: { id, tenant_id },
    include: {
      kots: true,
      status_history: { orderBy: { created_at: "asc" } },
      commission: true,
    },
  });
}

export async function updateOrderStatus(
  id: string,
  status: string,
  extra?: { cancelled_reason?: string; cancelled_by?: string }
) {
  return prisma.order.update({
    where: { id },
    data: { status, ...(extra ?? {}) },
  });
}

export async function updatePaymentStatus(
  id: string,
  payment_status: string,
  payment_method?: string
) {
  return prisma.order.update({
    where: { id },
    data: {
      payment_status,
      ...(payment_method ? { payment_method } : {}),
    },
  });
}

export async function createStatusHistory(
  order_id: string,
  status: string,
  changed_by?: string,
  notes?: string
) {
  return prisma.orderStatusHistory.create({
    data: { order_id, status, changed_by, notes },
  });
}
