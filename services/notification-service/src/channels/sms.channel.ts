import { logger } from "../lib/logger";

/**
 * SMS_PROVIDER:
 *   msg91 - real delivery (production). Needs MSG91_AUTH_KEY and MSG91_OTP_TEMPLATE_ID.
 *   log   - nothing is sent; the message is written to the log (local dev only).
 */
export const SMS_PROVIDER = (process.env["SMS_PROVIDER"] ?? "log").toLowerCase();

const MSG91_OTP_URL = "https://control.msg91.com/api/v5/otp";
const TIMEOUT_MS = 8000;

/** Call at start-up: refuse to boot in a half-configured production. */
export function assertSmsConfigured(): void {
  if (SMS_PROVIDER === "msg91") {
    for (const name of ["MSG91_AUTH_KEY", "MSG91_OTP_TEMPLATE_ID"]) {
      if (!process.env[name]) throw new Error(`SMS_PROVIDER=msg91 requires ${name}`);
    }
    logger.info("SMS provider: MSG91");
  } else if (SMS_PROVIDER === "log") {
    logger.warn("SMS_PROVIDER=log: no SMS will be delivered and OTPs are written to this log. Never use in production");
  } else {
    throw new Error(`Unknown SMS_PROVIDER "${SMS_PROVIDER}" (use msg91 or log)`);
  }
}

/** Sends the customer login OTP now (not queued). Throws if the provider did not accept it. */
export async function sendOtpSms(phone: string, otp: string): Promise<void> {
  if (SMS_PROVIDER === "log") {
    logger.warn(`[SMS_PROVIDER=log] OTP for ${phone} is ${otp}`);
    return;
  }

  const mobile = phone.replace(/^\+/, ""); // MSG91 wants country code without "+"
  const url = new URL(MSG91_OTP_URL);
  url.searchParams.set("template_id", process.env["MSG91_OTP_TEMPLATE_ID"] ?? "");
  url.searchParams.set("mobile", mobile);
  url.searchParams.set("otp", otp);

  const res = await fetch(url, {
    method: "POST",
    headers: { authkey: process.env["MSG91_AUTH_KEY"] ?? "", "Content-Type": "application/json" },
    body: "{}",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const body = (await res.json().catch(() => ({}))) as { type?: string; message?: string };
  if (!res.ok || body.type !== "success") {
    throw new Error(`MSG91 rejected the OTP SMS (status ${res.status}, ${body.type ?? "no type"}: ${body.message ?? "no message"})`);
  }
  logger.info("OTP SMS accepted by MSG91");
}

function renderTemplate(template: string, data: Record<string, unknown>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    const val = data[key];
    return val !== undefined ? String(val) : `{{${key}}}`;
  });
}

/**
 * Transactional SMS other than OTP (receipts, alerts). India requires a registered DLT template
 * per message, so there is no free-text sending: with msg91 this fails loudly until templates exist.
 */
export async function sendSms(
  to: string,
  template: string,
  data: Record<string, unknown>
): Promise<void> {
  const message = renderTemplate(template, data);
  if (SMS_PROVIDER === "log") {
    logger.info({ to, message, channel: "sms" }, "[log provider] SMS not sent");
    return;
  }
  throw new Error("Transactional SMS (non-OTP) is not implemented: needs MSG91 DLT templates");
}
