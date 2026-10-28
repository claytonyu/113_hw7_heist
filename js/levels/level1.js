// Level 1 - Goldcrest Lobby (tutorial).
//
// Teaches: movement, keycards + locked doors + fog, hacking a computer,
// a static laser that leaves a gap, slow sweeping cameras, one patrolling guard.
// No vents on this level.
//
// Route: Foyer (S) -> lobby -> WEST corridor (step around the laser) ->
// Records Room (red keycard) -> back through the lobby -> EAST corridor ->
// red door into the Manager's Office -> hack vault controls -> back across the
// lobby -> vault (diamond) -> return to the foyer.
Heist.registerLevel({
  id: 'l1',
  name: 'Level 1 - Goldcrest Lobby',

  map: [
    '############  ##########  ############',
    '#..........#  #........#  #..........#',
    '#..........#  #........#  #..........#',
    '#..........#  #...T....#  #..........#',
    '#..........#  #........#  #..........#',
    '#..........#  #........#  #..........#',
    '#..........#  #........#  #..........#',
    '#..........#######D########..........#',
    '#..........#..............#..........#',
    '#..........#..............#..........#',
    '#####D######..............#####D######',
    '#....................................#',
    '#....................................#',
    '#....................................#',
    '#####D######..............#####D######',
    '#..........#..............#..........#',
    '#..........#..............#..........#',
    '#..........#..............#..........#',
    '#..........######....######..........#',
    '#..........#  #........#  #..........#',
    '#..........#  #...S....#  #..........#',
    '#..........#  #........#  #..........#',
    '############  ##########  ############',
  ],

  objectives: [
    { text: 'Find the red keycard in the Records Room (west wing)', done: 'key:red' },
    { text: "Hack the vault controls in the Manager's Office (east wing)", done: 'flag:vault_open' },
    { text: 'Steal the Goldcrest Diamond from the vault', done: 'treasure' },
    { text: 'Escape through the front foyer', done: 'escape' },
  ],

  doors: [
    { x: 5, y: 10, label: 'Records Room' },
    { x: 5, y: 14, label: 'Break Room' },
    { x: 31, y: 14, label: 'Teller Office' },
    { x: 31, y: 10, requires: 'key:red', label: "Manager's Office" },
    { x: 18, y: 7, requires: 'flag:vault_open', label: 'Vault' },
  ],

  items: [
    { type: 'keycard', x: 2, y: 2, color: 'red' },
  ],

  computers: [
    { x: 35, y: 2, label: 'Vault door control', sets: 'vault_open',
      message: 'Vault door unlocked', hackTime: 2 },
  ],

  cameras: [
    // Records Room: sweeps the middle of the room; hug the west wall.
    { x: 10, y: 1, angle: 135, sweep: 80, fov: 45, range: 8, speed: 20 },
    // East corridor: swings across the Manager's Office door.
    { x: 33, y: 13, angle: 270, sweep: 120, fov: 45, range: 5, speed: 25 },
  ],

  guards: [
    // Night guard walking the lobby perimeter.
    { path: [[13, 9], [24, 9], [24, 16], [13, 16]], loop: true,
      speed: 1.5, fov: 60, range: 4, pause: 0.4 },
  ],

  lasers: [
    // Static beam across the top two lanes of the west corridor; walk the bottom lane.
    { x1: 7, y1: 11, x2: 7, y2: 12 },
  ],

  decor: [
    // Vault
    { type: 'rug', x: 17, y: 2, w: 3, h: 3 },
    { type: 'pedestal', x: 18, y: 3 },
    { type: 'safe', x: 15, y: 1 }, { type: 'safe', x: 16, y: 1 },
    { type: 'safe', x: 21, y: 1 }, { type: 'safe', x: 22, y: 1 },
    { type: 'crate', x: 15, y: 6 }, { type: 'crate', x: 22, y: 6 },
    { type: 'lamp', x: 15, y: 4 }, { type: 'lamp', x: 22, y: 4 },

    // Lobby
    { type: 'rug', x: 16, y: 10, w: 6, h: 5 },
    { type: 'plant', x: 12, y: 8 }, { type: 'plant', x: 25, y: 8 },
    { type: 'plant', x: 12, y: 17 }, { type: 'plant', x: 25, y: 17 },
    { type: 'sofa', x: 14, y: 8, w: 2, h: 1 }, { type: 'sofa', x: 21, y: 8, w: 2, h: 1 },
    { type: 'desk', x: 14, y: 14, w: 2, h: 1 }, { type: 'desk', x: 22, y: 14, w: 2, h: 1 },
    { type: 'chair', x: 14, y: 15 }, { type: 'chair', x: 23, y: 15 },
    { type: 'watercooler', x: 25, y: 10 },
    { type: 'painting', x: 15, y: 7 }, { type: 'painting', x: 21, y: 7 },

    // Foyer
    { type: 'rug', x: 17, y: 19, w: 4, h: 3 },
    { type: 'plant', x: 15, y: 19 }, { type: 'plant', x: 22, y: 19 },
    { type: 'lamp', x: 15, y: 21 }, { type: 'lamp', x: 22, y: 21 },

    // West corridor
    { type: 'plant', x: 1, y: 11 }, { type: 'lamp', x: 1, y: 13 },

    // Records Room
    { type: 'bookshelf', x: 4, y: 1, w: 3, h: 1 }, { type: 'bookshelf', x: 7, y: 1, w: 2, h: 1 },
    { type: 'desk', x: 1, y: 3, w: 2, h: 1 }, { type: 'chair', x: 2, y: 4 },
    { type: 'table', x: 5, y: 5, w: 2, h: 2 },
    { type: 'cabinet', x: 10, y: 5 }, { type: 'cabinet', x: 10, y: 6 }, { type: 'cabinet', x: 10, y: 7 },
    { type: 'plant', x: 1, y: 9 },
    { type: 'painting', x: 8, y: 0 },

    // Break Room
    { type: 'sofa', x: 2, y: 21, w: 3, h: 1 },
    { type: 'table', x: 6, y: 18, w: 2, h: 1 },
    { type: 'chair', x: 5, y: 18 }, { type: 'chair', x: 8, y: 18 },
    { type: 'watercooler', x: 10, y: 15 },
    { type: 'plant', x: 1, y: 15 }, { type: 'trash', x: 10, y: 21 },
    { type: 'lamp', x: 1, y: 21 },

    // East corridor
    { type: 'plant', x: 36, y: 11 },

    // Manager's Office
    { type: 'bookshelf', x: 27, y: 1, w: 3, h: 1 },
    { type: 'desk', x: 32, y: 3, w: 3, h: 1 }, { type: 'chair', x: 33, y: 4 },
    { type: 'rug', x: 29, y: 5, w: 4, h: 3 },
    { type: 'sofa', x: 27, y: 8, w: 3, h: 1 },
    { type: 'safe', x: 36, y: 6 },
    { type: 'plant', x: 36, y: 9 }, { type: 'lamp', x: 36, y: 1 },
    { type: 'painting', x: 32, y: 0 },

    // Teller Office
    { type: 'desk', x: 28, y: 17, w: 2, h: 1 }, { type: 'desk', x: 31, y: 17, w: 2, h: 1 },
    { type: 'desk', x: 34, y: 17, w: 2, h: 1 },
    { type: 'chair', x: 28, y: 18 }, { type: 'chair', x: 31, y: 18 }, { type: 'chair', x: 34, y: 18 },
    { type: 'cabinet', x: 36, y: 15 }, { type: 'cabinet', x: 36, y: 16 },
    { type: 'printer', x: 27, y: 21 }, { type: 'trash', x: 36, y: 21 },
    { type: 'watercooler', x: 27, y: 15 },
  ],
});
