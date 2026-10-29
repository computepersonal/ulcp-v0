import fs from "fs";
import os from "os";
import pino, { type DestinationStream, type Logger } from "pino";
import { appConfig } from "../config/app";
import { getLogContext } from "./context";

/**
 * Central application log schema (shared by every product on the observability stack).
 * Every line is one JSON object with exactly these nine top-level fields:
 *
 *   Timestamp, ApplicationName, ServiceName, MachineName, Message, Severity,
 *   CorrelationId, ServiceRequestId, CustomDimensions
 *
 * See docs/observability/LOGGING.md.
 */

const SEVERITY: Record<string, string> = {
  trace: "Trace",
  debug: "Debug",
  info: "Information",
  warn: "Warning",
  error: "Error",
  fatal: "Critical",
};

// Fields owned by the logger; a caller-supplied property with one of these names is renamed
const RESERVED = new Set(["ApplicationName", "ServiceName", "MachineName", "CorrelationId", "ServiceRequestId"]);

// Values under these keys never reach a log line (top level and one level down)
const SENSITIVE_KEYS = [
  "password",
  "passwordHash",
  "password_hash",
  "pin",
  "otp",
  "token",
  "access_token",
  "refresh_token",
  "secret",
  "api_key",
  "authorization",
  "x-internal-secret",
  "card_number",
  "cvv",
];

export const LOG_REDACT_PATHS = SENSITIVE_KEYS.flatMap((key) => [
  `CustomDimensions.${key}`,
  `CustomDimensions.*.${key}`,
  `CustomDimensions.*.*.${key}`,
]);

export const LOG_LEVELS = ["trace", "debug", "info", "warn", "error", "fatal"] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

export function parseLogLevel(value: string | undefined, fallback: LogLevel): LogLevel {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "warning") return "warn";
  return (LOG_LEVELS as readonly string[]).includes(normalized ?? "") ? (normalized as LogLevel) : fallback;
}

/**
 * The real host, never the container id. Containers must be told via LOG_HOST_NAME
 * (Kubernetes: inject the node name with the downward API).
 */
export function resolveMachineName(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env["LOG_HOST_NAME"]?.trim();
  if (configured) return configured;
  if (fs.existsSync("/.dockerenv") || env["KUBERNETES_SERVICE_HOST"]) {
    throw new Error("LOG_HOST_NAME must identify the actual host when running in a container");
  }
  return os.hostname();
}

function describeError(value: unknown): string | undefined {
  if (value instanceof Error) return value.stack ?? `${value.name}: ${value.message}`;
  return undefined;
}

export interface CreateLoggerOptions {
  /** Defaults to APP_NAME (ULCP) */
  applicationName?: string;
  /** Defaults to LOG_HOST_NAME / os.hostname() */
  machineName?: string;
  level?: LogLevel;
  /** Output stream; defaults to stdout (collected by the Docker/Kubernetes log collector) */
  stream?: DestinationStream;
}

/** `serviceName` is the logical service, e.g. "order-service". */
export function createLogger(serviceName: string, options: CreateLoggerOptions = {}): Logger {
  const applicationName = options.applicationName ?? appConfig.appName;
  const machineName = options.machineName ?? resolveMachineName();
  const level = options.level ?? parseLogLevel(process.env["LOG_LEVEL"], appConfig.isProduction ? "info" : "debug");

  return pino(
    {
      level,
      base: {},
      messageKey: "Message",
      timestamp: () => `,"Timestamp":"${new Date().toISOString()}"`,
      formatters: {
        level: (label) => ({ Severity: SEVERITY[label] ?? label }),
        log: (object) => {
          const context = getLogContext();
          const dimensions: Record<string, unknown> = { Environment: appConfig.nodeEnv };
          let exception: string | undefined;

          for (const [key, value] of Object.entries(object)) {
            if (key === "err" || key === "error") {
              const text = describeError(value);
              if (text) {
                exception = text;
                continue;
              }
            }
            dimensions[RESERVED.has(key) ? `_${key}` : key] = value;
          }
          if (exception) dimensions["Exception"] = exception;

          return {
            ApplicationName: applicationName,
            ServiceName: serviceName,
            MachineName: machineName,
            CorrelationId: context?.CorrelationId ?? null,
            ServiceRequestId: context?.ServiceRequestId ?? null,
            CustomDimensions: dimensions,
          };
        },
      },
      redact: { paths: LOG_REDACT_PATHS, censor: "[Redacted]" },
    },
    options.stream
  );
}
