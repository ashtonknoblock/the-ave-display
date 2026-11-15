// TV control over Wi-Fi: LG webOS (living room) and Roku TV (bedroom). No extra packages.
// LG: secure WebSocket on port 3001 + Wake-on-LAN to turn on.
//     Pairing manifest from the lgtv2 project (MIT, (c) Sebastian Raff) — lib/lg-pairing.json.
// Roku: Roku's local "External Control" HTTP API on port 8060.
const tls = require("tls");
const http = require("http");
const dgram = require("dgram");
const crypto = require("crypto");
const { env, saveEnv } = require("./env");
const pairing = require("./lg-pairing.json");

const LG = { ip: () => env.LG_IP || "192.168.1.204", mac: () => env.LG_MAC || "60:ab:14:a7:6e:d0" };
const bad = (msg, code = 400) => Object.assign(new Error(msg), { code });

// ---------- tiny WebSocket client (TLS, text frames only) ----------
function wsOpen(host, port, timeoutMs = 4000) {
  return new Promise((resolve, reject) => {
    const sock = tls.connect({ host, port, rejectUnauthorized: false, timeout: timeoutMs });
    const key = crypto.randomBytes(16).toString("base64");
    let buf = Buffer.alloc(0), open = false, onMsg = () => {};
    const fail = (e) => { sock.destroy(); reject(e); };
    sock.on("timeout", () => fail(new Error("TV didn't answer (it may be off)")));
    sock.on("error", (e) => (open ? sock.destroy() : fail(new Error("TV didn't answer (it may be off)"))));
    sock.on("secureConnect", () =>
      sock.write(`GET / HTTP/1.1\r\nHost: ${host}:${port}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n` +
        `Sec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\n\r\n`));
    sock.on("data", (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      if (!open) {
        const end = buf.indexOf("\r\n\r\n"); if (end < 0) return;
        if (!/^HTTP\/1\.1 101/.test(buf.slice(0, end).toString())) return fail(new Error("TV refused the connection"));
        buf = buf.slice(end + 4); open = true; sock.setTimeout(0);
        resolve({ send, close: () => sock.end(), on: (cb) => (onMsg = cb) });
      }
      for (;;) { // parse frames
        if (buf.length < 2) return;
        const op = buf[0] & 0x0f, masked = buf[1] & 0x80; let len = buf[1] & 0x7f, off = 2;
        if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; }
        else if (len === 127) { if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); off = 10; }
        const mk = masked ? buf.slice(off, off + 4) : null; if (masked) off += 4;
        if (buf.length < off + len) return;
        let data = buf.slice(off, off + len); buf = buf.slice(off + len);
        if (mk) data = Buffer.from(data.map((b, i) => b ^ mk[i % 4]));
        if (op === 1) { try { onMsg(JSON.parse(data.toString())); } catch {} }
        else if (op === 9) frame(0xa, data);
        else if (op === 8) sock.end();
      }
    });
    function frame(op, payload) {
      const mask = crypto.randomBytes(4), n = payload.length;
      const head = n < 126 ? Buffer.from([0x80 | op, 0x80 | n])
        : n < 65536 ? Buffer.from([0x80 | op, 0x80 | 126, n >> 8, n & 255])
        : (() => { const h = Buffer.alloc(10); h[0] = 0x80 | op; h[1] = 0x80 | 127; h.writeBigUInt64BE(BigInt(n), 2); return h; })();
      sock.write(Buffer.concat([head, mask, Buffer.from(payload.map((b, i) => b ^ mask[i % 4]))]));
    }
    function send(obj) { frame(1, Buffer.from(JSON.stringify(obj))); }
  });
}

