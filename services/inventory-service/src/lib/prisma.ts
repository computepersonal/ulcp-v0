import { PrismaClient } from "../generated/prisma";
import { logger } from "./logger";

export const prisma = new PrismaClient({
  log: process.env.NODE_ENV === "development"
    ? [{ emit: "event", level: "query" }]
    : [],
});

if (process.env.NODE_ENV === "development") {
  // $on is not in the public Prisma type but is available at runtime for query logging
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (prisma as unknown as { $on: (event: string, cb: (e: { query: string; duration: number }) => void) => void })
    .$on("query", (e) => {
      logger.debug({ query: e.query, duration: e.duration }, "prisma query");
    });
}
