// Upcoming dates for the rotating panel:
//  - personal: the Ave's Google Calendar (secret iCal link in .env)
//  - local:    Columbus event feeds, merged and filtered
const https = require("https");
const http = require("http");
const ical = require("./ical");
const { env } = require("./env");
const { holidaysBetween, dayKey } = require("./holidays");

const LOCAL_FEEDS = [
  { name: "Downtown Columbus", url: "https://downtowncolumbus.com/events/list/?ical=1" },
  { name: "Columbus Commons", url: "https://columbuscommons.org/events/list/?ical=1" },
  { name: "Rec & Parks", url: "https://columbusrecparks.com/calendar/list/?ical=1" },
  { name: "Metro Parks", url: "https://www.metroparks.net/events/list/?ical=1" },
];

// Recurring community services and classes that would flood the list.
const SKIP = /fitness|class(es)?\b|drop-in|support|meeting|open house|produce market|registration|workshop|program|camp\b|story ?time|senior|fifty plus|volunteer|board of|hearing|webinar/i;

function fetchText(url, redirects = 4) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith("https") ? https : http;
    const req = lib.get(url, { timeout: 15000, headers: { "User-Agent": "TheAveDisplay/1.0 (home dashboard)", Accept: "text/calendar,*/*" } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirects > 0) {
        res.resume();
        return resolve(fetchText(new URL(res.headers.location, url).toString(), redirects - 1));
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error(`HTTP ${res.statusCode} from ${url}`)); }
      let raw = "";
      res.setEncoding("utf8");
      res.on("data", (c) => (raw += c));
      res.on("end", () => resolve(raw));
    });
    req.on("timeout", () => req.destroy(new Error("Timed out: " + url)));
    req.on("error", reject);
  });
}

const cache = { personal: { at: 0, items: [] }, local: { at: 0, items: [], sources: {} } };

function slim(e, source) {
  return {
    title: e.title || "(untitled)",
    start: e.start.toISOString(),
    end: e.end ? e.end.toISOString() : null,
    allDay: Boolean(e.allDay),
    location: e.location ? e.location.split(",")[0] : "",
    source,
    recurring: Boolean(e.rrule),
  };
}

async function personal() {
  const urls = (env.CALENDAR_ICS_URLS || "").split(",").map((u) => u.trim()).filter(Boolean);
  if (!urls.length) {
    const now = new Date();
    const from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const items = holidaysBetween(from, new Date(from.getTime() + 60 * ical.DAY)).map((h) => ({ title: h.name, start: h.date.toISOString(), allDay: true, location: "", source: "holiday" }));
    return { configured: items.length > 0, items: items.slice(0, 8), offDays: holidaysBetween(from, new Date(from.getTime() + 60 * ical.DAY)).map((h) => dayKey(h.date)) };
  }
  if (Date.now() - cache.personal.at > 15 * 60000) {
    const now = new Date();
    const from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const to = new Date(from.getTime() + 60 * ical.DAY);
    const items = [];
    for (const u of urls) {
      try { items.push(...ical.expand(ical.parse(await fetchText(u)), from, to).map((e) => slim(e, "calendar"))); }
      catch (err) { console.error("Calendar feed failed:", err.message); }
    }
    for (const h of holidaysBetween(from, to)) {
      items.push({ title: h.name, start: h.date.toISOString(), end: null, allDay: true, location: "", source: "holiday", recurring: true });
    }
    cache.personal = { at: Date.now(), items: items.sort((a, b) => new Date(a.start) - new Date(b.start)) };
  }
  // days we're free: holidays + all-day "Off"/"Vacation"/"PTO" entries in the Ave calendar
  const OFF = /\b(off|day off|vacation|pto|holiday|out of office)\b/i;
  const offDays = new Set();
  for (const e of cache.personal.items) {
    if (e.source === "holiday" || (e.allDay && OFF.test(e.title))) {
      const s = new Date(e.start);
      const end = e.end ? new Date(e.end) : new Date(s.getTime() + ical.DAY);
      for (let d = new Date(s); d < end; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) offDays.add(dayKey(d));
    }
  }
  // the "Off" markers themselves don't need to show in Coming up
  const shown = cache.personal.items.filter((e) => !(e.allDay && e.source !== "holiday" && /^(off|day off|pto|out of office)$/i.test(e.title.trim())));
  return { configured: true, items: shown.slice(0, 8), offDays: [...offDays] };
}

// Weekdays: only evening things (5pm+), unless it's a day off.
function fitsSchedule(e, offDays) {
  const d = new Date(e.start);
  const weekend = d.getDay() === 0 || d.getDay() === 6;
  if (weekend || offDays.has(dayKey(d))) return true;
  if (e.allDay) return false;
  return d.getHours() >= 17;
}

async function local(offDayList = []) {
  const offDays = new Set(offDayList);
  if (Date.now() - cache.local.at > 3 * 3600000) {
    const now = new Date();
    const to = new Date(now.getTime() + 10 * ical.DAY);
    const all = [];
    const sources = {};
    for (const f of LOCAL_FEEDS) {
      try {
        const evs = ical.expand(ical.parse(await fetchText(f.url)), now, to);
        sources[f.name] = evs.length;
        all.push(...evs.map((e) => ({ ...slim(e, f.name), featured: (e.categories || []).includes("Featured"), categories: e.categories || [] })));
      } catch (err) {
        sources[f.name] = `error: ${err.message}`;
        console.error("Event feed failed:", f.name, err.message);
      }
    }
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const seen = new Set();
    const items = all
      .filter((e) => !SKIP.test(e.title) && !e.categories.some((c) => SKIP.test(c)))
      // skip long-running specials/exhibits that started before today
      .filter((e) => new Date(e.start) >= startOfToday)
      .sort((a, b) => new Date(a.start) - new Date(b.start))
      // show each event once (daily exhibits, multi-night runs, two sites listing the same show)
      .filter((e) => {
        const key = e.title.toLowerCase().replace(/[^a-z0-9]/g, "");
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => new Date(a.start) - new Date(b.start));
    cache.local = { at: Date.now(), items, sources };
  }
  return { items: cache.local.items.filter((e) => fitsSchedule(e, offDays)).slice(0, 12), sources: cache.local.sources };
}

module.exports = { personal, local };
