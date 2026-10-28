// Level 2 - The Executive Floor.
//
// Introduces vents, a security room, a keycard chain and laser gauntlets.
//
// Route: Loading bay (S) -> south hall (dodge the hall guard) -> Mail Room
// (blue keycard) -> blue door into the Security Room -> hack the security grid
// (cameras + executive corridor lasers go offline) -> central corridor ->
// north hall -> Archives (green keycard) -> executive corridor -> green door
// into the Executive Office -> Q into the ceiling vent, crawl east over the wall
// -> E down into Vault Control -> hack the vault override (opens the vault and
// the Vault Control door) -> north hall -> central corridor -> south hall ->
// laser gallery (blinking beams) -> vault (dodge the vault guard) -> diamond ->
// back down the gallery and west along the south hall to the loading bay.
//
// Optional: the break room / north hall vent is a short guard-free shortcut.
Heist.registerLevel({
  id: 'l2',
  name: 'Level 2 - The Executive Floor',

  map: [
    '########################################',
    '#.........#.........##.......##........#',
    '#.........#........v##.......##........#',
    '#.........#.........##.......##........#',
    '#.........#.........##..v....##....T...#',
    '#.........#.........##.......##........#',
    '#.........#####D######.......##........#',
    '#.........#####..#####.......##........#',
    '#.........#####..#####.......##........#',
    '#####D#########..########D########D#####',
    '#.............................###..#    ',
    '#..........................v..###..#    ',
    '#.............................###..#    ',
    '#####################..##########..#    ',
    '#.........#.........#..#......###..#    ',
    '#.........#.........#..#...v..###..#    ',
    '#.........#.........#..#......###..#    ',
    '#.........#.........#..#......###..#    ',
    '#.........#.........#..#......###..#    ',
    '#.........#.........#..#......###..#    ',
    '#.........#.........#..#......###..#    ',
    '#####D#########D#####..###D######..#####',
    '#......................................#',
    '#......................................#',
    '#......................................#',
    '#.......################################',
    '#.S.....#                               ',
    '#########                               ',
  ],

  ventMap: [
    '                                        ',
    '                                        ',
    '                   O=====               ',
    '                        =               ',
    '                        O               ',
    '                                        ',
    '                                        ',
    '                                        ',
    '                                        ',
    '                                        ',
    '                                        ',
    '                           O            ',
    '                           =            ',
    '                           =            ',
    '                           =            ',
    '                           O            ',
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
    { text: 'Grab the blue keycard in the Mail Room', done: 'key:blue' },
    { text: 'Shut down the security grid in the Security Room', done: 'flag:grid_off' },
    { text: 'Find the green keycard in the Archives', done: 'key:green' },
    { text: 'Crawl from the Executive Office vent into Vault Control and open the vault', done: 'flag:vault_open' },
    { text: 'Steal the Sapphire of Goldcrest from the vault', done: 'treasure' },
    { text: 'Escape through the loading bay', done: 'escape' },
  ],

  doors: [
    { x: 5, y: 21, label: 'Mail Room' },
    { x: 26, y: 21, label: 'Break Room' },
    { x: 5, y: 9, label: 'Archives' },
    { x: 15, y: 21, requires: 'key:blue', label: 'Security Room' },
    { x: 15, y: 6, requires: 'key:green', label: 'Executive Office' },
    { x: 25, y: 9, requires: 'flag:vault_open', label: 'Vault Control' },
    { x: 34, y: 9, requires: 'flag:vault_open', label: 'Vault' },
  ],

  items: [
    { type: 'keycard', x: 4, y: 16, color: 'blue' },
    { type: 'keycard', x: 2, y: 2, color: 'green' },
  ],

  computers: [
    { x: 15, y: 15, label: 'Security grid', sets: 'grid_off',
      message: 'Cameras and executive lasers offline', hackTime: 2.5 },
    { x: 27, y: 2, label: 'Vault override', sets: 'vault_open',
      message: 'Vault and control room doors unlocked', hackTime: 3 },
  ],

  cameras: [
    // Mail Room: sweeps across the desk with the blue keycard.
    { x: 9, y: 14, angle: 135, sweep: 80, fov: 45, range: 6, speed: 30, disabledBy: 'flag:grid_off' },
    // South hall between the Mail Room and Security Room doors.
    { x: 10, y: 24, angle: 270, sweep: 120, fov: 40, range: 3, speed: 30, disabledBy: 'flag:grid_off' },
    // North hall, outside the Archives.
    { x: 10, y: 10, angle: 90, sweep: 140, fov: 45, range: 4, speed: 30, disabledBy: 'flag:grid_off' },
    // Archives: swings over the reading tables.
    { x: 9, y: 1, angle: 135, sweep: 90, fov: 45, range: 6, speed: 35, disabledBy: 'flag:grid_off' },
    // Executive corridor: stares straight down at the green door approach.
    { x: 16, y: 7, angle: 90, sweep: 0, fov: 60, range: 3, speed: 0, disabledBy: 'flag:grid_off' },
  ],

  guards: [
    // South hall patrol, end to end.
    { path: [[31, 23], [9, 23]], loop: false, speed: 2, fov: 70, range: 4.5, pause: 1 },
    // North hall patrol.
    { path: [[2, 11], [28, 11]], loop: false, speed: 1.8, fov: 70, range: 4.5, pause: 0.8 },
    // Vault guard circling the pedestal.
    { path: [[32, 2], [37, 2], [37, 7], [32, 7]], loop: true, speed: 1.2, fov: 50, range: 3.5, pause: 0.5 },
  ],

  lasers: [
    // Executive corridor: solid grid until the security grid is hacked.
    { x1: 15, y1: 7, x2: 16, y2: 7, disabledBy: 'flag:grid_off' },
    { x1: 15, y1: 8, x2: 16, y2: 8, disabledBy: 'flag:grid_off' },
    // Laser gallery: three blinking full-width beams (1.4 s off per 3 s cycle)...
    { x1: 33, y1: 19, x2: 34, y2: 19, period: 3, onTime: 1.6, offset: 0 },
    { x1: 33, y1: 16, x2: 34, y2: 16, period: 3, onTime: 1.6, offset: 1 },
    { x1: 33, y1: 12, x2: 34, y2: 12, period: 3, onTime: 1.6, offset: 2 },
    // ...and two static half-width beams that force a zig-zag.
    { x1: 33, y1: 17, x2: 33, y2: 18 },
    { x1: 34, y1: 13, x2: 34, y2: 14 },
  ],

  decor: [
    // Loading bay
    { type: 'crate', x: 5, y: 26 }, { type: 'crate', x: 6, y: 26 }, { type: 'crate', x: 7, y: 25 },
    { type: 'crate', x: 7, y: 26 }, { type: 'trash', x: 1, y: 25 },

    // South hall
    { type: 'plant', x: 1, y: 22 }, { type: 'plant', x: 38, y: 24 },
    { type: 'watercooler', x: 20, y: 24 }, { type: 'plant', x: 25, y: 24 },
    { type: 'painting', x: 12, y: 25 }, { type: 'painting', x: 18, y: 25 }, { type: 'painting', x: 28, y: 25 },
    { type: 'trash', x: 38, y: 22 },

    // Mail Room
    { type: 'desk', x: 3, y: 16, w: 3, h: 1 }, { type: 'chair', x: 4, y: 17 },
    { type: 'cabinet', x: 1, y: 14 }, { type: 'cabinet', x: 2, y: 14 }, { type: 'cabinet', x: 3, y: 14 },
    { type: 'table', x: 6, y: 18, w: 2, h: 1 }, { type: 'crate', x: 1, y: 20 }, { type: 'crate', x: 2, y: 20 },
    { type: 'printer', x: 9, y: 20 }, { type: 'plant', x: 9, y: 17 },

    // Security Room
    { type: 'desk', x: 13, y: 15, w: 2, h: 1 }, { type: 'desk', x: 16, y: 15, w: 2, h: 1 },
    { type: 'chair', x: 14, y: 16 }, { type: 'chair', x: 16, y: 16 },
    { type: 'server', x: 11, y: 17 }, { type: 'server', x: 11, y: 18 }, { type: 'server', x: 11, y: 19 },
    { type: 'server', x: 19, y: 17 }, { type: 'server', x: 19, y: 18 }, { type: 'server', x: 19, y: 19 },
    { type: 'cabinet', x: 19, y: 14 }, { type: 'plant', x: 11, y: 14 },
    { type: 'lamp', x: 12, y: 20 }, { type: 'trash', x: 18, y: 20 },

    // Break Room
    { type: 'sofa', x: 24, y: 14, w: 1, h: 3, rot: 90 },
    { type: 'table', x: 25, y: 17, w: 2, h: 1 },
    { type: 'chair', x: 25, y: 18 }, { type: 'chair', x: 26, y: 18 },
    { type: 'watercooler', x: 29, y: 14 }, { type: 'plant', x: 29, y: 20 }, { type: 'trash', x: 24, y: 20 },

    // North hall
    { type: 'plant', x: 1, y: 10 }, { type: 'plant', x: 29, y: 12 },
    { type: 'lamp', x: 20, y: 12 }, { type: 'painting', x: 8, y: 9 }, { type: 'painting', x: 20, y: 9 },
    { type: 'watercooler', x: 1, y: 12 },

    // Archives
    { type: 'bookshelf', x: 4, y: 1, w: 4, h: 1 },
    { type: 'bookshelf', x: 3, y: 4, w: 4, h: 1 }, { type: 'bookshelf', x: 3, y: 6, w: 4, h: 1 },
    { type: 'cabinet', x: 9, y: 4 }, { type: 'cabinet', x: 9, y: 5 }, { type: 'cabinet', x: 9, y: 6 },
    { type: 'desk', x: 1, y: 3, w: 1, h: 2, rot: 90 }, { type: 'lamp', x: 1, y: 8 }, { type: 'plant', x: 9, y: 8 },

    // Executive Office
    { type: 'rug', x: 12, y: 2, w: 5, h: 3 },
    { type: 'desk', x: 13, y: 2, w: 3, h: 1 }, { type: 'chair', x: 14, y: 1 },
    { type: 'sofa', x: 12, y: 5, w: 2, h: 1 }, { type: 'bookshelf', x: 11, y: 1, w: 1, h: 3, rot: 90 },
    { type: 'plant', x: 19, y: 5 }, { type: 'lamp', x: 17, y: 1 }, { type: 'painting', x: 16, y: 0 },
    { type: 'safe', x: 19, y: 4 },

    // Vault Control
    { type: 'server', x: 22, y: 1 }, { type: 'server', x: 23, y: 1 },
    { type: 'server', x: 28, y: 6 }, { type: 'server', x: 28, y: 7 }, { type: 'server', x: 28, y: 8 },
    { type: 'desk', x: 26, y: 3, w: 3, h: 1 }, { type: 'chair', x: 27, y: 4 },
    { type: 'cabinet', x: 22, y: 8 },

    // Vault
    { type: 'rug', x: 34, y: 3, w: 3, h: 3 },
    { type: 'pedestal', x: 35, y: 4 },
    { type: 'safe', x: 31, y: 1 }, { type: 'safe', x: 38, y: 1 }, { type: 'safe', x: 31, y: 8 }, { type: 'safe', x: 38, y: 8 },
    { type: 'crate', x: 31, y: 4 }, { type: 'crate', x: 38, y: 4 }, { type: 'crate', x: 38, y: 5 },
  ],
});
