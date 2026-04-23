// ─── Plan Tiers ──────────────────────────────────────────────────────────────

export type PlanTier = "free" | "premium" | "allinone";

export const PLAN_PRICES: Record<PlanTier, number> = {
  free: 500,       // ₹0 for first 1 month, then ₹500/month
  premium: 1000,   // ₹1000/month
  allinone: 2500,  // ₹2500/month
};

export const FREE_TRIAL_MONTHS = 1; // free plan is ₹0 for first 1 month, one-time per tenant

export const PLAN_ITEM_LIMITS: Record<PlanTier, number> = {
  free: 200,
  premium: 500,
  allinone: Infinity,
};

export const PLAN_BRANCH_LIMITS: Record<PlanTier, number> = {
  free: 1,
  premium: 3,
  allinone: Infinity,
};

export const PLAN_STAFF_LIMITS: Record<PlanTier, number> = {
  free: 5,
  premium: 20,
  allinone: Infinity,
};

export const COMMISSION_RATES: Record<PlanTier, number> = {
  free: 3,
  premium: 2,
  allinone: 1.5,
};

// ─── Plan Features ───────────────────────────────────────────────────────────
// Which features are included in each plan tier (without add-ons)

export const PLAN_FEATURES: Record<string, PlanTier[]> = {
  // Free plan — catalogue, orders, basic reports
  qrOrdering:         ["free", "premium", "allinone"],
  catalogue:          ["free", "premium", "allinone"],
  orders:             ["free", "premium", "allinone"],
  basicReports:       ["free", "premium", "allinone"],
  kitchenManagement:  ["free", "premium", "allinone"],

  // Premium plan — better analytics, social room, basic inventory, jukebox
  advancedReports:    ["premium", "allinone"],
  advancedDashboards: ["premium", "allinone"],
  revenueReports:     ["premium", "allinone"],
  socialRoom:         ["premium", "allinone"],
  inventory:          ["premium", "allinone"],
  jukebox:            ["premium", "allinone"],
  kds:                ["premium", "allinone"],
  multipleBranches:   ["premium", "allinone"],

  // All-In-One plan — everything
  procurement:        ["allinone"],
  advertising:        ["allinone"],
  customerCRM:        ["allinone"],
  plStatement:        ["allinone"],
  menuAnalytics:      ["allinone"],
  customerInsights:   ["allinone"],
  pdfExport:          ["allinone"],
  excelExport:        ["allinone"],
  loyaltyTiers:       ["allinone"],
  monthlyTab:         ["allinone"],
  farDelivery:        ["allinone"],
};

// ─── Add-On Features ─────────────────────────────────────────────────────────
// Purchasable individually at ₹500/month each, regardless of plan

export interface AddOn {
  id: string;
  name: string;
  description: string;
  price: number;          // paise (50000 = ₹500)
  features: string[];     // feature keys this add-on unlocks
}

export const ADDONS: AddOn[] = [
  {
    id: "social_jukebox",
    name: "Social Room & Jukebox",
    description: "Music queue management, customer song requests via QR, social room for your venue",
    price: 50000,
    features: ["socialRoom", "jukebox"],
  },
  {
    id: "inventory_procurement",
    name: "Inventory & Procurement",
    description: "Ingredient tracking, stock alerts, vendor management, purchase orders, bid system",
    price: 50000,
    features: ["inventory", "procurement"],
  },
  {
    id: "customer_crm",
    name: "Customer CRM",
    description: "Customer insights, loyalty tiers, retention analytics, export tools",
    price: 50000,
    features: ["customerCRM", "customerInsights", "loyaltyTiers"],
  },
  {
    id: "advertising",
    name: "Advertising",
    description: "Ad campaigns, placement engine, venue ad revenue, explore feed promotions",
    price: 50000,
    features: ["advertising"],
  },
];

export const ADDON_IDS = ADDONS.map((a) => a.id);

// ─── Plan Display Info ───────────────────────────────────────────────────────

export interface PlanInfo {
  tier: PlanTier;
  name: string;
  tagline: string;
  price: number;            // monthly price in rupees (after trial)
  trialMonths?: number;     // only for free plan
  highlights: string[];
}

export const PLANS: PlanInfo[] = [
  {
    tier: "free",
    name: "Free",
    tagline: "Get started — free for 1 month",
    price: 500,
    trialMonths: FREE_TRIAL_MONTHS,
    highlights: [
      "QR menu & ordering",
      "Staff & customer POS",
      "Basic reports & analytics",
      "Kitchen management",
      "Up to 200 items, 1 branch, 5 staff",
    ],
  },
  {
    tier: "premium",
    name: "Premium",
    tagline: "Grow your business",
    price: 1000,
    highlights: [
      "Everything in Free",
      "Advanced reports & dashboards",
      "Social Room",
      "Basic Inventory management",
      "Jukebox",
      "KDS support",
      "Up to 500 items, 3 branches, 20 staff",
    ],
  },
  {
    tier: "allinone",
    name: "All-In-One",
    tagline: "Everything, unlimited",
    price: 2500,
    highlights: [
      "Everything in Premium",
      "Procurement & vendor bidding",
      "Advertising engine",
      "Customer CRM & insights",
      "P&L statements, PDF/Excel export",
      "Far delivery (Shiprocket)",
      "Unlimited items, branches, staff",
    ],
  },
];
