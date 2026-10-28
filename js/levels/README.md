# Level file format

Each level is a plain JS file that calls `Heist.registerLevel({...})`, and is
added as a `<script>` tag in `index.html` (and `test.html`) in play order.

All entity positions are in **tile coordinates** (column `x`, row `y`, 0-based)
unless stated otherwise. A tile is 32 px. Angles are in **degrees**, 0 = right
(+x), 90 = down (+y).

```js
Heist.registerLevel({
  id: 'l1',
  name: 'Level 1 - The Lobby',
  alertMax: 100,                 // optional, default CONFIG.ALERT_MAX

  // Main floor. All rows should be the same length.
  map: [
    '##########',
    '#S...D..T#',
    '##########',
  ],

  // Optional vent layer, same size as `map`.
  ventMap: [ ... ],

  objectives: [ { text: 'Find the red keycard', done: 'key:red' }, ... ],
  doors:     [ ... ],
  items:     [ ... ],
  computers: [ ... ],
  cameras:   [ ... ],
  guards:    [ ... ],
  lasers:    [ ... ],
  decor:     [ ... ],
});
```

## `map` characters (main floor)

| char | meaning |
|------|---------|
| `#`  | wall (solid, blocks sight) |
| `.`  | floor |
| ` `  | void / outside (solid, drawn as background) |
| `S`  | floor, player start and **exit**. Exactly one. |
| `T`  | floor, treasure. Exactly one. |
| `D`  | door. Needs an entry in `doors` with matching `x,y`, or it is a plain unlocked doorway. |
| `v`  | floor with a ceiling vent above it. Press Q here to climb in. |

Rooms are computed automatically: walkable tiles are flood-filled with doors as
boundaries. **A room is hidden (fogged) while the player is outside it and every
door touching it is locked.** Design locked rooms so all of their entrances are
doors.

## `ventMap` characters (vent layer)

| char | meaning |
|------|---------|
| `=`  | duct (crawlable) |
| `O`  | opening (crawlable). Must sit on a `v` tile in `map`. Press E to drop down. |
| anything else | solid |

## Requirement strings

Used by `doors[].requires`, `computers[].requires`, `objectives[].done`,
`cameras[].disabledBy`, `lasers[].disabledBy`, `guards[].disabledBy`.

- `key:<color>` player holds that keycard (`red`, `blue`, `green`, `yellow`)
- `flag:<name>` a flag was set (by hacking a computer, or an item's `sets`)
- `treasure` player holds the treasure
- `escape` player escaped (level won)

## Entities

```js
doors: [
  { x: 5, y: 1, requires: 'key:red', label: 'Office door' },  // unlocks on touch with key
  { x: 9, y: 4, requires: 'flag:vault_open', label: 'Vault' }, // unlocks when flag set
]
items: [
  { type: 'keycard', x: 3, y: 7, color: 'red' },               // picked up on touch
  // optional `sets: '<flag>'` on any item sets that flag on pickup
]
computers: [
  { x: 12, y: 3, label: 'Disable cameras', sets: 'cams_off',
    message: 'Cameras offline', hackTime: 1.5,                 // seconds holding F
    requires: 'key:blue', lockedHint: 'Needs blue keycard' },  // optional
]
cameras: [
  { x: 6, y: 1,            // tile the camera is mounted in (usually a floor tile next to a wall)
    angle: 90,             // center of the sweep, degrees
    sweep: 90,             // total swing width, degrees (0 = static)
    fov: 50,               // cone width, degrees
    range: 6,              // tiles
    speed: 30,             // swing speed, degrees/second
    disabledBy: 'flag:cams_off' },                             // optional
]
guards: [
  { path: [[3, 3], [10, 3], [10, 8], [3, 8]],   // tile waypoints, walked in order
    loop: true,            // true: loop back to first; false: ping-pong
    speed: 2,              // tiles/second
    fov: 70, range: 5,     // degrees, tiles
    pause: 0.5,            // optional seconds to wait at each waypoint
    disabledBy: null },
]
lasers: [
  { x1: 4, y1: 2, x2: 4, y2: 6,   // tile centers of both ends (beam runs between)
    period: 0,             // optional: >0 makes it blink with this cycle length (s)
    onTime: 0,             // optional: seconds on per cycle when blinking
    offset: 0,             // optional: phase offset (s)
    disabledBy: 'flag:lasers_off' },
]
decor: [
  { type: 'desk', x: 2, y: 2, w: 2, h: 1, rot: 0 },  // purely visual, not solid
]
```

Decor types: `desk`, `chair`, `plant`, `cabinet`, `bookshelf`, `sofa`,
`table`, `rug`, `crate`, `server`, `watercooler`, `printer`, `painting`,
`pedestal`, `safe`, `lamp`, `trash`. Unknown types render as a plain box.
