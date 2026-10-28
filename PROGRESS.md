# PROGRESS

Working log for the stealth heist game. Newest entries at the bottom of the log.

## Decisions (agreed with user)
- Stack: HTML5 Canvas + plain JavaScript, no build step. Open `index.html` to play.
- Levels: hand-written JS data files in `js/levels/`.
- Vent access is enabled in test levels (powerup progression comes later).

## Log
- [core] Architecture: global `Heist` namespace, plain `<script>` tags (works from `file://`, no modules/CORS issues).
- [core] Wrote `config.js`, `utils.js` (LOS, ray cast, cone test), `input.js`, `level.js` (parser, regions, fog rule), `player.js` (WASD + axis-separated tile collision), `tasks.js` (keycards, doors, hackable computers, treasure, escape), `game.js` (loop, state, win/lose, restart), basic `render.js`.
- [core] Level format documented in `js/levels/README.md`; this is the contract all subsystems follow.
- [core] Headless test harness: `test/test.html` + `test/run.sh` (headless Chrome, no Node needed). 8/8 core tests pass. Screenshot confirms rendering and fog over locked room.
- [core] Dispatching subagents with separate file ownership: security, vents, levels, visuals/audio.
- [security] Cameras (sine sweep, wall-clipped red cones), guards (loop/ping-pong patrols, pauses, cones), lasers (glow, blinking, instant fail). Camera 28 alert/s, guard 38 alert/s. 17 tests.
- [vents] Q/E layer switch, 0.25s/0.15s transitions, temperature (12/s up, 20/s down, max = instant fail, warning at 70%), corner assist, dimmed main floor while crawling. 14 tests.
- [levels] l1 Goldcrest Lobby (tutorial, no vents), l2 Executive Floor (vents, security grid), l3 Deep Vault (everything). Validator + progression solver + route tests. 29 tests.
- [visuals/audio] Pre-rendered tile/decor layer, 17 decor types, night lighting, fog with LOCKED badge, HUD panels, title card, win/lose overlay, synthesized SFX + ambient music, M mute.
- [integration] Added level3 to index.html/test.html, M mute in controls text. 68/68 tests pass. Screenshot verified.
- [handoff] Stopped at user request. Full state, decisions, and next steps are in HANDOFF.md.
