// Shared shopping list: added from the phone remote (and by voice), shown on the tablet.
const fs = require("fs");
const path = require("path");
const FILE = path.join(__dirname, "..", "data", "list.json");
let items = [];
try { items = JSON.parse(fs.readFileSync(FILE, "utf8")); } catch {}
if (!Array.isArray(items)) items = [];
let nextId = items.reduce((m, x) => Math.max(m, Number(x.id) || 0), 0) + 1;
function save() { try { fs.mkdirSync(path.dirname(FILE), { recursive: true }); fs.writeFileSync(FILE, JSON.stringify(items)); } catch {} }
const all = () => ({ items });
function add(text) { // "eggs, milk" adds two things; something already on the list just gets un-checked
  String(text || "").split(/[,\n]+/).map((t) => t.trim().slice(0, 60)).filter(Boolean).slice(0, 20).forEach((t) => {
    const old = items.find((x) => x.text.toLowerCase() === t.toLowerCase());
    if (old) old.done = false; else items.push({ id: nextId++, text: t.charAt(0).toUpperCase() + t.slice(1), done: false });
  });
  items = items.slice(-100);
  save(); return all();
}
function set(id, done) { const x = items.find((i) => i.id === Number(id)); if (x) x.done = Boolean(done); save(); return all(); }
function remove(id) { items = items.filter((i) => i.id !== Number(id)); save(); return all(); }
function clearDone() { items = items.filter((i) => !i.done); save(); return all(); }
module.exports = { all, add, set, remove, clearDone };
