// ===== Settings =====
const CONFIG = {
  location: { name: "Columbus", lat: 39.96, lon: -83.0 },
  timezone: "America/New_York",
  weatherRefreshMinutes: 15,
  night: { startHour: 22, endHour: 6 }, // dim between 10pm and 6am
  liveReload: true, // reload the page when files change on the server (handy while building)
};

let nightHours = false;

// ===== Clock =====
function updateClock() {
  const now = new Date();
  let h = now.getHours();
  const m = String(now.getMinutes()).padStart(2, "0");
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  document.getElementById("clock").innerHTML = `${h}:${m}<span class="ampm">${ampm}</span>`;
  document.getElementById("date").textContent = now.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  const hr = now.getHours();
  const { startHour, endHour } = CONFIG.night;
  nightHours = startHour > endHour ? hr >= startHour || hr < endHour : hr >= startHour && hr < endHour;
}

// ===== Weather (Open-Meteo, free, no API key) =====
// WMO weather codes -> [label, day icon, night icon]
const WMO = {
  0: ["Clear", "☀️", "🌙"],
  1: ["Mostly clear", "🌤️", "🌙"],
  2: ["Partly cloudy", "⛅", "☁️"],
  3: ["Cloudy", "☁️", "☁️"],
  45: ["Fog", "🌫️", "🌫️"],
  48: ["Freezing fog", "🌫️", "🌫️"],
  51: ["Light drizzle", "🌦️", "🌧️"],
  53: ["Drizzle", "🌦️", "🌧️"],
  55: ["Heavy drizzle", "🌧️", "🌧️"],
  56: ["Freezing drizzle", "🌧️", "🌧️"],
  57: ["Freezing drizzle", "🌧️", "🌧️"],
  61: ["Light rain", "🌦️", "🌧️"],
  63: ["Rain", "🌧️", "🌧️"],
  65: ["Heavy rain", "🌧️", "🌧️"],
  66: ["Freezing rain", "🌧️", "🌧️"],
  67: ["Freezing rain", "🌧️", "🌧️"],
  71: ["Light snow", "🌨️", "🌨️"],
  73: ["Snow", "🌨️", "🌨️"],
  75: ["Heavy snow", "❄️", "❄️"],
  77: ["Snow grains", "🌨️", "🌨️"],
  80: ["Showers", "🌦️", "🌧️"],
  81: ["Showers", "🌧️", "🌧️"],
  82: ["Heavy showers", "⛈️", "⛈️"],
  85: ["Snow showers", "🌨️", "🌨️"],
  86: ["Heavy snow showers", "❄️", "❄️"],
  95: ["Thunderstorms", "⛈️", "⛈️"],
  96: ["Storms + hail", "⛈️", "⛈️"],
  99: ["Storms + hail", "⛈️", "⛈️"],
};

function wmo(code, isDay = true) {
  const [label, day, night] = WMO[code] || ["—", "·", "·"];
  return { label, icon: isDay ? day : night };
}

async function updateWeather() {
  const { lat, lon } = CONFIG.location;
  const url =
    "https://api.open-meteo.com/v1/forecast" +
    `?latitude=${lat}&longitude=${lon}` +
    "&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,is_day" +
    "&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max" +
    "&temperature_unit=fahrenheit&wind_speed_unit=mph" +
    `&timezone=${encodeURIComponent(CONFIG.timezone)}&forecast_days=7`;

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    renderNow(data.current);
    renderForecast(data.daily);
    lastDaily = data.daily;
    if (lastEvents) renderWeekend(lastEvents);
    setStatus(`Updated ${new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`);
  } catch (err) {
    console.error("Weather failed:", err);
    setStatus("Weather unavailable — retrying soon");
  }
}

function renderNow(c) {
  const { label, icon } = wmo(c.weather_code, c.is_day === 1);
  document.getElementById("mini-wx").innerHTML =
    `<div class="mw-top"><span class="mw-icon">${icon}</span><span class="mw-temp">${Math.round(c.temperature_2m)}°</span></div><div class="mw-desc">${label}</div>`;
  document.getElementById("now-icon").textContent = icon;
  document.getElementById("now-temp").textContent = `${Math.round(c.temperature_2m)}°`;
  document.getElementById("now-desc").textContent = `${label} · ${CONFIG.location.name}`;
  document.getElementById("now-extra").textContent =
    `Feels ${Math.round(c.apparent_temperature)}° · Wind ${Math.round(c.wind_speed_10m)} mph`;
}

