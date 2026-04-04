/**
 * Internal HTTP client for identity-service.
 *
 * All calls use X-Internal-Secret — never exposed through Kong.
 *
 * user.email   → personal login credential (authentication only)
 * tenant.email → business contact (receipts, invoices, GST)
 * These are intentionally separate and never validated against each other.
 */

import { logger } from "./logger";

const IDENTITY_URL = process.env["IDENTITY_SERVICE_URL"] ?? "http://localhost:3001";
const INTERNAL_SECRET = process.env["INTERNAL_API_SECRET"] ?? "";

const headers = {
  "Content-Type": "application/json",
  "X-Internal-Secret": INTERNAL_SECRET,
};

export interface OwnerDetails {
  user_id: string;
  name: string;
  email: string;
  mobile: string | null;
}

/** Fetch minimal owner profile for embedding in tenant responses. */
export async function fetchOwnerDetails(userId: string): Promise<OwnerDetails | null> {
  try {
    const res = await fetch(`${IDENTITY_URL}/api/v1/auth/users/${userId}`, { headers });
    if (!res.ok) return null;
    const body = await res.json() as { success: boolean; data?: { user?: OwnerDetails } };
    return body.data?.user ?? null;
  } catch (err) {
    logger.warn({ err, userId }, "Could not fetch owner details from identity-service");
    return null;
  }
}

/** Update a user's tenant_id and role after tenant creation or transfer. */
export async function assignUserTenant(
  userId: string,
  tenant_id: string,
  role: string
): Promise<void> {
  const res = await fetch(`${IDENTITY_URL}/api/v1/auth/users/${userId}/tenant`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ tenant_id, role }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`identity-service PATCH /users/${userId}/tenant → ${res.status}: ${text}`);
  }
}

/** Update only a user's role (used during ownership transfer). */
export async function updateUserRole(userId: string, role: string): Promise<void> {
  const res = await fetch(`${IDENTITY_URL}/api/v1/auth/users/${userId}/role`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ role }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`identity-service PATCH /users/${userId}/role → ${res.status}: ${text}`);
  }
}
