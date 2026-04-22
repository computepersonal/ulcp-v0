/**
 * Internal HTTP client for tenant-service.
 * Used to fetch tenant plan for item limit enforcement.
 */
import { logger } from "./logger";
import { redisGet, redisSet } from "./redis";

const TENANT_URL = process.env["TENANT_SERVICE_URL"] ?? "http://localhost:3002";
const INTERNAL_SECRET = process.env["INTERNAL_API_SECRET"] ?? "";
const PLAN_CACHE_TTL = 300; // 5 min — plan rarely changes

const DEFAULT_BRANCH_CACHE_TTL = 1800; // 30 min — primary branch rarely changes

export async function fetchDefaultBranchId(
  tenantId: string,
  bearerToken?: string
): Promise<string | null> {
  const cacheKey = `tenant:default_branch:${tenantId}`;
  const cached = await redisGet(cacheKey);
  if (cached) return cached;

  try {
    // Use internal secret so this works for both authenticated and public (customer) requests
    const headers: Record<string, string> = { "x-internal-secret": INTERNAL_SECRET };
    if (bearerToken) headers["Authorization"] = `Bearer ${bearerToken}`;

    const res = await fetch(`${TENANT_URL}/api/v1/tenants/${tenantId}/branches`, { headers });
    if (!res.ok) return null;
    const body = (await res.json()) as {
      data?: { branches?: Array<{ id: string; is_primary: boolean }> };
    };
    const branches = body.data?.branches ?? [];
    const primary = branches.find((b) => b.is_primary) ?? branches[0];
    if (!primary) return null;
    await redisSet(cacheKey, primary.id, DEFAULT_BRANCH_CACHE_TTL);
    return primary.id;
  } catch (err) {
    logger.warn({ err, tenantId }, "Could not fetch default branch");
    return null;
  }
}

export async function fetchTenantOnboardingCompleted(
  tenantId: string
): Promise<boolean> {
  const cacheKey = `tenant:onboarding_completed:${tenantId}`;
  const cached = await redisGet(cacheKey);
  if (cached !== null) return cached === "true";

  try {
    const res = await fetch(`${TENANT_URL}/api/v1/tenants/${tenantId}`, {
      headers: { "x-internal-secret": INTERNAL_SECRET },
    });
    if (!res.ok) return false;
    const body = (await res.json()) as {
      data?: { tenant?: { onboarding_completed?: boolean } };
    };
    const completed = body.data?.tenant?.onboarding_completed ?? false;
    // Cache for 5 min — once completed it stays completed; short TTL handles the moment it flips
    await redisSet(cacheKey, String(completed), 300);
    return completed;
  } catch (err) {
    logger.warn({ err, tenantId }, "Could not fetch tenant onboarding status");
    return false;
  }
}

export async function fetchTenantPlan(
  tenantId: string,
  bearerToken: string
): Promise<string> {
  const cacheKey = `tenant:plan:${tenantId}`;
  const cached = await redisGet(cacheKey);
  if (cached) return cached;

  try {
    const res = await fetch(`${TENANT_URL}/api/v1/tenants/${tenantId}`, {
      headers: { Authorization: `Bearer ${bearerToken}` },
    });
    if (!res.ok) return "free"; // safe default
    const body = (await res.json()) as { data?: { tenant?: { plan?: string } } };
    const plan = body.data?.tenant?.plan ?? "free";
    await redisSet(cacheKey, plan, PLAN_CACHE_TTL);
    return plan;
  } catch (err) {
    logger.warn({ err, tenantId }, "Could not fetch tenant plan — defaulting to free");
    return "free";
  }
}