let lastDaily = null;
function renderForecast(d) {
  const el = document.getElementById("forecast");
  el.innerHTML = d.time
    .slice(0, 5)
    .map((dateStr, i) => {
      const date = new Date(dateStr + "T12:00:00");
      const name = i === 0 ? "Today" : date.toLocaleDateString("en-US", { weekday: "short" });
      const { icon } = wmo(d.weather_code[i]);
      const rain = d.precipitation_probability_max[i];
      return `
        <div class="day ${i === 0 ? "today" : ""}">
          <div class="day-name">${name}</div>
          <div class="day-icon">${icon}</div>
          <div class="day-hi">${Math.round(d.temperature_2m_max[i])}°</div>
          <div class="day-lo">${Math.round(d.temperature_2m_min[i])}°</div>
          <div class="day-rain">${rain >= 20 ? `💧${rain}%` : ""}</div>
        </div>`;
    })
    .join("");
}

let buildTag = "";
let lastStatus = "";
function setStatus(text) {
  lastStatus = text;
  document.getElementById("status").textContent = buildTag ? `${text} · ${buildTag}` : text;
}
fetch("/__info", { cache: "no-store" })
  .then((r) => r.json())
  .then(({ commit }) => {
    buildTag = commit;
    setStatus(lastStatus);
  })
  .catch(() => {});

// ===== Live reload (only while building) =====
let knownVersion = null;
async function checkForChanges() {
  try {
    const res = await fetch("/__version", { cache: "no-store" });
    const { version } = await res.json();
    if (knownVersion === null) knownVersion = version;
    else if (version !== knownVersion) location.reload();
  } catch {
    /* server restarting — ignore */
  }
}

// ===== Lights (Philips Hue via the local server) =====
const lightsEl = document.getElementById("lights");
let lightsBusyUntil = 0; // pause polling while someone is touching a tile

async function api(path, options = {}) {
  const res = await fetch(path, {
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || res.statusText), { status: res.status });
  return data;
}

function renderConnect(message = "") {
  lightsEl.innerHTML = `
    <div class="hue-connect">
      <strong>Connect your Hue lights</strong><br />
      Press the round button on top of the Hue Bridge, then tap Connect within 30 seconds.
      <br /><button id="hue-pair">Connect</button>
      <div class="hue-msg" id="hue-msg">${message}</div>
    </div>`;
  document.getElementById("hue-pair").onclick = pairHue;
}

async function pairHue() {
  const msg = document.getElementById("hue-msg");
  msg.textContent = "Connecting…";
  try {
    const r = await api("/api/hue/pair", { method: "POST" });
    if (r.ok) return updateLights();
    msg.textContent = r.reason === "press-button"
      ? "Not yet: press the button on the Bridge, then tap Connect again."
      : `Couldn't connect: ${r.reason}`;
  } catch (err) {
    msg.textContent = `Couldn't reach the Bridge: ${err.message}`;
  }
}

function pct(bri) {
  return Math.max(1, Math.round((bri / 254) * 100));
}

