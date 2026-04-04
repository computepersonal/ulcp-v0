import { PLAN_FEATURES, PlanTier } from "../constants/plans";

export function hasFeature(plan: PlanTier, feature: string): boolean {
  const allowedPlans = PLAN_FEATURES[feature];
  if (!allowedPlans) return false;
  return allowedPlans.includes(plan);
}

export function assertFeature(plan: PlanTier, feature: string): void {
  if (!hasFeature(plan, feature)) {
    throw new Error(
      `Feature "${feature}" is not available on the ${plan} plan. Please upgrade.`
    );
  }
}
