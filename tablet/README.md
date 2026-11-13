# Tablet setup (Lenovo TB-8505F)

How the tablet runs the dashboard on its own:

- **Termux** (from GitHub releases) runs `node server.js` from `~/the-ave-display`
- **Termux:Boot** runs `~/.termux/boot/start-display.sh` on every boot: waits for Wi-Fi, `git pull`, starts the server
- **Fully Kiosk Browser** shows `http://localhost:3000`, with *Web Auto Reload → Auto Reload after Page Error = 10s* so it recovers while the server is still starting
- Termux + Termux:Boot are whitelisted from battery optimization (`dumpsys deviceidle whitelist +com.termux` / `+com.termux.boot`), otherwise Lenovo blocks the boot start

## Rebuild after a wipe
1. Install Termux + Termux:Boot (GitHub releases), open each once
2. In Termux: `sh setup.sh` (this folder) — installs Node + git, clones the repo, installs the boot script
3. Whitelist both apps from battery optimization
4. Fully Kiosk: start URL `http://localhost:3000`, auto reload after page error 10s, keep screen on

## Updating
Push to GitHub, then reboot the tablet — it pulls on boot.
