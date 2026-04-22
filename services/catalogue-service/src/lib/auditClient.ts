/**
 * Fire-and-forget audit log client.
 * Calls tenant-service internal endpoint — never blocks the main request.
 */
import { logger } from "./logger";

const TENANT_URL = process.env["TENANT_SERVICE_URL"] ?? "http://localhost:3002";
const INTERNAL_SECRET = process.env["INTERNAL_API_SECRET"] ?? "";

export interface AuditLogPayload {
  tenant_id: string;
  branch_id?: string;
  actor_id: string;
  actor_name?: string;
  actor_role: string;
  action: string;         // e.g. "item.created", "item.deleted"
  entity_type: string;    // e.g. "item", "section"
  entity_id: string;
  entity_name: string;
  metadata?: Record<string, unknown>;
}

export function auditLog(payload: AuditLogPayload): void {
  // Fire-and-forget — never await, never throws
  fetch(`${TENANT_URL}/api/v1/tenants/internal/audit-logs`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-internal-secret": INTERNAL_SECRET,
    },
    body: JSON.stringify(payload),
  }).catch((err: unknown) => {
    logger.warn({ err, action: payload.action }, "Audit log failed (non-fatal)");
  });
}
