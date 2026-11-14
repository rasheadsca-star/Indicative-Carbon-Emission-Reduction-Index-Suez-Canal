/**
 * AISStream.io WebSocket adapter implementing the AisProvider contract.
 * NOT EXERCISED AGAINST THE LIVE SERVICE IN CI (no key, no network). Use only on a
 * durable server for a documented proof-of-coverage trial, after the user/SCA has
 * accepted the provider's terms. The key is read from process.env on the server.
 * Free community feeds have no SLA; coverage stays UNVERIFIED until reconciled.
 */
import { assertAisProvider } from "../ais-provider.mjs";

// [[lat_min, lon_min], [lat_max, lon_max]] covering north approach, canal and south approach (same extent as AIS Lab).
export const SUEZ_BBOX = [[29.70, 31.90], [31.65, 32.85]];

export function createAisstreamProvider({ apiKey = process.env.AISSTREAM_API_KEY, WebSocketImpl = globalThis.WebSocket,
  url = "wss://stream.aisstream.io/v0/stream", maxBackoffMs = 60_000, setTimer = setTimeout } = {}) {
  let ws = null, stopped = false, backoff = 1000;
  const provider = {
    id: "aisstream", licenceRef: "https://aisstream.io (terms to be accepted and archived by the data owner)", coverageStatus: "UNVERIFIED",
    async start(onMessage, onHealth) {
      if (!apiKey) throw Error("AISSTREAM_API_KEY not set (server-side secret required)");
      if (typeof WebSocketImpl !== "function") throw Error("WebSocket implementation unavailable");
      stopped = false;
      const open = () => {
        ws = new WebSocketImpl(url);
        ws.onopen = () => {
          backoff = 1000;
          ws.send(JSON.stringify({ APIKey: apiKey, BoundingBoxes: [SUEZ_BBOX], FilterMessageTypes: ["PositionReport", "StandardClassBPositionReport", "ExtendedClassBPositionReport"] }));
          onHealth?.({ event: "connect" });
        };
        ws.onmessage = (ev) => {
          let raw; try { raw = JSON.parse(typeof ev.data === "string" ? ev.data : String(ev.data)); } catch { onHealth?.({ event: "bad_frame" }); return; }
          onMessage(raw);
        };
        ws.onclose = () => {
          onHealth?.({ event: "disconnect" });
          if (!stopped) { setTimer(open, backoff); backoff = Math.min(maxBackoffMs, backoff * 2); }
        };
        ws.onerror = () => onHealth?.({ event: "error" });
      };
      open();
    },
    async stop() { stopped = true; ws?.close(); }
  };
  return assertAisProvider(provider);
}