// ---------- LG webOS ----------
async function lgSession(pairWaitMs = 0) {
  const ws = await wsOpen(LG.ip(), 3001);
  const waiting = new Map();
  let registered;
  const ready = new Promise((res, rej) => (registered = { res, rej }));
  ws.on((m) => {
    if (m.id === "reg0") {
      if (m.type === "registered") {
        const k = m.payload && m.payload["client-key"];
        if (k && k !== env.LG_KEY) { env.LG_KEY = k; saveEnv(); }
        registered.res();
      } else if (m.type === "error") registered.rej(bad("The TV said no to pairing — try again and press Allow/Yes on the TV", 409));
      return;
    }
    const w = waiting.get(m.id); if (!w) return;
    waiting.delete(m.id);
    m.type === "error" || (m.payload && m.payload.returnValue === false) ? w.rej(new Error(m.error || (m.payload && m.payload.errorText) || "TV error")) : w.res(m.payload || {});
  });
  const payload = { ...pairing, forcePairing: false };
  if (env.LG_KEY) payload["client-key"] = env.LG_KEY;
  else if (!pairWaitMs) { ws.close(); throw bad("The living room TV isn't paired yet — tap Pair", 409); }
  ws.send({ type: "register", id: "reg0", payload });
  const limit = pairWaitMs || 4000;
  await Promise.race([ready, new Promise((_, rej) => setTimeout(() => rej(bad(pairWaitMs ? "Nobody accepted the prompt on the TV in time" : "TV didn't respond", 408)), limit))])
    .catch((e) => { ws.close(); throw e; });
  let n = 0;
  return {
    req(uri, p) {
      const id = "r" + ++n;
      return new Promise((res, rej) => {
        waiting.set(id, { res, rej });
        ws.send({ type: "request", id, uri, payload: p || {} });
        setTimeout(() => waiting.has(id) && (waiting.delete(id), rej(new Error("TV didn't respond"))), 4000);
      });
    },
    close: () => ws.close(),
  };
}
async function lg(uri, p) { const s = await lgSession(); try { return await s.req(uri, p); } finally { s.close(); } }

function wake(mac) {
  const hex = mac.replace(/[^0-9a-f]/gi, "");
  if (hex.length !== 12) throw bad("No MAC address for the LG");
  const pkt = Buffer.concat([Buffer.alloc(6, 0xff), ...Array(16).fill(Buffer.from(hex, "hex"))]);
  return new Promise((resolve) => {
    const s = dgram.createSocket("udp4");
    s.bind(() => {
      s.setBroadcast(true);
      let left = 4; const done = () => --left || (s.close(), resolve({ ok: true }));
      for (const addr of ["255.255.255.255", "192.168.1.255"]) for (const port of [9, 7]) s.send(pkt, port, addr, done);
    });
  });
}

const LG_APPS = { netflix: "netflix", youtube: "youtube.leanback.v4", hulu: "hulu", disney: "com.disney.disneyplus-prod", prime: "amazon", appletv: "com.apple.appletv" };

async function lgAction(action, arg) {
  switch (action) {
    case "pair": { const s = await lgSession(60000); s.close(); return { ok: true, paired: true }; }
    case "on": return wake(LG.mac());
    case "off": return lg("ssap://system/turnOff");
    case "volup": return lg("ssap://audio/volumeUp");
    case "voldown": return lg("ssap://audio/volumeDown");
    case "mute": {
      const s = await lgSession();
      try { const st = await s.req("ssap://audio/getStatus"); return await s.req("ssap://audio/setMute", { mute: !st.mute }); } finally { s.close(); }
    }
    case "app": if (!LG_APPS[arg]) throw bad("Unknown app"); return lg("ssap://system.launcher/launch", { id: LG_APPS[arg] });
    case "input": if (!/^HDMI_[1-4]$/.test(arg || "")) throw bad("Unknown input"); return lg("ssap://tv/switchInput", { inputId: arg });
    default: throw bad("Unknown action", 404);
  }
}
async function lgStatus() {
  if (!env.LG_KEY) return { paired: false, on: await reachable(LG.ip(), 3001) };
  try { await lg("ssap://audio/getStatus"); return { paired: true, on: true }; }
  catch (e) { return { paired: e.code !== 409, on: false }; }
}
function reachable(host, port) {
  return new Promise((r) => { const s = tls.connect({ host, port, rejectUnauthorized: false, timeout: 1500 }, () => { s.destroy(); r(true); });
    s.on("error", () => r(false)); s.on("timeout", () => { s.destroy(); r(false); }); });
}

