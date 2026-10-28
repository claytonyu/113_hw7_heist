// Vent tests: climbing in/out, duct collision, temperature sensor, door bypass.
//
// Layout (fx_vent_a):
//   Left room (start) and right room (treasure) separated by a wall and a
//   locked red door at (5,2). Vent openings at (4,1), (4,3) on the left and
//   (6,1) on the right, joined by 1-wide ducts:
//     (4,3)O -> (4,2)= -> (4,1)O -> (5,1)= over the wall -> (6,1)O
//   A dead-end duct (5..8,3) runs off (4,3). (2,3) is a 'v' with no opening.
Heist.registerLevel({
  id: 'fx_vent_a',
  name: 'Vent Fixture',
  map: [
    '###########',
    '#S..v#v..T#',
    '#....D....#',
    '#.v.v#....#',
    '###########',
  ],
  ventMap: [
    '           ',
    '    O=O    ',
    '    =      ',
    '    O====  ',
    '           ',
  ],
  doors: [{ x: 5, y: 2, requires: 'key:red', label: 'Vault' }],
});

// 'v' tile but no ventMap at all.
Heist.registerLevel({
  id: 'fx_vent_none',
  name: 'No Vents',
  map: [
    '#######',
    '#S.v.T#',
    '#######',
  ],
});

