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

module.exports = { CATS, list, get, add, remove, show, getShowing, importUrl, setCategory };
