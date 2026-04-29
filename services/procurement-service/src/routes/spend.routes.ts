import { FastifyInstance } from "fastify";
import { apiSuccess } from "@ulcp/shared";
import { authenticateStaff } from "../middleware/authenticate";
import { prisma } from "../lib/prisma";

const ok = { type: "object" as const, properties: { success: { type: "boolean" as const }, data: { type: "object" as const, additionalProperties: true } } };
const err = { type: "object" as const, properties: { success: { type: "boolean" as const }, error: { type: "string" as const } } };
const errR = { 400: err, 401: err, 403: err, 404: err };

interface TenantParams { tenant_id: string }

export async function spendRoutes(fastify: FastifyInstance): Promise<void> {
  // GET /:tenant_id/spend/summary
  fastify.get<{ Params: TenantParams; Querystring: { from?: string; to?: string } }>(
    "/:tenant_id/spend/summary",
    { schema: { summary: "Procurement spend summary", tags: ["Spend"], response: { 200: ok, ...errR } }, preHandler: [authenticateStaff] },
    async (req, reply) => {
      const { tenant_id } = req.params;
      const from = req.query.from ? new Date(req.query.from) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const to = req.query.to ? new Date(req.query.to) : new Date();

      const [bills, payments, openPOs, dueBills] = await Promise.all([
        prisma.vendorBill.findMany({
          where: { tenant_id, bill_date: { gte: from, lte: to } },
          select: { vendor_id: true, total_amount: true, items: true, status: true },
        }),
        prisma.vendorPayment.aggregate({
          where: { tenant_id, payment_date: { gte: from, lte: to } },
          _sum: { amount: true },
          _count: true,
        }),
        prisma.purchaseOrder.count({
          where: { tenant_id, status: { in: ["sent", "partial", "approved"] } },
        }),
        prisma.vendorBill.aggregate({
          where: { tenant_id, status: { notIn: ["paid", "cancelled"] } },
          _sum: { amount_due: true },
        }),
      ]);

      const total_billed = bills.reduce((s, b) => s + b.total_amount, 0);
      const by_vendor = new Map<string, number>();
      for (const b of bills) {
        by_vendor.set(b.vendor_id, (by_vendor.get(b.vendor_id) ?? 0) + b.total_amount);
      }
      const top_vendor_ids = [...by_vendor.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
      const vendors = top_vendor_ids.length
        ? await prisma.vendor.findMany({
            where: { tenant_id, id: { in: top_vendor_ids.map(([id]) => id) } },
            select: { id: true, name: true },
          })
        : [];
      const vendorMap = new Map(vendors.map((v) => [v.id, v.name]));

      const top_vendors = top_vendor_ids.map(([id, amount]) => ({
        vendor_id: id,
        vendor_name: vendorMap.get(id) ?? "Unknown",
        amount,
      }));

      // Spend by category — read item lists
      const by_category = new Map<string, number>();
      for (const b of bills) {
        const items = b.items as unknown as Array<{ ingredient_name?: string; total: number }>;
        for (const it of items) {
          const key = (it.ingredient_name ?? "Other").split(" ")[0] ?? "Other";
          by_category.set(key, (by_category.get(key) ?? 0) + (it.total ?? 0));
        }
      }
      const spend_by_category = [...by_category.entries()].map(([category, amount]) => ({ category, amount })).sort((a, b) => b.amount - a.amount).slice(0, 12);

      return reply.send(apiSuccess({
        period: { from, to },
        total_billed,
        total_paid: payments._sum.amount ?? 0,
        payments_count: payments._count,
        outstanding: dueBills._sum.amount_due ?? 0,
        open_purchase_orders: openPOs,
        top_vendors,
        spend_by_category,
      }));
    }
  );
}