function renderRooms(rooms) {
  const changed = JSON.stringify(rooms.map((r) => r.id + r.name)) !== JSON.stringify(roomList.map((r) => r.id + r.name));
  roomList = rooms;
  if (typeof markLive === "function") markLive();
  if (changed) renderRoomScenes();
  if (!rooms.length) {
    lightsEl.innerHTML = `<div class="hue-connect">Connected to Hue, but no rooms are set up in the Hue app yet.</div>`;
    return;
  }
  lightsEl.innerHTML = `<div class="lights-grid">${rooms
    .map(
      (r) => `
      <div class="tile ${r.on ? "on" : ""}" data-id="${r.id}">
        <div class="tile-top">
          <div class="tile-name">${r.name}</div>
          <div class="tile-state">${r.on ? `On · ${pct(r.bri)}%` : "Off"}</div>
        </div>
        <input type="range" min="1" max="254" value="${r.bri}" aria-label="${r.name} brightness" />
      </div>`
    )
    .join("")}</div>`;

  lightsEl.querySelectorAll(".tile").forEach((tile) => {
    const id = tile.dataset.id;
    const state = tile.querySelector(".tile-state");
    const slider = tile.querySelector("input");

    tile.querySelector(".tile-top").onclick = async () => {
      lightsBusyUntil = Date.now() + 3000;
      const turnOn = !tile.classList.contains("on");
      tile.classList.toggle("on", turnOn);
      state.textContent = turnOn ? `On · ${pct(slider.value)}%` : "Off";
      try { await api(`/api/hue/rooms/${id}`, { method: "PUT", body: JSON.stringify({ on: turnOn }) }); }
      catch { updateLights(); }
    };

    slider.oninput = () => {
      lightsBusyUntil = Date.now() + 3000;
      tile.classList.add("on");
      state.textContent = `On · ${pct(slider.value)}%`;
    };
    slider.onchange = async () => {
      lightsBusyUntil = Date.now() + 3000;
      try { await api(`/api/hue/rooms/${id}`, { method: "PUT", body: JSON.stringify({ bri: Number(slider.value) }) }); }
      catch { updateLights(); }
    };
  });
}

async function updateLights() {
  if (Date.now() < lightsBusyUntil) return;
  try {
    const { paired } = await api("/api/hue/status");
    if (!paired) {
      if (!document.getElementById("hue-pair")) renderConnect();
      return;
    }
    renderRooms(await api("/api/hue/rooms"));
  } catch (err) {
    lightsEl.innerHTML = `<div class="hue-connect">Lights unavailable right now (${err.message}).</div>`;
  }
}

// ===== Upcoming dates + Columbus events =====
const esc = (t = "") => t.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

function dayDiff(date) {
  const a = new Date(); a.setHours(0, 0, 0, 0);
  const b = new Date(date); b.setHours(0, 0, 0, 0);
  return Math.round((b - a) / 86400000);
}
function whenLabel(ev) {
  const d = new Date(ev.start);
  const day = d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  return ev.allDay ? day : `${day} · ${d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).replace(":00", "")}`;
}

function renderDates(data) {
  const html = datesHtml(data);
  document.getElementById("slide-dates").innerHTML = html;
  document.getElementById("coming").innerHTML = html;
  watchScroll(document.getElementById("coming"));
  watchScroll(document.getElementById("slide-dates"));
}
function mineRow(ev) {
  const n = dayDiff(ev.start);
  const chip = n <= 0 ? "<b>Today</b>" : n === 1 ? "<b>Tmrw</b>" : `in <b>${n}</b> days`;
  return `<div class="item"><div class="chip ${n <= 0 ? "today" : n <= 3 ? "soon" : ""}">${chip}</div>
    <div><div class="item-title">${esc(ev.title)}</div><div class="item-sub">${esc(whenLabel(ev))}${ev.location ? " · " + esc(ev.location) : ""}</div></div></div>`;
}
function localRow(ev) {
  const d = new Date(ev.start);
  const n = dayDiff(ev.start);
  const top = n <= 0 ? "Today" : n === 1 ? "Tmrw" : d.toLocaleDateString("en-US", { weekday: "short" });
  return `<div class="item"><div class="chip ${n <= 1 ? "soon" : ""}">${top}<b>${d.getMonth() + 1}/${d.getDate()}</b></div>
    <div><div class="item-title">${esc(ev.title)}</div><div class="item-sub">${ev.allDay ? "" : esc(d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).replace(":00", "")) + " · "}${esc(ev.location || ev.source)}</div></div></div>`;
}
function datesHtml(data) {
  if (!data.configured) return "";
  const items = data.items.slice(0, 20);
  return `<div class="slide-title">Coming up <small>The Ave calendar</small></div>` + (items.length
    ? `<div class="list">${items.map(mineRow).join("")}</div>`
    : `<div class="empty">Nothing on the calendar for the next two months.</div>`);
}

