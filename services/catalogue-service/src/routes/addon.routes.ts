import { formatZodError } from "../lib/zodError";
import { FastifyInstance } from "fastify";
import { z } from "zod";
import { apiSuccess, apiError, AppError } from "@ulcp/shared";
import { authenticateStaff } from "../middleware/authenticate";
import {
  getTenantAddonGroups,
  createTenantAddonGroup,
  updateTenantAddonGroup,
  deleteTenantAddonGroup,
  addItemToAddonGroup,
  editAddonGroupItem,
  removeAddonGroupItem,
  getItemAddonGroups,
  attachAddonGroupToItem,
  detachAddonGroupFromItem,
} from "../services/addon.service";

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
  404: { type: "object", properties: { success: { type: "boolean" }, error: { type: "string" } } },
} as const;

const createGroupSchema = z.object({
  name: z.string().min(1),
  sort_order: z.number().int().min(0).optional(),
});

const updateGroupSchema = z.object({
  name: z.string().min(1).optional(),
  is_available: z.boolean().optional(),
  sort_order: z.number().int().min(0).optional(),
});

const createGroupItemSchema = z.object({
  name: z.string().min(1),
  price: z.number().int().min(0).optional(),
  mrp: z.number().int().min(0).optional(),
  sort_order: z.number().int().min(0).optional(),
});

const updateGroupItemSchema = createGroupItemSchema
  .omit({ name: true })
  .merge(z.object({ name: z.string().min(1).optional(), is_available: z.boolean().optional() }));

type TenantParams = { tenant_id: string };
type GroupParams = { tenant_id: string; group_id: string };
type GroupItemParams = GroupParams & { item_id: string };
type ItemLinkParams = { tenant_id: string; item_id: string; addon_group_id: string };
type ItemParams = { tenant_id: string; item_id: string };

