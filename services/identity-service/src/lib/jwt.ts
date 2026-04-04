import jwt from "jsonwebtoken";
import {
  StaffJwtPayload,
  CustomerJwtPayload,
  KdsJwtPayload,
  PinUnlockJwtPayload,
} from "@ulcp/shared";

const JWT_SECRET = process.env["JWT_SECRET"] ?? "";
const JWT_REFRESH_SECRET = process.env["JWT_REFRESH_SECRET"] ?? "";
const JWT_CUSTOMER_SECRET = process.env["JWT_CUSTOMER_SECRET"] ?? "";
const JWT_KDS_SECRET = process.env["JWT_KDS_SECRET"] ?? "";

const ACCESS_EXPIRES = process.env["JWT_ACCESS_EXPIRES_IN"] ?? "15m";
const REFRESH_EXPIRES = process.env["JWT_REFRESH_EXPIRES_IN"] ?? "30d";
const CUSTOMER_EXPIRES = process.env["JWT_CUSTOMER_EXPIRES_IN"] ?? "30d";
const KDS_EXPIRES = process.env["JWT_KDS_EXPIRES_IN"] ?? "365d";
const PIN_UNLOCK_EXPIRES = process.env["JWT_PIN_UNLOCK_EXPIRES_IN"] ?? "30m";

export function signStaffAccessToken(payload: Omit<StaffJwtPayload, "iat" | "exp">): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: ACCESS_EXPIRES } as jwt.SignOptions);
}

export function signStaffRefreshToken(user_id: string): string {
  return jwt.sign({ user_id }, JWT_REFRESH_SECRET, {
    expiresIn: REFRESH_EXPIRES,
  } as jwt.SignOptions);
}

export function verifyStaffAccessToken(token: string): StaffJwtPayload {
  return jwt.verify(token, JWT_SECRET) as StaffJwtPayload;
}

export function verifyStaffRefreshToken(token: string): { user_id: string } {
  return jwt.verify(token, JWT_REFRESH_SECRET) as { user_id: string };
}

export function signCustomerToken(customer_id: string): string {
  return jwt.sign({ customer_id }, JWT_CUSTOMER_SECRET, {
    expiresIn: CUSTOMER_EXPIRES,
  } as jwt.SignOptions);
}

export function verifyCustomerToken(token: string): CustomerJwtPayload {
  return jwt.verify(token, JWT_CUSTOMER_SECRET) as CustomerJwtPayload;
}

export function signKdsToken(
  payload: Omit<KdsJwtPayload, "iat" | "exp">
): string {
  return jwt.sign(payload, JWT_KDS_SECRET, { expiresIn: KDS_EXPIRES } as jwt.SignOptions);
}

export function verifyKdsToken(token: string): KdsJwtPayload {
  return jwt.verify(token, JWT_KDS_SECRET) as KdsJwtPayload;
}

export function signPinUnlockToken(
  payload: Omit<PinUnlockJwtPayload, "iat" | "exp">
): string {
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: PIN_UNLOCK_EXPIRES,
  } as jwt.SignOptions);
}