// ----- This weekend: Fri / Sat / Sun side by side -----
function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
function onDay(ev, day) {
  const s = new Date(ev.start);
  if (sameDay(s, day)) return true;
  if (!ev.allDay || !ev.end) return false;           // multi-day all-day events (trips, days off)
  const e = new Date(ev.end);
  const d0 = new Date(day.getFullYear(), day.getMonth(), day.getDate());
  return s <= d0 && d0 < e;
}
function weekendDays() {
  const t = new Date(); t.setHours(0, 0, 0, 0);
  const dow = t.getDay();
  const fri = new Date(t);
  if (dow === 6) fri.setDate(t.getDate() - 1);
  else if (dow === 0) fri.setDate(t.getDate() - 2);
  else fri.setDate(t.getDate() + ((5 - dow + 7) % 7));
  return [0, 1, 2].map((i) => new Date(fri.getFullYear(), fri.getMonth(), fri.getDate() + i)).filter((d) => d >= t);
}
function shortTime(ev) {
  if (ev.allDay) return "All day";
  return new Date(ev.start).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).replace(":00", "");
}
function dayWeather(day) {
  if (!lastDaily) return "";
  const i = lastDaily.time.findIndex((t) => sameDay(new Date(t + "T12:00:00"), day));
  if (i < 0) return "";
  return `${wmo(lastDaily.weather_code[i]).icon} ${Math.round(lastDaily.temperature_2m_max[i])}° / ${Math.round(lastDaily.temperature_2m_min[i])}°`;
}
function renderWeekend(data) {
  const el = document.getElementById("slide-weekend");
  const days = weekendDays();
  const mine = data.personal.items || [];
  const local = data.local.items || [];
  const fmt = (d) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const today = new Date();
  const cols = days.map((day) => {
    const evs = [
      ...mine.filter((e) => onDay(e, day)).map((e) => ({ ...e, mine: true })),
      ...local.filter((e) => onDay(e, day)),
    ].slice(0, 10);
    const wx = dayWeather(day);
    return `<div class="wk-day ${sameDay(day, today) ? "is-today" : ""}">
      <div class="wk-head">${sameDay(day, today) ? "Today" : day.toLocaleDateString("en-US", { weekday: "long" })}<small>${fmt(day)}</small></div>
      ${wx ? `<div class="wk-wx">${wx}</div>` : ""}
      ${evs.length ? evs.map((e) => `<div class="wk-ev ${e.mine ? "mine" : ""}"><div class="wk-time">${esc(shortTime(e))}${!e.mine && e.location ? " · " + esc(e.location) : ""}</div><div class="wk-title">${esc(e.title)}</div></div>`).join("") : `<div class="wk-none">Nothing planned yet</div>`}
    </div>`;
  });
  el.innerHTML = `<div class="slide-title">This weekend <small>${fmt(days[0])} – ${fmt(days[days.length - 1])}</small></div>
    <div class="weekend" style="--cols: ${days.length}">${cols.join("")}</div>`;
  watchScroll(el);
}

function renderLocal(data) {
  const el = document.getElementById("slide-local");
  const items = data.items.slice(0, 30);
  if (!items.length) { el.innerHTML = ""; return; }
  el.innerHTML = `<div class="slide-title">Around Columbus <small>next 10 days</small></div>
    <div class="list">${items.map(localRow).join("")}</div>`;
  watchScroll(el);
}

function renderCalendarPage(data) {
  const mine = data.personal.items || [];
  const local = data.local.items || [];
  document.getElementById("cal-mine").innerHTML = mine.length ? mine.map(mineRow).join("") : `<div class="empty">Nothing planned yet.</div>`;
  document.getElementById("cal-local").innerHTML = local.length ? local.map(localRow).join("") : `<div class="empty">No events found.</div>`;
}

let lastEvents = null;
async function updateEvents() {
  try {
    const data = await api("/api/events");
    lastEvents = data;
    renderDates(data.personal);
    renderLocal(data.local);
    renderWeekend(data);
    renderCalendarPage(data);
  } catch (err) {
    console.error("Events failed:", err);
  }
}

