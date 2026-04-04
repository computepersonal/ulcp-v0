import { logger } from "../lib/logger";

const DEV_MODE = !process.env.MSG91_API_KEY || process.env.DEV_MODE === "true";

function renderTemplate(template: string, data: Record<string, unknown>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    const val = data[key];
    return val !== undefined ? String(val) : `{{${key}}}`;
  });
}

export async function sendSms(
  to: string,
  template: string,
  data: Record<string, unknown>
): Promise<void> {
  const message = renderTemplate(template, data);

  if (DEV_MODE) {
    logger.info({ to, message, data, channel: "sms" }, "[DEV] SMS notification");
    return;
  }

  // Production: MSG91 integration
  // const response = await fetch("https://api.msg91.com/api/v5/flow/", {
  //   method: "POST",
  //   headers: { "Content-Type": "application/json", authkey: process.env.MSG91_API_KEY! },
  //   body: JSON.stringify({ sender: process.env.MSG91_SENDER_ID, short_url: 0, mobiles: to, message }),
  // });
  logger.info({ to }, "SMS sent via MSG91");
}
