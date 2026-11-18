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
const note = require("./lib/note");
const recipes = require("./lib/recipes");
const tv = require("./lib/tv");
const list = require("./lib/list");
const games = require("./lib/games");
const { env, saveEnv } = require("./lib/env");

// Phones on the Wi-Fi need a PIN; the tablet itself (localhost) doesn't.
if (!env.REMOTE_PIN) {
  env.REMOTE_PIN = String(Math.floor(1000 + Math.random() * 9000));
  saveEnv();
}
// Talk to the voicebox (Pi Zero voice assistant) on the home network.
function voicebox(p, method, body, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const target = new URL(p, env.VOICEBOX_URL || "http://192.168.1.216:8080");
    const data = body == null ? null : JSON.stringify(body);
    const headers = { "X-Voicebox-Pin": env.VOICEBOX_PIN || env.REMOTE_PIN };
    if (data) { headers["Content-Type"] = "application/json"; headers["Content-Length"] = Buffer.byteLength(data); }
    const r = http.request(target, { method, timeout: timeoutMs, headers }, (vr) => {
      let raw = "";
      vr.setEncoding("utf8");
      vr.on("data", (c) => (raw += c));
      vr.on("end", () => { let json = {}; try { json = JSON.parse(raw); } catch {} resolve({ status: vr.statusCode, json }); });
    });
    r.on("timeout", () => r.destroy(new Error("Voicebox didn't answer")));
    r.on("error", reject);
    r.end(data || undefined);
  });
}
let partyNow = null;
// When any timer finishes, the voicebox says so out loud.
timers.onDone((t) => voicebox("/api/say", "POST", { text: t.say || timers.spoken(t), kind: "timer" }).catch(() => {}));

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
  ".webmanifest": "application/manifest+json; charset=utf-8",
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
    const al = url.pathname.match(/^\/api\/hue\/alert\/(red|blue|gold)$/); // flash every light that colour, then restore
    if (al && req.method === "POST") { hue.alertRed(al[1]).catch((e) => console.error("Light alert:", e.message)); return sendJson(res, 200, { ok: true }); }
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

  if (url.pathname.startsWith("/api/tv")) {
    (async () => {
      const m = url.pathname.match(/^\/api\/tv\/(\w+)\/(\w+)$/);
      if (url.pathname === "/api/tv" && req.method === "GET") return sendJson(res, 200, await tv.list());
      if (m && req.method === "POST") return sendJson(res, 200, (await tv.act(m[1], m[2], (await readBody(req)).arg)) || { ok: true });
      sendJson(res, 404, { error: "Not found" });
    })().catch((err) => sendJson(res, err.code || 500, { error: err.message }));
    return;
  }

  if (url.pathname.startsWith("/api/recipes")) {
    (async () => {
      const p = url.pathname, m = p.match(/^\/api\/recipes\/([\w-]+)$/);
      if (p === "/api/recipes/cook" && req.method === "GET") return sendJson(res, 200, recipes.cookState());
      if (p === "/api/recipes/cook" && req.method === "POST") return sendJson(res, 200, recipes.setCook(await readBody(req)));
      if (p === "/api/recipes/cook/timer" && req.method === "POST") {
        const t = recipes.stepTimer(await readBody(req));
        return sendJson(res, 200, { ok: true, spoken: t.human, timer: timers.add(t.seconds, t.label, t.say) });
      }
      if (p === "/api/recipes" && req.method === "GET") return sendJson(res, 200, recipes.list());
      if (p === "/api/recipes" && req.method === "POST") return sendJson(res, 200, recipes.add(await readBody(req)));
      if (p === "/api/recipes/import" && req.method === "POST") return sendJson(res, 200, await recipes.importUrl((await readBody(req)).url));
      if (p === "/api/recipes/show" && req.method === "GET") return sendJson(res, 200, { showing: recipes.getShowing() });
      if (p === "/api/recipes/show" && req.method === "POST") return sendJson(res, 200, recipes.show((await readBody(req)).id));
      if (m && req.method === "GET") { const r = recipes.get(m[1]); return r ? sendJson(res, 200, r) : sendJson(res, 404, { error: "Not found" }); }
      if (m && req.method === "DELETE") return sendJson(res, 200, recipes.remove(m[1]));
      if (m && req.method === "PATCH") return sendJson(res, 200, recipes.setCategory(m[1], (await readBody(req)).category));
      sendJson(res, 404, { error: "Not found" });
    })().catch((err) => sendJson(res, err.code || 500, { error: err.message }));
    return;
  }

  // Voicebox (the Pi Zero voice assistant): say / ask / party controls are passed straight through.
  if (url.pathname.startsWith("/api/voicebox/")) {
    (async () => {
      const sub = url.pathname.slice("/api/voicebox".length);
      if (!/^\/(say|ask|settings|party|party\/(search|add|remove))$/.test(sub)) return sendJson(res, 404, { error: "Not found" });
      const b = req.method === "POST" ? await readBody(req) : null;
      if (sub === "/say" || sub === "/ask") {
        b.text = String(b.text || "").trim().slice(0, 300);
        if (!b.text) return sendJson(res, 400, { error: "Type a message" });
      }
      const r = await voicebox("/api" + sub, req.method, b, sub === "/party/search" ? 30000 : 8000);
      if (r.status === 200) return sendJson(res, 200, { ...r.json, ok: true });
      sendJson(res, 502, { error: r.json.error || (r.status === 409 ? "The voicebox is busy" : "Voicebox said " + r.status) });
    })().catch((err) => sendJson(res, 502, { error: "Can't reach the voicebox: " + err.message }));
    return;
  }

  // What party mode is playing, so the tablet can show it (the voicebox reports it here).
  if (url.pathname === "/api/party/now") {
    if (req.method === "POST") return void readBody(req).then((b) => { partyNow = b.title ? { title: String(b.title).slice(0, 80), at: Date.now() } : null; sendJson(res, 200, { ok: true }); });
    if (partyNow && Date.now() - partyNow.at > 8 * 60000) partyNow = null;
    return sendJson(res, 200, { now: partyNow });
  }

  // Shared shopping list (phone remote, voicebox and tablet all use this).
  if (url.pathname.startsWith("/api/list")) {
    (async () => {
      const m = url.pathname.match(/^\/api\/list\/(\d+)$/);
      if (url.pathname === "/api/list" && req.method === "GET") return sendJson(res, 200, list.all());
      if (url.pathname === "/api/list" && req.method === "POST") return sendJson(res, 200, list.add((await readBody(req)).text));
      if (url.pathname === "/api/list/clear" && req.method === "POST") return sendJson(res, 200, list.clearDone());
      if (m && req.method === "PATCH") return sendJson(res, 200, list.set(m[1], (await readBody(req)).done));
      if (m && req.method === "DELETE") return sendJson(res, 200, list.remove(m[1]));
      sendJson(res, 404, { error: "Not found" });
    })().catch((err) => sendJson(res, 500, { error: err.message }));
    return;
  }

  // Today's Pacers / Colts game, for the phone remote's home screen.
  if (url.pathname === "/api/games") return void games.today().then((g) => sendJson(res, 200, g)).catch(() => sendJson(res, 200, { games: [] }));

  if (url.pathname === "/api/note") {
    (async () => {
      if (req.method === "GET") return sendJson(res, 200, { note: note.get() });
      if (req.method === "POST") { const b = await readBody(req); return sendJson(res, 200, { note: note.set(b.text, b.until) }); }
      if (req.method === "DELETE") return sendJson(res, 200, note.clear());
      sendJson(res, 404, { error: "Not found" });
    })().catch((err) => sendJson(res, err.code || 500, { error: err.message }));
    return;
  }

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
