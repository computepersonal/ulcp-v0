import jwt from "jsonwebtoken";
import { StaffJwtPayload, CustomerJwtPayload, KdsJwtPayload } from "@ulcp/shared";

const JWT_SECRET = process.env["JWT_SECRET"] ?? "";
const JWT_CUSTOMER_SECRET = process.env["JWT_CUSTOMER_SECRET"] ?? "";
const JWT_KDS_SECRET = process.env["JWT_KDS_SECRET"] ?? "";

export function verifyStaffAccessToken(token: string): StaffJwtPayload {
  return jwt.verify(token, JWT_SECRET) as StaffJwtPayload;
}

export function verifyCustomerAccessToken(token: string): CustomerJwtPayload {
  return jwt.verify(token, JWT_CUSTOMER_SECRET) as CustomerJwtPayload;
}

export function verifyKdsAccessToken(token: string): KdsJwtPayload {
  return jwt.verify(token, JWT_KDS_SECRET) as KdsJwtPayload;
}
