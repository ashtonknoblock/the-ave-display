// A full-screen note on the tablet (e.g. "You got this!") that shows until a set time.
// Saved in data/note.json (not in git) so it survives a restart.
const fs = require("fs");
const path = require("path");
const FILE = path.join(__dirname, "..", "data", "note.json");
let note = null;
try { note = JSON.parse(fs.readFileSync(FILE, "utf8")); } catch {}

function save() {
  try { fs.mkdirSync(path.dirname(FILE), { recursive: true }); fs.writeFileSync(FILE, JSON.stringify(note)); }
  catch (err) { console.error("Couldn't save note:", err.message); }
}
function get() {
  if (note && new Date(note.until) <= new Date()) { note = null; save(); }
  return note;
}
function set(text, until) {
  text = String(text || "").trim().slice(0, 500);
  const u = new Date(until);
  if (!text || isNaN(u)) throw Object.assign(new Error("Need a message and an end time"), { code: 400 });
  note = { text, until: u.toISOString(), at: new Date().toISOString() };
  save();
  return note;
}
function clear() { note = null; save(); return { ok: true }; }
module.exports = { get, set, clear };
