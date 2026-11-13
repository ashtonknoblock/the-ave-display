# The Ave Display

Kitchen/wall dashboard for apartment 203, running on an old Lenovo Tab M8 (TB-8505F).

## Run it
```
node server.js
```
Then open the printed `http://<ip>:3000` address on the tablet. Saving any file in `public/` auto-refreshes the tablet.

## Structure
- `server.js` — tiny Node server (no dependencies)
- `public/index.html` — layout
- `public/style.css` — look and feel
- `public/app.js` — clock, weather, live reload. Settings are at the top in `CONFIG`.

## Notes
- Weather: Open-Meteo (free, no key)
- Secrets (Hue key etc.) go in `.env`, which is never committed
