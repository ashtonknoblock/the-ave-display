// Today's Pacers and Colts games (live score, final, or start time) from ESPN's public scoreboard.
const https = require("https");
const BOARDS = [["NBA", "basketball/nba"], ["NFL", "football/nfl"]];
const TEAM = "IND";
function getJson(url) {
  return new Promise((resolve, reject) => {
    const r = https.get(url, { timeout: 6000, headers: { "User-Agent": "the-ave-display" } }, (res) => {
      let raw = ""; res.setEncoding("utf8"); res.on("data", (c) => (raw += c));
      res.on("end", () => { try { resolve(JSON.parse(raw)); } catch (e) { reject(e); } });
    });
    r.on("timeout", () => r.destroy(new Error("timeout"))); r.on("error", reject);
  });
}
let cache = { at: 0, games: [] };
async function today() {
  const live = cache.games.some((g) => g.state === "in");
  if (Date.now() - cache.at < (live ? 25000 : 120000)) return { games: cache.games };
  cache.at = Date.now();
  const now = new Date(), games = [];
  await Promise.all(BOARDS.map(async ([league, p]) => {
    try {
      const j = await getJson(`https://site.api.espn.com/apis/site/v2/sports/${p}/scoreboard`);
      for (const ev of j.events || []) {
        const c = (ev.competitions || [])[0] || {}, teams = c.competitors || [];
        if (!teams.some((t) => t.team && t.team.abbreviation === TEAM)) continue;
        const st = (ev.status || {}).type || {}, d = new Date(ev.date);
        const sameDay = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
        if (st.state !== "in" && !sameDay) continue;
        const side = (w) => { const t = teams.find((x) => x.homeAway === w) || {}; return { abbr: (t.team || {}).abbreviation || "", name: (t.team || {}).shortDisplayName || "", score: t.score || "0" }; };
        games.push({ league, state: st.state, detail: st.shortDetail || "", date: ev.date, home: side("home"), away: side("away") });
      }
    } catch {}
  }));
  cache.games = games;
  return { games };
}
module.exports = { today };
