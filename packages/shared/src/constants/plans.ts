export const PLAN_PRICES = { free: 0, starter: 999, pro: 2499 } as const;
export const PLAN_ITEM_LIMITS = {
  free: 200,
  starter: 500,
  pro: Infinity,
} as const;
export const PLAN_BRANCH_LIMITS = {
  free: 1,
  starter: 3,
  pro: Infinity,
} as const;
export const PLAN_STAFF_LIMITS = {
  free: 5,
  starter: 20,
  pro: Infinity,
} as const;
export const COMMISSION_RATES = {
  free: 3,
  starter: 2,
  pro: 1.5,
} as const;

export type PlanTier = "free" | "starter" | "pro" | "enterprise";

export const PLAN_FEATURES: Record<string, PlanTier[]> = {
  qrOrdering: ["free", "starter", "pro", "enterprise"],
  inventory: ["starter", "pro", "enterprise"],
  kitchenManagement: ["starter", "pro", "enterprise"],
  farDelivery: ["starter", "pro", "enterprise"],
  multipleBranches: ["starter", "pro", "enterprise"],
  advancedDashboards: ["pro", "enterprise"],
  revenueReports: ["pro", "enterprise"],
  plStatement: ["pro", "enterprise"],
  menuAnalytics: ["pro", "enterprise"],
  customerInsights: ["pro", "enterprise"],
  pdfExport: ["pro", "enterprise"],
  excelExport: ["pro", "enterprise"],
  loyaltyTiers: ["pro", "enterprise"],
  kds: ["pro", "enterprise"],
  monthlyTab: ["pro", "enterprise"],
};
