import crypto from "crypto";
import { prisma } from "../lib/prisma";

const OTP_EXPIRY_MINS = 5;
const MAX_ATTEMPTS = 5;

function hashOtp(otp: string): string {
  return crypto.createHash("sha256").update(otp).digest("hex");
}

export async function storeOtp(mobile: string, otp: string): Promise<void> {
  // Invalidate any existing OTPs for this mobile
  await prisma.otpCode.updateMany({
    where: { mobile, is_used: false },
    data: { is_used: true },
  });

  const expires_at = new Date(Date.now() + OTP_EXPIRY_MINS * 60 * 1000);
  await prisma.otpCode.create({
    data: { mobile, otp_hash: hashOtp(otp), expires_at },
  });
}

export async function verifyOtp(
  mobile: string,
  otp: string
): Promise<boolean> {
  const otp_hash = hashOtp(otp);
  const record = await prisma.otpCode.findFirst({
    where: {
      mobile,
      is_used: false,
      expires_at: { gt: new Date() },
      attempts: { lt: MAX_ATTEMPTS },
    },
    orderBy: { created_at: "desc" },
  });

  if (!record) return false;

  if (record.otp_hash !== otp_hash) {
    await prisma.otpCode.update({
      where: { id: record.id },
      data: { attempts: { increment: 1 } },
    });
    return false;
  }

  await prisma.otpCode.update({
    where: { id: record.id },
    data: { is_used: true },
  });
  return true;
}
