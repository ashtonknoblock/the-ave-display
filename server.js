// The Ave Display — tiny local server (no npm installs needed)
// Run:  node server.js     then open http://<this-computer-ip>:3000 on the tablet

const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { execSync } = require("child_process");
const hue = require("./lib/hue");

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, "public");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
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
    return sendJson(res, 404, { error: "Not found" });
  } catch (err) {
    console.error("Hue error:", err.message);
    return sendJson(res, err.code || 500, { error: err.message });
  }
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");

  if (url.pathname.startsWith("/api/hue/")) return handleHue(req, res, url);

  if (url.pathname === "/__info") {
    let commit = "dev";
    try { commit = execSync("git rev-parse --short HEAD", { cwd: __dirname }).toString().trim(); } catch {}
    res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    return res.end(JSON.stringify({ commit }));
  }

  if (url.pathname === "/__version") {
    res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    return res.end(JSON.stringify({ version: latestChange(PUBLIC_DIR) }));
  }

  let filePath = path.join(PUBLIC_DIR, url.pathname === "/" ? "index.html" : url.pathname);
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
