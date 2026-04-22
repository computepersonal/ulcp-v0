import pino from "pino";
import { appConfig } from "@ulcp/shared";

export const logger = pino({
  level: appConfig.isProduction ? "info" : "debug",
  transport: appConfig.isDevelopment
    ? { target: "pino-pretty", options: { colorize: true } }
    : undefined,
  redact: ["req.headers.authorization"],
});
