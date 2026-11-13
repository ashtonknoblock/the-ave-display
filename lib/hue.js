// Philips Hue (v1 local API). Pairing details are kept in .env on the
// device itself — never committed to GitHub.
const https = require("https");
const http = require("http");

const { env, saveEnv } = require("./env");

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

// ===== Scenes =====
// Our own one-tap scenes (work with whatever rooms you have), plus any
// scenes you've saved in the Hue app.
const WARM = 454; // color temperature (mireds): ~2200K warm
const NEUTRAL = 366; // ~2700K

const BUILT_IN = [
  { id: "all-on", name: "All on", icon: "💡" },
  { id: "movie", name: "Movie", icon: "🎬" },
  { id: "bedtime", name: "Bedtime", icon: "🌙" },
  { id: "all-off", name: "All off", icon: "⏻" },
];

async function hueScenes() {
  assertPaired();
  const [scenes, groups] = await Promise.all([
    request(bridgeUrl(`/${env.HUE_USERNAME}/scenes`)),
    request(bridgeUrl(`/${env.HUE_USERNAME}/groups`)),
  ]);
  if (Array.isArray(scenes)) return [];
  return Object.entries(scenes)
    .filter(([, s]) => s.type === "GroupScene" && !s.recycle && groups[s.group])
    .map(([id, s]) => ({ id, name: s.name, room: groups[s.group].name, group: s.group }))
    .sort((a, b) => a.room.localeCompare(b.room) || a.name.localeCompare(b.name));
}

async function scenes() {
  return { builtIn: BUILT_IN, hue: await hueScenes().catch(() => []) };
}

const put = (p, body) => request(bridgeUrl(`/${env.HUE_USERNAME}${p}`), "PUT", body);

async function runScene(id) {
  assertPaired();
  const list = await rooms();
  const roomsOnly = list.filter((r) => r.type === "Room");
  const match = (re) => roomsOnly.filter((r) => re.test(r.name));
  const setAll = (fn) => Promise.all(roomsOnly.map((r) => put(`/groups/${r.id}/action`, fn(r))));

  switch (id) {
    case "all-off":
      return put("/groups/0/action", { on: false });
    case "all-on":
      return put("/groups/0/action", { on: true, bri: 254, ct: NEUTRAL });
    case "movie": {
      const living = match(/living|family|tv|den|lounge/i);
      const keep = new Set(living.map((r) => r.id));
      return setAll((r) => (keep.has(r.id) ? { on: true, bri: 40, ct: WARM } : { on: false }));
    }
    case "bedtime": {
      const bed = match(/bed|our room|master/i);
      const keep = new Set(bed.map((r) => r.id));
      return setAll((r) => (keep.has(r.id) ? { on: true, bri: 30, ct: WARM } : { on: false }));
    }
    default: {
      // a Hue app scene: "hue:<sceneId>:<groupId>"
      const m = String(id).match(/^hue:([^:]+):(.+)$/);
      if (!m) throw Object.assign(new Error("Unknown scene"), { code: 404 });
      return put(`/groups/${encodeURIComponent(m[2])}/action`, { scene: m[1] });
    }
  }
}

module.exports = { status, pair, rooms, setRoom, scenes, runScene };
