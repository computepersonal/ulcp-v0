import { logger } from "../lib/logger";

const DEV_MODE = !process.env.INTERAKT_API_KEY || process.env.DEV_MODE === "true";

function renderTemplate(template: string, data: Record<string, unknown>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    const val = data[key];
    return val !== undefined ? String(val) : `{{${key}}}`;
  });
}

export async function sendWhatsapp(
  to: string,
  template: string,
  data: Record<string, unknown>
): Promise<void> {
  const message = renderTemplate(template, data);

  if (DEV_MODE) {
    logger.info({ to, message, data, channel: "whatsapp" }, "[DEV] WhatsApp notification");
    return;
  }

  // Production: Interakt integration
  // await fetch("https://api.interakt.ai/v1/public/message/", {
  //   method: "POST",
  //   headers: {
  //     Authorization: `Basic ${Buffer.from(process.env.INTERAKT_API_KEY!).toString("base64")}`,
  //     "Content-Type": "application/json",
  //   },
  //   body: JSON.stringify({
  //     countryCode: "+91",
  //     phoneNumber: to,
  //     type: "Template",
  //     template: { name: template, languageCode: "en", bodyValues: Object.values(data) },
  //   }),
  // });
  logger.info({ to }, "WhatsApp sent via Interakt");
}
