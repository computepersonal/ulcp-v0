import { PrismaClient } from "../generated/prisma";
import { logger } from "./logger";

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

export const prisma: PrismaClient =
  global.__prisma ??
  new PrismaClient({
    log:
      process.env["NODE_ENV"] === "development"
        ? [
            { emit: "event", level: "query" },
            { emit: "event", level: "error" },
            { emit: "event", level: "warn" },
          ]
        : [{ emit: "event", level: "error" }],
  });

if (process.env["NODE_ENV"] !== "production") {
  global.__prisma = prisma;
}

prisma.$on("error" as never, (e: unknown) => {
  logger.error(e, "Prisma error");
});
