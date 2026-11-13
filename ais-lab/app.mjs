import { AIS_BBOX, MAX_POSITION_AGE_MS, classifyZone, vesselCategory, normalizeEvent, normalizeSnapshot, createTracker } from "./core.mjs";

const els = Object.fromEntries([...document.querySelectorAll("[data-id]")].map(el => [el.dataset.id, el]));
const tracker = createTracker();
const SOCKET_URL = "wss://ais.openwaters.io/v1/stream";
const SNAPSHOT_URL = "https://ais.openwaters.io/v1/vessels";
const search = els.search;
let socket = null;
let retryTimer = null;
let reconnectCount = 0;
let stopped = true;
let connected = false;
let map = null, markers = null;
let lastLive = 0, lastSnapshot = 0, lastError = "";
let attribution = "Open Waters AIS — source attribution per vessel. Licensing varies by upstream source.";
const fmt = new Intl.NumberFormat("en-US");
const shortClock = t => t ? new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Cairo", dateStyle: "short", timeStyle: "short" }).format(new Date(t)) : "—";
const ageText = t => !t ? "—" : (Math.max(0, Math.floor((Date.now() - t) / 60_000)) + " min ago");
const zoneLabel = z => ({north:"North approach", south:"South approach", canal:"Canal corridor", outside:"Outside"})[z] || z;
const status = (value, kind) => {
  els.state.textContent = value;
  els.state.dataset.kind = kind;
  els.connection.textContent = value;
};
function initMap() {
  if (!window.L) {
    els.mapFallback.hidden = false;
    return;
  }
  map = L.map(els.map, { zoomControl: true, attributionControl: true, scrollWheelZoom: false }).setView([30.68, 32.38], 9);
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 16, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors'
  }).addTo(map);
  markers = L.layerGroup().addTo(map);
  const north = L.circle([31.35,32.31], {radius: 18500, color:"#54cce0", fillOpacity:.07, weight:1.4});
  const south = L.circle([29.92,32.56], {radius: 18500, color:"#ffbb78", fillOpacity:.07, weight:1.4});
  north.bindTooltip("Northern approach — approximate research gate");
  south.bindTooltip("Southern approach — approximate research gate");
  north.addTo(map); south.addTo(map);
  L.polyline([[31.265,32.305],[31.1,32.305],[30.91,32.315],[30.67,32.33],[30.49,32.34],[30.31,32.345],[30.12,32.515],[30.045,32.56]],
    {color:"#27c5a7",weight:3,dashArray:"7 7",opacity:.75}).addTo(map);
}
function makeCell(text, className = "") {
  const td = document.createElement("td");
  td.textContent = text;
  if (className) td.className = className;
  return td;
}
function addMapMarker(v) {
  const zone = classifyZone(v.lat, v.lon);
  const col = zone === "canal" ? "#20cfac" : zone === "north" ? "#62c6fa" : "#ffb873";
  const marker = L.circleMarker([v.lat, v.lon], {
    radius: 5.5, color:"#08272d", weight:1.5, fillColor:col, fillOpacity:.95
  });
  const tip = document.createElement("div");
  const head = document.createElement("strong");
  head.textContent = v.name || v.mmsi;
  tip.append(head, document.createElement("br"));
  const detail = document.createElement("span");
  detail.textContent = "MMSI " + v.mmsi + " · " + vesselCategory(v.shipType) + " · " + zoneLabel(zone);
  tip.append(detail, document.createElement("br"));
  const src = document.createElement("small");
  src.textContent = "Source: " + v.source + " · " + ageText(v.timestamp);
  tip.append(src);
  marker.bindPopup(tip);
  marker.addTo(markers);
}
function render() {
  const s = tracker.summary();
  els.observed.textContent = fmt.format(s.observed);
  els.canal.textContent = fmt.format(s.inCanal);
  els.north.textContent = fmt.format(s.atNorth);
  els.south.textContent = fmt.format(s.atSouth);
  els.transits.textContent = fmt.format(s.inferredTransits);
  els.liveMessages.textContent = fmt.format(s.liveMessages);
  els.lastEvent.textContent = lastLive ? shortClock(lastLive) : "No live position yet";
  els.lastSnapshot.textContent = lastSnapshot ? shortClock(lastSnapshot) : "Not loaded";
  els.freshness.textContent = s.newest ? ageText(s.newest) : "No fresh positions";
  els.license.textContent = attribution;
  els.error.textContent = lastError;
  const needle = search.value.trim().toLowerCase();
  const type = els.type.value;
  const where = els.zone.value;
  const filtered = s.vessels.filter(v =>
    (!needle || (v.name || "").toLowerCase().includes(needle) || v.mmsi.includes(needle)) &&
    (type === "all" || vesselCategory(v.shipType) === type) &&
    (where === "all" || classifyZone(v.lat, v.lon) === where)
  ).slice(0, 200);
  els.visible.textContent = fmt.format(filtered.length);
  els.rows.replaceChildren();
  for (const v of filtered) {
    const tr = document.createElement("tr");
    tr.append(makeCell(v.name || "Unreported", "vesselname"),
      makeCell(v.mmsi, "mono"), makeCell(vesselCategory(v.shipType)),
      makeCell(zoneLabel(classifyZone(v.lat, v.lon))),
      makeCell(v.sog == null ? "—" : v.sog.toFixed(1) + " kn"),
      makeCell(ageText(v.timestamp)), makeCell(v.source || "—"));
    els.rows.appendChild(tr);
  }
  els.empty.hidden = filtered.length !== 0;
  if (markers) {
    markers.clearLayers();
    filtered.forEach(addMapMarker);
  }
  els.passageRows.replaceChildren();
  for (const c of s.completions.slice(0, 20)) {
    const tr = document.createElement("tr");
    tr.append(makeCell(c.name || c.mmsi), makeCell(c.direction),
      makeCell(shortClock(c.entryTime)), makeCell(shortClock(c.exitTime)),
      makeCell(c.elapsedHours + " h"), makeCell("Inferred only"));
    els.passageRows.appendChild(tr);
  }
  els.passageEmpty.hidden = s.completions.length !== 0;
}
function acceptFrame(raw) {
  let event;
  try { event = JSON.parse(raw); } catch { return; }
  if (event.type === "error") {
    lastError = "Provider: " + String(event.error || "unknown error").slice(0,180);
    status("Provider error", "error");
    render(); return;
  }
  if (event.type === "welcome") {
    els.tier.textContent = String(event.role || "anonymous") + " tier";
    return;
  }
  if (event.type !== "event") return;
  const v = normalizeEvent(event);
  if (!v) return;
  const outcome = tracker.ingest(v, true);
  if (outcome.accepted && v.isPositionReport && !v.synthesized) lastLive = Date.now();
  if (outcome.completed) showMessage("Potential AIS passage inferred for MMSI " + outcome.completed.mmsi + " — independent verification required.");
  render();
}
function showMessage(value) {
  els.notice.textContent = value;
}
async function loadSnapshot() {
  els.snapshot.disabled = true;
  try {
    const params = new URLSearchParams({
      bbox: AIS_BBOX.join(","), kind: "vessel", max_age: "30m", max_age_moving: "30m"
    });
    const r = await fetch(SNAPSHOT_URL + "?" + params, { cache:"no-store" });
    if (!r.ok) throw new Error("snapshot HTTP " + r.status);
    const data = await r.json();
    if (data.type !== "FeatureCollection" || !Array.isArray(data.features)) throw new Error("unexpected snapshot response");
    for (const f of data.features) {
      const v = normalizeSnapshot(f);
      if (v) tracker.ingest(v, false);
    }
    if (data.attribution && typeof data.attribution === "object") {
      const providers = Object.entries(data.attribution).map(([k, val]) => k + ": " + String(val)).slice(0, 12);
      if (providers.length) attribution = providers.join(" | ");
    }
    lastSnapshot = Date.now();
    lastError = "";
    showMessage("Snapshot loaded. Historical positions are not counted as completed passages.");
  } catch(e) {
    lastError = "Snapshot unavailable: " + String(e.message || e);
    showMessage("Live stream can still operate if the snapshot endpoint is unavailable.");
  } finally {
    els.snapshot.disabled = false;
    render();
  }
}
function connect() {
  if (stopped) return;
  status("Connecting to AIS", "pending");
  const ws = new WebSocket(SOCKET_URL);
  socket = ws;
  ws.addEventListener("open", () => {
    if (stopped || socket !== ws) { ws.close(); return; }
    reconnectCount = 0;
    connected = true;
    status("AIS connected", "connected");
    lastError = "";
    ws.send(JSON.stringify({ type: "subscribe", bbox: [AIS_BBOX] }));
    showMessage("AIS live feed connected. Observations are incomplete and depend on upstream coverage.");
    render();
  });
  ws.addEventListener("message", event => {
    if (socket === ws && !stopped) acceptFrame(event.data);
  });
  ws.addEventListener("error", () => {
    lastError = "WebSocket connection failed. Check network access and provider status.";
    render();
  });
  ws.addEventListener("close", event => {
    if (socket !== ws) return;
    connected = false;
    socket = null;
    if (stopped) { status("Paused", "idle"); return; }
    reconnectCount++;
    const delay = Math.min(60000, 5000 * 2 ** Math.min(reconnectCount - 1, 4));
    status("Reconnecting", "pending");
    lastError = "Stream closed (code " + event.code + "). Retrying after " + (delay / 1000) + "s.";
    retryTimer = setTimeout(connect, delay);
    render();
  });
}
function start() {
  if (!stopped) return;
  stopped = false;
  els.start.disabled = true;
  els.stop.disabled = false;
  connect();
  loadSnapshot();
}
function stop() {
  stopped = true;
  connected = false;
  clearTimeout(retryTimer);
  retryTimer = null;
  const ws = socket; socket = null;
  if (ws) ws.close(1000, "User paused");
  els.start.disabled = false;
  els.stop.disabled = true;
  status("Paused", "idle");
  showMessage("Collection paused. There is no server-side background monitoring in this public pilot.");
}
function downloadCsv() {
  const s = tracker.summary();
  const rows = [
    ["MMSI","Name","Direction","Entry UTC","Exit UTC","Elapsed hours","Canal observations","AIS source","Verification"],
    ...s.completions.map(c => [c.mmsi,c.name,c.direction,new Date(c.entryTime).toISOString(),
      new Date(c.exitTime).toISOString(),c.elapsedHours,c.canalPoints,c.source,c.status])
  ];
  if (rows.length === 1) {
    showMessage("No complete AIS-inferred passages in this browser session to export.");
    return;
  }
  const csv = "\uFEFF" + rows.map(row => row.map(v => '"' + String(v ?? "").replaceAll('"','""') + '"').join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type:"text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url; a.download = "ceri-sc-ais-inferred-passages-" + new Date().toISOString().slice(0,10) + ".csv";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 500);
}
els.start.addEventListener("click", start);
els.stop.addEventListener("click", stop);
els.snapshot.addEventListener("click", loadSnapshot);
els.export.addEventListener("click", downloadCsv);
els.reset.addEventListener("click", () => {
  if (!window.confirm("Clear all browser-session observations and inferred passages?")) return;
  tracker.reset(); lastLive = 0; lastSnapshot = 0;
  showMessage("Session data cleared. No external data was modified."); render();
});
for (const el of [search,els.type,els.zone]) el.addEventListener(el === search ? "input" : "change", render);
window.addEventListener("pagehide", () => { if (socket) socket.close(1000,"Page closed"); });
initMap();
render();
setInterval(render, 20000);
start();
