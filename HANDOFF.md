# HANDOFF

The game is a working prototype: three playable levels with every core mechanic in the SPEC except the X-Ray and Stealth Mode powerups and powerup progression. All 68 headless tests pass (`./test/run.sh`).

## How to run
- **Play:** open `index.html` in a browser. There is no build step and no server; it works from `file://`.
- **Test:** run `./test/run.sh`. It needs Google Chrome at `/Applications/Google Chrome.app` and python3. Node is not installed on this machine, so tests run in headless Chrome and the results are read out of the page's `<pre id="out">`.
- **Controls:**

| Key | Action |
|---|---|
| WASD / arrows | move |
| F (hold) | hack a computer |
| Q | climb into a vent (when standing on a `v` vent tile) |
| E | drop out of a vent (when on an `O` opening) |
| R | restart the level |
| `[` / `]` | previous / next level (debug) |
| Enter / Space | next level after a win, retry after a loss |
| M | mute |

## Decisions agreed with the user
- HTML5 Canvas + plain JavaScript.
- Levels are hand-written data files in `js/levels/`.
- Vent crawling is enabled in the test levels. Powerup progression comes later.

## Architecture
- Everything lives on one global object, `window.Heist`.
- Files are loaded as plain `<script>` tags, in the order given in `index.html`. ES modules are not used because they break under `file://`.
- **`test/test.html` keeps its own copy of the script list.** When you add a file, add it to both `index.html` and `test/test.html`.

| File | Responsibility |
|---|---|
| `js/config.js` | Tunable constants (`Heist.CONFIG`) and the tile characters |
| `js/utils.js` | Geometry: `lineOfSight`, `castRay`, `inCone`, `distToSegment`, angle helpers |
| `js/input.js` | Key state: `isDown`, `wasPressed`, `endFrame` |
| `js/level.js` | Level registry (`Heist.registerLevel`), parser, room detection (flood fill with doors as boundaries), fog rule, collision queries |
| `js/levels/*.js` | Level data. Format is in `js/levels/README.md`, which is the contract between systems. |
| `js/player.js` | Player creation, WASD movement with axis-separated collision on both layers, `isDetectable` |
| `js/tasks.js` | Keycards, locked doors, hackable computers, treasure, escape. Also the requirement-string checker. |
| `js/security.js` | Cameras, guards, lasers: detection plus their drawing |
| `js/vents.js` | Q/E layer switching, temperature sensor, vent-layer drawing |
| `js/render.js` | World, decor, lighting, fog, player, HUD, overlays |
| `js/audio.js` | WebAudio-synthesized sound effects and ambient music, mute toggle |
| `js/game.js` | State, main loop, win/lose, restart, camera follow, `step(dt)` for tests |

**Frame order:** `Player.update` → `Vents.update` → `Tasks.update` → `Security.update` → `Render.draw`.
- `state.hint` is cleared at the start of each frame.
- If two systems both set `state.hint`, the last one to run wins.

**API other systems call on `Heist.Game`:**
- `addAlert(n)`: raises the alert counter.
- `maxAlert(reason)`: instant loss.
- `lose(reason)`, `win()`.
- `toast(text)`, `sfx(name)`.

**Key fields on `state`:**
- `level` (the parsed level), `player`
- `alert` / `alertMax`, `temp` / `tempMax`
- `flags` (a Set), `status` (`playing` / `won` / `lost`)
- `security`, `ventFx`
- `shake`, `flash`, `cam`

**Requirement strings** are used by doors, computers, objectives and `disabledBy`:
- `key:<color>`, `flag:<name>`, `treasure`, `escape`.
- They are evaluated by `Heist.Tasks.check`.

## Game rules and design decisions
- **Alert counter:**
  - It only goes up and caps at `alertMax` (default 100). Reaching the cap loses the level.
  - Cameras add 28/s while they see you, so sitting in a cone loses in about 3.6 s.
  - Guards add 38/s, about 2.6 s to lose.
  - Detection checks the player's center plus two side points, with line of sight. Walls and locked doors block sight.
  - These constants are at the top of `security.js`.
- **Lasers:** touching an active beam sets the alert to max and ends the level immediately. Lasers can blink (`period`, `onTime`, `offset`) and can be turned off with `disabledBy`.
- **Guards:** they follow a fixed waypoint path, either looping or ping-pong, and never react to the player. A guard whose `disabledBy` requirement is met stops and loses its vision.
- **Cameras:** they swing back and forth in a smooth sine motion. The red vision cone is clipped against walls by ray casting. A "!" appears over a camera or guard while it sees you.
- **Fog ("can't see into locked rooms"):** a room is fully hidden while the player is outside it and every door bordering it is locked. Rooms are found automatically, so a locked room must be enclosed entirely by walls and doors.
- **Doors:**
  - A `key:` door unlocks when you touch it while holding the matching keycard.
  - A `flag:` door unlocks as soon as its flag is set, from anywhere on the map.
  - A door with no requirement is an open doorway.
- **Computers:** hold F for `hackTime` seconds. Letting go resets the progress. A computer can itself have a `requires` (for example a keycard or another flag).
- **Win:** pick up the treasure, then return to the start tile `S`.
- **Vents:**
  - You are undetectable while in a vent, and lasers do not apply.
  - Temperature rises 12/s inside and falls 20/s outside. Reaching 100 is an **instant loss**; I chose that interpretation of "the sensor triggers". A warning sound plays at 70%.
  - The main floor stays visible under a dark overlay while you crawl.
  - A corner assist nudges you into side ducts so turns are forgiving.
