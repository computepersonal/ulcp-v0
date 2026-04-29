import { FastifyInstance } from "fastify";
import { z } from "zod";
import { apiSuccess, apiError } from "@ulcp/shared";
import { authenticateStaff } from "../middleware/authenticate";
import { formatZodError } from "../lib/zodError";
import { createGrn, findGrnById, findGrns } from "../repositories/grn.repository";
import { findPurchaseOrderById } from "../repositories/purchaseOrder.repository";
import { completeGrn } from "../services/grn.service";

const ok = { type: "object" as const, properties: { success: { type: "boolean" as const }, data: { type: "object" as const, additionalProperties: true } } };
const err = { type: "object" as const, properties: { success: { type: "boolean" as const }, error: { type: "string" as const } } };
const errR = { 400: err, 401: err, 403: err, 404: err };

const grnItemSchema = z.object({
  po_item_id: z.string().optional(),
  ingredient_id: z.string().min(1),
  ingredient_name: z.string().min(1),
  unit: z.string().min(1),
  ordered_quantity: z.number().min(0),
  received_quantity: z.number().min(0),
  rejected_quantity: z.number().min(0).optional(),
  rejection_reason: z.string().optional(),
  unit_price: z.number().int().min(0),
  batch_number: z.string().optional(),
  expiry_date: z.string().datetime().optional(),
  quality_check_passed: z.boolean().optional(),
  notes: z.string().optional(),
});

const grnCreateSchema = z.object({
  po_id: z.string().min(1),
  branch_id: z.string().min(1),
  vehicle_number: z.string().optional(),
  driver_name: z.string().optional(),
  delivery_note_number: z.string().optional(),
  notes: z.string().optional(),
  items: z.array(grnItemSchema).min(1),
});

interface TenantParams { tenant_id: string }
interface GrnParams { tenant_id: string; grn_id: string }

export async function grnRoutes(fastify: FastifyInstance): Promise<void> {
  // POST /:tenant_id/grn — create draft GRN against a PO
  fastify.post<{ Params: TenantParams; Body: unknown }>(
    "/:tenant_id/grn",
    { schema: { summary: "Create Goods Received Note (draft)", tags: ["GRN"], response: { 201: ok, ...errR } }, preHandler: [authenticateStaff] },
    async (req, reply) => {
      const parsed = grnCreateSchema.safeParse(req.body);
      if (!parsed.success) return reply.code(400).send(apiError(formatZodError(parsed.error)));
      const { tenant_id } = req.params;
      const received_by = req.staff?.user_id ?? "system";

      const po = await findPurchaseOrderById(parsed.data.po_id, tenant_id);
      if (!po) return reply.code(404).send(apiError("Purchase order not found"));
      if (po.status === "cancelled" || po.status === "received") {
        return reply.code(400).send(apiError(`Cannot receive against PO in ${po.status} status`));
      }

      const grn = await createGrn({
        tenant_id,
        branch_id: parsed.data.branch_id,
        po_id: parsed.data.po_id,
        vendor_id: po.vendor_id,
        received_by,
        vehicle_number: parsed.data.vehicle_number,
        driver_name: parsed.data.driver_name,
        delivery_note_number: parsed.data.delivery_note_number,
        notes: parsed.data.notes,
        items: parsed.data.items.map((it) => ({
          po_item_id: it.po_item_id ?? null,
          ingredient_id: it.ingredient_id,
          ingredient_name: it.ingredient_name,
          unit: it.unit,
          ordered_quantity: it.ordered_quantity,
          received_quantity: it.received_quantity,
          rejected_quantity: it.rejected_quantity,
          rejection_reason: it.rejection_reason,
          unit_price: it.unit_price,
          batch_number: it.batch_number,
          expiry_date: it.expiry_date ? new Date(it.expiry_date) : null,
          quality_check_passed: it.quality_check_passed,
          notes: it.notes,
        })),
      });
      return reply.code(201).send(apiSuccess({ grn }));
    }
  );

  // GET /:tenant_id/grn
  fastify.get<{ Params: TenantParams; Querystring: { po_id?: string; vendor_id?: string } }>(
    "/:tenant_id/grn",
    { schema: { summary: "List GRNs", tags: ["GRN"], response: { 200: ok, ...errR } }, preHandler: [authenticateStaff] },
    async (req, reply) => {
      const { tenant_id } = req.params;
      const grns = await findGrns(tenant_id, { po_id: req.query.po_id, vendor_id: req.query.vendor_id });
      return reply.send(apiSuccess({ grns }));
    }
  );

  // GET /:tenant_id/grn/:grn_id
  fastify.get<{ Params: GrnParams }>(
    "/:tenant_id/grn/:grn_id",
    { schema: { summary: "Get GRN", tags: ["GRN"], response: { 200: ok, ...errR } }, preHandler: [authenticateStaff] },
    async (req, reply) => {
      const { tenant_id, grn_id } = req.params;
      const grn = await findGrnById(grn_id, tenant_id);
      if (!grn) return reply.code(404).send(apiError("GRN not found"));
      return reply.send(apiSuccess({ grn }));
    }
  );

  // POST /:tenant_id/grn/:grn_id/complete — push to inventory + update PO
  fastify.post<{ Params: GrnParams }>(
    "/:tenant_id/grn/:grn_id/complete",
    { schema: { summary: "Complete GRN — sync to inventory and update PO", tags: ["GRN"], response: { 200: ok, ...errR } }, preHandler: [authenticateStaff] },
    async (req, reply) => {
      const { tenant_id, grn_id } = req.params;
      const result = await completeGrn(grn_id, tenant_id);
      if (!result) return reply.code(404).send(apiError("GRN not found"));
      const failed = result.inventory_results.filter((r) => !r.ok);
      if (failed.length > 0) {
        return reply.send(apiSuccess({
          grn: result.grn,
          po_status: result.po_status,
          inventory_results: result.inventory_results,
          warnings: failed.map((f) => `Inventory sync failed for ${f.ingredient_id}: ${f.error}`),
        }));
      }
      return reply.send(apiSuccess({
        grn: result.grn,
        po_status: result.po_status,
        inventory_results: result.inventory_results,
      }));
    }
  );
}
