const COOKIE_NAME = "ceri_sc_session";
const SESSION_SECONDS = 8 * 60 * 60;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_FAILURES = 5;
const LOGIN_FAILURES = new Map();
const APP_VERSION = "V9.0";

const SEED_PROJECTS = [
  ["B20 Biofuel Programme", "Alternative fuel", "Active", 1624, "tCO2e", 2028, "SCA programme baseline", "Avoided emissions", "Indicative", "Green Transformation team"],
  ["Solar Stations — 4.5 MW", "Renewable energy", "Tender", 3840, "tCO2e/yr", 2028, "Project planning estimate", "Annual potential", "Planning estimate", "Energy team"],
  ["LNG Tug Conversion — 6 units", "Fleet transition", "Financing", 13500, "tCO2e/yr", 2032, "Completed feasibility studies", "Annual potential", "Feasibility complete", "Fleet team"],
  ["Hybrid Ferries — 2 units", "Fleet transition", "Offers under review", 570, "tCO2e/yr", 2028, "Tender-stage estimate", "Annual potential", "Tender evidence", "Ferry team"],
  ["Ultrasonic Anti-Fouling", "Efficiency", "Installation", 695.9, "tCO2e/yr", 2028, "Procurement record", "Annual potential", "Procurement evidence", "Marine engineering"],
];

export default {
  async fetch(request, env) {
    if (!env.ACCESS_PASSWORD) return serviceUnavailable();
    const url = new URL(request.url);

    if (url.pathname === "/auth/login" && request.method === "POST") return login(request, env, url);
    if (url.pathname === "/auth/logout") return logout(url);

    const session = await getValidSession(request, env.ACCESS_PASSWORD);
    if (!session) return loginPage(url, false);

    if (url.pathname.startsWith("/api/")) {
      try {
        return await handleApi(request, env, url, session);
      } catch (error) {
        return apiException(error);
      }
    }

    const response = await env.ASSETS.fetch(request);
    return protectedResponse(response);
  },
};

