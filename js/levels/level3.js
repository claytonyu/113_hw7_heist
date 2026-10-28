// Level 3 - The Deep Vault.
//
// Everything combined, tighter: two guards circling a ring corridor, blinking
// lasers on both sides of the ring, a laser grid gating the Director's
// keycard, a vent into the sealed time-lock room, and a laser-swept
// antechamber in front of the vault.
//
// Route: Stairwell (S) -> ring (stay behind the guards) -> Cloakroom (red
// keycard) -> red door into the Security Room (camera override) -> red door
// into the Server Room (laser grid, walk around the half-beam) -> Director's
// Office (grid is down; yellow keycard) -> yellow door into the Records Annex
// -> Q into the vent, crawl east over the wall -> E into the Time-Lock Room
// -> hack the time lock (opens the antechamber and the time-lock room door)
// -> ring -> antechamber: dodge the blinking beams to the vault terminal
// (needs the camera override) -> inner vault door opens -> dodge the vault
// guard -> crown -> back out through the antechamber to the stairwell.
Heist.registerLevel({
  id: 'l3',
  name: 'Level 3 - The Deep Vault',

  map: [
    '########################################',
    '#.........#........##.....#............#',
    '#.........#......v.##.....#............#',
    '#.........#........##.....#............#',
    '#.........#........##.v...#............#',
    '#.........#........##.....#............#',
    '#.........#........##.....#............#',
    '#####D#########D#######D########D#######',
    '#......................................#',
    '#......................................#',
    '#..#####D############################..#',
    '#..#........#............#..........#..#',
    '#..#........#............#..........#..#',
    '#..#........#............#..........#..#',
    '#..#........#............D.....T....#..#',
    '#..#........#............#..........#..#',
    '#..#........#............#..........#..#',
    '#..#........#............#..........#..#',
    '#..###############D##################..#',
    '#......................................#',
    '#......................................#',
    '#####D#############...##########D#######',
    '#.........#      #.....#  #............#',
    '#.........#      #..S..#  #............#',
    '#.........#      #.....#  #............#',
    '###########      #######  ##############',
  ],

  ventMap: [
    '                                        ',
    '                                        ',
    '                 O=====                 ',
    '                      =                 ',
    '                      O                 ',
    '                                        ',
    '                                        ',
    '                                        ',
    '                                        ',
    '                                        ',
    '                                        ',
    '                                        ',
    '                                        ',
    '                                        ',
    '                                        ',
    '                                        ',
    '                                        ',
    '                                        ',
    '                                        ',
    '                                        ',
    '                                        ',
    '                                        ',
    '                                        ',
    '                                        ',
    '                                        ',
    '                                        ',
  ],

  objectives: [
    { text: 'Lift the red keycard from the Cloakroom', done: 'key:red' },
    { text: 'Run the camera override in the Security Room', done: 'flag:cams_off' },
    { text: 'Shut down the laser grid in the Server Room', done: 'flag:lasers_off' },
    { text: "Take the yellow keycard from the Director's Office", done: 'key:yellow' },
    { text: 'Vent from the Records Annex into the Time-Lock Room and release the time lock', done: 'flag:timelock_off' },
    { text: 'Hack the vault terminal in the antechamber', done: 'flag:vault_inner' },
    { text: 'Steal the Goldcrest Crown', done: 'treasure' },
    { text: 'Escape down the stairwell', done: 'escape' },
  ],

  doors: [
    { x: 5, y: 7, label: 'Cloakroom' },
    { x: 32, y: 7, label: "Director's Office" },
    { x: 32, y: 21, label: 'Staff Lounge' },
    { x: 5, y: 21, requires: 'key:red', label: 'Security Room' },
    { x: 8, y: 10, requires: 'key:red', label: 'Server Room' },
    { x: 15, y: 7, requires: 'key:yellow', label: 'Records Annex' },
    { x: 23, y: 7, requires: 'flag:timelock_off', label: 'Time-Lock Room' },
    { x: 18, y: 18, requires: 'flag:timelock_off', label: 'Vault Antechamber' },
    { x: 25, y: 14, requires: 'flag:vault_inner', label: 'Inner Vault' },
  ],

  items: [
    { type: 'keycard', x: 5, y: 3, color: 'red' },
    { type: 'keycard', x: 37, y: 2, color: 'yellow' },
  ],

  computers: [
    { x: 2, y: 23, label: 'Camera override', sets: 'cams_off',
      message: 'All cameras offline', hackTime: 2.5 },
    { x: 11, y: 16, label: 'Laser grid', sets: 'lasers_off',
      message: "Director's laser grid offline", hackTime: 2.5 },
    { x: 25, y: 2, label: 'Time lock', sets: 'timelock_off',
      message: 'Time lock released: antechamber open', hackTime: 3.5 },
    { x: 13, y: 11, label: 'Vault terminal', sets: 'vault_inner',
      message: 'Inner vault door open', hackTime: 3,
      requires: 'flag:cams_off', lockedHint: 'Terminal locked: run the camera override first' },
  ],

  cameras: [
    { x: 9, y: 1, angle: 135, sweep: 90, fov: 45, range: 6, speed: 30, disabledBy: 'flag:cams_off' },
    { x: 19, y: 8, angle: 90, sweep: 120, fov: 40, range: 3, speed: 35, disabledBy: 'flag:cams_off' },
    { x: 10, y: 20, angle: 270, sweep: 120, fov: 40, range: 3, speed: 35, disabledBy: 'flag:cams_off' },
    { x: 11, y: 11, angle: 135, sweep: 80, fov: 45, range: 6, speed: 30, disabledBy: 'flag:cams_off' },
    { x: 38, y: 1, angle: 135, sweep: 80, fov: 45, range: 7, speed: 25, disabledBy: 'flag:cams_off' },
    { x: 21, y: 1, angle: 45, sweep: 60, fov: 45, range: 5, speed: 25, disabledBy: 'flag:cams_off' },
  ],

  guards: [
    // Two guards walk the ring in the same direction, half a lap apart.
    { path: [[2, 9], [37, 9], [37, 19], [2, 19]], loop: true, speed: 1.8, fov: 70, range: 4.5, pause: 0.5 },
    { path: [[37, 19], [2, 19], [2, 9], [37, 9]], loop: true, speed: 1.8, fov: 70, range: 4.5, pause: 0.5 },
    // Vault guard.
    { path: [[27, 12], [34, 12], [34, 16], [27, 16]], loop: true, speed: 1.4, fov: 55, range: 3.5, pause: 0.3 },
  ],

  lasers: [
    // Director's Office grid (solid until the Server Room is hacked).
    { x1: 27, y1: 5, x2: 38, y2: 5, disabledBy: 'flag:lasers_off' },
    { x1: 27, y1: 4, x2: 38, y2: 4, disabledBy: 'flag:lasers_off' },
    // Blinking beams across both sides of the ring.
    { x1: 1, y1: 14, x2: 2, y2: 14, period: 3, onTime: 1.5, offset: 1.5 },
    { x1: 37, y1: 14, x2: 38, y2: 14, period: 3, onTime: 1.5, offset: 0 },
    // Server Room: static half-beam, walk around its west end.
    { x1: 8, y1: 13, x2: 11, y2: 13 },
    // Antechamber: three blinking floor-to-ceiling curtains.
    { x1: 16, y1: 11, x2: 16, y2: 17, period: 3.5, onTime: 2, offset: 0 },
    { x1: 20, y1: 11, x2: 20, y2: 17, period: 3.5, onTime: 2, offset: 1.2 },
    { x1: 23, y1: 11, x2: 23, y2: 17, period: 3.5, onTime: 2, offset: 2.4 },
  ],

  decor: [
    // Stairwell
    { type: 'rug', x: 19, y: 22, w: 3, h: 3 },
    { type: 'plant', x: 18, y: 22 }, { type: 'plant', x: 22, y: 22 },
    { type: 'lamp', x: 18, y: 24 }, { type: 'lamp', x: 22, y: 24 },

    // Ring corridor
    { type: 'plant', x: 1, y: 8 }, { type: 'plant', x: 38, y: 8 },
    { type: 'plant', x: 1, y: 20 }, { type: 'plant', x: 38, y: 20 },
    { type: 'painting', x: 12, y: 7 }, { type: 'painting', x: 28, y: 7 },
    { type: 'painting', x: 14, y: 21 }, { type: 'painting', x: 25, y: 21 },
    { type: 'watercooler', x: 26, y: 20 }, { type: 'trash', x: 13, y: 20 },

    // Cloakroom
    { type: 'cabinet', x: 1, y: 1 }, { type: 'cabinet', x: 2, y: 1 }, { type: 'cabinet', x: 3, y: 1 },
    { type: 'desk', x: 4, y: 3, w: 3, h: 1 }, { type: 'chair', x: 5, y: 4 },
    { type: 'sofa', x: 1, y: 6, w: 3, h: 1 }, { type: 'plant', x: 9, y: 6 }, { type: 'lamp', x: 7, y: 1 },

    // Records Annex
    { type: 'bookshelf', x: 11, y: 1, w: 4, h: 1 }, { type: 'bookshelf', x: 12, y: 4, w: 4, h: 1 },
    { type: 'cabinet', x: 18, y: 5 }, { type: 'cabinet', x: 18, y: 6 },
    { type: 'table', x: 11, y: 6, w: 2, h: 1 }, { type: 'lamp', x: 18, y: 1 },

    // Time-Lock Room
    { type: 'server', x: 21, y: 6 }, { type: 'server', x: 22, y: 6 },
    { type: 'safe', x: 25, y: 5 }, { type: 'desk', x: 24, y: 1, w: 2, h: 1 },

    // Director's Office
    { type: 'rug', x: 31, y: 1, w: 5, h: 3 },
    { type: 'desk', x: 35, y: 2, w: 3, h: 1 }, { type: 'chair', x: 36, y: 3 },
    { type: 'bookshelf', x: 27, y: 1, w: 3, h: 1 }, { type: 'sofa', x: 28, y: 6, w: 3, h: 1 },
    { type: 'plant', x: 38, y: 6 }, { type: 'safe', x: 27, y: 3 }, { type: 'painting', x: 33, y: 0 },

    // Server Room
    { type: 'server', x: 4, y: 11 }, { type: 'server', x: 5, y: 11 },
    { type: 'server', x: 9, y: 15 }, { type: 'server', x: 9, y: 16 }, { type: 'server', x: 9, y: 17 },
    { type: 'server', x: 4, y: 15 }, { type: 'server', x: 4, y: 16 }, { type: 'server', x: 4, y: 17 },
    { type: 'desk', x: 10, y: 17, w: 2, h: 1 },

    // Antechamber
    { type: 'rug', x: 17, y: 12, w: 3, h: 5 },
    { type: 'lamp', x: 13, y: 17 }, { type: 'lamp', x: 24, y: 11 }, { type: 'lamp', x: 24, y: 17 },
    { type: 'painting', x: 18, y: 10 },

    // Vault
    { type: 'rug', x: 30, y: 13, w: 3, h: 3 },
    { type: 'pedestal', x: 31, y: 14 },
    { type: 'safe', x: 26, y: 11 }, { type: 'safe', x: 35, y: 11 }, { type: 'safe', x: 26, y: 17 }, { type: 'safe', x: 35, y: 17 },
    { type: 'crate', x: 35, y: 13 }, { type: 'crate', x: 35, y: 14 }, { type: 'crate', x: 35, y: 15 },
    { type: 'safe', x: 29, y: 11 }, { type: 'safe', x: 32, y: 11 },

    // Security Room
    { type: 'desk', x: 3, y: 22, w: 3, h: 1 }, { type: 'chair', x: 3, y: 23 },
    { type: 'server', x: 9, y: 22 }, { type: 'server', x: 9, y: 23 }, { type: 'server', x: 9, y: 24 },
    { type: 'cabinet', x: 7, y: 24 }, { type: 'plant', x: 1, y: 24 },

    // Staff Lounge
    { type: 'sofa', x: 28, y: 24, w: 3, h: 1 }, { type: 'table', x: 29, y: 23, w: 2, h: 1 },
    { type: 'sofa', x: 34, y: 24, w: 3, h: 1 }, { type: 'watercooler', x: 38, y: 22 },
    { type: 'printer', x: 27, y: 22 }, { type: 'plant', x: 38, y: 24 }, { type: 'trash', x: 36, y: 22 },
  ],
});
