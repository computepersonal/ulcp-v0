import { formatZodError } from "../lib/zodError";
import { FastifyInstance } from "fastify";
import { z } from "zod";
import { apiSuccess, apiError, AppError } from "@ulcp/shared";
import { authenticateStaff, tryAuthenticateStaff, resolveContext } from "../middleware/authenticate";
import { fetchDefaultBranchId, fetchTenantOnboardingCompleted } from "../lib/tenantClient";
import { auditLog } from "../lib/auditClient";
import {
  createCatalogueItem,
  getCatalogueItems,
  getCatalogueItemById,
  getPublicCatalogue,
  updateCatalogueItem,
  toggleItemAvailability,
  setTodayPriceOverride,
  deleteCatalogueItem,
  reorderCatalogueItems,
  searchCatalogueItems,
} from "../services/item.service";

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

// ─── Zod schemas ──────────────────────────────────────────────────────────────

const imageSchema = z.object({
  url: z.string().url(),
  isPrimary: z.boolean().default(false),
});

const variantSchema = z.object({
  name: z.string().min(1),
  sku: z.string().optional(),
  price: z.number().int().min(0),
  mrp: z.number().int().min(0),
  stock: z.number().int().min(0).default(0),
  isAvailable: z.boolean().default(true),
});

const attributeSchema = z.object({
  name: z.string().min(1),
  value: z.string().min(1),
});

const createItemSchema = z.object({
  section_id:      z.string().optional(),
  branch_id:       z.string().optional(),
  name:            z.string().min(1),
  description:     z.string().optional(),
  sku:             z.string().optional(),
  images:          z.array(imageSchema).optional(),
  mrp:             z.number().int().min(0).optional(),
  price:           z.number().int().min(0),
  offer_price:     z.number().int().min(0).optional(),
  offer_valid_till: z.string().datetime().optional(),
  unit:            z.string().optional(),
  has_variants:    z.boolean().optional(),
  variants:        z.array(variantSchema).optional(),
  attributes:      z.array(attributeSchema).optional(),
  track_stock:     z.boolean().optional(),
  stock:           z.number().int().min(0).optional(),
  low_stock_alert: z.number().int().min(0).optional(),
  is_food:         z.boolean().optional(),
  sort_order:      z.number().int().min(0).optional(),
  veg_type:        z.enum(["veg", "vegan", "non_veg", "egg"]).optional(),
  meal_type:       z.enum(["breakfast", "lunch", "dinner", "snacks", "all_day"]).optional(),
  item_type:       z.enum(["food", "beverage", "dessert", "merchandise", "service"]).optional(),
  course:          z.enum(["starter", "main", "dessert", "sides", "beverages"]).optional(),
  prep_time_mins:  z.number().int().min(0).optional(),
  calories:        z.number().int().min(0).optional(),
  video_url:       z.string().url().optional(),
});

const updateItemSchema = z.object({
  section_id:        z.string().nullable().optional(),
  branch_id:         z.string().optional(),
  name:              z.string().min(1).optional(),
  description:       z.string().optional(),
  sku:               z.string().optional(),
  images:            z.array(imageSchema).optional(),
  mrp:               z.number().int().min(0).optional(),
  price:             z.number().int().min(0).optional(),
  offer_price:       z.number().int().min(0).nullable().optional(),
  offer_valid_till:  z.string().datetime().nullable().optional(),
  unit:              z.string().optional(),
  has_variants:      z.boolean().optional(),
  variants:          z.array(variantSchema).optional(),
  attributes:        z.array(attributeSchema).optional(),
  track_stock:       z.boolean().optional(),
  stock:             z.number().int().min(0).optional(),
  low_stock_alert:   z.number().int().min(0).optional(),
  is_available:      z.boolean().optional(),
  unavailable_reason: z.string().optional(),
  availability_type: z.enum(["temporary", "permanent"]).optional(),
  is_food:           z.boolean().optional(),
  is_daily_special:  z.boolean().optional(),
  sort_order:        z.number().int().min(0).optional(),
  veg_type:          z.enum(["veg", "vegan", "non_veg", "egg"]).optional(),
  meal_type:         z.enum(["breakfast", "lunch", "dinner", "snacks", "all_day"]).optional(),
  item_type:         z.enum(["food", "beverage", "dessert", "merchandise", "service"]).optional(),
  course:            z.enum(["starter", "main", "dessert", "sides", "beverages"]).optional(),
  prep_time_mins:    z.number().int().min(0).optional(),
  calories:          z.number().int().min(0).optional(),
  video_url:         z.string().url().optional(),
});

const reorderSchema = z.object({
  items: z.array(z.object({ id: z.string(), sort_order: z.number().int() })).min(1),
});

const priceOverrideSchema = z.object({
  price:          z.number().int().min(0),
  original_price: z.number().int().min(0),
  reason:         z.string().min(1),
  resets_at:      z.string().datetime(),
});

