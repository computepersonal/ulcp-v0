import { FastifyInstance } from "fastify";
import { z } from "zod";
import { apiSuccess, apiError } from "@ulcp/shared";
import { formatZodError } from "../lib/zodError";
import { prisma } from "../lib/prisma";
import { findVendorToken } from "../repositories/bid.repository";
import { findVendorById, updateVendorProfile, findVendorItems } from "../repositories/vendor.repository";

const ok = { type: "object" as const, properties: { success: { type: "boolean" as const }, data: { type: "object" as const, additionalProperties: true } } };
const err = { type: "object" as const, properties: { success: { type: "boolean" as const }, error: { type: "string" as const } } };
const errR = { 400: err, 401: err, 403: err, 404: err };

interface TokenParams { token: string }

async function resolveVendorFromToken(token: string): Promise<{ vendor_id: string; tenant_id: string } | null> {
  const t = await findVendorToken(token);
  if (!t) return null;
  if (t.expires_at && t.expires_at < new Date()) return null;
  // Resolve tenant_id from vendor
  const vendor = await prisma.vendor.findUnique({ where: { id: t.vendor_id } });
  if (!vendor) return null;
  return { vendor_id: t.vendor_id, tenant_id: vendor.tenant_id };
}

const profileUpdateSchema = z.object({
  contact_name: z.string().optional(),
  contact_email: z.string().email().optional(),
  contact_phone: z.string().optional(),
  contact_whatsapp: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  pincode: z.string().optional(),
  gstin: z.string().optional(),
  pan: z.string().optional(),
  bank_account: z.string().optional(),
  bank_ifsc: z.string().optional(),
  bank_name: z.string().optional(),
  notes: z.string().optional(),
});