// ===== Rotator: cycles through slides that have content =====
let slideIndex = 0;
let slideTimer = null;
function slides() {
  return [...document.querySelectorAll("#rotator > .slide")].filter(
    (s) => getComputedStyle(s).display !== "none" && (s.dataset.slide === "weather" || s.innerHTML.trim())
  );
}
function showSlide(i) {
  const list = slides();
  slideIndex = (i + list.length) % list.length;
  document.querySelectorAll("#rotator > .slide").forEach((s) => s.classList.toggle("active", s === list[slideIndex]));
  document.getElementById("dots").innerHTML = list.length > 1 ? list.map((_, j) => `<span class="${j === slideIndex ? "on" : ""}"></span>`).join("") : "";
  // start each slide scrolled to the top
  list[slideIndex].querySelectorAll(".list, .wk-day").forEach((el) => (el.scrollTop = 0));
  clearTimeout(slideTimer);
  slideTimer = setTimeout(nextSlideWhenIdle, (Number(list[slideIndex].dataset.seconds) || 15) * 1000);
}
function nextSlideWhenIdle() {
  const wait = pausedUntil - Date.now();
  if (wait > 0) { slideTimer = setTimeout(nextSlideWhenIdle, wait); return; }
  showSlide(slideIndex + 1);
}
// Touching or scrolling a list pauses the rotation for 30 seconds.
let pausedUntil = 0;
function pauseRotation() { pausedUntil = Date.now() + 30000; }
function watchScroll(panel) {
  if (!panel) return;
  panel.querySelectorAll(".list, .wk-day").forEach((el) => {
    el.addEventListener("scroll", pauseRotation, { passive: true });
    el.addEventListener("touchstart", pauseRotation, { passive: true });
  });
}
// Tap the panel (but not inside a list) to jump to the next slide
document.getElementById("rotator").addEventListener("click", (e) => {
  if (e.target.closest(".list, .wk-day")) return;
  pausedUntil = 0;
  showSlide(slideIndex + 1);
});

// ===== Light scenes =====
// Pick a room, then its Hue-app scenes show as buttons.
let hueSceneList = [];
let holidayList = [];
let roomList = [];
let pickedRoom = null; // room id
try { pickedRoom = localStorage.getItem("ave-room-id"); } catch {}
function renderRoomScenes() {
  const pick = document.getElementById("room-pick");
  const hs = document.getElementById("hue-scenes");
  const rooms = roomList;
  if (!rooms.length || !(hueSceneList.length || holidayList.length)) { pick.innerHTML = ""; hs.innerHTML = ""; return; }
  if (!rooms.some((r) => r.id === pickedRoom)) pickedRoom = rooms[0].id;
  pick.innerHTML = `<span class="pick-label">Scenes for</span>` + rooms.map((r) =>
    `<button class="pick ${r.id === pickedRoom ? "on" : ""}" data-room="${r.id}">${esc(r.name)}</button>`).join("");
  pick.querySelectorAll("[data-room]").forEach((b) => (b.onclick = () => {
    pickedRoom = b.dataset.room;
    try { localStorage.setItem("ave-room-id", pickedRoom); } catch {}
    renderRoomScenes();
  }));
  const seen = new Set();
  hs.innerHTML = holidayList.map((x) =>
    `<button class="chip-btn holiday" data-scene="holiday:${x.id}:${pickedRoom}">${x.icon} ${esc(x.name)}</button>`).join("") + hueSceneList.filter((x) => (seen.has(x.name) ? false : seen.add(x.name))).map((x) =>
    `<button class="chip-btn" data-scene="hue:${x.id}:${pickedRoom}">${esc(x.name)}</button>`).join("");
  hs.querySelectorAll("[data-scene]").forEach((b) => (b.onclick = () => runScene(b.dataset.scene, b)));
  markLive();
}

