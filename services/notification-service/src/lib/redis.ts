import Redis from "ioredis";
import { logger } from "./logger";

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6380";

// Primary Redis client for commands (BullMQ, OTP, rate limiting)
// Note: ioredis auto-connects on first command; we don't use lazyConnect to avoid double-connect issues
export const redis = new Redis(REDIS_URL, {
  maxRetriesPerRequest: null, // Required for BullMQ
  enableReadyCheck: false,
});

redis.on("error", (err) => {
  logger.error({ err }, "Redis client error");
});

redis.on("connect", () => {
  logger.info("Redis connected");
});

export async function connectRedis(): Promise<void> {
  // Redis auto-connects; this just waits until ready
  await new Promise<void>((resolve, reject) => {
    if (redis.status === "ready") return resolve();
    redis.once("ready", resolve);
    redis.once("error", reject);
  });
}

export async function redisPublish(channel: string, message: string): Promise<void> {
  await redis.publish(channel, message);
}

// Create a dedicated subscriber connection (pub/sub locks the connection)
export function createSubscriberClient(): Redis {
  const sub = new Redis(REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });

  sub.on("error", (err) => {
    logger.error({ err }, "Redis subscriber error");
  });

  sub.on("connect", () => {
    logger.info("Redis subscriber connected");
  });

  return sub;
}
