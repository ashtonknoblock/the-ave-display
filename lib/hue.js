// Philips Hue (v1 local API). Pairing details are kept in .env on the
// device itself — never committed to GitHub.
const https = require("https");
const http = require("http");
const fs = require("fs");
const path = require("path");

const ENV_FILE = path.join(__dirname, "..", ".env");
const env = {};

function loadEnv() {
  try {
    for (const line of fs.readFileSync(ENV_FILE, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m) env[m[1]] = m[2];
    }
  } catch {}
}
function saveEnv() {
  const body = Object.entries(env).map(([k, v]) => `${k}=${v}`).join("\n") + "\n";
  fs.writeFileSync(ENV_FILE, body);
}
loadEnv();

// Generic JSON request. Hue bridges use a self-signed certificate, so
// certificate checks are skipped for the bridge only.
function request(url, method = "GET", body) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith("https") ? https : http;
    const data = body ? JSON.stringify(body) : null;
    const req = lib.request(
      url,
      {
        method,
        timeout: 5000,
        rejectUnauthorized: !url.includes(env.HUE_BRIDGE_IP || "\u0000"),
        headers: data ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) } : {},
      },
      (res) => {
        let raw = "";
        res.on("data", (c) => (raw += c));
        res.on("end", () => {
          try { resolve(JSON.parse(raw)); } catch { reject(new Error("Bad JSON from " + url)); }
        });
      }
    );
    req.on("timeout", () => req.destroy(new Error("Timed out: " + url)));
    req.on("error", reject);
    if (data) req.write(data);
    req.end();
  });
}

const proto = () => env.HUE_PROTOCOL || "https";
const bridgeUrl = (p) => `${proto()}://${env.HUE_BRIDGE_IP}/api${p}`;

async function discover() {
  const found = await request("https://discovery.meethue.com/");
  if (!Array.isArray(found) || !found.length) throw new Error("No Hue Bridge found on this network");
  return found[0].internalipaddress;
}

function status() {
  return { paired: Boolean(env.HUE_BRIDGE_IP && env.HUE_USERNAME), bridge: env.HUE_BRIDGE_IP || null };
}

// Call right after the button on the bridge has been pressed.
async function pair() {
  if (!env.HUE_BRIDGE_IP) {
    env.HUE_BRIDGE_IP = await discover();
    saveEnv();
  }
  const res = await request(bridgeUrl(""), "POST", { devicetype: "the_ave_display#tablet" });
  const r = Array.isArray(res) ? res[0] : res;
  if (r && r.success && r.success.username) {
    env.HUE_USERNAME = r.success.username;
    saveEnv();
    return { ok: true };
  }
  if (r && r.error && r.error.type === 101) return { ok: false, reason: "press-button" };
  return { ok: false, reason: (r && r.error && r.error.description) || "unknown" };
}

function assertPaired() {
  if (!status().paired) throw Object.assign(new Error("Hue not paired"), { code: 409 });
}

async function rooms() {
  assertPaired();
  const groups = await request(bridgeUrl(`/${env.HUE_USERNAME}/groups`));
  if (Array.isArray(groups) && groups[0] && groups[0].error) {
    throw Object.assign(new Error(groups[0].error.description), { code: 502 });
  }
  return Object.entries(groups)
    .filter(([, g]) => g.type === "Room" || g.type === "Zone")
    .map(([id, g]) => ({
      id,
      name: g.name,
      type: g.type,
      on: Boolean(g.state && g.state.any_on),
      allOn: Boolean(g.state && g.state.all_on),
      bri: (g.action && g.action.bri) || 254,
      lights: (g.lights || []).length,
    }))
    .sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === "Room" ? -1 : 1));
}

async function setRoom(id, { on, bri }) {
  assertPaired();
  const action = {};
  if (typeof on === "boolean") action.on = on;
  if (typeof bri === "number") {
    action.bri = Math.max(1, Math.min(254, Math.round(bri)));
    action.on = true;
  }
  return request(bridgeUrl(`/${env.HUE_USERNAME}/groups/${encodeURIComponent(id)}/action`), "PUT", action);
}

module.exports = { status, pair, rooms, setRoom };