- **Vent gating:** vents are gated by `state.powerups?.vents !== false`. Nothing sets `state.powerups` yet, so vents are always on.
- **Decor:** purely visual and **not solid**. The player walks over desks. This is a known rough edge (see TODO).
- **Visual language:**

| Meaning | Colour |
|---|---|
| Security / danger | red |
| Exit, hacked, success | green |
| Idle computer | blue |
| Flag-locked door | purple |
| Key doors and keycards | the key's colour |
| Treasure | cyan |
| Vent heat | orange |

- **Rendering:**
  - Static tiles and decor are pre-rendered to an offscreen canvas when the level loads. Doors, lights and entities are drawn live.
  - A full update plus draw takes about 3.6 ms per frame.
  - Darkness is drawn *before* security, so cones and lasers always stay bright and readable.

## Levels (setting: Goldcrest Savings & Trust, a bank at night)
1. **`l1` Goldcrest Lobby (tutorial, no vents)**
   1. Get the red keycard from the west wing, stepping around a static laser in the corridor.
   2. Use it on the east-wing office door and hack the vault control.
   3. Take the diamond from the vault.
   4. Return to the foyer.

   Hazards: one lobby guard and two slow cameras.
2. **`l2` The Executive Floor (introduces vents)**
   1. Get the blue keycard and open the security room.
   2. Hack the security grid, which turns off the cameras and the executive-corridor lasers.
   3. Get the green keycard and open the executive office.
   4. Crawl the vent into Vault Control and hack the vault override.
   5. Cross the laser gallery of blinking beams, take the treasure, and escape.

   Hazards: 3 guards and 5 cameras.
3. **`l3` The Deep Vault (everything combined)**
   1. Red keycard.
   2. Camera override.
   3. Laser grid off.
   4. Yellow keycard.
   5. Vent into the time-lock room and hack it.
   6. Hack the vault terminal in the laser-curtain antechamber.
   7. Take the crown and escape.

   Hazards: two guards walking a ring corridor, plus a guard inside the vault.

Step-by-step routes are in the header comment of each level file.

## Tests (`test/`)
- `harness.js` provides the tiny framework: `T.add`, `T.load(id)`, `T.run(sec)`, `T.hold(keys, sec)`, `T.press`, `T.teleport(tx, ty)`, `T.assert`.
- Each test file registers its own `fx_*` fixture levels. The real levels have ids `l1`, `l2`, and so on.

| File | Tests | What it covers |
|---|---|---|
| `core.test.js` | 8 | Parsing, movement, collision, keys, doors, fog, hacking, win, alert, restart |
| `security.test.js` | 17 | Cone and line-of-sight detection, sweep bounds, guard paths, lasers, blinking, `disabledBy`, undetectable player |
| `vents.test.js` | 14 | Q/E rules, duct collision, corner assist, temperature, door bypass |
| `levels.test.js` | 29 | Static validation of every real level, fog, a progression solver, and route checks with the real systems (see below) |

What `levels.test.js` confirms for each level:
- The treasure is unreachable at the start, the level is solvable, and every task is required.
- Standing at the start is safe.
- A scripted playthrough wins.
- Laser gaps, blink windows and vent runs work with the real security and vent code.

**When you add or change a level,** run the tests. The validator enforces:
- guard paths stay on floor tiles and never cross a door that starts locked;
- blinking lasers are fair: `onTime` at most 60% of `period`, and `period` at least 2 s;
- a vent run is at most 18 tiles;
- every locked room is sealed.

## Not done yet / next steps (by SPEC priority)
1. **Powerup progression:**
   - Keep powerups across levels in a persistent object, for example `Heist.Progress`, and copy it to `state.powerups` in `loadLevel`.
   - Unlock vents after level 1. `vents.js` already reads `state.powerups.vents`.
2. **X-Ray powerup:** see into hidden rooms on a cooldown. Hook into `drawFog` in `render.js` and skip it while active.
3. **Stealth Mode powerup:** 1–4 s of invisibility with a limited number of uses per level. Setting `state.player.stealth = true` already makes security ignore you and makes the renderer fade the player. What's missing is a key binding, a timer and the HUD.
4. **More task types (SPEC asks for brainstorming):**
   - power breaker that darkens a wing;
   - a code found on a note and entered at a keypad;
   - a guard-schedule terminal that pauses patrols;
   - a two-step time lock with a countdown;
   - a decoy alarm.
5. **Difficulty tuning:** play-test the alert rates (`security.js`) and the temperature rates (`config.js`). This has not been tuned by hand; the numbers come from reasoning and the test runs.
6. **Polish gaps:**
   - Decor is not solid, so the player walks over desks.
   - There is no title or menu screen and no level-select menu; `[` and `]` are debug keys.
   - Guard patrol routes are not drawn (the level agent suggested this).
   - Paintings sit on wall tiles; there is no `onWall` flag yet.
   - The HUD shows "SOUND ON" before audio has started; audio starts on the first real keypress.
7. **Hint overlap:** `Tasks.update` can overwrite the vent hint when a vent sits next to a locked door. To fix, set task hints only when `state.hint` is null.
8. **Docs:** the optional guard `angle` field (facing for a guard with a single waypoint) is supported but not documented in `js/levels/README.md`.

## History
- Built in one session. I wrote the core engine and the test harness first, then handed the work to four parallel subagents, each owning separate files: security, vents, levels, and visuals/audio. All of them finished, and none are still running.
- Integration:
  - Added `level3.js` to `index.html` and `test/test.html`.
  - Added "M mute" to the controls line and removed the CSS `::after` workaround the visuals agent had used for it.
  - Ran the full suite (68/68) and checked a screenshot of level 1.
- Nothing is committed to git yet.
- `SPEC.md` shows as modified in git. I did not edit it.
