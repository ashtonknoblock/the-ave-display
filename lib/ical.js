// Minimal iCalendar (.ics) reader: enough for Google Calendar and the
// WordPress "Events Calendar" feeds most Columbus sites use.
// Handles all-day + timed events, time zones (treated as local time,
// which is America/New_York on the tablet), and common repeats
// (yearly birthdays, weekly markets, monthly, daily).

function unfold(text) {
  return text.replace(/\r?\n[ \t]/g, "");
}

function unescape(v = "") {
  return v.replace(/\\n/gi, "\n").replace(/\\,/g, ",").replace(/\;/g, ";").replace(/\\\\/g, "\\").trim();
}

// "20261113" (all-day) | "20261113T190000" (local) | "20261113T190000Z" (UTC)
function parseDate(value, params = "") {
  const m = value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/);
  if (!m) return null;
  const [, y, mo, d, h, mi, s, z] = m;
  const allDay = !h || /VALUE=DATE(?!-)/.test(params);
  if (allDay) return { date: new Date(+y, +mo - 1, +d), allDay: true };
  if (z) return { date: new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s)), allDay: false };
  return { date: new Date(+y, +mo - 1, +d, +h, +mi, +s), allDay: false };
}

function parse(text) {
  const events = [];
  let cur = null;
  for (const line of unfold(text).split(/\r?\n/)) {
    if (line === "BEGIN:VEVENT") { cur = { exdates: [] }; continue; }
    if (line === "END:VEVENT") { if (cur && cur.start) events.push(cur); cur = null; continue; }
    if (!cur) continue;
    const idx = line.indexOf(":");
    if (idx < 0) continue;
    const left = line.slice(0, idx);
    const value = line.slice(idx + 1);
    const [name, ...paramParts] = left.split(";");
    const params = paramParts.join(";");
    switch (name) {
      case "UID": cur.uid = value; break;
      case "SUMMARY": cur.title = unescape(value); break;
      case "LOCATION": cur.location = unescape(value); break;
      case "URL": cur.url = value.trim(); break;
      case "CATEGORIES": cur.categories = unescape(value).split(",").map((c) => c.trim()).filter(Boolean); break;
      case "DESCRIPTION": cur.description = unescape(value).slice(0, 400); break;
      case "RRULE": cur.rrule = Object.fromEntries(value.split(";").map((p) => p.split("="))); break;
      case "RECURRENCE-ID": cur.recurrenceId = parseDate(value, params); break;
      case "STATUS": cur.status = value; break;
      case "DTSTART": {
        const p = parseDate(value, params);
        if (p) { cur.start = p.date; cur.allDay = p.allDay; }
        break;
      }
      case "DTEND": { const p = parseDate(value, params); if (p) cur.end = p.date; break; }
      case "EXDATE":
        for (const v of value.split(",")) { const p = parseDate(v, params); if (p) cur.exdates.push(p.date.getTime()); }
        break;
    }
  }
  return events.filter((e) => e.status !== "CANCELLED");
}

const DAY = 86400000;
const BYDAY = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

// Every occurrence of an event between `from` and `to`.
function occurrences(ev, from, to) {
  const dur = ev.end ? ev.end - ev.start : 0;
  const out = [];
  const push = (start) => {
    if (ev.exdates.includes(start.getTime())) return;
    const end = new Date(start.getTime() + dur);
    if (end >= from && start <= to) out.push({ ...ev, start, end });
  };
  if (!ev.rrule) { push(ev.start); return out; }

  const r = ev.rrule;
  const interval = parseInt(r.INTERVAL || "1", 10);
  const until = r.UNTIL ? parseDate(r.UNTIL).date : null;
  const count = r.COUNT ? parseInt(r.COUNT, 10) : Infinity;
  let n = 0;
  const s = ev.start;
  const keep = (d) => (!until || d <= until) && n < count && d <= to;

  if (r.FREQ === "WEEKLY") {
    const days = r.BYDAY ? r.BYDAY.split(",").map((d) => BYDAY[d.slice(-2)]).filter((d) => d !== undefined) : [s.getDay()];
    const weekStart = new Date(s.getFullYear(), s.getMonth(), s.getDate() - s.getDay(), s.getHours(), s.getMinutes(), s.getSeconds());
    for (let w = 0; w < 600; w += interval) {
      for (const dow of [...days].sort()) {
        const d = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + w * 7 + dow, s.getHours(), s.getMinutes(), s.getSeconds());
        if (d < s) continue;
        if (!keep(d)) return out;
        n++; push(d);
      }
    }
    return out;
  }

  for (let i = 0; i < 2000; i += interval) {
    let d;
    if (r.FREQ === "YEARLY") d = new Date(s.getFullYear() + i, s.getMonth(), s.getDate(), s.getHours(), s.getMinutes(), s.getSeconds());
    else if (r.FREQ === "MONTHLY") d = new Date(s.getFullYear(), s.getMonth() + i, s.getDate(), s.getHours(), s.getMinutes(), s.getSeconds());
    else if (r.FREQ === "DAILY") d = new Date(s.getFullYear(), s.getMonth(), s.getDate() + i, s.getHours(), s.getMinutes(), s.getSeconds());
    else { push(s); return out; }
    if (!keep(d)) return out;
    n++;
    // skip impossible dates like Feb 30 rolling into March
    if (r.FREQ !== "DAILY" && d.getDate() !== s.getDate()) continue;
    push(d);
  }
  return out;
}

// All occurrences in the window, with single-instance edits (RECURRENCE-ID)
// replacing the generated ones.
function expand(events, from, to) {
  const overrides = events.filter((e) => e.recurrenceId);
  const masters = events.filter((e) => !e.recurrenceId);
  const replaced = new Set(overrides.map((o) => `${o.uid}|${o.recurrenceId.date.getTime()}`));
  const list = [];
  for (const ev of masters) {
    for (const o of occurrences(ev, from, to)) {
      if (!replaced.has(`${o.uid}|${o.start.getTime()}`)) list.push(o);
    }
  }
  for (const o of overrides) list.push(...occurrences({ ...o, rrule: null }, from, to));
  return list.sort((a, b) => a.start - b.start);
}

module.exports = { parse, expand, DAY };
