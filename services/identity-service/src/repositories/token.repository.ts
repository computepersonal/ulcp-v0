import crypto from "crypto";
import { prisma } from "../lib/prisma";

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export async function storeRefreshToken(
  user_id: string,
  token: string,
  ttlDays = 30
): Promise<void> {
  const token_hash = hashToken(token);
  const expires_at = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);
  await prisma.refreshToken.create({ data: { user_id, token_hash, expires_at } });
}

export async function findAndDeleteRefreshToken(
  token: string
): Promise<string | null> {
  const token_hash = hashToken(token);
  const record = await prisma.refreshToken.findUnique({ where: { token_hash } });
  if (!record) return null;
  if (record.expires_at < new Date()) {
    await prisma.refreshToken.delete({ where: { token_hash } });
    return null;
  }
  await prisma.refreshToken.delete({ where: { token_hash } });
  return record.user_id;
}

export async function deleteAllUserRefreshTokens(user_id: string): Promise<void> {
  await prisma.refreshToken.deleteMany({ where: { user_id } });
}
