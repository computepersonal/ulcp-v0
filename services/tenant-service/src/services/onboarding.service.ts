import { AppError, NotFoundError } from "@ulcp/shared";
import { findTenantById, updateTenant } from "../repositories/tenant.repository";
import { createShiftTemplate, findShiftTemplates } from "../repositories/shift.repository";
import { redisDel } from "../lib/redis";
import { logger } from "../lib/logger";
import { z } from "zod";

// ─── Step validation schemas ─────────────────────────────────────────────────

const step1Schema = z.object({
  name: z.string().min(1, "Name is required").optional(),
  phone: z.string().optional(),
  email: z.string().email("Invalid email").optional(),
});

const step2Schema = z.object({
  business_type: z.string().min(1, "Business type is required"),
});

const step3Schema = z.object({
  name: z.string().min(1, "Business name is required"),
  slug: z.string().min(1, "Slug is required").optional(),
  logo_url: z.string().optional(),
  cover_url: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  phone: z.string().optional(),
  gst_registered: z.boolean().optional(),
  gstin: z.string().optional(),
});

const step4Schema = z.object({
  // Catalogue step — validated by checking catalogue-service has items
  // The frontend should send confirmation that at least 1 item was added
  confirmed: z.boolean().optional(),
});

const step5Schema = z.object({
  // Operations step — tables or delivery config
  // Frontend confirms at least basic config was done
  confirmed: z.boolean().optional(),
});

const step6Schema = z.object({
  // Staff invite step — optional confirmation
  confirmed: z.boolean().optional(),
});

const step7Schema = z.object({
  // Go Live — nothing to validate, just confirmation
});

const STEP_SCHEMAS: Record<number, z.ZodSchema> = {
  1: step1Schema,
  2: step2Schema,
  3: step3Schema,
  4: step4Schema,
  5: step5Schema,
  6: step6Schema,
  7: step7Schema,
};

// ─── Setup tasks (post-onboarding checklist) ─────────────────────────────────

export interface SetupTasks {
  catalogue: boolean;
  tables: boolean;
  staff: boolean;
  qr: boolean;
}

const DEFAULT_SETUP_TASKS: SetupTasks = {
  catalogue: false,
  tables: false,
  staff: false,
  qr: false,
};

type StepData = Record<string, unknown>;

// ─── Save wizard step with validation ────────────────────────────────────────

export async function saveWizardStep(
  tenant_id: string,
  step: number,
  data: StepData
) {
  const tenant = await findTenantById(tenant_id);
  if (!tenant) throw new NotFoundError("Tenant not found");

  // Validate step data against schema
  const schema = STEP_SCHEMAS[step];
  if (schema) {
    const result = schema.safeParse(data);
    if (!result.success) {
      const msg = result.error.issues.map((i) => i.message).join(", ");
      throw new AppError(msg, 400);
    }
  }

  // Don't allow skipping steps — must complete in order
  if (step > tenant.onboarding_step + 1) {
    throw new AppError(`Cannot skip to step ${step}. Complete step ${tenant.onboarding_step} first.`, 400);
  }

  // Build update based on step
  const update: Record<string, unknown> = {};

  if (step === 1) {
    if (data["name"]) update["name"] = data["name"];
    if (data["phone"]) update["phone"] = data["phone"];
    if (data["email"]) update["email"] = data["email"];
  } else if (step === 2) {
    if (!data["business_type"]) {
      throw new AppError("Business type is required", 400);
    }
    update["business_type"] = data["business_type"];
  } else if (step === 3) {
    if (data["name"]) update["name"] = data["name"];
    if (data["slug"]) update["slug"] = data["slug"];
    if (data["logo_url"]) update["logo_url"] = data["logo_url"];
    if (data["cover_url"]) update["cover_url"] = data["cover_url"];
    if (data["address"]) update["address"] = data["address"];
    if (data["city"]) update["city"] = data["city"];
    if (data["state"]) update["state"] = data["state"];
    if (data["phone"]) update["phone"] = data["phone"];
    if (data["gst_registered"] !== undefined) update["gst_registered"] = data["gst_registered"];
    if (data["gstin"]) update["gstin"] = data["gstin"];
  }
  // Steps 4, 5, 6 — handled by respective services (catalogue, tables/delivery)
  // We just advance the step counter

  // Advance onboarding_step if this step is >= current
  if (step >= tenant.onboarding_step) {
    update["onboarding_step"] = step + 1;
  }

  const updated = await updateTenant(tenant_id, update);

  // Invalidate tenant config cache
  await redisDel(`tenant:config:${tenant_id}`);

  return updated;
}

