import Redis from "ioredis";
import { logger } from "./logger";

const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6380";

export const redis = new Redis(redisUrl, {
  lazyConnect: true,
  maxRetriesPerRequest: null,
});

redis.on("connect", () => logger.info("Redis connected"));
redis.on("error", (err) => logger.error({ err }, "Redis error"));

export async function connectRedis() {
  await redis.connect();
}
