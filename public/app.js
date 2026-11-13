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
    `&timezone=${encodeURIComponent(CONFIG.timezone)}&forecast_days=5`;

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    renderNow(data.current);
    renderForecast(data.daily);
    setStatus(`Updated ${new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`);
  } catch (err) {
    console.error("Weather failed:", err);
    setStatus("Weather unavailable — retrying soon");
  }
}

function renderNow(c) {
  const { label, icon } = wmo(c.weather_code, c.is_day === 1);
  document.getElementById("now-icon").textContent = icon;
  document.getElementById("now-temp").textContent = `${Math.round(c.temperature_2m)}°`;
  document.getElementById("now-desc").textContent = `${label} · ${CONFIG.location.name}`;
  document.getElementById("now-extra").textContent =
    `Feels ${Math.round(c.apparent_temperature)}° · Wind ${Math.round(c.wind_speed_10m)} mph`;
}

function renderForecast(d) {
  const el = document.getElementById("forecast");
  el.innerHTML = d.time
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

function setStatus(text) {
  document.getElementById("status").textContent = text;
}

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

// ===== Start =====
updateClock();
setInterval(updateClock, 1000);

updateWeather();
setInterval(updateWeather, CONFIG.weatherRefreshMinutes * 60 * 1000);

if (CONFIG.liveReload) setInterval(checkForChanges, 2000);