// ─── Get onboarding state (richer response) ──────────────────────────────────

export async function getOnboardingState(tenant_id: string) {
  const tenant = await findTenantById(tenant_id);
  if (!tenant) throw new NotFoundError("Tenant not found");

  const setupTasks = (tenant.setup_tasks as SetupTasks | null) ?? DEFAULT_SETUP_TASKS;

  return {
    tenant_id: tenant.id,
    name: tenant.name,
    business_type: tenant.business_type,
    slug: tenant.slug,
    onboarding_step: tenant.onboarding_step,
    onboarding_completed: tenant.onboarding_completed,
    setup_tasks: setupTasks,
    plan: tenant.plan,
    trial_ends_at: tenant.trial_ends_at,
  };
}

// ─── Complete onboarding (with pre-flight check) ─────────────────────────────

export async function completeOnboarding(tenant_id: string) {
  const tenant = await findTenantById(tenant_id);
  if (!tenant) throw new NotFoundError("Tenant not found");

  if (tenant.onboarding_completed) {
    return tenant; // Already completed — idempotent
  }

  // Must have completed at minimum steps 1-3 (account, type, profile)
  // Steps 4-6 are optional but encouraged
  if (tenant.onboarding_step < 3) {
    throw new AppError(
      "Cannot complete onboarding. Please complete at least: business type selection and business profile.",
      400
    );
  }

  // Must have a business_type set
  if (!tenant.business_type) {
    throw new AppError("Business type must be selected before completing onboarding", 400);
  }

  // Grant one-time 1-month free trial on onboarding completion
  const trial_ends_at = new Date();
  trial_ends_at.setMonth(trial_ends_at.getMonth() + 1);

  const updated = await updateTenant(tenant_id, {
    onboarding_completed: true,
    onboarding_step: Math.max(tenant.onboarding_step, 6),
    trial_ends_at,
    free_trial_used: true,
    plan: "free",
    // Initialize setup tasks
    setup_tasks: DEFAULT_SETUP_TASKS,
  });

  // Seed default shift templates (fire-and-forget)
  void seedDefaultShiftTemplates(tenant_id);

  // Invalidate cache
  await redisDel(`tenant:config:${tenant_id}`);

  return updated;
}

// ─── Seed default shift templates ────────────────────────────────────────────

async function seedDefaultShiftTemplates(tenant_id: string) {
  try {
    const existing = await findShiftTemplates(tenant_id);
    if (existing.length > 0) return; // already has shifts

    await Promise.all([
      createShiftTemplate({
        tenant_id,
        name: "Morning Shift",
        start_time: "09:00",
        end_time: "16:00",
        break_mins: 30,
        color: "#F59E0B",
      }),
      createShiftTemplate({
        tenant_id,
        name: "Evening Shift",
        start_time: "18:00",
        end_time: "23:00",
        break_mins: 15,
        color: "#6366F1",
      }),
    ]);
  } catch (err) {
    logger.error(err, "Failed to seed default shift templates");
  }
}

// ─── Setup tasks (post-onboarding checklist, server-persisted) ───────────────

export async function getSetupTasks(tenant_id: string): Promise<SetupTasks> {
  const tenant = await findTenantById(tenant_id);
  if (!tenant) throw new NotFoundError("Tenant not found");
  return (tenant.setup_tasks as SetupTasks | null) ?? DEFAULT_SETUP_TASKS;
}

export async function markSetupTaskDone(
  tenant_id: string,
  task_id: keyof SetupTasks
): Promise<SetupTasks> {
  const tenant = await findTenantById(tenant_id);
  if (!tenant) throw new NotFoundError("Tenant not found");

  const validTasks: Array<keyof SetupTasks> = ["catalogue", "tables", "staff", "qr"];
  if (!validTasks.includes(task_id)) {
    throw new AppError(`Invalid task: ${task_id}`, 400);
  }

  const current = (tenant.setup_tasks as SetupTasks | null) ?? DEFAULT_SETUP_TASKS;
  const updated: SetupTasks = { ...current, [task_id]: true };

  await updateTenant(tenant_id, { setup_tasks: updated });
  await redisDel(`tenant:config:${tenant_id}`);

  return updated;
}
