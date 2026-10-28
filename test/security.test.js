// Security tests: cameras, guards, lasers. Fixture levels are test-only.
Heist.registerLevel({
  id: 'fx_sec_cam',
  name: 'Security Camera Fixture',
  map: [
    '###############',
    '#S............#',
    '#.............#',
    '#.............#',
    '#..#..........#',
    '#.............#',
    '#............T#',
    '###############',
  ],
  cameras: [
    // Static camera looking straight down column 3; wall at (3,4).
    { x: 3, y: 1, angle: 90, sweep: 0, fov: 40, range: 7, speed: 0, disabledBy: 'flag:cams_off' },
    // Sweeping camera, far right, for sweep tests.
    { x: 11, y: 1, angle: 90, sweep: 90, fov: 30, range: 3, speed: 45 },
  ],
});

Heist.registerLevel({
  id: 'fx_sec_guard',
  name: 'Security Guard Fixture',
  map: [
    '##############',
    '#S...........#',
    '#............#',
    '#............#',
    '#............#',
    '#............#',
    '#...........T#',
    '##############',
  ],
  guards: [
    { path: [[2, 2], [8, 2], [8, 5], [2, 5]], loop: true, speed: 3, fov: 70, range: 5 },
    { path: [[10, 1], [10, 5], [12, 5]], loop: false, speed: 3, fov: 70, range: 5, pause: 0.3 },
  ],
});

Heist.registerLevel({
  id: 'fx_sec_guard2',
  name: 'Security Guard Vision Fixture',
  map: [
    '##############',
    '#S...........#',
    '#............#',
    '#............#',
    '#...........T#',
    '##############',
  ],
  guards: [{ path: [[2, 3], [11, 3]], loop: false, speed: 1, fov: 70, range: 5, disabledBy: 'flag:guards_off' }],
});

Heist.registerLevel({
  id: 'fx_sec_laser',
  name: 'Security Laser Fixture',
  map: [
    '##############',
    '#S...........#',
    '#............#',
    '#............#',
    '#............#',
    '#...........T#',
    '##############',
  ],
  lasers: [
    { x1: 3, y1: 1, x2: 3, y2: 5, disabledBy: 'flag:lasers_off' },
    { x1: 8, y1: 1, x2: 8, y2: 5, period: 2, onTime: 1, offset: 0 },
  ],
});

