import { logger } from "../lib/logger";

const NOTIFICATION_URL = process.env["NOTIFICATION_SERVICE_URL"] ?? "http://localhost:3007";
const INTERNAL_SECRET = process.env["INTERNAL_API_SECRET"] ?? "";
const TIMEOUT_MS = 8000;

/**
 * Hands the OTP to notification-service, which sends the SMS. Throws if it could not be sent,
 * so the caller can tell the customer instead of pretending the code is on its way.
 * The OTP itself is never logged here (only the notification-service "log" provider prints it).
 */
export async function deliverOtpSms(phone: string, otp: string): Promise<void> {
  const res = await fetch(`${NOTIFICATION_URL}/api/v1/notify/otp/sms`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-internal-secret": INTERNAL_SECRET },
    body: JSON.stringify({ phone, otp }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) {
    logger.error({ status: res.status }, "notification-service refused the OTP SMS");
    throw new Error(`OTP SMS not sent (notification-service status ${res.status})`);
  }
}
