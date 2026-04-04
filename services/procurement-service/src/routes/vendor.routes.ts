import { FastifyInstance } from "fastify";
import { z } from "zod";
import { apiSuccess, apiError } from "@ulcp/shared";
import { authenticateStaff } from "../middleware/authenticate";
import { formatZodError } from "../lib/zodError";
import {
  createVendor,
  findVendors,
  findVendorById,
  updateVendor,
  deleteVendor,
  createVendorItem,
  findVendorItems,
  updateVendorItem,
  deleteVendorItem,
  upsertVendorPreference,
} from "../repositories/vendor.repository";
import { invalidateMarketCache } from "../services/market.service";

const ok = { type: "object" as const, properties: { success: { type: "boolean" as const }, data: { type: "object" as const, additionalProperties: true } } };
const err = { type: "object" as const, properties: { success: { type: "boolean" as const }, error: { type: "string" as const } } };
const errR = { 400: err, 401: err, 403: err, 404: err };

const vendorSchema = z.object({
  name: z.string().min(1),
  contact_name: z.string().min(1),
  contact_email: z.string().email(),
  contact_phone: z.string().min(1),
  contact_whatsapp: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  pincode: z.string().optional(),
  gstin: z.string().optional(),
  categories: z.array(z.string()).default([]),
  notes: z.string().optional(),
});

const vendorItemSchema = z.object({
  ingredient_id: z.string().min(1),
  ingredient_name: z.string().min(1),
  unit: z.string().min(1),
  unit_price: z.number().int().min(1),
  min_order_quantity: z.number().min(0),
  lead_time_days: z.number().int().min(0),
  is_available: z.boolean().optional(),
});

const preferenceSchema = z.object({
  ingredient_id: z.string().min(1),
  is_preferred: z.boolean(),
});

interface TenantParams { tenant_id: string }
interface VendorParams { tenant_id: string; vendor_id: string }
interface VendorItemParams { tenant_id: string; vendor_id: string; id: string }

