import jwt from "jsonwebtoken";
import { StaffJwtPayload } from "@ulcp/shared";

const JWT_SECRET = process.env["JWT_SECRET"] ?? "";

export function verifyStaffAccessToken(token: string): StaffJwtPayload {
  return jwt.verify(token, JWT_SECRET) as StaffJwtPayload;
}
