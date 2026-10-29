import { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  apiSuccess,
  apiError,
  PLANS,
  ADDONS,
  ADDON_IDS,
  PLAN_PRICES,
  FREE_TRIAL_MONTHS,
  PlanTier,
} from "@ulcp/shared";
import { authenticateStaff } from "../middleware/authenticate";
import { prisma } from "../lib/prisma";
import { logger } from "../lib/logger";

type TenantParams = { tenant_id: string };

const genericOk = { type: "object" as const, properties: { success: { type: "boolean" as const } }, additionalProperties: true };
const errResponses = {
  400: genericOk,
  403: genericOk,
  404: genericOk,
};

// ─── Helper: is trial still active? ──────────────────────────────────────────
function isTrialActive(trialEndsAt: Date | null): boolean {
  if (!trialEndsAt) return false;
  return new Date() < trialEndsAt;
}

// ─── Anti-abuse: check if another tenant already used a free trial with same identity ─
async function hasAbusingDuplicate(
  excludeTenantId: string,
  phone: string | null,
  email: string | null,
  name: string,
  address: string | null
): Promise<{ found: boolean; reason?: string }> {
  // Must match (phone + email) OR (name + address) with an existing tenant that already used trial
  const conditions = [];

  // Check 1: same phone AND same email (both must be non-empty)
  if (phone && email) {
    conditions.push({ phone, email, free_trial_used: true, id: { not: excludeTenantId } });
  }

  // Check 2: same name AND same address (both must be non-empty)
  if (name && address) {
    conditions.push({ name, address, free_trial_used: true, id: { not: excludeTenantId } });
  }

  if (conditions.length === 0) return { found: false };

  const existing = await prisma.tenant.findFirst({
    where: { OR: conditions },
    select: { id: true, name: true },
  });

  if (existing) {
    return {
      found: true,
      reason: "A free trial has already been used with matching identity details. Free trial is one-time only.",
    };
  }

  return { found: false };
}