(function () {
  const S = 32;
  const deg = (r) => (r * 180) / Math.PI;

  T.add('security: init builds runtime state in pixels', () => {
    const s = T.load('fx_sec_cam');
    T.assert(s.security && s.security.cameras.length === 2, 'two cameras');
    const c = s.security.cameras[0];
    T.assert(c.x === 3.5 * S && c.y === 1.5 * S, 'camera pixel pos');
    T.assert(Math.abs(c.facing - Math.PI / 2) < 1e-9, 'facing in radians');
    T.assert(s.security.seenThisFrame === false, 'seenThisFrame exposed');
  });

  T.add('security: camera sweep changes facing and stays within bounds', () => {
    const s = T.load('fx_sec_cam');
    const cam = s.security.cameras[1];
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < 60 * 6; i++) {
      T.run(1 / 60);
      const f = deg(cam.facing);
      lo = Math.min(lo, f); hi = Math.max(hi, f);
    }
    T.assert(lo >= 45 - 0.01 && hi <= 135 + 0.01, `within sweep, got ${lo.toFixed(1)}..${hi.toFixed(1)}`);
    T.assert(hi - lo > 85, 'covers the sweep, span ' + (hi - lo).toFixed(1));
    const static0 = s.security.cameras[0];
    T.assert(Math.abs(deg(static0.facing) - 90) < 1e-6, 'sweep 0 camera is static');
  });

  T.add('security: player in camera cone gains alert, behind wall does not', () => {
    let s = T.load('fx_sec_cam');
    T.teleport(3, 3); T.run(0.5);
    T.assert(s.alert > 0, 'in cone gains alert, got ' + s.alert);
    T.assert(s.alert < 30, 'brief brush is survivable, got ' + s.alert);
    T.assert(s.security.seenThisFrame, 'seenThisFrame true');
    T.assert(s.security.cameras[0].seeing, 'camera.seeing true');
    s = T.load('fx_sec_cam');
    T.teleport(3, 6); T.run(1);
    T.assert(s.alert === 0, 'behind wall: no alert, got ' + s.alert);
    T.teleport(7, 3); T.run(1);
    T.assert(s.alert === 0, 'outside cone: no alert, got ' + s.alert);
    T.assert(!s.security.seenThisFrame, 'seenThisFrame false');
  });

  T.add('security: sitting in a camera cone maxes alert -> lost', () => {
    const s = T.load('fx_sec_cam');
    T.teleport(3, 3); T.run(2.5);
    T.assert(s.status === 'playing', 'still alive after 2.5s, alert ' + s.alert);
    T.run(2);
    T.assert(s.status === 'lost' && s.alert === s.alertMax, 'lost after ~4.5s, alert ' + s.alert);
  });

  T.add('security: spotted sfx is edge-triggered', () => {
    const s = T.load('fx_sec_cam');
    const orig = Heist.Game.sfx;
    let n = 0;
    Heist.Game.sfx = (name) => { if (name === 'spotted') n++; };
    try {
      T.teleport(3, 3); T.run(1);
      T.assert(n === 1, 'one spotted while continuously seen, got ' + n);
      T.teleport(7, 3); T.run(1);
      T.teleport(3, 3); T.run(0.2);
      T.assert(n === 2, 'spotted again after leaving and re-entering, got ' + n);
    } finally { Heist.Game.sfx = orig; }
    T.assert(s.status === 'playing', 'still playing');
  });

  T.add('security: camera disabledBy flag stops detection', () => {
    const s = T.load('fx_sec_cam');
    s.flags.add('cams_off');
    T.teleport(3, 3); T.run(2);
    T.assert(s.alert === 0, 'disabled camera: no alert, got ' + s.alert);
    T.assert(!s.security.cameras[0].active, 'camera inactive');
  });

  function minDistToPath(g, closed) {
    const p = g.path;
    let best = Infinity;
    const n = closed ? p.length : p.length - 1;
    for (let i = 0; i < n; i++) {
      const a = p[i], b = p[(i + 1) % p.length];
      best = Math.min(best, Heist.Util.distToSegment(g.x, g.y, a.x, a.y, b.x, b.y));
    }
    return best;
  }
  function nearWaypoint(g) {
    return g.path.findIndex((w) => Heist.Util.dist(w.x, w.y, g.x, g.y) < 2);
  }

  T.add('security: guard loops through waypoints and stays on path', () => {
    const s = T.load('fx_sec_guard');
    s.player.stealth = true;
    const g = s.security.guards[0];
    const seq = [];
    for (let i = 0; i < 60 * 12; i++) {
      T.run(1 / 60);
      T.assert(minDistToPath(g, true) < 0.5, 'on path at step ' + i);
      const w = nearWaypoint(g);
      if (w >= 0 && seq[seq.length - 1] !== w) seq.push(w);
    }
    // Perimeter = 6+3+6+3 = 18 tiles at 3 t/s = 6s per lap -> ~2 laps.
    const str = seq.join('');
    T.assert(str.startsWith('012301230'), 'loop order, got ' + str);
  });

  T.add('security: ping-pong guard reverses, pauses, never closes the loop', () => {
    const s = T.load('fx_sec_guard');
    s.player.stealth = true;
    const g = s.security.guards[1];
    const seq = [];
    let paused = 0;
    for (let i = 0; i < 60 * 12; i++) {
      const x0 = g.x, y0 = g.y;
      T.run(1 / 60);
      if (g.x === x0 && g.y === y0) paused++;
      T.assert(minDistToPath(g, false) < 0.5, 'on open path at step ' + i);
      const w = nearWaypoint(g);
      if (w >= 0 && seq[seq.length - 1] !== w) seq.push(w);
    }
    const str = seq.join('');
    T.assert(str.startsWith('012101210'), 'ping-pong order, got ' + str);
    T.assert(paused > 30, 'pauses at waypoints, paused frames ' + paused);
  });

  T.add('security: guard facing follows movement direction', () => {
    const s = T.load('fx_sec_guard');
    s.player.stealth = true;
    const g = s.security.guards[0];
    T.run(1);  // moving right along the top edge
    T.assert(Math.abs(Heist.Util.wrapAngle(g.facing - 0)) < 0.05, 'facing right, got ' + deg(g.facing));
    T.run(1.5); // past (8,2), heading down
    T.assert(Math.abs(Heist.Util.wrapAngle(g.facing - Math.PI / 2)) < 0.05, 'facing down, got ' + deg(g.facing));
  });

  T.add('security: guard sees player in front, not behind', () => {
    let s = T.load('fx_sec_guard2');
    T.teleport(5, 3); T.run(0.3);
    T.assert(s.alert > 0, 'in front: alert, got ' + s.alert);
    T.assert(s.security.guards[0].seeing, 'guard.seeing');
    s = T.load('fx_sec_guard2');
    T.teleport(1, 3); T.run(1);
    T.assert(s.alert === 0, 'behind: no alert, got ' + s.alert);
  });

  T.add('security: guard sightings are harsher than cameras and can lose', () => {
    const s = T.load('fx_sec_guard2');
    T.assert(Heist.Security.GUARD_ALERT_RATE > Heist.Security.CAMERA_ALERT_RATE, 'guard rate > camera rate');
    T.teleport(6, 3); T.run(3.5);
    T.assert(s.status === 'lost', 'guard stare loses, alert ' + s.alert);
  });

  T.add('security: guard disabledBy flag stops detection', () => {
    const s = T.load('fx_sec_guard2');
    s.flags.add('guards_off');
    T.teleport(5, 3); T.run(1);
    T.assert(s.alert === 0, 'disabled guard: no alert, got ' + s.alert);
  });

  T.add('security: touching a laser instantly loses with alert at max', () => {
    const s = T.load('fx_sec_laser');
    T.teleport(3, 3); T.run(1 / 60);
    T.assert(s.status === 'lost', 'lost');
    T.assert(s.alert === s.alertMax, 'alert maxed');
    T.assert(/laser/i.test(s.loseReason), 'reason mentions laser: ' + s.loseReason);
  });

  T.add('security: laser near-miss does not trip', () => {
    const s = T.load('fx_sec_laser');
    s.player.x = 3.5 * S - 11; s.player.y = 3.5 * S; // radius 10, 11px away
    T.run(0.5);
    T.assert(s.status === 'playing', 'near miss is fine');
  });

  T.add('security: blinking laser off phase does not trip, on phase does', () => {
    const s = T.load('fx_sec_laser');
    T.run(1.1); // time ~1.1: blinking laser (onTime 1 of period 2) is off
    T.assert(!s.security.lasers[1].on, 'laser off');
    T.teleport(8, 3); T.run(0.5);
    T.assert(s.status === 'playing', 'off phase safe');
    T.run(0.6); // time ~2.2: on again
    T.assert(s.status === 'lost' && s.alert === s.alertMax, 'on phase trips');
  });

  T.add('security: laser disabledBy flag', () => {
    const s = T.load('fx_sec_laser');
    s.flags.add('lasers_off');
    T.teleport(3, 3); T.run(0.5);
    T.assert(s.status === 'playing' && !s.security.lasers[0].on, 'disabled laser safe');
  });

  T.add('security: undetectable player (vents / stealth) is ignored', () => {
    let s = T.load('fx_sec_cam');
    s.player.layer = 'vent';
    T.teleport(3, 3);
    Heist.Security.update(s, 1);
    T.assert(s.alert === 0 && !s.security.seenThisFrame, 'camera ignores vent player');
    s = T.load('fx_sec_laser');
    s.player.layer = 'vent';
    T.teleport(3, 3);
    Heist.Security.update(s, 1 / 60);
    T.assert(s.status === 'playing', 'laser ignores vent player');
    s = T.load('fx_sec_guard2');
    s.player.stealth = true;
    T.teleport(5, 3); T.run(1);
    T.assert(s.alert === 0, 'guard ignores stealthed player');
  });
})();
