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
      scene: g.state && g.state.any_on ? active.get(id) || null : (active.delete(id), null),
      allOn: Boolean(g.state && g.state.all_on),
      bri: (g.action && g.action.bri) || 254,
      lights: (g.lights || []).length,
    }))
    .sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === "Room" ? -1 : 1));
}

async function setRoom(id, { on, bri }) {
  assertPaired();
  if (on === false) stopLoop(id);
  if (typeof on === "boolean") active.delete(String(id));
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

// ===== Holiday scenes (shown mid-Nov to early Jan) =====
const XY = { red: [0.675, 0.322], green: [0.214, 0.709], white: null };
const HOLIDAY = [
  { id: "xmas", name: "Christmas", icon: "🎄" },
  { id: "candy", name: "Candy cane", icon: "🍬" },
  { id: "warm", name: "Warm glow", icon: "✨" },
  { id: "twinkle", name: "Twinkle", icon: "🌟" },
];
function holidaySeason(d = new Date()) {
  const m = d.getMonth(), day = d.getDate();
  return m === 10 || m === 11 || (m === 0 && day <= 6);
}
// bri null = change colour only, keep whatever brightness the room is at
const colorState = (c, bri = 254) => {
  const st = c === "white" || !XY[c] ? { on: true, ct: 400, transitiontime: 10 } : { on: true, xy: XY[c], transitiontime: 10 };
  if (bri != null) st.bri = bri;
  return st;
};

// which scene is running in each room/zone, so the buttons can stay lit
const active = new Map();

// one running "twinkle" loop per room; any other command for that room stops it
const loops = new Map();
function stopLoop(groupId) {
  if (groupId === "0") { for (const t of loops.values()) clearInterval(t); loops.clear(); return; }
  const t = loops.get(String(groupId));
  if (t) { clearInterval(t); loops.delete(String(groupId)); }
}

async function runHoliday(kind, groupId) {
  assertPaired();
  const groups = await request(bridgeUrl(`/${env.HUE_USERNAME}/groups`));
  const g = groups[groupId];
  if (!g) throw Object.assign(new Error("Room not found"), { code: 404 });
  const lights = g.lights || [];
  stopLoop(groupId);
  const setLights = (pick) => Promise.all(lights.map((lid, i) => put(`/lights/${lid}/state`, pick(i))));
  if (kind === "warm") return put(`/groups/${groupId}/action`, { on: true, bri: 254, ct: 454, transitiontime: 10 });
  if (kind === "xmas") {
    if (lights.length > 1) return setLights((i) => colorState(i % 2 ? "green" : "red"));
    kind = "twinkle"; // a single light (like one string) can't alternate, so animate instead
  }
  if (kind === "candy") return setLights((i) => colorState(i % 2 ? "white" : "red"));
  if (kind === "twinkle") {
    const seq = ["red", "green", "white"];
    let step = 0;
    const tick = (bri = null) => { step++; return setLights((i) => colorState(seq[(step + i) % seq.length], bri)).catch(() => {}); };
    await tick(254); // start at full brightness; later steps leave the dimmer alone
    loops.set(String(groupId), setInterval(tick, 4000));
    return { ok: true };
  }
  throw Object.assign(new Error("Unknown holiday scene"), { code: 404 });
}

async function scenes() {
  return { builtIn: BUILT_IN, hue: await hueScenes().catch(() => []), holiday: holidaySeason() ? HOLIDAY : [] };
}

const put = (p, body) => request(bridgeUrl(`/${env.HUE_USERNAME}${p}`), "PUT", body);

async function runScene(id) {
  assertPaired();
  const hol = String(id).match(/^holiday:([^:]+):(.+)$/);
  if (hol) { const r = await runHoliday(hol[1], hol[2]); active.set(hol[2], id); return r; }
  const target = (String(id).match(/^hue:[^:]+:(.+)$/) || [])[1];
  stopLoop(target || "0");
  const list = await rooms();
  const roomsOnly = list.filter((r) => r.type === "Room");
  const match = (re) => roomsOnly.filter((r) => re.test(r.name));
  const setAll = (fn) => Promise.all(roomsOnly.map((r) => put(`/groups/${r.id}/action`, fn(r))));

  switch (id) {
    case "all-off":
      active.clear();
      return put("/groups/0/action", { on: false });
    case "all-on":
      active.clear();
      list.forEach((r) => active.set(r.id, "all-on"));
      return put("/groups/0/action", { on: true, bri: 254, ct: NEUTRAL });
    case "movie": {
      const living = match(/living|family|tv|den|lounge/i);
      const keep = new Set(living.map((r) => r.id));
      roomsOnly.forEach((r) => (keep.has(r.id) ? active.set(r.id, "movie") : active.delete(r.id)));
      return setAll((r) => (keep.has(r.id) ? { on: true, bri: 40, ct: WARM } : { on: false }));
    }
    case "bedtime": {
      const bed = match(/bed|our room|master/i);
      const keep = new Set(bed.map((r) => r.id));
      roomsOnly.forEach((r) => (keep.has(r.id) ? active.set(r.id, "bedtime") : active.delete(r.id)));
      return setAll((r) => (keep.has(r.id) ? { on: true, bri: 30, ct: WARM } : { on: false }));
    }
    default: {
      // "hue:<sceneId>:<targetRoomId>" — apply a Hue app scene to any room
      const m = String(id).match(/^hue:([^:]+):(.+)$/);
      if (!m) throw Object.assign(new Error("Unknown scene"), { code: 404 });
      const r = await applyScene(m[1], m[2]);
      active.set(m[2], id);
      return r;
    }
  }
}

// Scenes in the Hue app belong to one room. If the target room has its own
// scene with the same name, use it; otherwise copy the scene's colors onto
// the target room's lights.
async function applyScene(sceneId, targetGroup) {
  const u = `/${env.HUE_USERNAME}`;
  const [allScenes, groups] = await Promise.all([request(bridgeUrl(`${u}/scenes`)), request(bridgeUrl(`${u}/groups`))]);
  const src = allScenes[sceneId];
  const target = groups[targetGroup];
  if (!src || !target) throw Object.assign(new Error("Scene or room not found"), { code: 404 });
  if (src.group === String(targetGroup)) return put(`/groups/${targetGroup}/action`, { scene: sceneId });
  const twin = Object.entries(allScenes).find(([, s]) => s.group === String(targetGroup) && s.name === src.name && !s.recycle);
  if (twin) return put(`/groups/${targetGroup}/action`, { scene: twin[0] });

  const detail = await request(bridgeUrl(`${u}/scenes/${sceneId}`));
  const states = Object.values(detail.lightstates || {}).map((st) => {
    const out = { on: st.on !== false };
    for (const k of ["bri", "xy", "ct", "hue", "sat"]) if (st[k] !== undefined) out[k] = st[k];
    out.transitiontime = 4;
    return out;
  });
  if (!states.length) throw Object.assign(new Error("Scene has no light settings"), { code: 422 });
  return Promise.all((target.lights || []).map((lid, i) => put(`/lights/${lid}/state`, states[i % states.length])));
}

module.exports = { status, pair, rooms, setRoom, scenes, runScene };
