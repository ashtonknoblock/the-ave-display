// Recipes: saved in data/recipes.json (not in git). Can import from a recipe
// web page using the schema.org "Recipe" data most recipe sites include.
const fs = require("fs");
const path = require("path");
const https = require("https");
const http = require("http");

const FILE = path.join(__dirname, "..", "data", "recipes.json");
let recipes = [];
try { recipes = JSON.parse(fs.readFileSync(FILE, "utf8")); } catch {}
let showing = null; // { id, at } — "open this recipe on the tablet"

function save() {
  try { fs.mkdirSync(path.dirname(FILE), { recursive: true }); fs.writeFileSync(FILE, JSON.stringify(recipes, null, 1)); }
  catch (err) { console.error("Couldn't save recipes:", err.message); }
}
const bad = (msg, code = 400) => Object.assign(new Error(msg), { code });
const lines = (v) => (Array.isArray(v) ? v : String(v || "").split(/\r?\n/)).map((s) => String(s).trim()).filter(Boolean);

const CATS = ["Breakfast", "Apps & Snacks", "Soups & Chili", "Dinner", "Crockpot", "Sides & Salads"];
// Best guess from the name and recipe text; a category picked on the phone always wins
function guessCategory(r) {
  const t = r.title.toLowerCase(), all = (t + " " + r.ingredients.join(" ") + " " + r.steps.join(" ")).toLowerCase();
  if (/crock ?pot|slow cooker/.test(all)) return "Crockpot";
  if (/breakfast|egg muffin|french toast|pancake|waffle|oat|frittata|omelet|banana bread|cottage cheese bake/.test(t)) return "Breakfast";
  if (/soup|chili|stew|zuppa|fagioli/.test(t)) return "Soups & Chili";
  if (/salad|potato|zucchini|brussels|sprouts|squash|slaw|rice$|side/.test(t) && !/stuffed|roll-?ups?/.test(t)) return "Sides & Salads";
  if (/dip|popper|wings|caviar|nachos|queso|egg rolls|bites|sliders|bread|roll ups|meatballs|mushrooms/.test(t) && !/casserole|bake/.test(t)) return "Apps & Snacks";
  return "Dinner";
}
const catOf = (r) => (CATS.includes(r.category) ? r.category : guessCategory(r));
function setCategory(id, category) {
  const r = get(id); if (!r) throw bad("Recipe not found", 404);
  if (!CATS.includes(category)) throw bad("Unknown category");
  r.category = category; save(); return { ok: true };
}
function list() {
  return recipes.map((r) => ({ id: r.id, title: r.title, servings: r.servings, time: r.time, source: r.source, count: r.ingredients.length, category: catOf(r) }))
    .sort((a, b) => a.title.localeCompare(b.title));
}
const get = (id) => recipes.find((r) => r.id === id) || null;

function add(b) {
  const r = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    title: String(b.title || "").trim().slice(0, 120),
    servings: String(b.servings || "").trim().slice(0, 40),
    time: String(b.time || "").trim().slice(0, 40),
    ingredients: lines(b.ingredients).slice(0, 80),
    steps: lines(b.steps).slice(0, 60),
    notes: String(b.notes || "").trim().slice(0, 1000),
    source: String(b.source || "").trim().slice(0, 500),
    added: new Date().toISOString(),
  };
  if (CATS.includes(b.category)) r.category = b.category;
  if (!r.title) throw bad("Give it a name");
  if (!r.ingredients.length && !r.steps.length) throw bad("Add some ingredients or steps");
  recipes.push(r); save();
  return r;
}
function remove(id) {
  const n = recipes.length; recipes = recipes.filter((r) => r.id !== id); save();
  if (showing && showing.id === id) showing = null;
  return { ok: recipes.length !== n };
}
function show(id) {
  if (id && !get(id)) throw bad("Recipe not found", 404);
  showing = id ? { id, at: Date.now() } : null;
  if (id) cook = { id, step: null };
  return { ok: true };
}
const getShowing = () => showing;

// ----- import from a web page -----
function fetchPage(url, redirects = 5) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith("https") ? https : http;
    const req = lib.get(url, {
      timeout: 15000,
      headers: {
        "User-Agent": "Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36",
        Accept: "text/html,application/xhtml+xml", "Accept-Language": "en-US,en;q=0.9",
      },
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirects > 0) {
        res.resume(); return resolve(fetchPage(new URL(res.headers.location, url).toString(), redirects - 1));
      }
      if (res.statusCode !== 200) { res.resume(); return reject(bad(`That site wouldn't share the page (HTTP ${res.statusCode}). Try typing it in instead.`, 422)); }
      let raw = ""; res.setEncoding("utf8");
      res.on("data", (c) => { raw += c; if (raw.length > 5e6) req.destroy(); });
      res.on("end", () => resolve(raw));
    });
    req.on("timeout", () => req.destroy(new Error("The site took too long")));
    req.on("error", reject);
  });
}
const decode = (s) => String(s || "")
  .replace(/<[^>]+>/g, " ")
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
  .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#?39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
  .replace(/\s+/g, " ").replace(/\s+([.,;:!?])/g, "$1").trim();
