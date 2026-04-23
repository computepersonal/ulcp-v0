/**
 * Fetches tenant config fields from tenant-service.
 * Used to read kot_ack_mode + kot_ack_delay_secs per tenant.
 */
import { logger } from "./logger";
import { redis } from "./redis";

const TENANT_URL = process.env["TENANT_SERVICE_URL"] ?? "http://localhost:3002";
const CACHE_TTL = 1800; // 30 min — same as TENANT_CONFIG_CACHE_TTL_SECS

export interface TenantKotConfig {
  kot_ack_mode: "auto" | "kds" | "printer";
  kot_ack_delay_secs: number;
  plan: string;
}

export async function fetchTenantKotConfig(
  tenantId: string,
  bearerToken: string
): Promise<TenantKotConfig> {
  const cacheKey = `tenant:kot_config:${tenantId}`;
  const cached = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached) as TenantKotConfig;

  try {
    const res = await fetch(`${TENANT_URL}/api/v1/tenants/${tenantId}`, {
      headers: { Authorization: `Bearer ${bearerToken}` },
    });
    if (!res.ok) return defaultConfig();

    const body = (await res.json()) as {
      data?: {
        tenant?: {
          plan?: string;
          kot_ack_mode?: string;
          kot_ack_delay_secs?: number;
        };
      };
    };

    const t = body.data?.tenant;
    const plan = t?.plan ?? "free";

    // Default mode per plan: free → auto, starter/pro → kds
    const defaultMode = plan === "free" ? "auto" : "kds";
    const config: TenantKotConfig = {
      kot_ack_mode: (t?.kot_ack_mode as TenantKotConfig["kot_ack_mode"]) ?? defaultMode,
      kot_ack_delay_secs: t?.kot_ack_delay_secs ?? 60,
      plan,
    };

    await redis.set(cacheKey, JSON.stringify(config), "EX", CACHE_TTL);
    return config;
  } catch (err) {
    logger.warn({ err, tenantId }, "Could not fetch tenant KOT config — using defaults");
    return defaultConfig();
  }
}

export function invalidateTenantKotCache(tenantId: string): Promise<number> {
  return redis.del(`tenant:kot_config:${tenantId}`);
}

function defaultConfig(): TenantKotConfig {
  return { kot_ack_mode: "auto", kot_ack_delay_secs: 60, plan: "free" };
}

/**
 * Update table status in tenant-service (internal call).
 * Used when a dine-in order is placed to mark the table as occupied.
 */
export async function updateTableStatus(
  tenantId: string,
  branchId: string,
  tableId: string,
  status: string
): Promise<void> {
  const secret = process.env["INTERNAL_API_SECRET"];
  if (!secret) {
    logger.warn("INTERNAL_API_SECRET not set — cannot update table status");
    return;
  }

  try {
    const res = await fetch(
      `${TENANT_URL}/api/v1/tenants/${tenantId}/branches/${branchId}/tables/${tableId}/status`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "X-Internal-Secret": secret,
        },
        body: JSON.stringify({ status }),
      }
    );
    if (!res.ok) {
      logger.warn({ tenantId, tableId, status, httpStatus: res.status }, "Failed to update table status");
    }
  } catch (err) {
    logger.warn({ err, tenantId, tableId }, "Error updating table status");
  }
}
