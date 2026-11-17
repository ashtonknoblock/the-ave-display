// Kitchen timers. They live on the server so the tablet (and later the
// phones) all see the same timers, and they survive a page reload or a
// server restart (saved to data/timers.json, which is not in git).
const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "..", "data");
const FILE = path.join(DATA_DIR, "timers.json");
let timers = [];
let nextId = 1;

try {
  timers = JSON.parse(fs.readFileSync(FILE, "utf8"));
  nextId = timers.reduce((m, t) => Math.max(m, t.id), 0) + 1;
} catch {}

function save() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(timers));
  } catch (err) {
    console.error("Couldn't save timers:", err.message);
  }
}

// drop timers that rang and were never stopped more than an hour ago
function prune() {
  const before = timers.length;
  timers = timers.filter((t) => !(t.endsAt < Date.now() - 3600000));
  if (timers.length !== before) save();
}

function list() {
  prune();
  return { now: Date.now(), timers: timers.slice().sort((a, b) => a.endsAt - b.endsAt) };
}

function add(seconds, label, say) {
  const s = Math.max(1, Math.min(24 * 3600, Math.round(Number(seconds) || 0)));
  const t = { id: nextId++, label: String(label || "").slice(0, 40) || defaultLabel(s), durationMs: s * 1000, endsAt: Date.now() + s * 1000 };
  if (say) t.say = String(say).slice(0, 300); // what the voicebox should announce when it finishes
  timers.push(t);
  save();
  return t;
}

function defaultLabel(s) {
  if (s % 3600 === 0) return `${s / 3600} hr timer`;
  if (s >= 60 && s % 60 === 0) return `${s / 60} min timer`;
  const m = Math.floor(s / 60);
  return m ? `${m}m ${s % 60}s timer` : `${s} sec timer`;
}

// extend (or snooze a ringing timer)
function addTime(id, seconds) {
  const t = timers.find((x) => x.id === Number(id));
  if (!t) return null;
  const base = Math.max(t.endsAt, Date.now());
  t.endsAt = base + seconds * 1000;
  t.durationMs += seconds * 1000;
  t.announced = false;
  save();
  return t;
}

function remove(id) {
  const before = timers.length;
  timers = timers.filter((t) => t.id !== Number(id));
  if (timers.length !== before) save();
  return before !== timers.length;
}

// Tell whoever is listening (the voicebox) the moment a timer finishes, once per timer.
let doneCb = null;
function onDone(cb) { doneCb = cb; }
function spoken(t) {
  const l = t.label.replace(/(\d+)m (\d+)s/, "$1 minute $2 second").replace(/\bmin\b/g, "minute").replace(/\bhr\b/g, "hour").replace(/\bsec\b/g, "second");
  return /timer$/i.test(l) ? `Your ${l} is done.` : `Your ${l} timer is done.`;
}
setInterval(() => {
  const now = Date.now();
  let changed = false;
  for (const t of timers) {
    if (t.announced || t.endsAt > now) continue;
    t.announced = true; changed = true;
    if (doneCb && now - t.endsAt < 120000) { try { doneCb(t); } catch {} }
  }
  if (changed) save();
}, 1000);

module.exports = { list, add, addTime, remove, onDone, spoken };
