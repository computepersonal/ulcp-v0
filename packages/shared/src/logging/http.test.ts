import assert from "node:assert/strict";
import http from "node:http";
import { test } from "node:test";
import { runWithLogContext } from "./context";
import { createRequestLogHooks, installFetchCorrelation } from "./http";
import { createLogger } from "./logger";

test("outgoing fetch forwards the current CorrelationId, not the ServiceRequestId", async () => {
  installFetchCorrelation();
  let seen: string | string[] | undefined;
  const server = http.createServer((req, res) => {
    seen = req.headers["x-correlation-id"];
    res.end("ok");
  });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const { port } = server.address() as { port: number };
  try {
    await runWithLogContext({ CorrelationId: "flow-9", ServiceRequestId: "op-1" }, () =>
      fetch(`http://127.0.0.1:${port}/`, { headers: { "X-Test": "1" } })
    );
    assert.equal(seen, "flow-9");
    seen = undefined;
    await fetch(`http://127.0.0.1:${port}/`); // outside a flow: nothing added
    assert.equal(seen, undefined);
  } finally {
    server.close();
  }
});

test("request hook accepts a valid X-Correlation-ID, rejects a bad one, always makes its own request id", () => {
  const lines: Record<string, unknown>[] = [];
  const logger = createLogger("t", {
    applicationName: "ULCP", machineName: "H",
    stream: { write: (c: string) => void lines.push(JSON.parse(c) as Record<string, unknown>) },
  });
  const hooks = createRequestLogHooks(logger);
  const run = (header: string | undefined) => {
    const out: string[] = [];
    const reply = { header: (_n: string, v: string) => void out.push(v), statusCode: 200 };
    hooks.onRequest({ headers: header ? { "x-correlation-id": header } : {}, method: "GET", url: "/x" }, reply, () => logger.info("in"));
    return out[0]!;
  };
  assert.equal(run("good-id_1.2"), "good-id_1.2");
  assert.notEqual(run("bad id with spaces!"), "bad id with spaces!");
  assert.match(run(undefined), /^[0-9a-f-]{36}$/);
  const ids = lines.map((l) => l["ServiceRequestId"]);
  assert.equal(new Set(ids).size, 3);
  assert.equal(lines[0]!["CorrelationId"], "good-id_1.2");
});
