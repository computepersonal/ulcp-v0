import type { Permission } from "../constants/permissions";
import type { Role } from "../constants/roles";

export interface StaffJwtPayload {
  user_id: string;
  tenant_id: string | null; // null for pending_onboarding users (no tenant yet)
  role: Role;
  permissions: Permission[];
  branch_id?: string;
  is_partner?: boolean;
  iat?: number;
  exp?: number;
}

export interface CustomerJwtPayload {
  customer_id: string;
  iat?: number;
  exp?: number;
}

export interface KdsJwtPayload {
  device_id: string;
  tenant_id: string;
  branch_id: string;
  station: "kitchen" | "bar";
  iat?: number;
  exp?: number;
}

export interface PinUnlockJwtPayload {
  user_id: string;
  tenant_id: string;
  branch_id: string;
  permissions: ["orders:create"];
  iat?: number;
  exp?: number;
}

export type AnyJwtPayload =
  | StaffJwtPayload
  | CustomerJwtPayload
  | KdsJwtPayload
  | PinUnlockJwtPayload;

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

export function apiSuccess<T>(data: T): ApiResponse<T> {
  return { success: true, data };
}

export function apiError(error: string): ApiResponse<never> {
  return { success: false, error };
}
