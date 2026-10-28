// Core tests: parsing, movement, collision, doors/keys, hacking, fog, win/lose.
// Fixture levels are registered here (test-only), loaded by id.
Heist.registerLevel({
  id: 'fx_core',
  name: 'Core Fixture',
  map: [
    '##############',
    '#S.......#...#',
    '#........D.T.#',
    '#..v.....#...#',
    '######D#######',
    '#............#',
    '##############',
  ],
  doors: [
    { x: 9, y: 2, requires: 'key:red', label: 'Vault' },
    { x: 6, y: 4, requires: 'flag:back_open', label: 'Back room' },
  ],
  items: [{ type: 'keycard', x: 5, y: 3, color: 'red' }],
  computers: [{ x: 7, y: 1, label: 'Open back room', sets: 'back_open', hackTime: 1 }],
  objectives: [{ text: 'Key', done: 'key:red' }],
});

T.add('core: level parses with start, treasure, regions', () => {
  const s = T.load('fx_core');
  T.assert(s.level.w === 14 && s.level.h === 7, 'dims');
  T.assert(s.player.x === 1.5 * 32 && s.player.y === 1.5 * 32, 'player at start');
  T.assert(s.level.doors.length === 2, 'two doors');
  T.assert(s.level.regionCount === 3, 'three regions, got ' + s.level.regionCount);
});

T.add('core: WASD moves the player', () => {
  const s = T.load('fx_core');
  const x0 = s.player.x;
  T.hold('d', 0.5);
  T.assert(Math.abs(s.player.x - x0 - 75) < 4, 'moved ~75px right, got ' + (s.player.x - x0));
  const y0 = s.player.y;
  T.hold('s', 0.2);
  T.assert(s.player.y > y0, 'moved down');
});

T.add('core: walls block movement', () => {
  const s = T.load('fx_core');
  T.hold('w', 1);
  T.assert(s.player.y >= 32 + s.player.r - 1, 'stopped by top wall, y=' + s.player.y);
  T.hold('a', 1);
  T.assert(s.player.x >= 32 + s.player.r - 1, 'stopped by left wall');
});

T.add('core: locked door blocks, key unlocks, fog lifts', () => {
  const s = T.load('fx_core');
  const vaultRegion = Heist.Level.regionAt(s.level, 11.5 * 32, 2.5 * 32);
  T.assert(Heist.Level.isRegionHidden(s.level, vaultRegion, 0), 'vault hidden at start');
  T.teleport(8, 2);
  T.hold('d', 1);
  T.assert(s.player.x < 9 * 32, 'blocked by locked door');
  T.teleport(5, 3); T.run(0.05);
  T.assert(s.player.keys.has('red'), 'picked up key');
  T.assert(Heist.Tasks.check(s, 'key:red'), 'objective check');
  T.teleport(8, 2);
  T.hold('d', 1.2);
  T.assert(s.player.x > 10 * 32, 'walked through unlocked door, x=' + s.player.x);
  T.assert(!Heist.Level.isRegionHidden(s.level, vaultRegion, 0), 'vault visible');
});

T.add('core: hacking needs F held for hackTime and sets flag', () => {
  const s = T.load('fx_core');
  T.teleport(7, 2);
  T.hold('f', 0.5);
  T.assert(!s.flags.has('back_open'), 'not yet');
  T.run(0.1);
  T.hold('f', 0.5);
  T.assert(!s.flags.has('back_open'), 'progress resets on release');
  T.hold('f', 1.1);
  T.assert(s.flags.has('back_open'), 'flag set');
  T.assert(!s.level.doors[1].locked, 'flag door unlocked');
});

T.add('core: treasure then return to start wins', () => {
  const s = T.load('fx_core');
  T.teleport(1, 1); T.run(0.1);
  T.assert(s.status === 'playing', 'no win without treasure');
  s.level.doors[0].locked = false;
  T.teleport(11, 2); T.run(0.05);
  T.assert(s.player.hasTreasure, 'got treasure');
  T.assert(s.status === 'playing', 'not won yet');
  T.teleport(1, 1); T.run(0.05);
  T.assert(s.status === 'won', 'won');
});

T.add('core: alert counter accumulates, never decreases, maxes out to lose', () => {
  const s = T.load('fx_core');
  Heist.Game.addAlert(30);
  Heist.Game.addAlert(-10);
  T.assert(s.alert === 30, 'alert 30');
  T.run(1);
  T.assert(s.alert === 30, 'does not decay');
  Heist.Game.addAlert(100);
  T.assert(s.alert === s.alertMax && s.status === 'lost', 'lost');
});

T.add('core: R restarts the level', () => {
  const s = T.load('fx_core');
  T.hold('d', 0.3);
  T.press('r');
  const s2 = Heist.Game.state;
  T.assert(s2 !== s && s2.player.x === 1.5 * 32, 'fresh state');
});
