const COOKIE_NAME = "ceri_sc_session";
const SESSION_SECONDS = 8 * 60 * 60;

export default {
  async fetch(request, env) {
    if (!env.ACCESS_PASSWORD) {
      return serviceUnavailable();
    }

    const url = new URL(request.url);

    if (url.pathname === "/auth/login" && request.method === "POST") {
      return login(request, env, url);
    }

    if (url.pathname === "/auth/logout") {
      return logout(url);
    }

    if (!(await hasValidSession(request, env.ACCESS_PASSWORD))) {
      return loginPage(url, false);
    }

    const response = await env.ASSETS.fetch(request);
    return protectedResponse(response);
  },
};

async function login(request, env, url) {
  if (!sameOrigin(request, url)) {
    return new Response("Forbidden", { status: 403 });
  }

  const form = await request.formData();
  const supplied = String(form.get("password") || "");
  const passwordIsValid = await timingSafeEqual(supplied, env.ACCESS_PASSWORD);

  if (!passwordIsValid) {
    await delay(650);
    return loginPage(url, true);
  }

  const expires = Math.floor(Date.now() / 1000) + SESSION_SECONDS;
  const payload = toBase64Url(JSON.stringify({ exp: expires }));
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

async function hasValidSession(request, password) {
  const cookie = request.headers.get("Cookie") || "";
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]+)`));
  if (!match) return false;

  const [payload, providedSignature] = match[1].split(".");
  if (!payload || !providedSignature) return false;

  const expectedSignature = await sign(payload, password);
  if (!(await timingSafeEqual(providedSignature, expectedSignature))) return false;

  try {
    const session = JSON.parse(fromBase64Url(payload));
    return Number.isFinite(session.exp) && session.exp > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

async function sign(value, password) {
  const keyMaterial = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`ceri-sc-session:${password}`),
  );
  const key = await crypto.subtle.importKey(
    "raw",
    keyMaterial,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(value),
  );
  return bytesToBase64Url(new Uint8Array(signature));
}

async function timingSafeEqual(left, right) {
  const leftHash = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(left)),
  );
  const rightHash = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(right)),
  );

  let difference = 0;
  for (let index = 0; index < leftHash.length; index += 1) {
    difference |= leftHash[index] ^ rightHash[index];
  }
  return difference === 0;
}

function loginPage(url, invalid) {
  const next = safeNext(`${url.pathname}${url.search}`);
  const error = invalid
    ? `<div class="error" role="alert">كلمة المرور غير صحيحة · Incorrect access password</div>`
    : "";

  const html = `<!doctype html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="theme-color" content="#06241e">
  <title>Secure Access · CERI-SC</title>
  <style>
    :root{color-scheme:dark;--ink:#eafff8;--muted:#91b9ae;--line:rgba(63,220,174,.24);--green:#2ee0ad}
    *{box-sizing:border-box}html,body{min-height:100%;margin:0}
    body{display:grid;place-items:center;padding:24px;color:var(--ink);font-family:Arial,"Segoe UI",sans-serif;background:radial-gradient(circle at 15% 10%,rgba(31,207,157,.18),transparent 30%),radial-gradient(circle at 90% 85%,rgba(12,123,143,.18),transparent 34%),linear-gradient(145deg,#031812,#061f26 72%,#041316)}
    .shell{width:min(950px,100%);display:grid;grid-template-columns:1.05fr .95fr;border:1px solid var(--line);border-radius:24px;overflow:hidden;background:rgba(4,28,24,.76);box-shadow:0 30px 90px rgba(0,0,0,.42);backdrop-filter:blur(16px)}
    .brand{position:relative;min-height:520px;padding:48px;display:flex;flex-direction:column;justify-content:space-between;direction:ltr;background:linear-gradient(150deg,rgba(21,151,116,.23),rgba(3,30,34,.6))}
    .brand:before,.brand:after{content:"";position:absolute;border:1px solid rgba(46,224,173,.17);border-radius:50%}.brand:before{width:390px;height:390px;left:-180px;bottom:-190px}.brand:after{width:260px;height:260px;left:-115px;bottom:-125px}
    .mark{display:flex;align-items:center;gap:14px}.icon{width:54px;height:54px;border-radius:17px;display:grid;place-items:center;color:#03251c;font-weight:900;font-size:20px;background:linear-gradient(135deg,#40e5b6,#20bfa1);box-shadow:0 12px 35px rgba(46,224,173,.22)}
    .mark strong{font-size:19px}.mark span{display:block;margin-top:5px;color:var(--muted);font-size:11px}
    .message{position:relative;z-index:1}.eyebrow{color:var(--green);font-size:11px;font-weight:800;letter-spacing:.16em;text-transform:uppercase}.message h1{max-width:500px;margin:14px 0 16px;font-size:clamp(31px,4vw,51px);line-height:1.04;letter-spacing:-.04em}.message p{max-width:500px;margin:0;color:var(--muted);line-height:1.7;font-size:14px}
    .panel{padding:48px 44px;display:flex;flex-direction:column;justify-content:center}.lock{width:46px;height:46px;border:1px solid var(--line);border-radius:14px;display:grid;place-items:center;color:var(--green);font-size:21px;background:rgba(46,224,173,.07)}h2{margin:20px 0 8px;font-size:25px}.sub{margin:0 0 28px;color:var(--muted);font-size:13px;line-height:1.7}
    label{display:block;margin-bottom:8px;font-size:12px;font-weight:700}input{width:100%;height:52px;padding:0 15px;border:1px solid rgba(132,190,174,.3);border-radius:12px;outline:none;color:#fff;background:rgba(1,15,14,.62);font-size:16px;direction:ltr}input:focus{border-color:var(--green);box-shadow:0 0 0 4px rgba(46,224,173,.1)}
    button{width:100%;height:52px;margin-top:14px;border:0;border-radius:12px;cursor:pointer;color:#03251c;background:linear-gradient(135deg,#40e5b6,#20bfa1);font-size:14px;font-weight:900;box-shadow:0 14px 35px rgba(32,191,161,.18)}button:hover{filter:brightness(1.06)}
    .error{margin-bottom:15px;padding:11px 13px;border:1px solid rgba(255,108,108,.34);border-radius:10px;color:#ffc6c6;background:rgba(164,39,39,.16);font-size:12px;line-height:1.6}.note{margin-top:20px;color:#759f94;font-size:10px;line-height:1.7}.en{direction:ltr;text-align:left}
    @media(max-width:760px){body{padding:14px}.shell{grid-template-columns:1fr}.brand{min-height:270px;padding:30px}.message h1{font-size:34px}.panel{padding:34px 28px}.brand .message p{display:none}}
  </style>
</head>
<body>
  <main class="shell">
    <section class="brand">
      <div class="mark"><div class="icon">SC</div><div><strong>CERI-SC</strong><span>Secure Intelligence Platform</span></div></div>
      <div class="message">
        <div class="eyebrow">Protected presentation environment</div>
        <h1>Suez Canal Climate Intelligence</h1>
        <p>Indicative Carbon Emission Reduction Index · Scientific decision-support and scenario intelligence.</p>
      </div>
    </section>
    <section class="panel">
      <div class="lock">⌾</div>
      <h2>الدخول الآمن</h2>
      <p class="sub">أدخل كلمة مرور العرض للوصول إلى المنصة.<br><span class="en">Enter the presentation password to continue.</span></p>
      ${error}
      <form action="/auth/login" method="post" autocomplete="off">
        <input type="hidden" name="next" value="${escapeHtml(next)}">
        <label for="password">كلمة المرور · Password</label>
        <input id="password" name="password" type="password" autocomplete="current-password" required autofocus>
        <button type="submit">دخول المنصة · Enter platform</button>
      </form>
      <p class="note">جلسة آمنة لمدة 8 ساعات · Secure 8-hour session<br>Authorized presentation access only</p>
    </section>
  </main>
  <script>if("serviceWorker" in navigator){navigator.serviceWorker.getRegistrations().then(r=>r.forEach(x=>x.unregister()));}if("caches" in window){caches.keys().then(k=>k.forEach(x=>caches.delete(x)));}</script>
</body>
</html>`;

  return new Response(html, {
    status: invalid ? 401 : 200,
    headers: securityHeaders("text/html; charset=utf-8"),
  });
}

async function protectedResponse(response) {
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "private, no-store, max-age=0");
  headers.set("Pragma", "no-cache");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "SAMEORIGIN");
  const contentType = headers.get("Content-Type") || "";
  let body = response.body;

  if (response.ok && contentType.includes("text/html")) {
    const html = await response.text();
    const logoutControl = `<a href="/auth/logout" aria-label="Secure logout" style="position:fixed;z-index:2147483647;right:16px;bottom:16px;padding:10px 13px;border:1px solid rgba(46,224,173,.5);border-radius:11px;background:rgba(3,31,27,.94);color:#dffff5;font:700 11px Arial,sans-serif;text-decoration:none;box-shadow:0 10px 30px rgba(0,0,0,.35)">خروج آمن · Logout</a>`;
    body = html.includes("</body>")
      ? html.replace("</body>", `${logoutControl}</body>`)
      : `${html}${logoutControl}`;
    headers.delete("Content-Length");
  }

  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function serviceUnavailable() {
  return new Response(
    "CERI-SC secure access is not configured. Add the ACCESS_PASSWORD secret in Cloudflare.",
    { status: 503, headers: securityHeaders("text/plain; charset=utf-8") },
  );
}

function securityHeaders(contentType) {
  return {
    "Content-Type": contentType,
    "Cache-Control": "no-store, max-age=0",
    "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
  };
}

function sameOrigin(request, url) {
  const origin = request.headers.get("Origin");
  return !origin || origin === url.origin;
}

function safeNext(value) {
  const next = String(value || "/");
  return next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function toBase64Url(value) {
  return bytesToBase64Url(new TextEncoder().encode(value));
}

function fromBase64Url(value) {
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const bytes = Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function bytesToBase64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