type TenantParams = { tenant_id: string };
type ItemParams   = { tenant_id: string; id: string };

export async function itemRoutes(fastify: FastifyInstance): Promise<void> {

  // ─── Public routes (no auth required) ────────────────────────────────────

  // GET /catalogue/:tenant_id/:branch_id/public
  // (registered at prefix /api/v1/catalogue/:tenant_id/:branch_id)
  fastify.get<{ Params: TenantParams & { branch_id: string } }>(
    "/public",
    {
      schema: {
        summary: "Get full catalogue for a branch (customer / public)",
        description: "Returns all available sections and items for a specific branch. Disabled items are hidden. Served from Redis cache (TTL 5min). branch_id comes from the QR code URL.",
        tags: ["Catalogue Public"],
        security: [],
        params: {
          type: "object",
          properties: {
            tenant_id: { type: "string" },
            branch_id: { type: "string" },
          },
        },
        response: { 200: genericOk },
      },
      preHandler: [tryAuthenticateStaff],
    },
    async (req, reply) => {
      try {
        const { tenant_id, branch_id } = req.params;
        const context = resolveContext(req);
        // Customers cannot browse until onboarding is complete
        if (context === "customer") {
          const ready = await fetchTenantOnboardingCompleted(tenant_id);
          if (!ready) {
            return reply.code(403).send(apiError("This business is not yet open. Please check back soon."));
          }
        }
        const catalogue = await getPublicCatalogue(tenant_id, branch_id);
        return reply.send(apiSuccess({ ...catalogue as object, context }));
      } catch (err) {
        if (err instanceof AppError) return reply.code(err.statusCode).send(apiError(err.message));
        throw err;
      }
    }
  );

  // GET /catalogue/:tenant_id/:branch_id/public/search?q=
  fastify.get<{ Params: TenantParams & { branch_id: string }; Querystring: { q: string } }>(
    "/public/search",
    {
      schema: {
        summary: "Search catalogue items for a branch (customer / public)",
        description: "Full-text PostgreSQL search scoped to branch. Returns only available items.",
        tags: ["Catalogue Public"],
        security: [],
        params: {
          type: "object",
          properties: {
            tenant_id: { type: "string" },
            branch_id: { type: "string" },
          },
        },
        querystring: {
          type: "object",
          required: ["q"],
          properties: { q: { type: "string", minLength: 1 } },
        },
        response: { 200: genericOk },
      },
      preHandler: [tryAuthenticateStaff],
    },
    async (req, reply) => {
      const { q } = req.query;
      if (!q?.trim()) {
        return reply.code(400).send(apiError("Search query q is required"));
      }
      try {
        const context = resolveContext(req);
        const onlyAvailable = context === "customer";
        const items = await searchCatalogueItems(req.params.tenant_id, q.trim(), onlyAvailable);
        return reply.send(apiSuccess({ items, context, branch_id: req.params.branch_id }));
      } catch (err) {
        if (err instanceof AppError) return reply.code(err.statusCode).send(apiError(err.message));
        throw err;
      }
    }
  );

  // ─── Staff routes (auth required) ────────────────────────────────────────

  // POST /catalogue/:tenant_id/items
  fastify.post<{ Params: TenantParams }>(
    "/",
    {
      schema: {
        summary: "Create a catalogue item",
        tags: ["Catalogue Items"],
        params: { type: "object", properties: { tenant_id: { type: "string" } } },
        body: {
          type: "object",
          required: ["name", "price"],
          properties: {
            section_id:       { type: "string" },
            branch_id:        { type: "string" },
            name:             { type: "string" },
            description:      { type: "string" },
            sku:              { type: "string" },
            images:           { type: "array", items: { type: "object", additionalProperties: true } },
            mrp:              { type: "integer", minimum: 0, description: "Maximum retail price in paise" },
            price:            { type: "integer", minimum: 0, description: "Selling price in paise" },
            offer_price:      { type: "integer", minimum: 0 },
            offer_valid_till: { type: "string", format: "date-time" },
            unit:             { type: "string", description: "plate, kg, piece, litre, etc." },
            has_variants:     { type: "boolean" },
            variants:         { type: "array", items: { type: "object", additionalProperties: true } },
            attributes:       { type: "array", items: { type: "object", additionalProperties: true } },
            track_stock:      { type: "boolean" },
            stock:            { type: "integer", minimum: 0 },
            low_stock_alert:  { type: "integer", minimum: 0 },
            is_food:          { type: "boolean" },
            sort_order:       { type: "integer", minimum: 0 },
          },
        },
        response: { 201: genericOk, ...errResponses },
      },
      preHandler: [authenticateStaff],
    },
    async (req, reply) => {
      const body = createItemSchema.safeParse(req.body);
      if (!body.success) {
        return reply.code(400).send(apiError(formatZodError(body.error)));
      }
      const token = req.headers.authorization?.slice(7) ?? "";
      try {
        const item = await createCatalogueItem(req.params.tenant_id, body.data, token);
        auditLog({
          tenant_id:   req.params.tenant_id,
          actor_id:    req.staff!.user_id,
          actor_name:  req.staff!.name,
          actor_role:  req.staff!.role,
          action:      "item.created",
          entity_type: "item",
          entity_id:   item.id,
          entity_name: item.name,
          metadata:    { price: item.price, section_id: item.section_id },
        });
        return reply.code(201).send(apiSuccess({ item }));
      } catch (err) {
        if (err instanceof AppError) return reply.code(err.statusCode).send(apiError(err.message));
        throw err;
      }
    }
  );

  // GET /catalogue/:tenant_id/items
  fastify.get<{
    Params: TenantParams;
    Querystring: { section_id?: string; branch_id?: string; is_available?: string };
  }>(
    "/",
    {
      schema: {
        summary: "List catalogue items",
        tags: ["Catalogue Items"],
        params: { type: "object", properties: { tenant_id: { type: "string" } } },
        querystring: {
          type: "object",
          properties: {
            section_id:   { type: "string" },
            branch_id:    { type: "string" },
            is_available: { type: "string", enum: ["true", "false"] },
          },
        },
        response: { 200: genericOk, ...errResponses },
      },
      preHandler: [authenticateStaff],
    },
    async (req, reply) => {
      const { section_id, is_available } = req.query;
      const context = resolveContext(req);
      // Default to primary branch when branch_id not provided
      const branch_id =
        req.query.branch_id ??
        (await fetchDefaultBranchId(
          req.params.tenant_id,
          req.headers.authorization ?? ""
        )) ??
        undefined;
      try {
        const items = await getCatalogueItems({
          tenant_id: req.params.tenant_id,
          section_id,
          branch_id,
          is_available:
            context === "customer"
              ? true
              : is_available !== undefined
                ? is_available === "true"
                : undefined,
        });
        return reply.send(apiSuccess({ items, context }));
      } catch (err) {
        if (err instanceof AppError) return reply.code(err.statusCode).send(apiError(err.message));
        throw err;
      }
    }
  );

  // PATCH /catalogue/:tenant_id/items/reorder  — MUST be before /:id
  fastify.patch<{ Params: TenantParams }>(
    "/reorder",
    {
      schema: {
        summary: "Bulk reorder items",
        tags: ["Catalogue Items"],
        params: { type: "object", properties: { tenant_id: { type: "string" } } },
        body: {
          type: "object",
          required: ["items"],
          properties: {
            items: {
              type: "array",
              items: {
                type: "object",
                required: ["id", "sort_order"],
                properties: { id: { type: "string" }, sort_order: { type: "integer" } },
              },
            },
          },
        },
        response: { 200: genericOk, ...errResponses },
      },
      preHandler: [authenticateStaff],
    },
    async (req, reply) => {
      const body = reorderSchema.safeParse(req.body);
      if (!body.success) {
        return reply.code(400).send(apiError(formatZodError(body.error)));
      }
      try {
        await reorderCatalogueItems(req.params.tenant_id, body.data.items);
        return reply.send(apiSuccess({ message: "Items reordered" }));
      } catch (err) {
        if (err instanceof AppError) return reply.code(err.statusCode).send(apiError(err.message));
        throw err;
      }
    }
  );

  // GET /catalogue/:tenant_id/items/:id
  fastify.get<{ Params: ItemParams }>(
    "/:id",
    {
      schema: {
        summary: "Get a catalogue item by ID",
        tags: ["Catalogue Items"],
        params: {
          type: "object",
          properties: { tenant_id: { type: "string" }, id: { type: "string" } },
        },
        response: { 200: genericOk, ...errResponses },
      },
      preHandler: [authenticateStaff],
    },
    async (req, reply) => {
      try {
        const item = await getCatalogueItemById(req.params.tenant_id, req.params.id);
        const context = resolveContext(req);
        return reply.send(apiSuccess({ item, context }));
      } catch (err) {
        if (err instanceof AppError) return reply.code(err.statusCode).send(apiError(err.message));
        throw err;
      }
    }
  );

  // PATCH /catalogue/:tenant_id/items/:id
  fastify.patch<{ Params: ItemParams }>(
    "/:id",
    {
      schema: {
        summary: "Update a catalogue item",
        tags: ["Catalogue Items"],
        params: {
          type: "object",
          properties: { tenant_id: { type: "string" }, id: { type: "string" } },
        },
        body: { type: "object", additionalProperties: true },
        response: { 200: genericOk, ...errResponses },
      },
      preHandler: [authenticateStaff],
    },
    async (req, reply) => {
      const body = updateItemSchema.safeParse(req.body);
      if (!body.success) {
        return reply.code(400).send(apiError(formatZodError(body.error)));
      }
      try {
        const item = await updateCatalogueItem(req.params.tenant_id, req.params.id, body.data);
        // Determine action — availability change vs general edit
        const action = body.data.is_available !== undefined
          ? (body.data.is_available ? "item.enabled" : "item.disabled")
          : "item.updated";
        auditLog({
          tenant_id:   req.params.tenant_id,
          actor_id:    req.staff!.user_id,
          actor_name:  req.staff!.name,
          actor_role:  req.staff!.role,
          action,
          entity_type: "item",
          entity_id:   item.id,
          entity_name: item.name,
          metadata:    { changes: body.data },
        });
        return reply.send(apiSuccess({ item }));
      } catch (err) {
        if (err instanceof AppError) return reply.code(err.statusCode).send(apiError(err.message));
        throw err;
      }
    }
  );

  // PATCH /catalogue/:tenant_id/items/:id/toggle
  fastify.patch<{ Params: ItemParams }>(
    "/:id/toggle",
    {
      schema: {
        summary: "Toggle item availability on/off",
        tags: ["Catalogue Items"],
        params: {
          type: "object",
          properties: { tenant_id: { type: "string" }, id: { type: "string" } },
        },
        response: { 200: genericOk, ...errResponses },
      },
      preHandler: [authenticateStaff],
    },
    async (req, reply) => {
      try {
        const item = await toggleItemAvailability(req.params.tenant_id, req.params.id);
        auditLog({
          tenant_id:   req.params.tenant_id,
          actor_id:    req.staff!.user_id,
          actor_name:  req.staff!.name,
          actor_role:  req.staff!.role,
          action:      item.is_available ? "item.enabled" : "item.disabled",
          entity_type: "item",
          entity_id:   item.id,
          entity_name: item.name,
        });
        return reply.send(apiSuccess({ item }));
      } catch (err) {
        if (err instanceof AppError) return reply.code(err.statusCode).send(apiError(err.message));
        throw err;
      }
    }
  );

  // PATCH /catalogue/:tenant_id/items/:id/price-override
  fastify.patch<{ Params: ItemParams }>(
    "/:id/price-override",
    {
      schema: {
        summary: "Set today price override (resets at midnight)",
        tags: ["Catalogue Items"],
        params: {
          type: "object",
          properties: { tenant_id: { type: "string" }, id: { type: "string" } },
        },
        body: {
          type: "object",
          required: ["price", "original_price", "reason", "resets_at"],
          properties: {
            price:          { type: "integer", minimum: 0, description: "Override price in paise" },
            original_price: { type: "integer", minimum: 0, description: "Original price in paise" },
            reason:         { type: "string" },
            resets_at:      { type: "string", format: "date-time", description: "Usually midnight tonight" },
          },
        },
        response: { 200: genericOk, ...errResponses },
      },
      preHandler: [authenticateStaff],
    },
    async (req, reply) => {
      const body = priceOverrideSchema.safeParse(req.body);
      if (!body.success) {
        return reply.code(400).send(apiError(formatZodError(body.error)));
      }
      try {
        const item = await setTodayPriceOverride(req.params.tenant_id, req.params.id, {
          ...body.data,
          set_by: req.staff!.user_id,
        });
        return reply.send(apiSuccess({ item }));
      } catch (err) {
        if (err instanceof AppError) return reply.code(err.statusCode).send(apiError(err.message));
        throw err;
      }
    }
  );

  // DELETE /catalogue/:tenant_id/items/:id
  fastify.delete<{ Params: ItemParams }>(
    "/:id",
    {
      schema: {
        summary: "Delete a catalogue item",
        tags: ["Catalogue Items"],
        params: {
          type: "object",
          properties: { tenant_id: { type: "string" }, id: { type: "string" } },
        },
        response: { 200: genericOk, ...errResponses },
      },
      preHandler: [authenticateStaff],
    },
    async (req, reply) => {
      try {
        // Fetch name before deletion for audit log
        const existing = await getCatalogueItemById(req.params.tenant_id, req.params.id);
        await deleteCatalogueItem(req.params.tenant_id, req.params.id);
        auditLog({
          tenant_id:   req.params.tenant_id,
          actor_id:    req.staff!.user_id,
          actor_name:  req.staff!.name,
          actor_role:  req.staff!.role,
          action:      "item.deleted",
          entity_type: "item",
          entity_id:   req.params.id,
          entity_name: existing.name,
        });
        return reply.send(apiSuccess({ message: "Item deleted" }));
      } catch (err) {
        if (err instanceof AppError) return reply.code(err.statusCode).send(apiError(err.message));
        throw err;
      }
    }
  );
}
