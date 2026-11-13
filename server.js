// The Ave Display — tiny local server (no npm installs needed)
process.env.TZ = process.env.TZ || "America/New_York";
// Run:  node server.js     then open http://<this-computer-ip>:3000 on the tablet

const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { execSync } = require("child_process");
const hue = require("./lib/hue");
const events = require("./lib/events");
const timers = require("./lib/timers");
const { env, saveEnv } = require("./lib/env");

// Phones on the Wi-Fi need a PIN; the tablet itself (localhost) doesn't.
if (!env.REMOTE_PIN) {
  env.REMOTE_PIN = String(Math.floor(1000 + Math.random() * 9000));
  saveEnv();
}
function isLocal(req) {
  const a = req.socket.remoteAddress || "";
  return a === "127.0.0.1" || a === "::1" || a.endsWith(":127.0.0.1");
}
function authed(req) {
  if (isLocal(req)) return true;
  return (req.headers.cookie || "").split(/;\s*/).includes(`ave_pin=${env.REMOTE_PIN}`);
}
function lanAddress() {
  for (const addrs of Object.values(os.networkInterfaces())) {
    for (const a of addrs || []) if (a.family === "IPv4" && !a.internal) return a.address;
  }
  return "localhost";
}

const PORT = process.env.PORT || 3000;
const STARTED_AT = Date.now(); // changes on every restart, so open pages reload after server updates
const PUBLIC_DIR = path.join(__dirname, "public");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".wav": "audio/wav",
};

// Newest modified time of any file in public/ — the page polls this and
// reloads itself when it changes, so saving in VS Code refreshes the tablet.
function latestChange(dir) {
  let newest = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    const t = entry.isDirectory() ? latestChange(full) : fs.statSync(full).mtimeMs;
    if (t > newest) newest = t;
  }
  return newest;
}

function sendJson(res, code, obj) {
  res.writeHead(code, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  res.end(JSON.stringify(obj));
}

function readBody(req) {
  return new Promise((resolve) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      try { resolve(raw ? JSON.parse(raw) : {}); } catch { resolve({}); }
    });
  });
}

// ===== Hue API used by the dashboard =====
async function handleHue(req, res, url) {
  try {
    if (url.pathname === "/api/hue/status") return sendJson(res, 200, hue.status());
    if (url.pathname === "/api/hue/pair" && req.method === "POST") return sendJson(res, 200, await hue.pair());
    if (url.pathname === "/api/hue/rooms" && req.method === "GET") return sendJson(res, 200, await hue.rooms());
    const m = url.pathname.match(/^\/api\/hue\/rooms\/([^/]+)$/);
    if (m && req.method === "PUT") return sendJson(res, 200, await hue.setRoom(m[1], await readBody(req)));
    if (url.pathname === "/api/hue/scenes" && req.method === "GET") return sendJson(res, 200, await hue.scenes());
    const sc = url.pathname.match(/^\/api\/hue\/scenes\/(.+)$/);
    if (sc && req.method === "POST") return sendJson(res, 200, await hue.runScene(decodeURIComponent(sc[1])));
    return sendJson(res, 404, { error: "Not found" });
  } catch (err) {
    console.error("Hue error:", err.message);
    return sendJson(res, err.code || 500, { error: err.message });
  }
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");

  if (url.pathname === "/api/login" && req.method === "POST") {
    readBody(req).then((b) => {
      if (String(b.pin || "") === env.REMOTE_PIN) {
        res.setHeader("Set-Cookie", `ave_pin=${env.REMOTE_PIN}; Max-Age=31536000; Path=/; SameSite=Lax`);
        return sendJson(res, 200, { ok: true });
      }
      setTimeout(() => sendJson(res, 401, { ok: false }), 800);
    });
    return;
  }
  if (url.pathname === "/api/remote-info") {
    if (!isLocal(req)) return sendJson(res, 403, { error: "tablet only" });
    return sendJson(res, 200, { url: `http://${lanAddress()}:${PORT}/remote`, pin: env.REMOTE_PIN });
  }
  if (url.pathname.startsWith("/api/") && !authed(req)) return sendJson(res, 401, { error: "PIN required" });

  if (url.pathname.startsWith("/api/hue/")) return handleHue(req, res, url);

  if (url.pathname.startsWith("/api/timers")) {
    (async () => {
      const id = (url.pathname.match(/^\/api\/timers\/(\d+)/) || [])[1];
      if (!id && req.method === "GET") return sendJson(res, 200, timers.list());
      if (!id && req.method === "POST") {
        const b = await readBody(req);
        return sendJson(res, 200, timers.add(b.seconds, b.label));
      }
      if (id && req.method === "DELETE") return sendJson(res, 200, { ok: timers.remove(id) });
      if (id && url.pathname.endsWith("/add") && req.method === "POST") {
        const b = await readBody(req);
        return sendJson(res, 200, timers.addTime(id, Number(b.seconds) || 60));
      }
      sendJson(res, 404, { error: "Not found" });
    })().catch((err) => sendJson(res, 500, { error: err.message }));
    return;
  }

  if (url.pathname === "/api/events") {
    events.personal()
      .then(async (personal) => ({ personal, local: await events.local(personal.offDays) }))
      .then(({ personal, local }) => sendJson(res, 200, { personal, local }))
      .catch((err) => sendJson(res, 500, { error: err.message }));
    return;
  }

  if (url.pathname === "/__info") {
    let commit = "dev";
    try { commit = execSync("git rev-parse --short HEAD", { cwd: __dirname }).toString().trim(); } catch {}
    res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    return res.end(JSON.stringify({ commit }));
  }

  if (url.pathname === "/__version") {
    res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    return res.end(JSON.stringify({ version: `${latestChange(PUBLIC_DIR)}-${STARTED_AT}` }));
  }

  const page = url.pathname === "/" ? "index.html" : url.pathname === "/remote" ? "remote.html" : url.pathname;
  let filePath = path.join(PUBLIC_DIR, page);
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end("Forbidden");
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      return res.end("Not found");
    }
    res.writeHead(200, {
      "Content-Type": MIME[path.extname(filePath)] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    res.end(data);
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`\nThe Ave Display running on port ${PORT}`);
  console.log("Open one of these on the tablet:");
  for (const addrs of Object.values(os.networkInterfaces())) {
    for (const a of addrs || []) {
      if (a.family === "IPv4" && !a.internal) console.log(`  http://${a.address}:${PORT}`);
    }
  }
  console.log("");
});