export async function subscriptionRoutes(fastify: FastifyInstance): Promise<void> {

  // GET /:tenant_id/subscription — get current plan, add-ons, trial status
  fastify.get<{ Params: TenantParams }>(
    "/:tenant_id/subscription",
    {
      schema: {
        summary: "Get subscription details",
        tags: ["Subscription"],
        response: { 200: genericOk, ...errResponses },
      },
      preHandler: [authenticateStaff],
    },
    async (req, reply) => {
      const tenant = await prisma.tenant.findUnique({
        where: { id: req.params.tenant_id },
        select: {
          plan: true,
          active_addons: true,
          trial_ends_at: true,
          free_trial_used: true,
          created_at: true,
          subscriptions: {
            where: { is_active: true },
            orderBy: { created_at: "desc" },
          },
        },
      });
      if (!tenant) return reply.code(404).send(apiError("Tenant not found"));

      const plan = tenant.plan as PlanTier;
      // Trial is active when: on free plan + trial was granted (free_trial_used=true) + hasn't expired yet
      const trialActive = plan === "free" && tenant.free_trial_used && isTrialActive(tenant.trial_ends_at);
      const trialEndsAt = tenant.trial_ends_at?.toISOString() ?? null;
      const monthlyPrice = trialActive ? 0 : PLAN_PRICES[plan] ?? 500;

      // Calculate add-on total
      const addonTotal = tenant.active_addons.reduce((sum, addonId) => {
        const addon = ADDONS.find((a) => a.id === addonId);
        return sum + (addon ? addon.price / 100 : 0); // convert paise to rupees
      }, 0);

      return reply.send(apiSuccess({
        plan,
        planInfo: PLANS.find((p) => p.tier === plan),
        monthlyPrice,
        trialActive,
        trialEndsAt,
        freeTrialUsed: tenant.free_trial_used,
        activeAddons: tenant.active_addons,
        addonTotal,
        totalMonthly: monthlyPrice + addonTotal,
        availableAddons: ADDONS.map((a) => ({
          ...a,
          price: a.price / 100, // rupees for display
          active: tenant.active_addons.includes(a.id),
        })),
        availablePlans: PLANS,
        subscriptions: tenant.subscriptions,
      }));
    }
  );

  // POST /:tenant_id/subscription/upgrade — change plan tier
  fastify.post<{ Params: TenantParams }>(
    "/:tenant_id/subscription/upgrade",
    {
      schema: {
        summary: "Upgrade or change plan",
        tags: ["Subscription"],
        response: { 200: genericOk, ...errResponses },
      },
      preHandler: [authenticateStaff],
    },
    async (req, reply) => {
      // Only owners can change plan
      const role = req.staff?.role ?? "";
      if (!["tenant_owner", "primary_owner", "managing_partner", "platform_superadmin"].includes(role)) {
        return reply.code(403).send(apiError("Only owners can change the subscription plan"));
      }

      const body = z.object({
        plan: z.enum(["free", "premium", "allinone"]),
      }).safeParse(req.body);
      if (!body.success) return reply.code(400).send(apiError("Invalid plan"));

      const newPlan = body.data.plan;

      const tenant = await prisma.tenant.findUnique({
        where: { id: req.params.tenant_id },
        select: { plan: true, free_trial_used: true, phone: true, email: true, name: true, address: true },
      });
      if (!tenant) return reply.code(404).send(apiError("Tenant not found"));

      if (tenant.plan === newPlan) {
        return reply.code(400).send(apiError("Already on this plan"));
      }

      // If switching to free: check if trial was already used (one-time lifetime)
      const updateData: Record<string, unknown> = { plan: newPlan };

      if (newPlan === "free") {
        if (tenant.free_trial_used) {
          // Trial already consumed — they can switch to free but no free month, charges immediately
          // No trial_ends_at reset
        } else {
          // Anti-abuse: check if same person already used trial under a different tenant
          const abuse = await hasAbusingDuplicate(
            req.params.tenant_id,
            tenant.phone,
            tenant.email,
            tenant.name,
            tenant.address
          );
          if (abuse.found) {
            return reply.code(400).send(apiError(abuse.reason ?? "Free trial already used"));
          }

          // Grant one-time 1-month trial
          const trialEnd = new Date();
          trialEnd.setMonth(trialEnd.getMonth() + FREE_TRIAL_MONTHS);
          updateData.trial_ends_at = trialEnd;
          // Mark trial as used immediately so it can never be granted again
          updateData.free_trial_used = true;
        }
      }

      const updated = await prisma.tenant.update({
        where: { id: req.params.tenant_id },
        data: updateData,
      });

      // Create subscription record
      await prisma.subscription.create({
        data: {
          tenant_id: req.params.tenant_id,
          plan: newPlan,
          type: "plan",
          amount: PLAN_PRICES[newPlan] * 100, // paise
          is_active: true,
        },
      });

      // Deactivate old plan subscriptions
      await prisma.subscription.updateMany({
        where: {
          tenant_id: req.params.tenant_id,
          type: "plan",
          plan: { not: newPlan },
          is_active: true,
        },
        data: { is_active: false },
      });

      logger.info({ tenant_id: req.params.tenant_id, from: tenant.plan, to: newPlan }, "Plan changed");

      return reply.send(apiSuccess({
        plan: updated.plan,
        message: `Plan changed to ${newPlan}`,
      }));
    }
  );

  // POST /:tenant_id/subscription/addon — toggle an add-on
  fastify.post<{ Params: TenantParams }>(
    "/:tenant_id/subscription/addon",
    {
      schema: {
        summary: "Add or remove an add-on",
        tags: ["Subscription"],
        response: { 200: genericOk, ...errResponses },
      },
      preHandler: [authenticateStaff],
    },
    async (req, reply) => {
      const role = req.staff?.role ?? "";
      if (!["tenant_owner", "primary_owner", "managing_partner", "platform_superadmin"].includes(role)) {
        return reply.code(403).send(apiError("Only owners can manage add-ons"));
      }

      const body = z.object({
        addon_id: z.string(),
        action: z.enum(["add", "remove"]),
      }).safeParse(req.body);
      if (!body.success) return reply.code(400).send(apiError("Invalid request"));

      const { addon_id, action } = body.data;
      if (!ADDON_IDS.includes(addon_id)) {
        return reply.code(400).send(apiError(`Unknown add-on: ${addon_id}`));
      }

      const tenant = await prisma.tenant.findUnique({
        where: { id: req.params.tenant_id },
        select: { active_addons: true },
      });
      if (!tenant) return reply.code(404).send(apiError("Tenant not found"));

      let newAddons = [...tenant.active_addons];

      if (action === "add") {
        if (newAddons.includes(addon_id)) {
          return reply.code(400).send(apiError("Add-on already active"));
        }
        newAddons.push(addon_id);

        // Create addon subscription record
        const addon = ADDONS.find((a) => a.id === addon_id);
        await prisma.subscription.create({
          data: {
            tenant_id: req.params.tenant_id,
            plan: "addon",
            type: "addon",
            addon_id,
            amount: addon?.price ?? 50000,
            is_active: true,
          },
        });
      } else {
        newAddons = newAddons.filter((id) => id !== addon_id);

        // Deactivate addon subscription
        await prisma.subscription.updateMany({
          where: {
            tenant_id: req.params.tenant_id,
            type: "addon",
            addon_id,
            is_active: true,
          },
          data: { is_active: false },
        });
      }

      await prisma.tenant.update({
        where: { id: req.params.tenant_id },
        data: { active_addons: newAddons },
      });

      logger.info({ tenant_id: req.params.tenant_id, addon_id, action }, "Add-on toggled");

      return reply.send(apiSuccess({
        active_addons: newAddons,
        message: action === "add" ? `${addon_id} activated` : `${addon_id} removed`,
      }));
    }
  );
}
