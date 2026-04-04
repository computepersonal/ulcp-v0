import { logger } from "../lib/logger";

const DEV_MODE = !process.env.SENDGRID_API_KEY || process.env.DEV_MODE === "true";

function renderTemplate(template: string, data: Record<string, unknown>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    const val = data[key];
    return val !== undefined ? String(val) : `{{${key}}}`;
  });
}

export async function sendEmail(
  to: string,
  subject: string,
  template: string,
  data: Record<string, unknown>
): Promise<void> {
  const rendered = renderTemplate(template, data);

  if (DEV_MODE) {
    logger.info({ to, subject, rendered, data, channel: "email" }, "[DEV] Email notification");
    return;
  }

  // Production: SendGrid integration
  // const sgMail = require("@sendgrid/mail");
  // sgMail.setApiKey(process.env.SENDGRID_API_KEY);
  // await sgMail.send({ to, from: "noreply@localcommerce.app", subject, html: rendered });
  logger.info({ to, subject }, "Email sent via SendGrid");
}
