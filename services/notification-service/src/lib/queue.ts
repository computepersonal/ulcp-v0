import { Queue, Worker, Job } from "bullmq";
import Redis from "ioredis";
import { redis } from "./redis";
import { logger } from "./logger";

export interface NotificationJobData {
  type: "email" | "sms" | "push" | "whatsapp";
  to: string;
  subject?: string;
  template: string;
  data: Record<string, unknown>;
  tenant_id?: string;
}

const QUEUE_NAME = "notifications";

// BullMQ queue — uses the shared redis connection
export const notificationQueue = new Queue<NotificationJobData>(QUEUE_NAME, {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "custom",
    },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 50 },
  },
});

// Custom backoff: attempt 1 → 1s, attempt 2 → 5s, attempt 3 → 30s
notificationQueue.on("error", (err) => {
  logger.error({ err }, "Notification queue error");
});

let worker: Worker<NotificationJobData> | null = null;

export function startNotificationWorker(
  processJob: (job: Job<NotificationJobData>) => Promise<void>
): Worker<NotificationJobData> {
  worker = new Worker<NotificationJobData>(
    QUEUE_NAME,
    async (job) => {
      await processJob(job);
    },
    {
      connection: new Redis(
        process.env.REDIS_URL ?? "redis://localhost:6380",
        { maxRetriesPerRequest: null, enableReadyCheck: false }
      ),
      concurrency: 5,
      settings: {
        backoffStrategy: (attemptsMade: number) => {
          // attempt 1 → 1000ms, attempt 2 → 5000ms, attempt 3+ → 30000ms
          const delays = [1000, 5000, 30000];
          return delays[Math.min(attemptsMade - 1, delays.length - 1)];
        },
      },
    }
  );

  worker.on("completed", (job) => {
    logger.info({ job_id: job.id, type: job.data.type, to: job.data.to }, "Notification sent");
  });

  worker.on("failed", (job, err) => {
    logger.error({ job_id: job?.id, type: job?.data?.type, err }, "Notification failed");
  });

  logger.info("Notification worker started");
  return worker;
}

export async function stopWorker(): Promise<void> {
  if (worker) {
    await worker.close();
    logger.info("Notification worker stopped");
  }
}
