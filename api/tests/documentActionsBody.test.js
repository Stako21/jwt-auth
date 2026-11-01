import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import http from "node:http";
import express from "express";
import { documentActionsJson } from "../middlewares/documentActionsJson.js";

test("1000 administrative removal tokens fit the HTTP parser while ordinary and oversized requests retain bounded limits", async () => {
  const app = express();
  app.use("/api/documents/admin/actions", documentActionsJson);
  app.use(express.json());
  app.post("/api/documents/admin/actions", (req, res) => res.json({ count: req.body.documents.length }));
  app.post("/ordinary", (req, res) => res.sendStatus(200));
  app.use((error, _req, res, _next) => res.status(error.status || 500).json({ code: error.type }));
  const server = http.createServer(app);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const root = `http://127.0.0.1:${server.address().port}`;
    const payload = {
      action: "unsync", comment: "я".repeat(250),
      documents: Array.from({ length: 1000 }, (_, index) => ({ id: 2147483647 - index,
        expectedStatus: "NOT_COMPLETED", expectedSyncRequestedAt: "2026-11-01T16:00:00.123Z" })),
    };
    const body = JSON.stringify(payload);
    assert.ok(Buffer.byteLength(body) > 100 * 1024);
    const post = (route, value) => fetch(`${root}${route}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: value,
    });
    const allowed = await post("/api/documents/admin/actions", body);
    assert.equal(allowed.status, 200);
    assert.deepEqual(await allowed.json(), { count: 1000 });
    const ordinary = await post("/ordinary", body);
    assert.equal(ordinary.status, 413);
    await ordinary.arrayBuffer();
    const oversized = await post("/api/documents/admin/actions", JSON.stringify({ ...payload,
      documents: [...payload.documents, ...payload.documents, ...payload.documents] }));
    assert.equal(oversized.status, 413);
    await oversized.arrayBuffer();
  } finally {
    server.closeAllConnections();
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
