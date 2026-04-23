import { PLAN_FEATURES, ADDONS, PlanTier } from "../constants/plans";

/**
 * Check if a feature is available for a given plan + active add-ons.
 * @param plan      The tenant's current plan tier
 * @param feature   Feature key to check (e.g. "inventory", "socialRoom")
 * @param addons    Array of active add-on IDs (e.g. ["social_jukebox", "inventory_procurement"])
 */
export function hasFeature(
  plan: PlanTier,
  feature: string,
  addons: string[] = []
): boolean {
  // Check if plan includes the feature
  const allowedPlans = PLAN_FEATURES[feature];
  if (allowedPlans && allowedPlans.includes(plan)) return true;

  // Check if any active add-on unlocks the feature
  for (const addonId of addons) {
    const addon = ADDONS.find((a) => a.id === addonId);
    if (addon && addon.features.includes(feature)) return true;
  }

  return false;
}

/**
 * Throws if the feature is not available for the plan + add-ons.
 */
export function assertFeature(
  plan: PlanTier,
  feature: string,
  addons: string[] = []
): void {
  if (!hasFeature(plan, feature, addons)) {
    throw new Error(
      `Feature "${feature}" is not available on the ${plan} plan. Please upgrade or purchase the add-on.`
    );
  }
}