export async function vendorRoutes(fastify: FastifyInstance): Promise<void> {
  // POST /:tenant_id/vendors
  fastify.post<{ Params: TenantParams; Body: unknown }>(
    "/:tenant_id/vendors",
    { schema: { summary: "Add a vendor", tags: ["Vendors"], body: { type: "object" as const, required: ["name","contact_name","contact_email","contact_phone"], properties: { name:{type:"string"as const}, contact_name:{type:"string"as const}, contact_email:{type:"string"as const}, contact_phone:{type:"string"as const}, contact_whatsapp:{type:"string"as const}, address:{type:"string"as const}, city:{type:"string"as const}, state:{type:"string"as const}, pincode:{type:"string"as const}, gstin:{type:"string"as const}, categories:{type:"array"as const,items:{type:"string"as const}}, notes:{type:"string"as const} } }, response:{201:ok,...errR} }, preHandler:[authenticateStaff] },
    async (req, reply) => {
      const parsed = vendorSchema.safeParse(req.body);
      if (!parsed.success) return reply.code(400).send(apiError(formatZodError(parsed.error)));
      const { tenant_id } = req.params;
      const vendor = await createVendor({ tenant_id, ...parsed.data });
      return reply.code(201).send(apiSuccess({ vendor }));
    }
  );

  // GET /:tenant_id/vendors
  fastify.get<{ Params: TenantParams; Querystring: { category?: string; is_active?: string } }>(
    "/:tenant_id/vendors",
    { schema: { summary: "List vendors", tags: ["Vendors"], response:{200:ok,...errR} }, preHandler:[authenticateStaff] },
    async (req, reply) => {
      const { tenant_id } = req.params;
      const { category, is_active } = req.query;
      const vendors = await findVendors(tenant_id, {
        category,
        is_active: is_active !== undefined ? is_active === "true" : undefined,
      });
      return reply.send(apiSuccess({ vendors }));
    }
  );

  // GET /:tenant_id/vendors/:vendor_id
  fastify.get<{ Params: VendorParams }>(
    "/:tenant_id/vendors/:vendor_id",
    { schema: { summary: "Get vendor", tags: ["Vendors"], response:{200:ok,...errR} }, preHandler:[authenticateStaff] },
    async (req, reply) => {
      const { tenant_id, vendor_id } = req.params;
      const vendor = await findVendorById(vendor_id, tenant_id);
      if (!vendor) return reply.code(404).send(apiError("Vendor not found"));
      return reply.send(apiSuccess({ vendor }));
    }
  );

  // PATCH /:tenant_id/vendors/:vendor_id
  fastify.patch<{ Params: VendorParams; Body: unknown }>(
    "/:tenant_id/vendors/:vendor_id",
    { schema: { summary: "Update vendor", tags: ["Vendors"], response:{200:ok,...errR} }, preHandler:[authenticateStaff] },
    async (req, reply) => {
      const parsed = vendorSchema.partial().safeParse(req.body);
      if (!parsed.success) return reply.code(400).send(apiError(formatZodError(parsed.error)));
      const { tenant_id, vendor_id } = req.params;
      await updateVendor(vendor_id, tenant_id, parsed.data);
      await invalidateMarketCache(tenant_id);
      const vendor = await findVendorById(vendor_id, tenant_id);
      return reply.send(apiSuccess({ vendor }));
    }
  );

  // DELETE /:tenant_id/vendors/:vendor_id
  fastify.delete<{ Params: VendorParams }>(
    "/:tenant_id/vendors/:vendor_id",
    { schema: { summary: "Delete vendor", tags: ["Vendors"], response:{200:ok,...errR} }, preHandler:[authenticateStaff] },
    async (req, reply) => {
      const { tenant_id, vendor_id } = req.params;
      await deleteVendor(vendor_id, tenant_id);
      await invalidateMarketCache(tenant_id);
      return reply.send(apiSuccess({ deleted: true }));
    }
  );

  // POST /:tenant_id/vendors/:vendor_id/items
  fastify.post<{ Params: VendorParams; Body: unknown }>(
    "/:tenant_id/vendors/:vendor_id/items",
    { schema: { summary: "Add vendor item", tags: ["Vendors"], body:{type:"object"as const,required:["ingredient_id","ingredient_name","unit","unit_price","min_order_quantity","lead_time_days"],properties:{ingredient_id:{type:"string"as const},ingredient_name:{type:"string"as const},unit:{type:"string"as const},unit_price:{type:"integer"as const,description:"Price in paise"},min_order_quantity:{type:"number"as const},lead_time_days:{type:"integer"as const},is_available:{type:"boolean"as const}}}, response:{201:ok,...errR} }, preHandler:[authenticateStaff] },
    async (req, reply) => {
      const parsed = vendorItemSchema.safeParse(req.body);
      if (!parsed.success) return reply.code(400).send(apiError(formatZodError(parsed.error)));
      const { tenant_id, vendor_id } = req.params;
      const item = await createVendorItem({
        vendor: { connect: { id: vendor_id } },
        tenant_id,
        ...parsed.data,
      });
      await invalidateMarketCache(tenant_id);
      return reply.code(201).send(apiSuccess({ item }));
    }
  );

  // GET /:tenant_id/vendors/:vendor_id/items
  fastify.get<{ Params: VendorParams }>(
    "/:tenant_id/vendors/:vendor_id/items",
    { schema: { summary: "List vendor items", tags: ["Vendors"], response:{200:ok,...errR} }, preHandler:[authenticateStaff] },
    async (req, reply) => {
      const { tenant_id, vendor_id } = req.params;
      const items = await findVendorItems(vendor_id, tenant_id);
      return reply.send(apiSuccess({ items }));
    }
  );

  // PATCH /:tenant_id/vendors/:vendor_id/items/:id
  fastify.patch<{ Params: VendorItemParams; Body: unknown }>(
    "/:tenant_id/vendors/:vendor_id/items/:id",
    { schema: { summary: "Update vendor item", tags: ["Vendors"], response:{200:ok,...errR} }, preHandler:[authenticateStaff] },
    async (req, reply) => {
      const parsed = vendorItemSchema.partial().safeParse(req.body);
      if (!parsed.success) return reply.code(400).send(apiError(formatZodError(parsed.error)));
      const { tenant_id, vendor_id, id } = req.params;
      await updateVendorItem(id, vendor_id, parsed.data);
      await invalidateMarketCache(tenant_id);
      return reply.send(apiSuccess({ updated: true }));
    }
  );

  // DELETE /:tenant_id/vendors/:vendor_id/items/:id
  fastify.delete<{ Params: VendorItemParams }>(
    "/:tenant_id/vendors/:vendor_id/items/:id",
    { schema: { summary: "Delete vendor item", tags: ["Vendors"], response:{200:ok,...errR} }, preHandler:[authenticateStaff] },
    async (req, reply) => {
      const { tenant_id, vendor_id, id } = req.params;
      await deleteVendorItem(id, vendor_id);
      await invalidateMarketCache(tenant_id);
      return reply.send(apiSuccess({ deleted: true }));
    }
  );

  // POST /:tenant_id/vendors/:vendor_id/preferred
  fastify.post<{ Params: VendorParams; Body: unknown }>(
    "/:tenant_id/vendors/:vendor_id/preferred",
    { schema: { summary: "Toggle vendor preference for an ingredient", tags: ["Vendors"], body:{type:"object"as const,required:["ingredient_id","is_preferred"],properties:{ingredient_id:{type:"string"as const},is_preferred:{type:"boolean"as const}}}, response:{200:ok,...errR} }, preHandler:[authenticateStaff] },
    async (req, reply) => {
      const parsed = preferenceSchema.safeParse(req.body);
      if (!parsed.success) return reply.code(400).send(apiError(formatZodError(parsed.error)));
      const { tenant_id, vendor_id } = req.params;
      const pref = await upsertVendorPreference(
        tenant_id, vendor_id, parsed.data.ingredient_id, parsed.data.is_preferred
      );
      await invalidateMarketCache(tenant_id);
      return reply.send(apiSuccess({ preference: pref }));
    }
  );
}
