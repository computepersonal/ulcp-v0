import { Queue, Worker, Job } from "bullmq";
import { logger } from "./logger";

const REDIS_URL = process.env["REDIS_URL"] ?? "redis://localhost:6380";

// Parse redis URL into ioredis connection config for BullMQ
function redisConnection() {
  const url = new URL(REDIS_URL);
  return {
    host: url.hostname,
    port: parseInt(url.port || "6380"),
    password: url.password || undefined,
  };
}

const connection = redisConnection();

// ─── KOT Auto-Ack Queue ───────────────────────────────────────────────────────
// Jobs added when a KOT is created in "auto" mode.
// After delay_secs, if KOT is still "pending" → auto-acknowledge.

export interface KotAutoAckJobData {
  kot_id: string;
  tenant_id: string;
  delay_secs: number;
}

export const kotAutoAckQueue = new Queue<KotAutoAckJobData>("kot-auto-ack", {
  connection,
  defaultJobOptions: {
    removeOnComplete: 100,
    removeOnFail: 200,
    attempts: 3,
    backoff: { type: "exponential", delay: 5000 },
  },
});

export async function scheduleKotAutoAck(
  kot_id: string,
  tenant_id: string,
  delay_secs: number
): Promise<void> {
  await kotAutoAckQueue.add(
    "auto-ack",
    { kot_id, tenant_id, delay_secs },
    { delay: delay_secs * 1000, jobId: `auto-ack-${kot_id}` }
  );
  logger.info({ kot_id, delay_secs }, "Scheduled KOT auto-ack job");
}

export async function cancelKotAutoAck(kot_id: string): Promise<void> {
  const job = await kotAutoAckQueue.getJob(`auto-ack-${kot_id}`);
  if (job) {
    try {
      await job.remove();
      logger.info({ kot_id }, "Cancelled KOT auto-ack job");
    } catch (err) {
      // Job locked = it's the auto-ack worker itself firing acknowledgeKot.
      // The job will complete normally — nothing to cancel.
      if (!(err instanceof Error) || !err.message.includes("locked")) {
        throw err;
      }
    }
  }
}

// ─── Worker (started in index.ts) ────────────────────────────────────────────

let _worker: Worker | null = null;

export function startKotAutoAckWorker(
  processor: (job: Job<KotAutoAckJobData>) => Promise<void>
): void {
  _worker = new Worker<KotAutoAckJobData>("kot-auto-ack", processor, {
    connection,
    concurrency: 10,
  });

  _worker.on("completed", (job) => {
    logger.info({ kot_id: job.data.kot_id }, "KOT auto-ack job completed");
  });
  _worker.on("failed", (job, err) => {
    logger.error({ kot_id: job?.data.kot_id, err }, "KOT auto-ack job failed");
  });

  logger.info("KOT auto-ack worker started");
}

export async function stopWorker(): Promise<void> {
  if (_worker) await _worker.close();
}
