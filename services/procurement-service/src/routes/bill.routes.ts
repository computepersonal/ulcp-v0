import { FastifyInstance } from "fastify";
import { z } from "zod";
import { apiSuccess, apiError } from "@ulcp/shared";
import { authenticateStaff } from "../middleware/authenticate";
import { formatZodError } from "../lib/zodError";
import {
  createBill,
  findBillById,
  findBills,
  approveBill,
  recordPayment,
  updateBillStatus,
} from "../repositories/bill.repository";
import { findPurchaseOrderById } from "../repositories/purchaseOrder.repository";
import { findGrnById } from "../repositories/grn.repository";
import { performThreeWayMatch } from "../services/grn.service";
import { prisma } from "../lib/prisma";
import type { Prisma } from "../generated/prisma";

const ok = { type: "object" as const, properties: { success: { type: "boolean" as const }, data: { type: "object" as const, additionalProperties: true } } };
const err = { type: "object" as const, properties: { success: { type: "boolean" as const }, error: { type: "string" as const } } };
const errR = { 400: err, 401: err, 403: err, 404: err };

const billItemSchema = z.object({
  ingredient_id: z.string().min(1),
  ingredient_name: z.string().min(1),
  quantity: z.number().min(0),
  unit_price: z.number().int().min(0),
  total: z.number().int().min(0),
});

const billCreateSchema = z.object({
  branch_id: z.string().min(1),
  bill_number: z.string().min(1),
  vendor_id: z.string().min(1),
  po_id: z.string().optional(),
  grn_id: z.string().optional(),
  bill_date: z.string().datetime(),
  due_date: z.string().datetime(),
  subtotal: z.number().int().min(0),
  tax_amount: z.number().int().min(0).optional(),
  delivery_charge: z.number().int().min(0).optional(),
  discount: z.number().int().min(0).optional(),
  total_amount: z.number().int().min(0),
  items: z.array(billItemSchema).min(1),
  attachment_url: z.string().url().optional(),
  notes: z.string().optional(),
  override_match: z.boolean().optional(),
});

const paymentSchema = z.object({
  amount: z.number().int().min(1),
  method: z.enum(["bank_transfer", "upi", "cheque", "cash", "card", "other"]),
  payment_date: z.string().datetime().optional(),
  reference_number: z.string().optional(),
  notes: z.string().optional(),
});

interface TenantParams { tenant_id: string }
interface BillParams { tenant_id: string; bill_id: string }

