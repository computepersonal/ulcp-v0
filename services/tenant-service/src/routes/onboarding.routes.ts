import { formatZodError } from "../lib/zodError";
import { FastifyInstance } from "fastify";
import { z } from "zod";
import { apiSuccess, apiError, AppError } from "@ulcp/shared";
import { authenticateStaff } from "../middleware/authenticate";
import {
  saveWizardStep,
  getOnboardingState,
  completeOnboarding,
  getSetupTasks,
  markSetupTaskDone,
} from "../services/onboarding.service";

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
  404: { type: "object", properties: { success: { type: "boolean" }, error: { type: "string" } } },
} as const;

const saveStepSchema = z.object({
  step: z.number().int().min(1).max(6),
  data: z.record(z.unknown()),
});

const markTaskSchema = z.object({
  task_id: z.enum(["catalogue", "tables", "staff", "qr"]),
});

type TenantIdParam = { tenant_id: string };

export async function onboardingRoutes(fastify: FastifyInstance): Promise<void> {
  // GET /onboarding/:tenant_id — get onboarding state
  fastify.get<{ Params: TenantIdParam }>(
    "/:tenant_id",
    {
      schema: {
        summary: "Get onboarding state",
        tags: ["Onboarding"],
        params: { type: "object", properties: { tenant_id: { type: "string" } } },
        response: { 200: genericOk, ...errResponses },
      },
      preHandler: [authenticateStaff],
    },
    async (req, reply) => {
      try {
        const state = await getOnboardingState(req.params.tenant_id);
        return reply.send(apiSuccess(state));
      } catch (err) {
        if (err instanceof AppError) {
          return reply.code(err.statusCode).send(apiError(err.message));
        }
        throw err;
      }
    }
  );

  // POST /onboarding/:tenant_id/step — save wizard step
  fastify.post<{ Params: TenantIdParam }>(
    "/:tenant_id/step",
    {
      schema: {
        summary: "Save onboarding step (with validation)",
        tags: ["Onboarding"],
        params: { type: "object", properties: { tenant_id: { type: "string" } } },
        body: {
          type: "object",
          required: ["step", "data"],
          properties: {
            step: { type: "integer", minimum: 1, maximum: 6 },
            data: { type: "object", additionalProperties: true },
          },
        },
        response: { 200: genericOk, ...errResponses },
      },
      preHandler: [authenticateStaff],
    },
    async (req, reply) => {
      const body = saveStepSchema.safeParse(req.body);
      if (!body.success) {
        return reply
          .code(400)
          .send(apiError(formatZodError(body.error)));
      }
      try {
        const tenant = await saveWizardStep(
          req.params.tenant_id,
          body.data.step,
          body.data.data
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

  // POST /onboarding/:tenant_id/complete — complete onboarding
  fastify.post<{ Params: TenantIdParam }>(
    "/:tenant_id/complete",
    {
      schema: {
        summary: "Complete onboarding (activates trial, validates pre-reqs)",
        tags: ["Onboarding"],
        params: { type: "object", properties: { tenant_id: { type: "string" } } },
        response: { 200: genericOk, ...errResponses },
      },
      preHandler: [authenticateStaff],
    },
    async (req, reply) => {
      try {
        const tenant = await completeOnboarding(req.params.tenant_id);
        return reply.send(apiSuccess({ tenant }));
      } catch (err) {
        if (err instanceof AppError) {
          return reply.code(err.statusCode).send(apiError(err.message));
        }
        throw err;
      }
    }
  );

  // GET /onboarding/:tenant_id/setup-tasks — get setup task progress
  fastify.get<{ Params: TenantIdParam }>(
    "/:tenant_id/setup-tasks",
    {
      schema: {
        summary: "Get post-onboarding setup task progress",
        tags: ["Onboarding"],
        params: { type: "object", properties: { tenant_id: { type: "string" } } },
        response: { 200: genericOk, ...errResponses },
      },
      preHandler: [authenticateStaff],
    },
    async (req, reply) => {
      try {
        const tasks = await getSetupTasks(req.params.tenant_id);
        return reply.send(apiSuccess({ setup_tasks: tasks }));
      } catch (err) {
        if (err instanceof AppError) {
          return reply.code(err.statusCode).send(apiError(err.message));
        }
        throw err;
      }
    }
  );

  // PATCH /onboarding/:tenant_id/setup-tasks — mark a setup task done
  fastify.patch<{ Params: TenantIdParam }>(
    "/:tenant_id/setup-tasks",
    {
      schema: {
        summary: "Mark a setup task as done",
        tags: ["Onboarding"],
        params: { type: "object", properties: { tenant_id: { type: "string" } } },
        body: {
          type: "object",
          required: ["task_id"],
          properties: {
            task_id: { type: "string", enum: ["catalogue", "tables", "staff", "qr"] },
          },
        },
        response: { 200: genericOk, ...errResponses },
      },
      preHandler: [authenticateStaff],
    },
    async (req, reply) => {
      const body = markTaskSchema.safeParse(req.body);
      if (!body.success) {
        return reply.code(400).send(apiError(formatZodError(body.error)));
      }
      try {
        const tasks = await markSetupTaskDone(req.params.tenant_id, body.data.task_id);
        return reply.send(apiSuccess({ setup_tasks: tasks }));
      } catch (err) {
        if (err instanceof AppError) {
          return reply.code(err.statusCode).send(apiError(err.message));
        }
        throw err;
      }
    }
  );
}
