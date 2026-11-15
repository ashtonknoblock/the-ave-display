# Backlog

## Phase 0 – Tablet setup ✅
- [x] Factory reset, confirm no Hinge Health management
- [x] Firmware update (Feb 2023 patch), Play system + app updates
- [x] Battery protection mode (60% cap)
- [x] Disable junk apps, screen never sleeps
- [ ] Voice Match / "Hey Google" timers

## Phase 1 – MVP
- [x] Clock + date
- [x] Current weather + 5-day forecast (Open-Meteo)
- [x] Live reload while building
- [x] Night dim mode (10pm–6am)
- [x] GitHub repo
- [x] Fully Kiosk Browser full-screen, auto-start on boot
- [x] Server runs on the tablet (Termux), auto-starts on boot, auto-updates from GitHub
- [ ] Turn off "remove permissions for unused apps" for Fully Kiosk / Termux
- [ ] Decide mounting: portrait vs landscape

## Phase 2 – Lights (Hue)
- [x] Pair with Hue Bridge from the dashboard (key stored in .env on the tablet)
- [x] Room on/off + brightness
- [ ] Scene buttons (Movie, Bedtime)

## Phase 3 – Info
- [ ] Pacers / Colts / Fever / IU scores + next game
- [ ] Knobability widget
- [ ] Ambient rotating view when idle

## Calendar + events
- [x] Rotating panel: weather / Coming up / Around Columbus
- [x] The Ave Google Calendar via secret iCal link (yearly birthdays count down)
- [x] Columbus feeds: Downtown Columbus, Columbus Commons, Rec & Parks, Metro Parks
- [ ] Columbus Underground (check for a feed, otherwise read the page)
- [ ] Experience Columbus / Eventbrite
- [ ] Tune the event filter after a week of real use

## Smart home roadmap (team plan, Nov 13)
Navigation: Home stays glanceable; bottom dock + swipe for other pages; auto-return Home after 60s idle.
- [x] Sprint 1: dock + swipe pages, Timers page (presets, custom, alarm, pills on every page), Lights page with scenes (All on / Movie / Bedtime / All off + Hue app scenes), Calendar page
- [x] Sprint 2: display modes (active / ambient / night) + motion wake via Fully Plus; alarm via Fully sound; phone remote at /remote (PIN, same Wi-Fi); tablet IP reserved (192.168.1.215)
- [ ] Sprint 3: shared grocery list (live sync), household reminders, nightly backup of data/
- [ ] Sprint 4: sports strip + Knobability, morning brief, drive time to OSU Wexner
- [ ] Sprint 5: voice test (tap-to-talk), sunset / bedtime / wake-up light automations

## Groceries → Walmart cart (idea, Nov 15)
- [ ] Shared grocery list on tablet + phone remote (add, check off, clear)
- [ ] "Add ingredients to list" button on each recipe
- [ ] "Send to Walmart" button on the remote: copies a ready-made "fill my cart with…" message
- [ ] Scheduled task on the Dell (Claude desktop): read the list from the tablet over Wi-Fi, open Walmart in Chrome (already signed in), fill the cart, stop before checkout, notify with what was added / not found
  - Start it on a schedule (day/time TBD), on demand via Run in the Claude app, or both
  - Needs: Dell awake, Claude desktop + Chrome open. Stops if Walmart shows a bot check. Never checks out.
- [ ] Quick add to Google Calendar from the remote (Apps Script setup on The Ave account)
- [ ] Nightly backup of data/ (recipes, timers, note) so a tablet reset doesn't lose them

## TV control (idea, Nov 15)
- [ ] Living room LG (webOS): on/off, volume, inputs, launch apps over Wi-Fi. One-time pairing (accept prompt on the TV). Power-on needs "Turn on via Wi-Fi" / "Mobile TV On" enabled.
- [ ] Bedroom TCL Roku TV: on/off, volume, inputs, launch apps via Roku's local control. Power-on needs "Fast TV start" enabled.
- [ ] TV buttons on the Lights page + phone remote; reserve both TVs' IPs on the router
- [ ] Tie into scenes (e.g. Movie = dim living room + LG on, Bedtime = bedroom TV off)

## Phase 4 – Timers (old notes)
- [ ] Big tap-to-start timers (5/10/15) with alarm sound
- [ ] Multiple timers
- [ ] Cooking-friendly layout

## Phase 5 – Nice to have
- [ ] Shared grocery / to-do list
- [ ] Calendar
- [ ] Tap-to-talk voice commands, maybe a custom wake word

## Side quest
- [ ] Unlock bootloader + root, custom "The Ave" boot animation (wipes tablet — code is safe on GitHub)
