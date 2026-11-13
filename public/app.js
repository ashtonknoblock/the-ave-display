// ===== Settings =====
const CONFIG = {
  location: { name: "Columbus", lat: 39.96, lon: -83.0 },
  timezone: "America/New_York",
  weatherRefreshMinutes: 15,
  night: { startHour: 22, endHour: 6 }, // dim between 10pm and 6am
  liveReload: true, // reload the page when files change on the server (handy while building)
};

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
  const isNight = startHour > endHour ? hr >= startHour || hr < endHour : hr >= startHour && hr < endHour;
  document.body.classList.toggle("night", isNight);
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
function datesHtml(data) {
  if (!data.configured) return "";
  const items = data.items.slice(0, 20);
  return `<div class="slide-title">Coming up <small>The Ave calendar</small></div>` + (items.length
    ? `<div class="list">${items.map((ev) => {
        const n = dayDiff(ev.start);
        const chip = n <= 0 ? "<b>Today</b>" : n === 1 ? "<b>Tmrw</b>" : `in <b>${n}</b> days`;
        return `<div class="item"><div class="chip ${n <= 0 ? "today" : n <= 3 ? "soon" : ""}">${chip}</div>
          <div><div class="item-title">${esc(ev.title)}</div><div class="item-sub">${esc(whenLabel(ev))}${ev.location ? " · " + esc(ev.location) : ""}</div></div></div>`;
      }).join("")}</div>`
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
    <div class="list">${items.map((ev) => {
      const d = new Date(ev.start);
      const n = dayDiff(ev.start);
      const top = n <= 0 ? "Today" : n === 1 ? "Tmrw" : d.toLocaleDateString("en-US", { weekday: "short" });
      return `<div class="item"><div class="chip ${n <= 1 ? "soon" : ""}">${top}<b>${d.getMonth() + 1}/${d.getDate()}</b></div>
        <div><div class="item-title">${esc(ev.title)}</div><div class="item-sub">${ev.allDay ? "" : esc(d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).replace(":00", "")) + " · "}${esc(ev.location || ev.source)}</div></div></div>`;
    }).join("")}</div>`;
  watchScroll(el);
}

let lastEvents = null;
async function updateEvents() {
  try {
    const data = await api("/api/events");
    lastEvents = data;
    renderDates(data.personal);
    renderLocal(data.local);
    renderWeekend(data);
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

// ===== Start =====
updateClock();
setInterval(updateClock, 1000);

updateWeather();
setInterval(updateWeather, CONFIG.weatherRefreshMinutes * 60 * 1000);

updateLights();
setInterval(updateLights, 5000);

updateEvents();
setInterval(updateEvents, 10 * 60 * 1000);
showSlide(0);

if (CONFIG.liveReload) setInterval(checkForChanges, 2000);
