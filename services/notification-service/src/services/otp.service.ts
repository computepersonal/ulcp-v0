import crypto from "crypto";
import { redis } from "../lib/redis";
import { logger } from "../lib/logger";
import { notificationQueue } from "../lib/queue";

const DEV_MODE = process.env.DEV_MODE === "true";
const OTP_EXPIRY_SECS = 300; // 5 minutes
const MAX_ATTEMPTS = 5;
const RATE_LIMIT_MAX = 3;
const RATE_LIMIT_WINDOW_SECS = 3600; // 1 hour

export function generateOtp(): string {
  // Cryptographically secure 6-digit OTP
  const bytes = crypto.randomBytes(3);
  const num = ((bytes[0] << 16) | (bytes[1] << 8) | bytes[2]) % 1_000_000;
  return num.toString().padStart(6, "0");
}

function hashOtp(otp: string): string {
  return crypto.createHash("sha256").update(otp).digest("hex");
}

export async function sendOtp(
  phone: string,
  tenantId: string
): Promise<{ success: boolean; message: string }> {
  // Rate limit: max 3 OTP requests per hour per phone
  const rateLimitKey = `otp:ratelimit:${phone}`;
  const count = await redis.incr(rateLimitKey);

  if (count === 1) {
    // Set expiry only on first hit
    await redis.expire(rateLimitKey, RATE_LIMIT_WINDOW_SECS);
  }

  if (count > RATE_LIMIT_MAX) {
    logger.warn({ phone, count }, "OTP rate limit exceeded");
    return { success: false, message: "Too many OTP requests. Please wait before trying again." };
  }

  const otp = generateOtp();
  const hash = hashOtp(otp);

  const otpKey = `otp:${phone}:${tenantId}`;
  const attemptsKey = `otp:attempts:${phone}:${tenantId}`;

  // Store hash with expiry
  await redis.set(otpKey, hash, "EX", OTP_EXPIRY_SECS);
  // Reset attempts counter
  await redis.set(attemptsKey, "0", "EX", OTP_EXPIRY_SECS);

  if (DEV_MODE) {
    logger.info(
      { phone, otp, tenant_id: tenantId, message: "[DEV] OTP for testing" },
      "[DEV] OTP generated"
    );
  }

  // Queue SMS job (fire-and-forget)
  await notificationQueue.add("otp-sms", {
    type: "sms",
    to: phone,
    template: "Your verification code is {{otp}}. Valid for 5 minutes.",
    data: { otp },
    tenant_id: tenantId,
  });

  return { success: true, message: DEV_MODE ? "OTP sent (check logs in dev mode)" : "OTP sent" };
}

export async function verifyOtp(
  phone: string,
  otp: string,
  tenantId: string
): Promise<{ verified: boolean; message: string }> {
  const otpKey = `otp:${phone}:${tenantId}`;
  const attemptsKey = `otp:attempts:${phone}:${tenantId}`;

  const storedHash = await redis.get(otpKey);
  if (!storedHash) {
    return { verified: false, message: "OTP expired or not found" };
  }

  // Increment attempt counter
  const attempts = await redis.incr(attemptsKey);
  if (attempts > MAX_ATTEMPTS) {
    // Invalidate OTP
    await redis.del(otpKey);
    logger.warn({ phone, attempts }, "OTP max attempts exceeded, invalidated");
    return { verified: false, message: "Too many failed attempts. Request a new OTP." };
  }

  const inputHash = hashOtp(otp);

  // Constant-time comparison to prevent timing attacks
  const storedBuffer = Buffer.from(storedHash, "utf8");
  const inputBuffer = Buffer.from(inputHash, "utf8");

  if (storedBuffer.length !== inputBuffer.length) {
    return { verified: false, message: "Invalid OTP" };
  }

  const isValid = crypto.timingSafeEqual(storedBuffer, inputBuffer);

  if (!isValid) {
    logger.debug({ phone, attempts }, "OTP verification failed");
    return { verified: false, message: "Invalid OTP" };
  }

  // Delete OTP on success (one-time use)
  await redis.del(otpKey);
  await redis.del(attemptsKey);

  logger.info({ phone, tenant_id: tenantId }, "OTP verified successfully");
  return { verified: true, message: "OTP verified" };
}