async function login(request, env, url) {
  if (!sameOrigin(request, url)) return json({ ok: false, error: "forbidden" }, 403);
  const throttleKey = request.headers.get("CF-Connecting-IP") || "unknown";
  const attempt = LOGIN_FAILURES.get(throttleKey);
  if (attempt && attempt.count >= LOGIN_MAX_FAILURES && Date.now() - attempt.startedAt < LOGIN_WINDOW_MS) {
    return new Response("Too many attempts. Try again later.", { status: 429, headers: { ...securityHeaders("text/plain; charset=utf-8"), "Retry-After": "900" } });
  }

  const form = await request.formData();
  const supplied = String(form.get("password") || "");
  const adminPassword = env.ADMIN_PASSWORD || env.ACCESS_PASSWORD;
  const [accessIsValid, adminIsValid] = await Promise.all([
    timingSafeEqual(supplied, env.ACCESS_PASSWORD),
    timingSafeEqual(supplied, adminPassword),
  ]);

  if (!accessIsValid && !adminIsValid) {
    const current = LOGIN_FAILURES.get(throttleKey);
    LOGIN_FAILURES.set(throttleKey, current && Date.now() - current.startedAt < LOGIN_WINDOW_MS ? { ...current, count: current.count + 1 } : { count: 1, startedAt: Date.now() });
    await delay(700);
    return loginPage(url, true);
  }

  LOGIN_FAILURES.delete(throttleKey);
  const expires = Math.floor(Date.now() / 1000) + SESSION_SECONDS;
  const role = adminIsValid ? "admin" : "viewer";
  const payload = toBase64Url(JSON.stringify({ exp: expires, role }));
  const signature = await sign(payload, env.ACCESS_PASSWORD);
  const next = safeNext(form.get("next"));

  return new Response(null, {
    status: 303,
    headers: {
      Location: next,
      "Set-Cookie": `${COOKIE_NAME}=${payload}.${signature}; Path=/; Max-Age=${SESSION_SECONDS}; HttpOnly; Secure; SameSite=Strict`,
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function logout(url) {
  return new Response(null, {
    status: 303,
    headers: {
      Location: `${url.origin}/`,
      "Set-Cookie": `${COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict`,
      "Clear-Site-Data": '"cache", "storage"',
      "Cache-Control": "no-store",
    },
  });
}

async function getValidSession(request, password) {
  const cookie = request.headers.get("Cookie") || "";
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]+)`));
  if (!match) return null;
  const [payload, providedSignature] = match[1].split(".");
  if (!payload || !providedSignature) return null;
  const expectedSignature = await sign(payload, password);
  if (!(await timingSafeEqual(providedSignature, expectedSignature))) return null;
  try {
    const session = JSON.parse(fromBase64Url(payload));
    if (!Number.isFinite(session.exp) || session.exp <= Math.floor(Date.now() / 1000)) return null;
    return { exp: session.exp, role: session.role === "admin" ? "admin" : "viewer" };
  } catch {
    return null;
  }
}

async function handleApi(request, env, url, session) {
  if (url.pathname === "/api/status" && request.method === "GET") {
    return json({ ok: true, version: APP_VERSION, role: session.role, database: Boolean(env.DB), storage: env.DB ? "Cloudflare D1" : "Reference fallback only", pwaMode: "network-only secure", generatedAt: new Date().toISOString() });
  }

  if (url.pathname === "/api/admin") {
    if (!env.DB) return json({ ok: false, error: "database_not_bound", storage: "Reference fallback only", role: session.role }, 503);
    await ensureSchema(env.DB);
    if (request.method === "GET") return getAdminData(env.DB, session.role);
    if (session.role !== "admin") return json({ ok: false, error: "admin_required" }, 403);
    if (!sameOrigin(request, url)) return json({ ok: false, error: "forbidden" }, 403);
    if (request.method === "POST") return saveProject(request, env.DB);
    if (request.method === "DELETE") return deleteProject(url, env.DB);
    return json({ ok: false, error: "method_not_allowed" }, 405);
  }

  if (url.pathname === "/api/feedback" && request.method === "POST") {
    if (!env.DB) return json({ ok: false, error: "database_not_bound" }, 503);
    if (!sameOrigin(request, url)) return json({ ok: false, error: "forbidden" }, 403);
    await ensureSchema(env.DB);
    const body = await readJson(request);
    const category = cleanText(body.category, 40) || "other";
    const message = cleanText(body.message, 2000);
    const page = cleanText(body.page, 200) || "/";
    if (message.length < 5) return json({ ok: false, error: "invalid_message" }, 400);
    await env.DB.prepare("INSERT INTO feedback (category, message, page, created_at) VALUES (?, ?, ?, ?)").bind(category, message, page, new Date().toISOString()).run();
    return json({ ok: true }, 201);
  }

  return json({ ok: false, error: "not_found" }, 404);
}

async function ensureSchema(db) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    status TEXT NOT NULL,
    current_value REAL NOT NULL DEFAULT 0,
    unit TEXT NOT NULL DEFAULT 'tCO2e',
    target_year INTEGER NOT NULL,
    source TEXT NOT NULL,
    impact_type TEXT NOT NULL,
    evidence_status TEXT NOT NULL,
    owner TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`).run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    action TEXT NOT NULL,
    detail TEXT NOT NULL,
    record_id INTEGER,
    created_at TEXT NOT NULL
  )`).run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS feedback (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category TEXT NOT NULL,
    message TEXT NOT NULL,
    page TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`).run();

  const count = await db.prepare("SELECT COUNT(*) AS count FROM projects").first();
  if (Number(count?.count || 0) === 0) {
    const now = new Date().toISOString();
    await db.batch(SEED_PROJECTS.map((row) => db.prepare("INSERT INTO projects (name, category, status, current_value, unit, target_year, source, impact_type, evidence_status, owner, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(...row, now, now)));
    await db.prepare("INSERT INTO audit_log (action, detail, created_at) VALUES (?, ?, ?)").bind("seed", "Initial governed project register created", now).run();
  }
}

async function getAdminData(db, role) {
  const [projectsResult, auditsResult] = await Promise.all([
    db.prepare("SELECT id, name, category, status, current_value AS currentValue, unit, target_year AS targetYear, source, impact_type AS impactType, evidence_status AS evidenceStatus, owner, version, updated_at AS updatedAt FROM projects ORDER BY target_year, id").all(),
    db.prepare("SELECT action, detail, created_at AS createdAt FROM audit_log ORDER BY id DESC LIMIT 25").all(),
  ]);
  return json({ ok: true, version: APP_VERSION, role, storage: "Cloudflare D1", projects: projectsResult.results || [], audits: auditsResult.results || [], vesselProfiles: 5, generatedAt: new Date().toISOString() });
}

async function saveProject(request, db) {
  const body = await readJson(request);
  const p = normalizeProject(body.project || {});
  if (p.error) return json({ ok: false, error: p.error }, 400);
  const now = new Date().toISOString();
  if (p.id) {
    const previous = await db.prepare("SELECT version FROM projects WHERE id = ?").bind(p.id).first();
    if (!previous) return json({ ok: false, error: "not_found" }, 404);
    await db.prepare("UPDATE projects SET name=?, category=?, status=?, current_value=?, unit=?, target_year=?, source=?, impact_type=?, evidence_status=?, owner=?, version=?, updated_at=? WHERE id=?")
      .bind(p.name, p.category, p.status, p.currentValue, p.unit, p.targetYear, p.source, p.impactType, p.evidenceStatus, p.owner, Number(previous.version || 1) + 1, now, p.id).run();
    await recordAudit(db, "update", `${p.name} updated`, p.id, now);
    return json({ ok: true, id: p.id });
  }
  const result = await db.prepare("INSERT INTO projects (name, category, status, current_value, unit, target_year, source, impact_type, evidence_status, owner, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(p.name, p.category, p.status, p.currentValue, p.unit, p.targetYear, p.source, p.impactType, p.evidenceStatus, p.owner, now, now).run();
  const id = Number(result.meta?.last_row_id || 0);
  await recordAudit(db, "create", `${p.name} created`, id, now);
  return json({ ok: true, id }, 201);
}

async function deleteProject(url, db) {
  const id = Number(url.searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0) return json({ ok: false, error: "invalid_id" }, 400);
  const existing = await db.prepare("SELECT name FROM projects WHERE id = ?").bind(id).first();
  if (!existing) return json({ ok: false, error: "not_found" }, 404);
  await db.prepare("DELETE FROM projects WHERE id = ?").bind(id).run();
  await recordAudit(db, "delete", `${existing.name} deleted`, id, new Date().toISOString());
  return json({ ok: true });
}

async function recordAudit(db, action, detail, recordId, createdAt) {
  await db.prepare("INSERT INTO audit_log (action, detail, record_id, created_at) VALUES (?, ?, ?, ?)").bind(action, detail, recordId, createdAt).run();
}

function normalizeProject(input) {
  const project = {
    id: Number.isInteger(Number(input.id)) && Number(input.id) > 0 ? Number(input.id) : null,
    name: cleanText(input.name, 160),
    category: cleanText(input.category, 80),
    status: cleanText(input.status, 80),
    currentValue: Number(input.currentValue),
    unit: cleanText(input.unit, 30) || "tCO2e",
    targetYear: Number(input.targetYear),
    source: cleanText(input.source, 500),
    impactType: cleanText(input.impactType, 80),
    evidenceStatus: cleanText(input.evidenceStatus, 80),
    owner: cleanText(input.owner, 120),
  };
  if (!project.name || !project.category || !project.status || !project.source || !project.impactType || !project.evidenceStatus || !project.owner) return { error: "required_fields" };
  if (!Number.isFinite(project.currentValue) || project.currentValue < 0) return { error: "invalid_value" };
  if (!Number.isInteger(project.targetYear) || project.targetYear < 2025 || project.targetYear > 2050) return { error: "invalid_target_year" };
  return project;
}

async function readJson(request) {
  const contentType = request.headers.get("Content-Type") || "";
  if (!contentType.includes("application/json")) throw new Error("unsupported_media_type");
  const length = Number(request.headers.get("Content-Length") || 0);
  if (length > 12000) throw new Error("payload_too_large");
  return request.json();
}

function cleanText(value, maxLength) {
  return String(value || "").replace(/[\u0000-\u001F\u007F]/g, " ").trim().slice(0, maxLength);
}

async function sign(value, password) {
  const keyMaterial = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`ceri-sc-session:${password}`));
  const key = await crypto.subtle.importKey("raw", keyMaterial, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return bytesToBase64Url(new Uint8Array(signature));
}

async function timingSafeEqual(left, right) {
  const [leftHash, rightHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(left))),
    crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(right))),
  ]);
  const a = new Uint8Array(leftHash), b = new Uint8Array(rightHash);
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) difference |= a[index] ^ b[index];
  return difference === 0;
}

