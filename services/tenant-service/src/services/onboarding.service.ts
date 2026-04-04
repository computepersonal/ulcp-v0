import { NotFoundError } from "@ulcp/shared";
import { findTenantById, updateTenant } from "../repositories/tenant.repository";
import { redisDel } from "../lib/redis";

type StepData = Record<string, unknown>;

export async function saveWizardStep(
  tenant_id: string,
  step: number,
  data: StepData
) {
  const tenant = await findTenantById(tenant_id);
  if (!tenant) throw new NotFoundError("Tenant not found");

  // Build update based on step
  const update: Record<string, unknown> = {};

  if (step === 1) {
    // Account details — typically already set; name is stored at onboarding
    if (data["name"]) update["name"] = data["name"];
    if (data["phone"]) update["phone"] = data["phone"];
    if (data["email"]) update["email"] = data["email"];
  } else if (step === 2) {
    // Business type
    if (data["business_type"]) update["business_type"] = data["business_type"];
  } else if (step === 3) {
    // Profile
    if (data["name"]) update["name"] = data["name"];
    if (data["slug"]) update["slug"] = data["slug"];
    if (data["logo_url"]) update["logo_url"] = data["logo_url"];
    if (data["cover_url"]) update["cover_url"] = data["cover_url"];
    if (data["address"]) update["address"] = data["address"];
    if (data["gst_registered"] !== undefined) update["gst_registered"] = data["gst_registered"];
    if (data["gstin"]) update["gstin"] = data["gstin"];
  } else if (step === 4) {
    // Catalogue — handled by catalogue-service; nothing to store here
  } else if (step === 5) {
    // Operations — delivery zones / table config handled by respective services
  } else if (step === 6) {
    // Go Live — complete onboarding
  }

  // Advance onboarding_step if this step is >= current
  if (step >= tenant.onboarding_step) {
    update["onboarding_step"] = step + 1;
  }

  const updated = await updateTenant(tenant_id, update);

  // Invalidate tenant config cache
  await redisDel(`tenant:config:${tenant_id}`);

  return updated;
}

export async function getOnboardingState(tenant_id: string) {
  const tenant = await findTenantById(tenant_id);
  if (!tenant) throw new NotFoundError("Tenant not found");

  return {
    tenant_id: tenant.id,
    onboarding_step: tenant.onboarding_step,
    onboarding_completed: tenant.onboarding_completed,
    trial_ends_at: tenant.trial_ends_at,
  };
}

export async function completeOnboarding(tenant_id: string) {
  const tenant = await findTenantById(tenant_id);
  if (!tenant) throw new NotFoundError("Tenant not found");

  const trial_ends_at = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

  const updated = await updateTenant(tenant_id, {
    onboarding_completed: true,
    onboarding_step: 6,
    trial_ends_at,
    // Upgrade to starter for the trial period
    plan: "starter",
  });

  // Invalidate cache
  await redisDel(`tenant:config:${tenant_id}`);

  return updated;
}
