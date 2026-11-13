// The Ave Display — tiny local server (no npm installs needed)
// Run:  node server.js     then open http://<this-computer-ip>:3000 on the tablet

const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");

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

const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");

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