function loginPage(url, invalid) {
  const next = safeNext(`${url.pathname}${url.search}`);
  const error = invalid ? `<div class="error" role="alert">كلمة المرور غير صحيحة · Incorrect access password</div>` : "";
  const html = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#06241e"><title>Secure Access · CERI-SC</title><style>
  :root{color-scheme:dark;--ink:#eafff8;--muted:#91b9ae;--line:rgba(63,220,174,.24);--green:#2ee0ad}*{box-sizing:border-box}html,body{min-height:100%;margin:0}body{display:grid;place-items:center;padding:24px;color:var(--ink);font-family:Arial,"Segoe UI",sans-serif;background:radial-gradient(circle at 15% 10%,rgba(31,207,157,.18),transparent 30%),radial-gradient(circle at 90% 85%,rgba(12,123,143,.18),transparent 34%),linear-gradient(145deg,#031812,#061f26 72%,#041316)}.shell{width:min(950px,100%);display:grid;grid-template-columns:1.05fr .95fr;border:1px solid var(--line);border-radius:24px;overflow:hidden;background:rgba(4,28,24,.76);box-shadow:0 30px 90px rgba(0,0,0,.42)}.brand{min-height:520px;padding:48px;display:flex;flex-direction:column;justify-content:space-between;direction:ltr;background:linear-gradient(150deg,rgba(21,151,116,.23),rgba(3,30,34,.6))}.mark{display:flex;align-items:center;gap:14px}.icon{width:54px;height:54px;border-radius:17px;display:grid;place-items:center;color:#03251c;font-weight:900;background:linear-gradient(135deg,#40e5b6,#20bfa1)}.mark span{display:block;margin-top:5px;color:var(--muted);font-size:11px}.eyebrow{color:var(--green);font-size:11px;font-weight:800;letter-spacing:.16em;text-transform:uppercase}.message h1{margin:14px 0;font-size:48px;line-height:1.04}.message p,.sub,.note{color:var(--muted);line-height:1.7}.panel{padding:48px 44px;display:flex;flex-direction:column;justify-content:center}.lock{width:46px;height:46px;border:1px solid var(--line);border-radius:14px;display:grid;place-items:center;color:var(--green);font-size:21px}h2{margin:20px 0 8px;font-size:25px}.sub{font-size:13px;margin-bottom:28px}label{display:block;margin-bottom:8px;font-size:12px;font-weight:700}input,button{width:100%;height:52px;border-radius:12px;font-size:14px}input{padding:0 15px;border:1px solid rgba(132,190,174,.3);outline:none;color:#fff;background:rgba(1,15,14,.62);direction:ltr}button{margin-top:14px;border:0;cursor:pointer;color:#03251c;background:linear-gradient(135deg,#40e5b6,#20bfa1);font-weight:900}.error{margin-bottom:15px;padding:11px;border:1px solid rgba(255,108,108,.34);border-radius:10px;color:#ffc6c6;background:rgba(164,39,39,.16);font-size:12px}.note{font-size:10px}.en{direction:ltr;text-align:left}@media(max-width:760px){body{padding:14px}.shell{grid-template-columns:1fr}.brand{min-height:260px;padding:30px}.message h1{font-size:34px}.panel{padding:34px 28px}.message p{display:none}}
  </style></head><body><main class="shell"><section class="brand"><div class="mark"><div class="icon">SC</div><div><strong>CERI-SC V9.0</strong><span>Secure Intelligence Platform</span></div></div><div class="message"><div class="eyebrow">Protected presentation environment</div><h1>Suez Canal Climate Intelligence</h1><p>Indicative Carbon Emission Reduction Index · Scientific decision-support and scenario intelligence.</p></div></section><section class="panel"><div class="lock">⌾</div><h2>الدخول الآمن</h2><p class="sub">أدخل كلمة مرور العرض للوصول إلى المنصة.<br><span class="en">Enter the presentation password to continue.</span></p>${error}<form action="/auth/login" method="post" autocomplete="off"><input type="hidden" name="next" value="${escapeHtml(next)}"><label for="password">كلمة المرور · Password</label><input id="password" name="password" type="password" autocomplete="current-password" required autofocus><button type="submit">دخول المنصة · Enter platform</button></form><p class="note">جلسة آمنة لمدة 8 ساعات · Secure 8-hour session<br>Authorized presentation access only</p></section></main></body></html>`;
  return new Response(html, { status: invalid ? 401 : 200, headers: securityHeaders("text/html; charset=utf-8") });
}

async function protectedResponse(response) {
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "private, no-store, max-age=0");
  headers.set("Pragma", "no-cache");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "SAMEORIGIN");
  headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  if ((headers.get("Content-Type") || "").includes("text/html")) headers.set("Content-Security-Policy", "default-src 'self'; img-src 'self' data: https://upload.wikimedia.org; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src 'self' 'unsafe-inline'; connect-src 'self' https://query.wikidata.org; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function serviceUnavailable() {
  return new Response("CERI-SC secure access is not configured. Add the ACCESS_PASSWORD secret in Cloudflare.", { status: 503, headers: securityHeaders("text/plain; charset=utf-8") });
}

function securityHeaders(contentType) {
  return { "Content-Type": contentType, "Cache-Control": "no-store, max-age=0", "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff", "X-Frame-Options": "DENY" };
}

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { ...securityHeaders("application/json; charset=utf-8"), "Content-Security-Policy": "default-src 'none'" } });
}

function apiException(error) {
  const code = error instanceof SyntaxError ? "invalid_json" : String(error?.message || "internal_error");
  if (code === "unsupported_media_type") return json({ ok: false, error: code }, 415);
  if (code === "payload_too_large") return json({ ok: false, error: code }, 413);
  if (code === "invalid_json") return json({ ok: false, error: code }, 400);
  console.error("CERI-SC API request failed", code);
  return json({ ok: false, error: "internal_error" }, 500);
}

function sameOrigin(request, url) {
  const fetchSite = request.headers.get("Sec-Fetch-Site");
  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") return false;
  const origin = request.headers.get("Origin");
  if (!origin || origin === "null") return true;
  try { const parsedOrigin = new URL(origin); return parsedOrigin.protocol === url.protocol && parsedOrigin.host === url.host; } catch { return false; }
}

function safeNext(value) {
  const next = String(value || "/");
  return next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

function escapeHtml(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function toBase64Url(value) { return bytesToBase64Url(new TextEncoder().encode(value)); }
function fromBase64Url(value) { const base64 = value.replaceAll("-", "+").replaceAll("_", "/"); const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4); return new TextDecoder().decode(Uint8Array.from(atob(padded), (character) => character.charCodeAt(0))); }
function bytesToBase64Url(bytes) { let binary = ""; for (const byte of bytes) binary += String.fromCharCode(byte); return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", ""); }
function delay(milliseconds) { return new Promise((resolve) => setTimeout(resolve, milliseconds)); }
