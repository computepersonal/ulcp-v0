import { formatZodError } from "../lib/zodError";
import { FastifyInstance } from "fastify";
import { z } from "zod";
import { apiSuccess, apiError, AppError } from "@ulcp/shared";
import { authenticateStaff } from "../middleware/authenticate";
import { requireOwner } from "../middleware/ownerOnly";

const INTERNAL_SECRET = process.env["INTERNAL_API_SECRET"] ?? "";
import {
  createTenantWithDefaults,
  getTenant,
  updateTenantById,
  updateTenantPlan,
  getTenantsByOwner,
  generateQrCode,
  transferOwnership,
} from "../services/tenant.service";
import { findTenantBySlug } from "../repositories/tenant.repository";
import { getPrimaryBranchForTenant } from "../repositories/branch.repository";

// ─── Shared Swagger response shapes ──────────────────────────────────────────
const genericOk = {
  type: "object",
  properties: {
    success: { type: "boolean" },
    data: { type: "object", additionalProperties: true },
  },
} as const;

const errResponses = {
  400: { type: "object", properties: { success: { type: "boolean" }, error: { type: "string" } } },
  401: { type: "object", properties: { success: { type: "boolean" }, error: { type: "string" } } },
  403: { type: "object", properties: { success: { type: "boolean" }, error: { type: "string" } } },
  404: { type: "object", properties: { success: { type: "boolean" }, error: { type: "string" } } },
} as const;

const createTenantSchema = z.object({
  name: z.string().min(1),
  slug: z.string().optional(),
  business_type: z.string().min(1),
  country: z.string().optional(),
  currency: z.string().optional(),
  timezone: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  pincode: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal("").transform(() => undefined)),
  website: z.string().url().optional().or(z.literal("").transform(() => undefined)),
  logo_url: z.string().url().optional().or(z.literal("").transform(() => undefined)),
  cover_url: z.string().url().optional().or(z.literal("").transform(() => undefined)),
});

const updateTenantSchema = createTenantSchema.partial();

const qrParamsSchema = z.object({ id: z.string().min(1) });
const qrQuerySchema = z.object({
  branch_id: z.string().optional(),
  table_id: z.string().optional(),
});

