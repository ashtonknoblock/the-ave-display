// Tiny .env reader/writer shared by the server modules. .env lives on
// the device only (it's in .gitignore).
const fs = require("fs");
const path = require("path");

const ENV_FILE = path.join(__dirname, "..", ".env");
const env = {};

function loadEnv() {
  try {
    for (const line of fs.readFileSync(ENV_FILE, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m) env[m[1]] = m[2];
    }
  } catch {}
}
function saveEnv() {
  fs.writeFileSync(ENV_FILE, Object.entries(env).map(([k, v]) => `${k}=${v}`).join("\n") + "\n");
}
loadEnv();

module.exports = { env, saveEnv, loadEnv };