export async function vendorPortalRoutes(fastify: FastifyInstance): Promise<void> {
  // GET /portal/:token/me — vendor profile + summary
  fastify.get<{ Params: TokenParams }>(
    "/:token/me",
    { schema: { summary: "Vendor portal: get my profile + summary", tags: ["VendorPortal"], response: { 200: ok, ...errR } } },
    async (req, reply) => {
      const ctx = await resolveVendorFromToken(req.params.token);
      if (!ctx) return reply.code(401).send(apiError("Invalid or expired token"));
      const vendor = await findVendorById(ctx.vendor_id, ctx.tenant_id);
      if (!vendor) return reply.code(404).send(apiError("Vendor not found"));
      return reply.send(apiSuccess({ vendor }));
    }
  );

  // PATCH /portal/:token/me — vendor updates own profile
  fastify.patch<{ Params: TokenParams; Body: unknown }>(
    "/:token/me",
    { schema: { summary: "Vendor portal: update own profile", tags: ["VendorPortal"], response: { 200: ok, ...errR } } },
    async (req, reply) => {
      const ctx = await resolveVendorFromToken(req.params.token);
      if (!ctx) return reply.code(401).send(apiError("Invalid or expired token"));
      const parsed = profileUpdateSchema.safeParse(req.body);
      if (!parsed.success) return reply.code(400).send(apiError(formatZodError(parsed.error)));
      await updateVendorProfile(ctx.vendor_id, ctx.tenant_id, parsed.data);
      const vendor = await findVendorById(ctx.vendor_id, ctx.tenant_id);
      return reply.send(apiSuccess({ vendor }));
    }
  );

  // GET /portal/:token/invoices — vendor's bills
  fastify.get<{ Params: TokenParams }>(
    "/:token/invoices",
    { schema: { summary: "Vendor portal: list my invoices", tags: ["VendorPortal"], response: { 200: ok, ...errR } } },
    async (req, reply) => {
      const ctx = await resolveVendorFromToken(req.params.token);
      if (!ctx) return reply.code(401).send(apiError("Invalid or expired token"));
      const bills = await prisma.vendorBill.findMany({
        where: { tenant_id: ctx.tenant_id, vendor_id: ctx.vendor_id },
        include: { payments: true },
        orderBy: { bill_date: "desc" },
      });
      const totals = bills.reduce(
        (acc, b) => {
          acc.total_billed += b.total_amount;
          acc.total_paid += b.amount_paid;
          acc.outstanding += (b.status === "paid" || b.status === "cancelled" ? 0 : b.amount_due);
          return acc;
        },
        { total_billed: 0, total_paid: 0, outstanding: 0 }
      );
      return reply.send(apiSuccess({ bills, totals }));
    }
  );

  // GET /portal/:token/catalog — vendor's offered items
  fastify.get<{ Params: TokenParams }>(
    "/:token/catalog",
    { schema: { summary: "Vendor portal: my catalog", tags: ["VendorPortal"], response: { 200: ok, ...errR } } },
    async (req, reply) => {
      const ctx = await resolveVendorFromToken(req.params.token);
      if (!ctx) return reply.code(401).send(apiError("Invalid or expired token"));
      const items = await findVendorItems(ctx.vendor_id, ctx.tenant_id);
      return reply.send(apiSuccess({ items }));
    }
  );

  const catalogItemSchema = z.object({
    ingredient_id: z.string().min(1),
    ingredient_name: z.string().min(1),
    unit: z.string().min(1),
    unit_price: z.number().int().min(1),
    min_order_quantity: z.number().min(0),
    lead_time_days: z.number().int().min(0),
    is_available: z.boolean().optional(),
  });

  // POST /portal/:token/catalog — add catalog item
  fastify.post<{ Params: TokenParams; Body: unknown }>(
    "/:token/catalog",
    { schema: { summary: "Vendor portal: add catalog item", tags: ["VendorPortal"], response: { 201: ok, ...errR } } },
    async (req, reply) => {
      const ctx = await resolveVendorFromToken(req.params.token);
      if (!ctx) return reply.code(401).send(apiError("Invalid or expired token"));
      const parsed = catalogItemSchema.safeParse(req.body);
      if (!parsed.success) return reply.code(400).send(apiError(formatZodError(parsed.error)));
      const item = await prisma.vendorItem.create({
        data: { vendor_id: ctx.vendor_id, tenant_id: ctx.tenant_id, ...parsed.data },
      });
      return reply.code(201).send(apiSuccess({ item }));
    }
  );

  // PATCH /portal/:token/catalog/:item_id
  fastify.patch<{ Params: { token: string; item_id: string }; Body: unknown }>(
    "/:token/catalog/:item_id",
    { schema: { summary: "Vendor portal: update catalog item", tags: ["VendorPortal"], response: { 200: ok, ...errR } } },
    async (req, reply) => {
      const ctx = await resolveVendorFromToken(req.params.token);
      if (!ctx) return reply.code(401).send(apiError("Invalid or expired token"));
      const parsed = catalogItemSchema.partial().safeParse(req.body);
      if (!parsed.success) return reply.code(400).send(apiError(formatZodError(parsed.error)));
      await prisma.vendorItem.updateMany({
        where: { id: req.params.item_id, vendor_id: ctx.vendor_id },
        data: parsed.data,
      });
      return reply.send(apiSuccess({ updated: true }));
    }
  );

  // DELETE /portal/:token/catalog/:item_id
  fastify.delete<{ Params: { token: string; item_id: string } }>(
    "/:token/catalog/:item_id",
    { schema: { summary: "Vendor portal: delete catalog item", tags: ["VendorPortal"], response: { 200: ok, ...errR } } },
    async (req, reply) => {
      const ctx = await resolveVendorFromToken(req.params.token);
      if (!ctx) return reply.code(401).send(apiError("Invalid or expired token"));
      await prisma.vendorItem.deleteMany({ where: { id: req.params.item_id, vendor_id: ctx.vendor_id } });
      return reply.send(apiSuccess({ deleted: true }));
    }
  );

  // GET /portal/:token/orders — vendor's POs
  fastify.get<{ Params: TokenParams }>(
    "/:token/orders",
    { schema: { summary: "Vendor portal: my purchase orders", tags: ["VendorPortal"], response: { 200: ok, ...errR } } },
    async (req, reply) => {
      const ctx = await resolveVendorFromToken(req.params.token);
      if (!ctx) return reply.code(401).send(apiError("Invalid or expired token"));
      const purchase_orders = await prisma.purchaseOrder.findMany({
        where: { tenant_id: ctx.tenant_id, vendor_id: ctx.vendor_id },
        include: { items: true },
        orderBy: { created_at: "desc" },
      });
      return reply.send(apiSuccess({ purchase_orders }));
    }
  );
}
