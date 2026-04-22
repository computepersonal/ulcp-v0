import { prisma } from "../lib/prisma";

export interface CreateVisitInput {
  tenant_id: string;
  customer_id: string;
  order_id: string;
  branch_id: string;
  total_amount: number;
  items_count: number;
}

export async function createVisit(input: CreateVisitInput) {
  return prisma.customerVisit.create({ data: input });
}

export async function getVisitsForCustomer(
  tenantId: string,
  customerId: string,
  opts: { page?: number; limit?: number }
) {
  const page  = Math.max(1, opts.page ?? 1);
  const limit = Math.min(100, opts.limit ?? 10);
  const skip  = (page - 1) * limit;

  const [visits, total] = await Promise.all([
    prisma.customerVisit.findMany({
      where: { tenant_id: tenantId, customer_id: customerId },
      orderBy: { visited_at: "desc" },
      skip,
      take: limit,
    }),
    prisma.customerVisit.count({
      where: { tenant_id: tenantId, customer_id: customerId },
    }),
  ]);

  return { visits, total, page, limit };
}

export async function getVisitStats(tenantId: string, customerId: string) {
  const agg = await prisma.customerVisit.aggregate({
    where: { tenant_id: tenantId, customer_id: customerId },
    _count: true,
    _sum: { total_amount: true },
    _avg: { total_amount: true },
  });
  const lastVisit = await prisma.customerVisit.findFirst({
    where: { tenant_id: tenantId, customer_id: customerId },
    orderBy: { visited_at: "desc" },
    select: { visited_at: true },
  });
  return {
    total_orders: agg._count,
    total_spend: agg._sum.total_amount ?? 0,
    average_order_value: Math.round(agg._avg.total_amount ?? 0),
    last_order_date: lastVisit?.visited_at ?? null,
  };
}