// Keep the button for the running scene lit
function sceneIsLive(key, rs) {
  if (/^(holiday|hue):/.test(key)) { const r = rs.find((x) => x.id === key.split(":").pop()); return Boolean(r && r.on && r.scene === key); }
  if (key === "all-off") return rs.length > 0 && !rs.some((r) => r.on);
  return rs.some((r) => r.on && r.scene === key);
}
function guessScene(key, rs) { // show it right away; the next poll confirms
  if (/^(holiday|hue):/.test(key)) { const r = rs.find((x) => x.id === key.split(":").pop()); if (r) { r.on = true; r.scene = key; } }
  else rs.forEach((r) => { if (key === "all-off") { r.on = false; r.scene = null; } else if (key === "all-on" || r.type === "Room") r.scene = key; });
}
function markLive() {
  document.querySelectorAll("#scenes [data-scene], #hue-scenes [data-scene]").forEach((b) => b.classList.toggle("live", sceneIsLive(b.dataset.scene, roomList)));
}
async function runScene(id, btn) {
  flash(btn);
  guessScene(id, roomList); markLive();
  lightsBusyUntil = 0;
  try { await api(`/api/hue/scenes/${encodeURIComponent(id)}`, { method: "POST" }); } catch (err) { console.error(err); }
  setTimeout(updateLights, 600);
}
async function updateScenes() {
  try {
    const { builtIn, hue, holiday } = await api("/api/hue/scenes");
    const sc = document.getElementById("scenes");
    sc.innerHTML = builtIn.map((x) => `<button class="scene" data-scene="${x.id}"><span>${x.icon}</span>${esc(x.name)}</button>`).join("");
    hueSceneList = hue;
    holidayList = holiday || [];
    sc.querySelectorAll("[data-scene]").forEach((b) => (b.onclick = () => runScene(b.dataset.scene, b)));
    renderRoomScenes();
    markLive();
  } catch {
    document.getElementById("scenes").innerHTML = "";
  }
}

