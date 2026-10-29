import { logger } from "../lib/logger";

const DEV_MODE = !process.env.FIREBASE_PROJECT_ID || process.env.DEV_MODE === "true";

function renderTemplate(template: string, data: Record<string, unknown>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    const val = data[key];
    return val !== undefined ? String(val) : `{{${key}}}`;
  });
}

export async function sendPush(
  to: string,
  template: string,
  data: Record<string, unknown>
): Promise<void> {
  const body = renderTemplate(template, data);

  if (DEV_MODE) {
    logger.info({ to, body, data, channel: "push" }, "[DEV] Push notification");
    return;
  }

  // Production: Firebase FCM integration
  // const admin = require("firebase-admin");
  // await admin.messaging().send({
  //   token: to,
  //   notification: { title: data.title as string, body },
  //   data: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)])),
  // });
  throw new Error("push delivery via FCM is not implemented in V0");
}