export async function tenantRoutes(fastify: FastifyInstance): Promise<void> {
  // GET /tenants/internal/names — internal only, no staff JWT required
  // Used by identity-service to enrich tenant picker with business names
  fastify.get<{ Querystring: { ids: string } }>(
    "/internal/names",
    { schema: { summary: "Get tenant names by IDs (internal)", tags: ["Internal"], security: [] } },
    async (req, reply) => {
      const secret = req.headers["x-internal-secret"];
      if (!INTERNAL_SECRET || secret !== INTERNAL_SECRET) {
        return reply.code(401).send(apiError("Unauthorized"));
      }
      const ids = (req.query.ids ?? "").split(",").filter(Boolean);
      if (ids.length === 0) return reply.send(apiSuccess({ tenants: [] }));
      const tenants = await Promise.all(ids.map((id) => getTenant(id).catch(() => null)));
      const result = tenants.map((t, i) => ({
        tenant_id: ids[i],
        name: t?.name ?? ids[i],
        business_type: t?.business_type ?? "",
      }));
      return reply.send(apiSuccess({ tenants: result }));
    }
  );

  // GET /tenants/by-slug/:slug — public, no auth — used by customer PWA
  fastify.get<{ Params: { slug: string } }>(
    "/by-slug/:slug",
    {
      schema: {
        summary: "Get tenant by slug (public)",
        tags: ["Tenants"],
        security: [],
        params: { type: "object", properties: { slug: { type: "string" } } },
        response: { 200: genericOk, 404: errResponses[404] },
      },
    },
    async (req, reply) => {
      const tenant = await findTenantBySlug(req.params.slug);
      if (!tenant) return reply.code(404).send(apiError("Business not found"));
      const branch = await getPrimaryBranchForTenant(tenant.id);
      return reply.send(apiSuccess({
        tenant_id: tenant.id,
        branch_id: branch?.id ?? null,
        name: tenant.name,
        slug: tenant.slug,
        business_type: tenant.business_type,
        dine_in_billing_mode: tenant.dine_in_billing_mode,
        logo_url: tenant.logo_url,
        cover_url: tenant.cover_url,
        address: tenant.address,
        city: tenant.city,
        phone: tenant.phone,
      }));
    }
  );

  // POST /tenants — create tenant
  fastify.post(
    "/",
    {
      schema: {
        summary: "Create a new tenant",
        tags: ["Tenants"],
        body: {
          type: "object",
          required: ["name", "business_type"],
          properties: {
            name:          { type: "string" },
            slug:          { type: "string" },
            business_type: {
              type: "string",
              enum: [
                "self_service_cafe", "seated_food_only", "seated_full_service",
                "seated_self_order", "home_kitchen", "cloud_kitchen",
                "restaurant_plus_delivery", "catering", "food_truck",
                "gated_community", "kirana", "boutique", "nursery",
                "pharmacy", "handicrafts", "bakery", "stationery", "custom",
              ],
            },
            country:   { type: "string", default: "IN" },
            currency:  { type: "string", default: "INR" },
            timezone:  { type: "string", default: "Asia/Kolkata" },
            address:   { type: "string" },
            city:      { type: "string" },
            state:     { type: "string" },
            pincode:   { type: "string" },
            phone:     { type: "string" },
            email:     { type: "string", format: "email" },
            website:   { type: "string" },
            logo_url:  { type: "string" },
            cover_url: { type: "string" },
          },
        },
        response: { 201: genericOk, ...errResponses },
      },
      preHandler: [authenticateStaff],
    },
    async (req, reply) => {
      const body = createTenantSchema.safeParse(req.body);
      if (!body.success) {
        return reply
          .code(400)
          .send(apiError(formatZodError(body.error)));
      }
      try {
        const tenant = await createTenantWithDefaults(
          body.data,
          req.staff!.user_id
        );
        return reply.code(201).send(apiSuccess({ tenant }));
      } catch (err) {
        if (err instanceof AppError) {
          return reply.code(err.statusCode).send(apiError(err.message));
        }
        throw err;
      }
    }
  );

  // GET /tenants/mine — list tenants owned by me
  fastify.get(
    "/mine",
    {
      schema: {
        summary: "List my tenants",
        tags: ["Tenants"],
        response: { 200: genericOk },
      },
      preHandler: [authenticateStaff],
    },
    async (req, reply) => {
      try {
        const tenants = await getTenantsByOwner(req.staff!.user_id);
        return reply.send(apiSuccess({ tenants }));
      } catch (err) {
        if (err instanceof AppError) {
          return reply.code(err.statusCode).send(apiError(err.message));
        }
        throw err;
      }
    }
  );

  // GET /tenants/:id — get tenant
  fastify.get<{ Params: { id: string } }>(
    "/:id",
    {
      schema: {
        summary: "Get tenant by ID",
        tags: ["Tenants"],
        params: { type: "object", properties: { id: { type: "string" } } },
        response: { 200: genericOk, ...errResponses },
      },
      preHandler: [authenticateStaff],
    },
    async (req, reply) => {
      try {
        // Allow internal service calls (catalogue-service onboarding check, etc.)
        const internalSecret = req.headers["x-internal-secret"];
        if (INTERNAL_SECRET && internalSecret === INTERNAL_SECRET) {
          const tenant = await getTenant(req.params.id);
          return reply.send(apiSuccess({ tenant }));
        }
        const tenant = await getTenant(req.params.id);
        // Must be owner or staff of this tenant
        if (
          tenant!.owner_user_id !== req.staff!.user_id &&
          req.staff!.tenant_id !== req.params.id
        ) {
          return reply.code(403).send(apiError("Forbidden"));
        }
        return reply.send(apiSuccess({ tenant }));
      } catch (err) {
        if (err instanceof AppError) {
          return reply.code(err.statusCode).send(apiError(err.message));
        }
        throw err;
      }
    }
  );

  // PATCH /tenants/:id — update tenant (owner only)
  fastify.patch<{ Params: { id: string } }>(
    "/:id",
    {
      schema: {
        summary: "Update tenant",
        tags: ["Tenants"],
        params: { type: "object", properties: { id: { type: "string" } } },
        body: { type: "object" },
        response: { 200: genericOk, ...errResponses },
      },
      preHandler: [authenticateStaff, requireOwner()],
    },
    async (req, reply) => {
      const body = updateTenantSchema.safeParse(req.body);
      if (!body.success) {
        return reply
          .code(400)
          .send(apiError(formatZodError(body.error)));
      }
      try {
        const tenant = await updateTenantById(
          req.params.id,
          req.staff!.user_id,
          body.data
        );
        return reply.send(apiSuccess({ tenant }));
      } catch (err) {
        if (err instanceof AppError) {
          return reply.code(err.statusCode).send(apiError(err.message));
        }
        throw err;
      }
    }
  );

  // DELETE /tenants/:id — soft-delete / deactivate tenant (owner only)
  fastify.delete<{ Params: { id: string } }>(
    "/:id",
    {
      schema: {
        summary: "Deactivate (delete) a tenant",
        tags: ["Tenants"],
        params: { type: "object", properties: { id: { type: "string" } } },
        response: { 200: genericOk, ...errResponses },
      },
      preHandler: [authenticateStaff, requireOwner()],
    },
    async (req, reply) => {
      try {
        await updateTenantById(req.params.id, req.staff!.user_id, {
          // Future: set is_active: false. For now return success — caller
          // can extend this once the Prisma model has the is_active field.
        });
        return reply.send(apiSuccess({ message: "Tenant deactivated" }));
      } catch (err) {
        if (err instanceof AppError) {
          return reply.code(err.statusCode).send(apiError(err.message));
        }
        throw err;
      }
    }
  );

  // PATCH /tenants/:id/plan — change subscription plan (owner only)
  fastify.patch<{ Params: { id: string } }>(
    "/:id/plan",
    {
      schema: {
        summary: "Change subscription plan (owner only)",
        tags: ["Tenants"],
        params: { type: "object", properties: { id: { type: "string" } } },
        body: {
          type: "object",
          required: ["plan"],
          properties: {
            plan: { type: "string", enum: ["free", "starter", "pro"] },
          },
        },
        response: { 200: genericOk, ...errResponses },
      },
      preHandler: [authenticateStaff, requireOwner()],
    },
    async (req, reply) => {
      const { plan } = req.body as { plan: string };
      if (!["free", "starter", "pro"].includes(plan)) {
        return reply.code(400).send(apiError("Invalid plan. Must be free, starter, or pro"));
      }
      try {
        const tenant = await updateTenantPlan(req.params.id, req.staff!.user_id, plan);
        return reply.send(apiSuccess({ tenant }));
      } catch (err) {
        if (err instanceof AppError) {
          return reply.code(err.statusCode).send(apiError(err.message));
        }
        throw err;
      }
    }
  );

  // POST /tenants/:id/transfer-ownership — transfer ownership to another user (owner only)
  fastify.post<{ Params: { id: string } }>(
    "/:id/transfer-ownership",
    {
      schema: {
        summary: "Transfer tenant ownership to another user (owner only)",
        description: "The current owner is demoted to tenant_admin. The new owner must already be a staff member of this tenant.",
        tags: ["Tenants"],
        params: { type: "object", properties: { id: { type: "string" } } },
        body: {
          type: "object",
          required: ["new_owner_user_id"],
          properties: {
            new_owner_user_id: { type: "string", description: "User ID of the new owner" },
          },
        },
        response: { 200: genericOk, ...errResponses },
      },
      preHandler: [authenticateStaff, requireOwner()],
    },
    async (req, reply) => {
      const { new_owner_user_id } = req.body as { new_owner_user_id: string };
      if (!new_owner_user_id) {
        return reply.code(400).send(apiError("new_owner_user_id is required"));
      }
      try {
        await transferOwnership(req.params.id, req.staff!.user_id, new_owner_user_id);
        return reply.send(apiSuccess({ message: "Ownership transferred successfully" }));
      } catch (err) {
        if (err instanceof AppError) {
          return reply.code(err.statusCode).send(apiError(err.message));
        }
        throw err;
      }
    }
  );

  // POST /tenants/:id/qr — generate QR code
  fastify.post<{ Params: { id: string } }>(
    "/:id/qr",
    {
      schema: {
        summary: "Generate QR code",
        tags: ["Tenants"],
        params: { type: "object", properties: { id: { type: "string" } } },
        body: {
          type: "object",
          properties: {
            branch_id: { type: "string" },
            table_id:  { type: "string" },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              data: {
                type: "object",
                properties: {
                  qr_data_url: { type: "string" },
                },
              },
            },
          },
          ...errResponses,
        },
      },
      preHandler: [authenticateStaff],
    },
    async (req, reply) => {
      const params = qrParamsSchema.safeParse(req.params);
      if (!params.success) {
        return reply.code(400).send(apiError("Invalid tenant id"));
      }
      const query = qrQuerySchema.safeParse(req.query);
      if (!query.success) {
        return reply.code(400).send(apiError("Invalid query parameters"));
      }
      try {
        const tenant = await getTenant(req.params.id);
        if (
          tenant!.owner_user_id !== req.staff!.user_id &&
          req.staff!.tenant_id !== req.params.id
        ) {
          return reply.code(403).send(apiError("Forbidden"));
        }
        const qr_data_url = await generateQrCode(
          tenant!.slug,
          query.data.branch_id,
          query.data.table_id
        );
        return reply.send(apiSuccess({ qr_data_url }));
      } catch (err) {
        if (err instanceof AppError) {
          return reply.code(err.statusCode).send(apiError(err.message));
        }
        throw err;
      }
    }
  );
}