(function () {
  const S = 32;
  const tileX = (s) => Math.floor(s.player.x / S);
  const tileY = (s) => Math.floor(s.player.y / S);
  // Enter the vent at tile (tx,ty) and finish the climb animation.
  function enter(tx, ty) {
    T.teleport(tx, ty);
    T.press('q');
    T.run(0.3);
  }

  T.add('vents: Q on a vent tile climbs in, snapped to tile center', () => {
    const s = T.load('fx_vent_a');
    T.teleport(4, 3);
    s.player.x -= 6; s.player.y += 5; // off-center but still on the tile (away from the door)
    T.run(0.02);
    T.assert(s.hint === 'Press Q to climb into the vent', 'hint shown, got ' + s.hint);
    T.press('q');
    T.assert(s.player.layer === 'vent', 'in vent');
    T.assert(s.player.x === 4.5 * S && s.player.y === 3.5 * S, 'snapped to center');
    T.assert(!Heist.Player.isDetectable(s), 'not detectable in vents');
  });

  T.add('vents: climb transition ignores input, then movement resumes', () => {
    const s = T.load('fx_vent_a');
    T.teleport(4, 3);
    T.press('q');
    T.hold('w', 0.15);
    T.assert(s.player.y === 3.5 * S, 'pinned during climb');
    T.run(0.2);
    T.hold('w', 0.2);
    T.assert(s.player.y < 3.5 * S - 10, 'moves after climb');
  });

  T.add('vents: Q elsewhere does nothing', () => {
    const s = T.load('fx_vent_a');
    T.teleport(3, 3); T.press('q'); T.run(0.3);
    T.assert(s.player.layer === 'main', 'plain floor');
    T.teleport(2, 3); T.press('q'); T.run(0.3);
    T.assert(s.player.layer === 'main', "'v' with no opening above");
    T.assert(s.hint === null, 'no hint on dead vent');
  });

  T.add('vents: level without ventMap ignores Q', () => {
    const s = T.load('fx_vent_none');
    T.teleport(3, 1); T.press('q'); T.run(0.3);
    T.assert(s.player.layer === 'main', 'still main');
    T.assert(s.temp === 0, 'temp unchanged');
  });

  T.add('vents: disabled by powerups.vents === false', () => {
    const s = T.load('fx_vent_a');
    s.powerups = { vents: false };
    T.teleport(4, 3); T.press('q'); T.run(0.3);
    T.assert(s.player.layer === 'main', 'locked out');
    T.run(0.02);
    T.assert(/requires/i.test(s.hint || ''), 'locked hint, got ' + s.hint);
    s.powerups.vents = true;
    T.press('q');
    T.assert(s.player.layer === 'vent', 'works when enabled');
  });

  T.add('vents: crawl along 1-wide ducts, blocked by non-duct', () => {
    const s = T.load('fx_vent_a');
    enter(4, 3);
    T.hold('a', 0.5);
    T.assert(s.player.x >= 4 * S + 7.5, 'blocked left (no duct at 3,3), x=' + s.player.x);
    T.hold('s', 0.5);
    T.assert(s.player.y <= 4 * S - 7.5, 'blocked down');
    T.hold('w', 1.2);
    T.assert(tileX(s) === 4 && tileY(s) === 1, 'climbed up duct to (4,1), at ' + tileX(s) + ',' + tileY(s));
    T.assert(s.player.y >= S + 7.5, 'blocked by duct end');
    T.hold('d', 1);
    T.assert(tileX(s) === 6 && tileY(s) === 1, 'crawled over wall to (6,1)');
    T.assert(s.player.x <= 7 * S - 7.5, 'blocked at duct end');
    T.assert(s.player.layer === 'vent', 'still in vent');
  });

  T.add('vents: corner assist turns into a branch when slightly misaligned', () => {
    const s = T.load('fx_vent_a');
    enter(4, 3);
    T.hold('d', 0.15); // ~13px past center of (4,3), now overlapping (5,3)
    T.assert(s.player.x > 4.5 * S + 8, 'drifted right of the branch');
    T.hold('w', 1.5);
    T.assert(tileY(s) === 1, 'turned up into the vertical duct, ty=' + tileY(s));
  });

  T.add('vents: E on opening drops to the matching main tile', () => {
    const s = T.load('fx_vent_a');
    enter(4, 3);
    T.hold('w', 1.2);
    T.run(0.02);
    T.assert(s.hint === 'Press E to drop down', 'hint shown, got ' + s.hint);
    T.press('e');
    T.assert(s.player.layer === 'main', 'dropped');
    T.assert(s.player.x === 4.5 * S && s.player.y === 1.5 * S, 'at (4,1) center');
    T.run(0.2);
    T.assert(Heist.Player.isDetectable(s), 'detectable again');
  });

  T.add('vents: E on plain duct does nothing', () => {
    const s = T.load('fx_vent_a');
    enter(4, 3);
    T.hold('d', 1.5); // dead-end duct over floor (8,3)
    T.assert(tileX(s) === 8, 'at end of duct, tx=' + tileX(s));
    T.press('e'); T.run(0.2);
    T.assert(s.player.layer === 'vent', 'still in vent over floor duct');
    T.teleport(5, 1); // duct over the wall
    T.press('e'); T.run(0.2);
    T.assert(s.player.layer === 'vent', 'still in vent over wall');
  });

  T.add('vents: Q in vents / E on main floor are ignored', () => {
    const s = T.load('fx_vent_a');
    T.teleport(4, 3); T.press('e'); T.run(0.2);
    T.assert(s.player.layer === 'main', 'E on main does nothing');
    T.press('q'); T.run(0.3);
    T.press('q'); T.run(0.3);
    T.assert(s.player.layer === 'vent', 'Q in vent does nothing');
  });

  T.add('vents: temperature rises in vents, falls outside, never below 0', () => {
    const s = T.load('fx_vent_a');
    T.run(1);
    T.assert(s.temp === 0, 'starts at 0');
    enter(4, 3);
    T.run(1.7); // 2s total in vent
    T.assert(Math.abs(s.temp - 24) < 1.5, 'rose ~12/s, got ' + s.temp);
    T.press('e');
    T.run(0.5);
    T.assert(s.temp < 24 && s.temp > 0, 'falling, got ' + s.temp);
    T.run(3);
    T.assert(s.temp === 0, 'clamped at 0, got ' + s.temp);
    T.assert(s.status === 'playing', 'still playing');
  });

  T.add('vents: reaching max temperature trips the sensor (instant loss)', () => {
    const s = T.load('fx_vent_a');
    enter(4, 3);
    T.run(7);
    T.assert(s.status === 'playing', 'still fine at ~87');
    T.assert(s.ventFx.warned, 'temp warning armed past 70%');
    T.run(2);
    T.assert(s.temp === s.tempMax, 'temp at max');
    T.assert(s.status === 'lost', 'lost');
    T.assert(s.alert === s.alertMax, 'alert maxed');
    T.assert(/temperature/i.test(s.loseReason), 'reason: ' + s.loseReason);
  });

  T.add('vents: sfx edges fire once each', () => {
    const s = T.load('fx_vent_a');
    const played = [];
    const orig = Heist.Audio.play;
    Heist.Audio.play = (n) => played.push(n);
    try {
      enter(4, 3);
      T.run(6.5); // cross 70%
      T.press('e');
      T.run(0.5);
    } finally { Heist.Audio.play = orig; }
    const count = (n) => played.filter((x) => x === n).length;
    T.assert(count('vent_up') === 1, 'vent_up once');
    T.assert(count('vent_down') === 1, 'vent_down once');
    T.assert(count('temp_warning') === 1, 'temp_warning once');
    T.assert(s.status === 'playing', 'survived');
  });

  T.add('vents: bypass a locked door through the ducts (core use)', () => {
    const s = T.load('fx_vent_a');
    const vault = Heist.Level.regionAt(s.level, 8.5 * S, 2.5 * S);
    // Door really blocks on foot.
    T.teleport(4, 2);
    T.hold('d', 1);
    T.assert(s.player.x < 5 * S, 'door blocks');
    // Walk to the vent, climb in, crawl over the wall, drop into the vault.
    T.hold('s', 0.4);
    T.assert(tileX(s) === 4 && tileY(s) === 3, 'on vent tile (4,3)');
    T.press('q'); T.run(0.3);
    T.hold('w', 1.2);
    T.hold('d', 1);
    T.press('e'); T.run(0.2);
    T.assert(s.player.layer === 'main', 'dropped down');
    T.assert(tileX(s) === 6 && tileY(s) === 1, 'inside the vault at (6,1)');
    T.assert(Heist.Level.regionAt(s.level, s.player.x, s.player.y) === vault, 'in vault region');
    T.assert(s.level.doors[0].locked, 'door still locked');
    // Grab the treasure on foot.
    T.hold('d', 1.2);
    T.assert(s.player.hasTreasure, 'got treasure');
  });
})();
