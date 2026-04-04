import jwt from "jsonwebtoken";
import { StaffJwtPayload, CustomerJwtPayload } from "@ulcp/shared";

const JWT_SECRET = process.env["JWT_SECRET"] ?? "";
const JWT_CUSTOMER_SECRET = process.env["JWT_CUSTOMER_SECRET"] ?? "";

export function verifyStaffAccessToken(token: string): StaffJwtPayload {
  return jwt.verify(token, JWT_SECRET) as StaffJwtPayload;
}

export function verifyCustomerAccessToken(token: string): CustomerJwtPayload {
  return jwt.verify(token, JWT_CUSTOMER_SECRET) as CustomerJwtPayload;
}