// ===== Timers =====
const PRESETS = [1, 3, 5, 10, 15, 20, 30, 60];
let timerState = { timers: [], offset: 0 }; // offset = server clock - tablet clock
let customSeconds = 300;
const fmtLeft = (ms) => {
  const t = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s2 = t % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(s2).padStart(2, "0")}` : `${m}:${String(s2).padStart(2, "0")}`;
};
document.getElementById("presets").innerHTML = PRESETS.map((m) =>
  `<button class="preset" data-min="${m}">${m >= 60 ? m / 60 : m}<small>${m >= 60 ? "hour" : "min"}</small></button>`).join("");
document.querySelectorAll(".preset").forEach((b) => (b.onclick = () => startTimer(Number(b.dataset.min) * 60)));
document.querySelectorAll(".adj").forEach((b) => (b.onclick = () => {
  customSeconds = Math.max(60, Math.min(6 * 3600, customSeconds + Number(b.dataset.adj)));
  document.getElementById("custom-time").textContent = fmtLeft(customSeconds * 1000);
}));
document.getElementById("custom-go").onclick = () => startTimer(customSeconds);

async function startTimer(seconds) {
  unlockAudio();
  try { await api("/api/timers", { method: "POST", body: JSON.stringify({ seconds }) }); } catch (err) { console.error(err); }
  loadTimers();
}
async function timerAction(id, action) {
  if (action === "stop") await api(`/api/timers/${id}`, { method: "DELETE" }).catch(() => {});
  else await api(`/api/timers/${id}/add`, { method: "POST", body: JSON.stringify({ seconds: 60 }) }).catch(() => {});
  loadTimers();
}
async function loadTimers() {
  try {
    const r = await api("/api/timers");
    timerState = { timers: r.timers, offset: r.now - Date.now() };
    renderTimers();
  } catch {}
}
let timerKey = "";
function renderTimers() {
  const now = Date.now() + timerState.offset;
  const list = document.getElementById("timer-list");
  const ts = timerState.timers;
  const key = ts.map((t) => `${t.id}:${t.endsAt}:${t.endsAt <= now}`).join("|");
  if (key === timerKey) {
    // same timers: just tick the numbers (keeps buttons stable for taps)
    ts.forEach((t) => {
      const card = list.querySelector(`[data-card="${t.id}"]`);
      if (!card) return;
      const left = t.endsAt - now;
      card.querySelector(".t-left").textContent = left <= 0 ? "Done" : fmtLeft(left);
      card.querySelector(".bar").style.width = `${Math.max(0, Math.min(100, (left / t.durationMs) * 100))}%`;
    });
    document.querySelectorAll(".timer-pill b").forEach((b) => {
      const t = ts.find((x) => x.id === Number(b.dataset.id));
      if (t) b.textContent = fmtLeft(t.endsAt - now);
    });
    return;
  }
  timerKey = key;
  list.innerHTML = ts.length ? ts.map((t) => {
    const left = t.endsAt - now;
    const pct = Math.max(0, Math.min(100, (left / t.durationMs) * 100));
    return `<div class="timer-card ${left <= 0 ? "done" : ""}" data-card="${t.id}">
      <div class="t-label">${esc(t.label)}</div>
      <div class="t-left">${left <= 0 ? "Done" : fmtLeft(left)}</div>
      <div class="t-btns"><button data-t="${t.id}" data-a="add">+1m</button><button data-t="${t.id}" data-a="stop">✕</button></div>
      <div class="bar" style="width:${pct}%"></div></div>`;
  }).join("") : `<div class="timer-empty">No timers running. Tap a time to start one.<br />“Hey Google, set a timer” works too.</div>`;
  list.querySelectorAll("[data-t]").forEach((b) => (b.onclick = () => timerAction(b.dataset.t, b.dataset.a)));

  // pills on every page
  const running = ts.filter((t) => t.endsAt > now);
  document.getElementById("timer-pills").innerHTML = running.slice(0, 3).map((t) =>
    `<div class="timer-pill">⏲️<b data-id="${t.id}">${fmtLeft(t.endsAt - now)}</b></div>`).join("");
  document.querySelectorAll(".timer-pill").forEach((p) => (p.onclick = () => go("timers")));

  // ringing?
  const ringing = ts.find((t) => t.endsAt <= now);
  const alarm = document.getElementById("alarm");
  if (ringing) {
    alarm.hidden = false;
    alarm.dataset.id = ringing.id;
    document.getElementById("alarm-title").textContent = ringing.label.replace(/ timer$/, "") + " — time's up";
    ring(true);
  } else {
    alarm.hidden = true;
    ring(false);
  }
}
document.getElementById("alarm-stop").onclick = () => { ring(false); timerAction(document.getElementById("alarm").dataset.id, "stop"); };
document.getElementById("alarm-snooze").onclick = () => { ring(false); timerAction(document.getElementById("alarm").dataset.id, "add"); };

// Alarm sound (Web Audio beeps). Browsers only allow sound after a tap,
// so the audio is unlocked on the first touch anywhere.
let audioCtx = null;
let ringTimer = null;
function unlockAudio() {
  if (!audioCtx) { try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch {} }
  if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
}
document.addEventListener("pointerdown", unlockAudio);
function beep(at, freq) {
  const o = audioCtx.createOscillator(), g = audioCtx.createGain();
  o.type = "sine"; o.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(0.5, at + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, at + 0.25);
  o.connect(g).connect(audioCtx.destination);
  o.start(at); o.stop(at + 0.3);
}
let fullyRinging = false;
function ring(on) {
  if (hasFully && typeof fully.playSound === "function") {
    // Fully plays sound natively, even if nobody has touched the screen
    if (on && !fullyRinging) { try { fully.playSound(location.origin + "/alarm.wav", true); fullyRinging = true; } catch {} }
    if (!on && fullyRinging) { try { fully.stopSound(); } catch {} fullyRinging = false; }
    if (on) activity();
    return;
  }
  if (!on) { clearInterval(ringTimer); ringTimer = null; return; }
  activity();
  if (ringTimer || !audioCtx) return;
  const play = () => { const t = audioCtx.currentTime; [0, 0.3, 0.6].forEach((d, i) => beep(t + d, i === 2 ? 1175 : 880)); };
  play();
  ringTimer = setInterval(play, 1600);
}

// ===== Pages: dock, swipe, auto-return home =====
const PAGES = ["home", "lights", "timers", "calendar"];
let currentPage = "home";
let lastTouch = Date.now();
function go(name) {
  if (!PAGES.includes(name) || name === currentPage) return;
  const dir = PAGES.indexOf(name) > PAGES.indexOf(currentPage) ? 1 : -1;
  document.querySelectorAll(".page").forEach((p) => {
    const on = p.dataset.page === name;
    p.style.setProperty("--from", `${dir * 6}vw`);
    p.classList.toggle("active", on);
  });
  document.querySelectorAll(".dock button").forEach((b) => b.classList.toggle("on", b.dataset.go === name));
  document.body.classList.toggle("on-timers", name === "timers");
  currentPage = name;
  if (name === "lights") { updateLights(); updateScenes(); }
  if (name === "timers") loadTimers();
}
document.querySelectorAll(".dock button").forEach((b) => (b.onclick = () => go(b.dataset.go)));
document.querySelector('.dock button[data-go="home"]').classList.add("on");

// swipe left/right to move between pages (not while dragging a slider)
let sx = 0, sy = 0, swipeOk = false;
const pagesEl = document.getElementById("pages");
pagesEl.addEventListener("touchstart", (e) => {
  const t = e.touches[0]; sx = t.clientX; sy = t.clientY;
  swipeOk = !e.target.closest('input[type="range"], .hue-scenes');
}, { passive: true });
pagesEl.addEventListener("touchend", (e) => {
  if (!swipeOk) return;
  const t = e.changedTouches[0], dx = t.clientX - sx, dy = t.clientY - sy;
  if (Math.abs(dx) > 90 && Math.abs(dy) < 60) {
    const i = PAGES.indexOf(currentPage) + (dx < 0 ? 1 : -1);
    if (i >= 0 && i < PAGES.length) go(PAGES[i]);
  }
}, { passive: true });

// back to Home after 60s of no touches
document.addEventListener("pointerdown", () => (lastTouch = Date.now()), true);
setInterval(() => {
  if (currentPage !== "home" && Date.now() - lastTouch > 60000 && document.getElementById("alarm").hidden) go("home");
}, 5000);

// ===== Display modes: active / ambient / night =====
// Wakes on touch or on motion from the front camera (Fully PLUS),
// dims when nobody's around, and goes to a dim clock at night.
const hasFully = typeof window.fully !== "undefined";
const DISPLAY = {
  awakeMs: 2 * 60 * 1000,   // stay bright this long after the last touch/motion
  brightness: { active: 200, ambient: 70, nightAwake: 60, night: 4 },
};
let lastActivity = Date.now();
let lastBrightness = null;
let displayMode = "";
function activity() {
  lastActivity = Date.now();
  if (hasFully) { try { if (!fully.getScreenOn()) fully.turnScreenOn(); } catch {} }
  applyDisplayMode();
}
window.onFullyMotion = activity; // called by Fully when the camera sees motion
document.addEventListener("pointerdown", activity, true);
function applyDisplayMode() {
  const awake = Date.now() - lastActivity < DISPLAY.awakeMs || !document.getElementById("alarm").hidden;
  const mode = nightHours ? (awake ? "nightAwake" : "night") : awake ? "active" : "ambient";
  if (mode !== displayMode) {
    document.body.classList.remove("mode-active", "mode-ambient", "mode-nightAwake", "mode-night");
    document.body.classList.add(`mode-${mode}`);
    displayMode = mode;
  }
  const b = DISPLAY.brightness[mode];
  if (hasFully && b !== lastBrightness) {
    try { fully.setScreenBrightness(b); lastBrightness = b; } catch {}
  }
}
if (hasFully) {
  try { fully.bind("onMotion", "onFullyMotion();"); } catch {}
}
setInterval(applyDisplayMode, 5000);

// ===== Phone remote info (Lights page) =====
api("/api/remote-info").then((r) => {
  const el = document.getElementById("remote-info");
  if (el) el.innerHTML = `📱 Phone remote: <b>${esc(r.url.replace("http://", ""))}</b> · PIN <b>${esc(r.pin)}</b>`;
}).catch(() => {});

// Older browsers (like the tablet's) ignore flexbox "gap"; detect and patch with margins.
(function () {
  const d = document.createElement("div");
  d.style.cssText = "display:flex;flex-direction:column;gap:1px;position:absolute";
  d.appendChild(document.createElement("div")); d.appendChild(document.createElement("div"));
  document.body.appendChild(d);
  if (d.scrollHeight !== 1) document.documentElement.classList.add("no-flexgap");
  d.remove();
})();

// ===== Start =====
updateClock();
setInterval(updateClock, 1000);

updateWeather();
setInterval(updateWeather, CONFIG.weatherRefreshMinutes * 60 * 1000);

updateLights();
setInterval(updateLights, 5000);
updateScenes();

loadTimers();
setInterval(loadTimers, 5000);   // pick up timers started elsewhere
setInterval(renderTimers, 500);  // smooth countdown

updateEvents();
setInterval(updateEvents, 10 * 60 * 1000);
showSlide(0);
applyDisplayMode();

if (CONFIG.liveReload) setInterval(checkForChanges, 2000);
