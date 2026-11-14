import test from "node:test";
import assert from "node:assert/strict";
import { createAisstreamProvider, SUEZ_BBOX } from "./providers/aisstream.mjs";

class FakeWs {
  static last = null;
  constructor(url) { this.url = url; this.sent = []; FakeWs.last = this; }
  send(s) { this.sent.push(JSON.parse(s)); }
  close() { this.onclose?.(); }
}

test("aisstream adapter refuses to start without a server-side key", async () => {
  const p = createAisstreamProvider({ apiKey: "", WebSocketImpl: FakeWs });
  await assert.rejects(p.start(() => {}), /AISSTREAM_API_KEY/);
});

test("aisstream adapter subscribes to the Suez bbox, forwards frames, reconnects with backoff, stops cleanly", async () => {
  const timers = [];
  const p = createAisstreamProvider({ apiKey: "test-key-not-real", WebSocketImpl: FakeWs, setTimer: (fn, ms) => timers.push(ms) });
  const got = [], health = [];
  await p.start((m) => got.push(m), (h) => health.push(h.event));
  const ws = FakeWs.last;
  ws.onopen();
  assert.deepEqual(ws.sent[0].BoundingBoxes, [SUEZ_BBOX]);
  assert.equal(p.coverageStatus, "UNVERIFIED");
  ws.onmessage({ data: JSON.stringify({ MessageType: "PositionReport" }) });
  ws.onmessage({ data: "{bad" });
  assert.equal(got.length, 1);
  ws.onclose();
  ws.onclose();
  assert.deepEqual(timers, [1000, 2000]);
  await p.stop();
  assert.ok(health.includes("connect") && health.includes("bad_frame") && health.includes("disconnect"));
});
