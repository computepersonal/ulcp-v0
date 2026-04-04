import Redis from "ioredis";
import { logger } from "./logger";

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6380";

// Command client — for regular Redis operations
export const redis = new Redis(REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

redis.on("error", (err) => {
  logger.error({ err }, "Redis command client error");
});

redis.on("connect", () => {
  logger.info("Redis command client connected");
});

// Subscriber client — dedicated connection (pub/sub locks the connection)
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