// ---------- Roku ----------
let rokuIp = env.ROKU_IP || "";
function rokuReq(method, path, ip = rokuIp) {
  return new Promise((resolve, reject) => {
    if (!ip) return reject(bad("Can't find the bedroom TV on Wi-Fi yet", 404));
    const r = http.request({ host: ip, port: 8060, path, method, timeout: 3000 }, (res) => {
      let b = ""; res.on("data", (c) => (b += c)); res.on("end", () => (res.statusCode < 300 ? resolve(b) : reject(new Error(`Roku said ${res.statusCode}`))));
    });
    r.on("timeout", () => r.destroy(new Error("Bedroom TV didn't answer")));
    r.on("error", (e) => reject(bad(e.message.includes("answer") ? e.message : "Bedroom TV didn't answer", 504)));
    r.end();
  });
}
function findRoku() { // SSDP search: Rokus answer "roku:ecp"
  return new Promise((resolve) => {
    const s = dgram.createSocket({ type: "udp4", reuseAddr: true });
    const msg = Buffer.from('M-SEARCH * HTTP/1.1\r\nHost: 239.255.255.250:1900\r\nMan: "ssdp:discover"\r\nST: roku:ecp\r\nMX: 2\r\n\r\n');
    const t = setTimeout(() => { s.close(); resolve(null); }, 3000);
    s.on("message", (m) => {
      const loc = /LOCATION:\s*http:\/\/([\d.]+):8060/i.exec(m.toString());
      if (loc) { clearTimeout(t); s.close(); resolve(loc[1]); }
    });
    s.on("error", () => { clearTimeout(t); try { s.close(); } catch {} resolve(null); });
    s.bind(() => { s.send(msg, 1900, "239.255.255.250"); setTimeout(() => { try { s.send(msg, 1900, "239.255.255.250"); } catch {} }, 600); });
  });
}
async function ensureRoku() {
  if (rokuIp) return rokuIp;
  const ip = await findRoku();
  if (ip) { rokuIp = ip; env.ROKU_IP = ip; saveEnv(); }
  return rokuIp;
}
const ROKU_APPS = { netflix: 12, youtube: 837, hulu: 2285, disney: 291097, prime: 13, appletv: 551012 };
const ROKU_KEYS = { on: "PowerOn", off: "PowerOff", volup: "VolumeUp", voldown: "VolumeDown", mute: "VolumeMute", home: "Home" };
async function rokuAction(action, arg) {
  await ensureRoku();
  if (ROKU_KEYS[action]) return rokuReq("POST", `/keypress/${ROKU_KEYS[action]}`).then(() => ({ ok: true }));
  if (action === "app") { if (!ROKU_APPS[arg]) throw bad("Unknown app"); return rokuReq("POST", `/launch/${ROKU_APPS[arg]}`).then(() => ({ ok: true })); }
  if (action === "input") { if (!/^HDMI_[1-4]$/.test(arg || "")) throw bad("Unknown input"); return rokuReq("POST", `/keypress/InputHDMI${arg.slice(-1)}`).then(() => ({ ok: true })); }
  throw bad("Unknown action", 404);
}
async function rokuStatus() {
  try {
    await ensureRoku();
    const x = await rokuReq("GET", "/query/device-info");
    const mode = (/<power-mode>([^<]+)</.exec(x) || [])[1] || "";
    return { found: true, on: mode === "PowerOn" };
  } catch { rokuIp = env.ROKU_IP || ""; return { found: Boolean(rokuIp), on: false }; }
}

// ---------- public ----------
const TVS = [
  { id: "lg", name: "Living room TV", room: /living|family|tv|den|lounge/i },
  { id: "roku", name: "Bedroom TV", room: /bed|our room|master/i },
];
async function list() {
  const [l, r] = await Promise.all([lgStatus(), rokuStatus()]);
  return [{ ...TVS[0], room: undefined, ...l, found: true }, { ...TVS[1], room: undefined, paired: true, ...r }];
}
function act(id, action, arg) {
  if (id === "lg") return lgAction(action, arg);
  if (id === "roku") return rokuAction(action, arg);
  throw bad("Unknown TV", 404);
}
module.exports = { list, act, findRoku };