export async function billRoutes(fastify: FastifyInstance): Promise<void> {
  // POST /:tenant_id/bills — with 3-way match check
  fastify.post<{ Params: TenantParams; Body: unknown }>(
    "/:tenant_id/bills",
    { schema: { summary: "Create vendor bill (3-way match)", tags: ["Bills"], response: { 201: ok, ...errR } }, preHandler: [authenticateStaff] },
    async (req, reply) => {
      const parsed = billCreateSchema.safeParse(req.body);
      if (!parsed.success) return reply.code(400).send(apiError(formatZodError(parsed.error)));
      const { tenant_id } = req.params;
      const created_by = req.staff?.user_id ?? "system";

      let three_way_match_status = "pending";
      let match_warnings: Prisma.InputJsonValue | undefined;

      if (parsed.data.po_id && parsed.data.grn_id) {
        const po = await findPurchaseOrderById(parsed.data.po_id, tenant_id);
        const grn = await findGrnById(parsed.data.grn_id, tenant_id);
        if (po && grn) {
          const match = performThreeWayMatch(po, grn, parsed.data.items);
          three_way_match_status = match.status;
          if (match.warnings.length > 0) match_warnings = match.warnings as unknown as Prisma.InputJsonValue;
          if (match.status === "mismatched" && !parsed.data.override_match) {
            return reply.code(400).send(apiError(`3-way match failed: ${match.warnings.length} discrepancies. Pass override_match=true to proceed.`));
          }
          if (match.status === "mismatched" && parsed.data.override_match) {
            three_way_match_status = "overridden";
          }
        }
      }

      const bill = await createBill({
        tenant_id,
        branch_id: parsed.data.branch_id,
        bill_number: parsed.data.bill_number,
        vendor_id: parsed.data.vendor_id,
        po_id: parsed.data.po_id,
        grn_id: parsed.data.grn_id,
        bill_date: new Date(parsed.data.bill_date),
        due_date: new Date(parsed.data.due_date),
        subtotal: parsed.data.subtotal,
        tax_amount: parsed.data.tax_amount,
        delivery_charge: parsed.data.delivery_charge,
        discount: parsed.data.discount,
        total_amount: parsed.data.total_amount,
        items: parsed.data.items,
        attachment_url: parsed.data.attachment_url,
        notes: parsed.data.notes,
        three_way_match_status,
        match_warnings,
        created_by,
      });

      // Increase vendor outstanding
      await prisma.vendor.updateMany({
        where: { id: parsed.data.vendor_id, tenant_id },
        data: { outstanding_balance: { increment: parsed.data.total_amount } },
      });

      return reply.code(201).send(apiSuccess({ bill }));
    }
  );

  // GET /:tenant_id/bills
  fastify.get<{ Params: TenantParams; Querystring: { status?: string; vendor_id?: string } }>(
    "/:tenant_id/bills",
    { schema: { summary: "List bills", tags: ["Bills"], response: { 200: ok, ...errR } }, preHandler: [authenticateStaff] },
    async (req, reply) => {
      const { tenant_id } = req.params;
      const status = req.query.status as never;
      const bills = await findBills(tenant_id, { status, vendor_id: req.query.vendor_id });
      return reply.send(apiSuccess({ bills }));
    }
  );

  // GET /:tenant_id/bills/due — bills due in next 7 days (configurable)
  fastify.get<{ Params: TenantParams; Querystring: { days?: string } }>(
    "/:tenant_id/bills/due",
    { schema: { summary: "Bills due in next N days (default 7)", tags: ["Bills"], response: { 200: ok, ...errR } }, preHandler: [authenticateStaff] },
    async (req, reply) => {
      const { tenant_id } = req.params;
      const days = parseInt(req.query.days ?? "7", 10);
      const bills = await findBills(tenant_id, { due_within_days: days });
      return reply.send(apiSuccess({ bills }));
    }
  );

  // GET /:tenant_id/bills/overdue
  fastify.get<{ Params: TenantParams }>(
    "/:tenant_id/bills/overdue",
    { schema: { summary: "Overdue bills", tags: ["Bills"], response: { 200: ok, ...errR } }, preHandler: [authenticateStaff] },
    async (req, reply) => {
      const { tenant_id } = req.params;
      const bills = await findBills(tenant_id, { overdue: true });
      // Update statuses to overdue lazily (best-effort)
      await Promise.all(
        bills
          .filter((b) => b.status !== "overdue" && b.status !== "paid")
          .map((b) => updateBillStatus(b.id, tenant_id, "overdue"))
      );
      return reply.send(apiSuccess({ bills }));
    }
  );

  // GET /:tenant_id/bills/:bill_id
  fastify.get<{ Params: BillParams }>(
    "/:tenant_id/bills/:bill_id",
    { schema: { summary: "Get bill", tags: ["Bills"], response: { 200: ok, ...errR } }, preHandler: [authenticateStaff] },
    async (req, reply) => {
      const { tenant_id, bill_id } = req.params;
      const bill = await findBillById(bill_id, tenant_id);
      if (!bill) return reply.code(404).send(apiError("Bill not found"));
      return reply.send(apiSuccess({ bill }));
    }
  );

  // PATCH /:tenant_id/bills/:bill_id/approve
  fastify.patch<{ Params: BillParams }>(
    "/:tenant_id/bills/:bill_id/approve",
    { schema: { summary: "Approve bill for payment", tags: ["Bills"], response: { 200: ok, ...errR } }, preHandler: [authenticateStaff] },
    async (req, reply) => {
      const { tenant_id, bill_id } = req.params;
      const approver = req.staff?.user_id ?? "system";
      const r = await approveBill(bill_id, tenant_id, approver);
      if (r.count === 0) return reply.code(400).send(apiError("Bill not awaiting approval"));
      const bill = await findBillById(bill_id, tenant_id);
      return reply.send(apiSuccess({ bill }));
    }
  );

  // POST /:tenant_id/bills/:bill_id/pay — record a payment against bill
  fastify.post<{ Params: BillParams; Body: unknown }>(
    "/:tenant_id/bills/:bill_id/pay",
    { schema: { summary: "Record a payment against a bill", tags: ["Bills"], response: { 201: ok, ...errR } }, preHandler: [authenticateStaff] },
    async (req, reply) => {
      const parsed = paymentSchema.safeParse(req.body);
      if (!parsed.success) return reply.code(400).send(apiError(formatZodError(parsed.error)));
      const { tenant_id, bill_id } = req.params;
      const bill = await findBillById(bill_id, tenant_id);
      if (!bill) return reply.code(404).send(apiError("Bill not found"));
      if (bill.status === "cancelled") return reply.code(400).send(apiError("Cannot pay a cancelled bill"));
      if (parsed.data.amount > bill.amount_due) {
        return reply.code(400).send(apiError(`Payment amount exceeds amount due (${bill.amount_due})`));
      }

      const payment = await recordPayment({
        tenant_id,
        vendor_id: bill.vendor_id,
        bill_id: bill.id,
        amount: parsed.data.amount,
        method: parsed.data.method,
        payment_date: parsed.data.payment_date ? new Date(parsed.data.payment_date) : undefined,
        reference_number: parsed.data.reference_number,
        notes: parsed.data.notes,
        created_by: req.staff?.user_id ?? "system",
      });

      const updated = await findBillById(bill_id, tenant_id);
      return reply.code(201).send(apiSuccess({ payment, bill: updated }));
    }
  );
}
