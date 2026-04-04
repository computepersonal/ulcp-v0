import { Job } from "bullmq";
import { NotificationJobData } from "../lib/queue";
import { sendEmail } from "../channels/email.channel";
import { sendSms } from "../channels/sms.channel";
import { sendPush } from "../channels/push.channel";
import { sendWhatsapp } from "../channels/whatsapp.channel";
import { logger } from "../lib/logger";

export async function processJob(job: Job<NotificationJobData>): Promise<void> {
  const { type, to, subject, template, data } = job.data;

  logger.debug({ job_id: job.id, type, to }, "Processing notification job");

  switch (type) {
    case "email":
      await sendEmail(to, subject ?? "Notification", template, data);
      break;

    case "sms":
      await sendSms(to, template, data);
      break;

    case "push":
      await sendPush(to, template, data);
      break;

    case "whatsapp":
      await sendWhatsapp(to, template, data);
      break;

    default: {
      const exhaustive: never = type;
      logger.warn({ type: exhaustive, job_id: job.id }, "Unknown notification type");
    }
  }
}
