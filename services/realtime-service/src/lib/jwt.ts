import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET ?? "dev_jwt_secret";
const JWT_CUSTOMER_SECRET = process.env.JWT_CUSTOMER_SECRET ?? "";
const JWT_KDS_SECRET = process.env.JWT_KDS_SECRET ?? "";

export interface TokenPayload {
  user_id?: string;
  tenant_id?: string;
  branch_id?: string;
  role: string;
  customer_id?: string;
  // KDS device fields
  device_id?: string;
  station?: string;
}

export function verifyToken(token: string): TokenPayload | null {
  // Try staff JWT
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as Record<string, unknown>;
    return {
      user_id: typeof decoded.user_id === "string" ? decoded.user_id : undefined,
      tenant_id: typeof decoded.tenant_id === "string" ? decoded.tenant_id : undefined,
      branch_id: typeof decoded.branch_id === "string" ? decoded.branch_id : undefined,
      role: typeof decoded.role === "string" ? decoded.role : "unknown",
      customer_id: typeof decoded.customer_id === "string" ? decoded.customer_id : undefined,
    };
  } catch { /* not a staff token */ }

  // Try customer JWT
  try {
    const decoded = jwt.verify(token, JWT_CUSTOMER_SECRET) as Record<string, unknown>;
    if (typeof decoded.customer_id === "string") {
      return { customer_id: decoded.customer_id, role: "customer" };
    }
  } catch { /* not a customer token */ }

  // Try KDS JWT
  try {
    const decoded = jwt.verify(token, JWT_KDS_SECRET) as Record<string, unknown>;
    if (typeof decoded.device_id === "string") {
      return {
        device_id: decoded.device_id,
        tenant_id: typeof decoded.tenant_id === "string" ? decoded.tenant_id : undefined,
        branch_id: typeof decoded.branch_id === "string" ? decoded.branch_id : undefined,
        station:   typeof decoded.station === "string" ? decoded.station : undefined,
        role: "kds_device",
      };
    }
  } catch { /* not a KDS token */ }

  return null;
}
