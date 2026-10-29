import assert from "node:assert/strict";
import { test } from "node:test";
import { runInNewOperation, runWithLogContext } from "./context";
import { createLogger, parseLogLevel } from "./logger";

function capture() {
  const lines: Record<string, unknown>[] = [];
  const stream = { write: (chunk: string) => void lines.push(JSON.parse(chunk) as Record<string, unknown>) };
  const logger = createLogger("order-service", { applicationName: "ULCP", machineName: "TEST-HOST", level: "debug", stream });
  return { lines, logger };
}

test("every line has exactly the nine schema fields", () => {
  const { lines, logger } = capture();
  logger.info({ orderId: "o1" }, "Order created");
  const line = lines[0]!;
  assert.deepEqual(Object.keys(line).sort(), [
    "ApplicationName", "CorrelationId", "CustomDimensions", "MachineName", "Message",
    "ServiceName", "ServiceRequestId", "Severity", "Timestamp",
  ]);
  assert.equal(line["ApplicationName"], "ULCP");
  assert.equal(line["ServiceName"], "order-service");
  assert.equal(line["MachineName"], "TEST-HOST");
  assert.equal(line["Message"], "Order created");
  assert.equal(line["Severity"], "Information");
  assert.match(String(line["Timestamp"]), /^\d{4}-\d{2}-\d{2}T.*Z$/);
  assert.equal((line["CustomDimensions"] as Record<string, unknown>)["orderId"], "o1");
});

test("IDs are null outside a flow and set inside one", () => {
  const { lines, logger } = capture();
  logger.info("startup");
  runWithLogContext({ CorrelationId: "corr-1", ServiceRequestId: "req-1" }, () => logger.info("in flow"));
  assert.equal(lines[0]!["CorrelationId"], null);
  assert.equal(lines[0]!["ServiceRequestId"], null);
  assert.equal(lines[1]!["CorrelationId"], "corr-1");
  assert.equal(lines[1]!["ServiceRequestId"], "req-1");
});

test("operations in one flow share CorrelationId but get their own ServiceRequestId", () => {
  const { lines, logger } = capture();
  runWithLogContext({ CorrelationId: "flow", ServiceRequestId: "outer" }, () => {
    runInNewOperation(() => logger.info("a"));
    runInNewOperation(() => logger.info("b"));
  });
  assert.equal(lines[0]!["CorrelationId"], "flow");
  assert.equal(lines[1]!["CorrelationId"], "flow");
  assert.notEqual(lines[0]!["ServiceRequestId"], lines[1]!["ServiceRequestId"]);
});

test("severity names, exceptions and reserved-name collisions", () => {
  const { lines, logger } = capture();
  logger.warn("w");
  logger.fatal("f");
  logger.error({ err: new Error("boom"), CorrelationId: "spoof" }, "failed");
  assert.equal(lines[0]!["Severity"], "Warning");
  assert.equal(lines[1]!["Severity"], "Critical");
  const dims = lines[2]!["CustomDimensions"] as Record<string, unknown>;
  assert.match(String(dims["Exception"]), /boom/);
  assert.equal(lines[2]!["CorrelationId"], null);
  assert.equal(dims["_CorrelationId"], "spoof");
});

test("secrets are redacted", () => {
  const { lines, logger } = capture();
  logger.info({ password: "p", body: { otp: "123456", name: "ok" }, headers: { authorization: "Bearer x" } }, "login");
  const dims = lines[0]!["CustomDimensions"] as Record<string, Record<string, unknown> & string>;
  assert.equal(dims["password"], "[Redacted]");
  assert.equal(dims["body"].otp, "[Redacted]");
  assert.equal(dims["body"].name, "ok");
  assert.equal(dims["headers"].authorization, "[Redacted]");
});

test("log level parsing", () => {
  assert.equal(parseLogLevel("WARNING", "info"), "warn");
  assert.equal(parseLogLevel("nonsense", "info"), "info");
});