export async function addonRoutes(fastify: FastifyInstance): Promise<void> {
  // ── Addon Groups (tenant-level) ────────────────────────────────────────────

  // GET /addons
  fastify.get<{ Params: TenantParams }>(
    "/",
    {
      schema: { summary: "List all addon groups", tags: ["Addons"], response: { 200: genericOk, ...errResponses } },
      preHandler: [authenticateStaff],
    },
    async (req, reply) => {
      try {
        const groups = await getTenantAddonGroups(req.params.tenant_id);
        return reply.send(apiSuccess({ groups }));
      } catch (err) {
        if (err instanceof AppError) return reply.code(err.statusCode).send(apiError(err.message));
        throw err;
      }
    }
  );

  // POST /addons
  fastify.post<{ Params: TenantParams }>(
    "/",
    {
      schema: {
        summary: "Create an addon group",
        tags: ["Addons"],
        body: {
          type: "object",
          required: ["name"],
          properties: {
            name:       { type: "string" },
            sort_order: { type: "integer", minimum: 0 },
          },
        },
        response: { 201: genericOk, ...errResponses },
      },
      preHandler: [authenticateStaff],
    },
    async (req, reply) => {
      const body = createGroupSchema.safeParse(req.body);
      if (!body.success)
        return reply.code(400).send(apiError(formatZodError(body.error)));
      try {
        const group = await createTenantAddonGroup(req.params.tenant_id, body.data);
        return reply.code(201).send(apiSuccess({ group }));
      } catch (err) {
        if (err instanceof AppError) return reply.code(err.statusCode).send(apiError(err.message));
        throw err;
      }
    }
  );

  // PATCH /addons/:group_id
  fastify.patch<{ Params: GroupParams }>(
    "/:group_id",
    {
      schema: { summary: "Update an addon group", tags: ["Addons"], response: { 200: genericOk, ...errResponses } },
      preHandler: [authenticateStaff],
    },
    async (req, reply) => {
      const body = updateGroupSchema.safeParse(req.body);
      if (!body.success)
        return reply.code(400).send(apiError(formatZodError(body.error)));
      try {
        const group = await updateTenantAddonGroup(req.params.tenant_id, req.params.group_id, body.data);
        return reply.send(apiSuccess({ group }));
      } catch (err) {
        if (err instanceof AppError) return reply.code(err.statusCode).send(apiError(err.message));
        throw err;
      }
    }
  );

  // DELETE /addons/:group_id
  fastify.delete<{ Params: GroupParams }>(
    "/:group_id",
    {
      schema: { summary: "Delete an addon group", tags: ["Addons"], response: { 200: genericOk, ...errResponses } },
      preHandler: [authenticateStaff],
    },
    async (req, reply) => {
      try {
        await deleteTenantAddonGroup(req.params.tenant_id, req.params.group_id);
        return reply.send(apiSuccess({ message: "Addon group deleted" }));
      } catch (err) {
        if (err instanceof AppError) return reply.code(err.statusCode).send(apiError(err.message));
        throw err;
      }
    }
  );

  // ── Addon Group Items ──────────────────────────────────────────────────────

  // POST /addons/:group_id/items
  fastify.post<{ Params: GroupParams }>(
    "/:group_id/items",
    {
      schema: {
        summary: "Add an item to an addon group",
        tags: ["Addons"],
        body: {
          type: "object",
          required: ["name"],
          properties: {
            name:       { type: "string" },
            price:      { type: "integer", minimum: 0 },
            mrp:        { type: "integer", minimum: 0 },
            sort_order: { type: "integer", minimum: 0 },
          },
        },
        response: { 201: genericOk, ...errResponses },
      },
      preHandler: [authenticateStaff],
    },
    async (req, reply) => {
      const body = createGroupItemSchema.safeParse(req.body);
      if (!body.success)
        return reply.code(400).send(apiError(formatZodError(body.error)));
      try {
        const item = await addItemToAddonGroup(req.params.tenant_id, req.params.group_id, body.data);
        return reply.code(201).send(apiSuccess({ item }));
      } catch (err) {
        if (err instanceof AppError) return reply.code(err.statusCode).send(apiError(err.message));
        throw err;
      }
    }
  );

  // PATCH /addons/:group_id/items/:item_id
  fastify.patch<{ Params: GroupItemParams }>(
    "/:group_id/items/:item_id",
    {
      schema: { summary: "Update an addon group item", tags: ["Addons"], response: { 200: genericOk, ...errResponses } },
      preHandler: [authenticateStaff],
    },
    async (req, reply) => {
      const body = updateGroupItemSchema.safeParse(req.body);
      if (!body.success)
        return reply.code(400).send(apiError(formatZodError(body.error)));
      try {
        const item = await editAddonGroupItem(
          req.params.tenant_id, req.params.group_id, req.params.item_id, body.data
        );
        return reply.send(apiSuccess({ item }));
      } catch (err) {
        if (err instanceof AppError) return reply.code(err.statusCode).send(apiError(err.message));
        throw err;
      }
    }
  );

  // DELETE /addons/:group_id/items/:item_id
  fastify.delete<{ Params: GroupItemParams }>(
    "/:group_id/items/:item_id",
    {
      schema: { summary: "Delete an addon group item", tags: ["Addons"], response: { 200: genericOk, ...errResponses } },
      preHandler: [authenticateStaff],
    },
    async (req, reply) => {
      try {
        await removeAddonGroupItem(req.params.tenant_id, req.params.group_id, req.params.item_id);
        return reply.send(apiSuccess({ message: "Addon item deleted" }));
      } catch (err) {
        if (err instanceof AppError) return reply.code(err.statusCode).send(apiError(err.message));
        throw err;
      }
    }
  );

  // ── Item ↔ AddonGroup Links ────────────────────────────────────────────────
  // These routes live under /addons but act on catalogue items

  // GET /addons/by-item/:item_id  — get addon groups linked to a specific item
  fastify.get<{ Params: ItemParams }>(
    "/by-item/:item_id",
    {
      schema: { summary: "Get addon groups linked to an item", tags: ["Addons"], response: { 200: genericOk, ...errResponses } },
      preHandler: [authenticateStaff],
    },
    async (req, reply) => {
      try {
        const links = await getItemAddonGroups(req.params.tenant_id, req.params.item_id);
        return reply.send(apiSuccess({ addon_groups: links.map((l) => l.addon_group) }));
      } catch (err) {
        if (err instanceof AppError) return reply.code(err.statusCode).send(apiError(err.message));
        throw err;
      }
    }
  );

  // POST /addons/by-item/:item_id/:addon_group_id  — link addon group to item
  fastify.post<{ Params: ItemLinkParams }>(
    "/by-item/:item_id/:addon_group_id",
    {
      schema: { summary: "Link an addon group to an item", tags: ["Addons"], response: { 201: genericOk, ...errResponses } },
      preHandler: [authenticateStaff],
    },
    async (req, reply) => {
      try {
        await attachAddonGroupToItem(
          req.params.tenant_id, req.params.item_id, req.params.addon_group_id
        );
        return reply.code(201).send(apiSuccess({ message: "Addon group linked" }));
      } catch (err) {
        if (err instanceof AppError) return reply.code(err.statusCode).send(apiError(err.message));
        throw err;
      }
    }
  );

  // DELETE /addons/by-item/:item_id/:addon_group_id  — unlink addon group from item
  fastify.delete<{ Params: ItemLinkParams }>(
    "/by-item/:item_id/:addon_group_id",
    {
      schema: { summary: "Unlink an addon group from an item", tags: ["Addons"], response: { 200: genericOk, ...errResponses } },
      preHandler: [authenticateStaff],
    },
    async (req, reply) => {
      try {
        await detachAddonGroupFromItem(
          req.params.tenant_id, req.params.item_id, req.params.addon_group_id
        );
        return reply.send(apiSuccess({ message: "Addon group unlinked" }));
      } catch (err) {
        if (err instanceof AppError) return reply.code(err.statusCode).send(apiError(err.message));
        throw err;
      }
    }
  );
}
