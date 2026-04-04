import jwt from "jsonwebtoken";

const JWT_SECRET = process.env["JWT_SECRET"] ?? "dev_jwt_secret";

export interface PlayerJwtPayload {
  tenant_id: string;
  branch_id: string;
  type: "jukebox_player";
}

export function signPlayerToken(tenant_id: string, branch_id: string): string {
  return jwt.sign(
    { tenant_id, branch_id, type: "jukebox_player" },
    JWT_SECRET,
    { expiresIn: "365d" }
  );
}

export function verifyPlayerToken(token: string): PlayerJwtPayload {
  return jwt.verify(token, JWT_SECRET) as PlayerJwtPayload;
}