function findRecipe(node) {
  if (!node || typeof node !== "object") return null;
  if (Array.isArray(node)) { for (const n of node) { const r = findRecipe(n); if (r) return r; } return null; }
  const t = node["@type"];
  if (t === "Recipe" || (Array.isArray(t) && t.includes("Recipe"))) return node;
  return findRecipe(node["@graph"]) || findRecipe(node.mainEntity) || null;
}
function flattenSteps(v) {
  if (!v) return [];
  if (typeof v === "string") return lines(v.replace(/<br\s*\/?>|<\/p>|<\/li>/gi, "\n")).map(decode);
  if (Array.isArray(v)) return v.flatMap(flattenSteps);
  if (v.itemListElement) return flattenSteps(v.itemListElement); // HowToSection
  return [decode(v.text || v.name || "")].filter(Boolean);
}
function minutes(iso) { // PT1H30M -> "1 hr 30 min"
  const m = String(iso || "").match(/PT(?:(\d+)H)?(?:(\d+)M)?/); if (!m || (!m[1] && !m[2])) return "";
  return [m[1] && `${m[1]} hr`, m[2] && `${m[2]} min`].filter(Boolean).join(" ");
}
async function importUrl(url) {
  if (!/^https?:\/\//i.test(url || "")) throw bad("That doesn't look like a web link");
  const html = await fetchPage(url);
  let rec = null;
  for (const m of html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try { rec = findRecipe(JSON.parse(m[1].trim())); } catch {}
    if (rec) break;
  }
  if (!rec) throw bad("Couldn't find a recipe on that page. Try typing it in instead.", 422);
  const y = rec.recipeYield;
  return add({
    title: decode(rec.name),
    servings: decode(Array.isArray(y) ? y[y.length - 1] : y),
    time: minutes(rec.totalTime) || minutes(rec.cookTime),
    ingredients: (rec.recipeIngredient || rec.ingredients || []).map(decode),
    steps: flattenSteps(rec.recipeInstructions),
    source: url,
  });
}

// ===== Cooking along =====
// Times mentioned in a step ("cook 30 more minutes", "7-8 hours") become tap-to-start timers.
const UNIT = { h: 3600, m: 60, s: 1 };
function stepTimes(text) {
  const out = [], re = /(\d+(?:\.\d+)?)(?:\s*(?:-|–|—|to)\s*\d+(?:\.\d+)?)?\s*(?:more\s+|additional\s+)?(hours?|hrs?|minutes?|mins?|seconds?|secs?)\b/gi;
  let m;
  while ((m = re.exec(String(text))) && out.length < 3) {
    const n = parseFloat(m[1]), u = m[2][0].toLowerCase(), seconds = Math.round(n * UNIT[u]);
    if (seconds < 5 || seconds > 24 * 3600) continue;
    out.push({ seconds, label: `${n} ${u === "h" ? "hr" : u === "m" ? "min" : "sec"}`, human: `${n} ${u === "h" ? "hour" : u === "m" ? "minute" : "second"}${n === 1 ? "" : "s"}` });
  }
  return out;
}
// which recipe is open on the tablet and which step we're on (shared by the tablet and the voicebox)
let cook = { id: null, step: null };
function cookState() {
  const r = cook.id && get(cook.id);
  if (!r) return { recipe: null, step: null };
  return { recipe: { id: r.id, title: r.title, steps: r.steps, times: r.steps.map((x) => (stepTimes(x)[0] || {}).human || null) }, step: cook.step };
}
function setCook(b) {
  if ("id" in b) cook = { id: b.id && get(b.id) ? b.id : null, step: null };
  if ("step" in b && cook.id) cook.step = b.step == null ? null : Math.max(0, Math.min(get(cook.id).steps.length - 1, Number(b.step) || 0));
  return { ok: true, ...cook };
}
function stepTimer(b) {
  const r = get(b.id || cook.id);
  if (!r) throw bad("No recipe is open", 404);
  const i = Number(b.step) || 0, t = stepTimes(r.steps[i] || "")[Number(b.k) || 0];
  if (!t) throw bad("That step doesn't mention a time", 400);
  const short = r.title.replace(/\s*\(.*?\)\s*/g, " ").trim();
  const adj = t.human.replace(/s$/, ""); // "30 minute" timer
  return { seconds: t.seconds, human: adj, label: `${short.slice(0, 26)} · step ${i + 1}`,
    say: `${short}: the ${adj} timer for step ${i + 1} is done.` + (r.steps[i + 1] ? ` Step ${i + 2} is next.` : " That was the last step.") };
}
const view = (id) => { const x = get(id); return x && { ...x, stepTimes: x.steps.map(stepTimes) }; };

module.exports = { CATS, list, get: view, add, remove, show, getShowing, importUrl, setCategory, cookState, setCook, stepTimer };
