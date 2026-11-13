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
