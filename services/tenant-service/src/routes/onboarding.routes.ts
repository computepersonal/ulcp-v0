import { formatZodError } from "../lib/zodError";
import { FastifyInstance } from "fastify";
import { z } from "zod";
import { apiSuccess, apiError, AppError } from "@ulcp/shared";
import { authenticateStaff } from "../middleware/authenticate";
import {
  saveWizardStep,
  getOnboardingState,
  completeOnboarding,
} from "../services/onboarding.service";

// ─── Shared Swagger response shapes ──────────────────────────────────────────
const genericOk = {
  type: "object",
  properties: {
    success: { type: "boolean" },
    data: { type: "object", additionalProperties: true },
  },
} as const;

const saveStepSchema = z.object({
  step: z.number().int().min(1).max(6),
  data: z.record(z.unknown()),
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
        response: { 200: genericOk },
      },
      preHandler: [authenticateStaff],
    },
    async (req, reply) => {
      try {
        const state = await getOnboardingState(req.params.tenant_id);
        return reply.send(apiSuccess({ state }));
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
        summary: "Save onboarding step",
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
        response: { 200: genericOk },
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
        summary: "Complete onboarding (activates trial)",
        tags: ["Onboarding"],
        params: { type: "object", properties: { tenant_id: { type: "string" } } },
        response: { 200: genericOk },
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
}
