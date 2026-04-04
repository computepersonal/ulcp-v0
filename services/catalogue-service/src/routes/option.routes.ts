import { formatZodError } from "../lib/zodError";
import { FastifyInstance } from "fastify";
import { z } from "zod";
import { apiSuccess, apiError, AppError } from "@ulcp/shared";
import { authenticateStaff } from "../middleware/authenticate";
import {
  getItemOptionGroups,
  addOptionGroup,
  editOptionGroup,
  removeOptionGroup,
  addOptionChoice,
  editOptionChoice,
  removeOptionChoice,
} from "../services/option.service";

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
  is_required: z.boolean().optional(),
  min_select: z.number().int().min(0).optional(),
  max_select: z.number().int().min(1).optional(),
  sort_order: z.number().int().min(0).optional(),
});

const updateGroupSchema = createGroupSchema.partial();

const createChoiceSchema = z.object({
  name: z.string().min(1),
  add_on_price: z.number().int().min(0).optional(),
  is_available: z.boolean().optional(),
  sort_order: z.number().int().min(0).optional(),
});

const updateChoiceSchema = createChoiceSchema.partial();

type Params = { tenant_id: string; item_id: string };
type GroupParams = Params & { group_id: string };
type ChoiceParams = GroupParams & { choice_id: string };

export async function optionRoutes(fastify: FastifyInstance): Promise<void> {
  // GET /:item_id/options
  fastify.get<{ Params: Params }>(
    "/",
    {
      schema: {
        summary: "List option groups for an item",
        tags: ["Item Options"],
        response: { 200: genericOk, ...errResponses },
      },
      preHandler: [authenticateStaff],
    },
    async (req, reply) => {
      try {
        const groups = await getItemOptionGroups(req.params.tenant_id, req.params.item_id);
        return reply.send(apiSuccess({ groups }));
      } catch (err) {
        if (err instanceof AppError) return reply.code(err.statusCode).send(apiError(err.message));
        throw err;
      }
    }
  );

  // POST /:item_id/options
  fastify.post<{ Params: Params }>(
    "/",
    {
      schema: {
        summary: "Add an option group to an item",
        tags: ["Item Options"],
        body: {
          type: "object",
          required: ["name"],
          properties: {
            name:        { type: "string" },
            is_required: { type: "boolean" },
            min_select:  { type: "integer", minimum: 0 },
            max_select:  { type: "integer", minimum: 1 },
            sort_order:  { type: "integer", minimum: 0 },
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
        const group = await addOptionGroup(req.params.tenant_id, req.params.item_id, body.data);
        return reply.code(201).send(apiSuccess({ group }));
      } catch (err) {
        if (err instanceof AppError) return reply.code(err.statusCode).send(apiError(err.message));
        throw err;
      }
    }
  );

  // PATCH /:item_id/options/:group_id
  fastify.patch<{ Params: GroupParams }>(
    "/:group_id",
    {
      schema: {
        summary: "Update an option group",
        tags: ["Item Options"],
        response: { 200: genericOk, ...errResponses },
      },
      preHandler: [authenticateStaff],
    },
    async (req, reply) => {
      const body = updateGroupSchema.safeParse(req.body);
      if (!body.success)
        return reply.code(400).send(apiError(formatZodError(body.error)));
      try {
        const group = await editOptionGroup(req.params.tenant_id, req.params.group_id, body.data);
        return reply.send(apiSuccess({ group }));
      } catch (err) {
        if (err instanceof AppError) return reply.code(err.statusCode).send(apiError(err.message));
        throw err;
      }
    }
  );

  // DELETE /:item_id/options/:group_id
  fastify.delete<{ Params: GroupParams }>(
    "/:group_id",
    {
      schema: { summary: "Delete an option group", tags: ["Item Options"], response: { 200: genericOk, ...errResponses } },
      preHandler: [authenticateStaff],
    },
    async (req, reply) => {
      try {
        await removeOptionGroup(req.params.tenant_id, req.params.group_id);
        return reply.send(apiSuccess({ message: "Option group deleted" }));
      } catch (err) {
        if (err instanceof AppError) return reply.code(err.statusCode).send(apiError(err.message));
        throw err;
      }
    }
  );

  // POST /:item_id/options/:group_id/choices
  fastify.post<{ Params: GroupParams }>(
    "/:group_id/choices",
    {
      schema: {
        summary: "Add a choice to an option group",
        tags: ["Item Options"],
        body: {
          type: "object",
          required: ["name"],
          properties: {
            name:          { type: "string" },
            add_on_price:  { type: "integer", minimum: 0 },
            is_available:  { type: "boolean" },
            sort_order:    { type: "integer", minimum: 0 },
          },
        },
        response: { 201: genericOk, ...errResponses },
      },
      preHandler: [authenticateStaff],
    },
    async (req, reply) => {
      const body = createChoiceSchema.safeParse(req.body);
      if (!body.success)
        return reply.code(400).send(apiError(formatZodError(body.error)));
      try {
        const choice = await addOptionChoice(req.params.tenant_id, req.params.group_id, body.data);
        return reply.code(201).send(apiSuccess({ choice }));
      } catch (err) {
        if (err instanceof AppError) return reply.code(err.statusCode).send(apiError(err.message));
        throw err;
      }
    }
  );

  // PATCH /:item_id/options/:group_id/choices/:choice_id
  fastify.patch<{ Params: ChoiceParams }>(
    "/:group_id/choices/:choice_id",
    {
      schema: { summary: "Update a choice", tags: ["Item Options"], response: { 200: genericOk, ...errResponses } },
      preHandler: [authenticateStaff],
    },
    async (req, reply) => {
      const body = updateChoiceSchema.safeParse(req.body);
      if (!body.success)
        return reply.code(400).send(apiError(formatZodError(body.error)));
      try {
        const choice = await editOptionChoice(
          req.params.tenant_id, req.params.group_id, req.params.choice_id, body.data
        );
        return reply.send(apiSuccess({ choice }));
      } catch (err) {
        if (err instanceof AppError) return reply.code(err.statusCode).send(apiError(err.message));
        throw err;
      }
    }
  );

  // DELETE /:item_id/options/:group_id/choices/:choice_id
  fastify.delete<{ Params: ChoiceParams }>(
    "/:group_id/choices/:choice_id",
    {
      schema: { summary: "Delete a choice", tags: ["Item Options"], response: { 200: genericOk, ...errResponses } },
      preHandler: [authenticateStaff],
    },
    async (req, reply) => {
      try {
        await removeOptionChoice(
          req.params.tenant_id, req.params.group_id, req.params.choice_id
        );
        return reply.send(apiSuccess({ message: "Choice deleted" }));
      } catch (err) {
        if (err instanceof AppError) return reply.code(err.statusCode).send(apiError(err.message));
        throw err;
      }
    }
  );
}
