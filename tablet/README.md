# Tablet setup (Lenovo TB-8505F)

How the tablet runs the dashboard on its own:

- **Termux** (from GitHub releases) runs `node server.js` from `~/the-ave-display`
- **Termux:Boot** runs `~/.termux/boot/start-display.sh` on every boot: waits for Wi-Fi, `git pull`, starts the server
- **Fully Kiosk Browser** shows `http://localhost:3000`, with *Web Auto Reload → Auto Reload after Page Error = 10s* so it recovers while the server is still starting
- Termux + Termux:Boot are whitelisted from battery optimization (`dumpsys deviceidle whitelist +com.termux` / `+com.termux.boot`), otherwise Lenovo blocks the boot start

## Rebuild after a wipe
1. Install Termux + Termux:Boot (GitHub releases), open each once
2. In Termux: `sh setup.sh` (this folder) — installs Node + git, clones the repo
3. Copy `boot-stub.sh` to `~/.termux/boot/start-display.sh` and `chmod +x` it
4. Whitelist both apps from battery optimization
5. Fully Kiosk: start URL `http://localhost:3000`, auto reload after page error 10s, keep screen on

## Updating
Automatic: `tablet/updater.sh` checks GitHub every 2 minutes and pulls new commits.
Page changes appear on their own (live reload); changes to `server.js` or `tablet/` restart the server.
The commit ID in the bottom-right corner shows which version the tablet is running.
