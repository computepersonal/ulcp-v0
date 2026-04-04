import { Queue, Worker, Job } from "bullmq";
import { logger } from "./logger";

const REDIS_URL = process.env["REDIS_URL"] ?? "redis://localhost:6380";

function redisConnection() {
  const url = new URL(REDIS_URL);
  return {
    host: url.hostname,
    port: parseInt(url.port || "6380"),
    password: url.password || undefined,
  };
}

const connection = redisConnection();

// ─── Bid Auto-Close Queue ─────────────────────────────────────────────────────

export interface BidAutoCloseJobData {
  bid_request_id: string;
  tenant_id: string;
}

export const bidAutoCloseQueue = new Queue<BidAutoCloseJobData>("bid-auto-close", {
  connection,
  defaultJobOptions: {
    removeOnComplete: 100,
    removeOnFail: 200,
    attempts: 3,
    backoff: { type: "exponential", delay: 5000 },
  },
});

export async function scheduleBidAutoClose(
  bid_request_id: string,
  tenant_id: string,
  close_at: Date
): Promise<void> {
  const delay = close_at.getTime() - Date.now();
  if (delay <= 0) return;
  await bidAutoCloseQueue.add(
    "auto-close",
    { bid_request_id, tenant_id },
    { delay, jobId: `auto-close:${bid_request_id}` }
  );
  logger.info({ bid_request_id, close_at }, "Scheduled bid auto-close job");
}

export async function cancelBidAutoClose(bid_request_id: string): Promise<void> {
  const job = await bidAutoCloseQueue.getJob(`auto-close:${bid_request_id}`);
  if (job) {
    await job.remove();
    logger.info({ bid_request_id }, "Cancelled bid auto-close job");
  }
}

// ─── Bid Recurrence Queue ─────────────────────────────────────────────────────

export interface BidRecurrenceJobData {
  bid_request_id: string;
  tenant_id: string;
}

export const bidRecurrenceQueue = new Queue<BidRecurrenceJobData>("bid-recurrence", {
  connection,
  defaultJobOptions: {
    removeOnComplete: 50,
    removeOnFail: 100,
  },
});

export async function scheduleBidRecurrence(
  bid_request_id: string,
  tenant_id: string,
  repeat_every_ms: number
): Promise<void> {
  await bidRecurrenceQueue.add(
    "recur",
    { bid_request_id, tenant_id },
    {
      repeat: { every: repeat_every_ms },
      jobId: `recur:${bid_request_id}`,
    }
  );
  logger.info({ bid_request_id, repeat_every_ms }, "Scheduled bid recurrence job");
}

export async function cancelBidRecurrence(bid_request_id: string): Promise<void> {
  await bidRecurrenceQueue.removeRepeatable("recur", {
    every: 0,
    jobId: `recur:${bid_request_id}`,
  });
  logger.info({ bid_request_id }, "Cancelled bid recurrence job");
}

// ─── Workers ──────────────────────────────────────────────────────────────────

let _autoCloseWorker: Worker | null = null;
let _recurrenceWorker: Worker | null = null;

export function startBidAutoCloseWorker(
  processor: (job: Job<BidAutoCloseJobData>) => Promise<void>
): void {
  _autoCloseWorker = new Worker<BidAutoCloseJobData>("bid-auto-close", processor, {
    connection,
    concurrency: 5,
  });
  _autoCloseWorker.on("completed", (job) =>
    logger.info({ bid_request_id: job.data.bid_request_id }, "Bid auto-close completed")
  );
  _autoCloseWorker.on("failed", (job, err) =>
    logger.error({ bid_request_id: job?.data.bid_request_id, err }, "Bid auto-close failed")
  );
  logger.info("Bid auto-close worker started");
}

export function startBidRecurrenceWorker(
  processor: (job: Job<BidRecurrenceJobData>) => Promise<void>
): void {
  _recurrenceWorker = new Worker<BidRecurrenceJobData>("bid-recurrence", processor, {
    connection,
    concurrency: 5,
  });
  _recurrenceWorker.on("completed", (job) =>
    logger.info({ bid_request_id: job.data.bid_request_id }, "Bid recurrence job completed")
  );
  _recurrenceWorker.on("failed", (job, err) =>
    logger.error({ bid_request_id: job?.data.bid_request_id, err }, "Bid recurrence job failed")
  );
  logger.info("Bid recurrence worker started");
}

export async function stopWorkers(): Promise<void> {
  if (_autoCloseWorker) await _autoCloseWorker.close();
  if (_recurrenceWorker) await _recurrenceWorker.close();
}
