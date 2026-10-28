// Security system: swiveling cameras, patrolling guards, laser tripwires.
//
// API (called by game.js / render.js):
//   init(state)        build runtime entities from state.level on level load
//   update(state, dt)  move/rotate entities, detect the player, raise alert
//   draw(ctx, state)   draw cones, lasers, guards, cameras (world coords)
//
// Runtime state exposed on state.security:
//   cameras: [{ def, x, y, facing, t, active, seeing, seenT }]
//   guards:  [{ def, x, y, facing, path:[{x,y}], target, dir, wait, active, seeing, seenT }]
//   lasers:  [{ def, x1, y1, x2, y2, on, active }]
//   seenThisFrame: bool, true while any camera/guard currently sees the player
//
// Positions are pixels, facings are radians.
Heist.Security = (function () {
  const C = Heist.CONFIG;
  const U = Heist.Util;

  // ---- Tunables ----
  // Alert per second while the player is in view (alertMax default 100).
  // Camera: ~3.6 s of continuous exposure loses; a 0.5 s brush costs ~14.
  // Guard: ~2.6 s loses; guards are mobile and close, so they hit harder.
  const CAMERA_ALERT_RATE = 28;
  const GUARD_ALERT_RATE = 38;
  const GUARD_TURN_RATE = 7;        // rad/s, how fast a guard's facing turns
  const GUARD_DEFAULT_SPEED = 2;    // tiles/s
  const CAMERA_DEFAULT_SPEED = 30;  // deg/s
  const RAYS_PER_DEGREE = 0.6;      // cone resolution (clamped below)
  const MIN_RAYS = 12, MAX_RAYS = 48;
  const SPOTTED_SFX_COOLDOWN = 0.6; // s; avoid spamming 'spotted' on flicker
  const SEEN_FLASH_TIME = 0.5;      // s the '!' lingers after losing sight
  const BODY_SAMPLE = 0.75;         // sample points at this fraction of radius

  // ---- Init ----
  function tileCenter(tx, ty) { return { x: (tx + 0.5) * C.TILE, y: (ty + 0.5) * C.TILE }; }

  function init(state) {
    const L = state.level;
    const cameras = (L.cameras || []).map((d) => {
      const p = tileCenter(d.x, d.y);
      return {
        def: d, x: p.x, y: p.y,
        base: U.deg(d.angle || 0),
        facing: U.deg(d.angle || 0),
        t: 0, active: true, seeing: false, seenT: 0,
      };
    });
    const guards = (L.guards || []).map((d) => {
      const path = (d.path || [[0, 0]]).map(([tx, ty]) => tileCenter(tx, ty));
      const g = {
        def: d, path, x: path[0].x, y: path[0].y,
        target: path.length > 1 ? 1 : 0, dir: 1,
        wait: 0, facing: U.deg(d.angle || 0),
        active: true, seeing: false, seenT: 0, step: 0,
      };
      if (path.length > 1) g.facing = Math.atan2(path[1].y - path[0].y, path[1].x - path[0].x);
      return g;
    });
    const lasers = (L.lasers || []).map((d) => {
      const a = tileCenter(d.x1, d.y1), b = tileCenter(d.x2, d.y2);
      return { def: d, x1: a.x, y1: a.y, x2: b.x, y2: b.y, on: true, active: true };
    });
    state.security = { cameras, guards, lasers, seenThisFrame: false, wasSeen: false, sfxCooldown: 0 };
  }

  // ---- Update ----
  function cameraFacing(cam) {
    const d = cam.def;
    const sweep = U.deg(d.sweep || 0);
    const speed = U.deg(d.speed || CAMERA_DEFAULT_SPEED);
    if (sweep <= 0 || speed <= 0) return cam.base;
    // Sinusoidal ping-pong: same half-period as a linear sweep at `speed`,
    // eases into the ends, never exceeds +-sweep/2.
    const halfPeriod = sweep / speed;
    return cam.base + (sweep / 2) * Math.sin((Math.PI * cam.t) / halfPeriod);
  }

  // Can a viewer at (ox,oy) facing `facing` see the player?
  function seesPlayer(state, ox, oy, facing, fovDeg, rangeTiles) {
    const p = state.player, L = state.level;
    const fov = U.deg(fovDeg), range = rangeTiles * C.TILE;
    if (U.dist(ox, oy, p.x, p.y) > range + p.r) return false;
    if (U.inCone(L, ox, oy, facing, fov, range, p.x, p.y)) return true;
    // Sample the player's body edges perpendicular to the line of sight.
    const a = Math.atan2(p.y - oy, p.x - ox) + Math.PI / 2;
    const r = p.r * BODY_SAMPLE;
    for (const s of [-1, 1]) {
      const px = p.x + Math.cos(a) * r * s, py = p.y + Math.sin(a) * r * s;
      if (U.inCone(L, ox, oy, facing, fov, range, px, py)) return true;
    }
    return false;
  }

  function updateGuard(g, dt) {
    const d = g.def, path = g.path;
    if (path.length < 2) return;
    if (g.wait > 0) { g.wait = Math.max(0, g.wait - dt); return; }
    let move = (d.speed || GUARD_DEFAULT_SPEED) * C.TILE * dt;
    // Advance along the path, possibly crossing several waypoints this frame.
    for (let guardIter = 0; move > 0 && guardIter < 8; guardIter++) {
      const tgt = path[g.target];
      const dx = tgt.x - g.x, dy = tgt.y - g.y;
      const len = Math.hypot(dx, dy);
      if (len > 1e-6) g.heading = Math.atan2(dy, dx);
      if (len > move) { g.x += (dx / len) * move; g.y += (dy / len) * move; break; }
      g.x = tgt.x; g.y = tgt.y; move -= len;
      advanceTarget(g);
      if (d.pause > 0) { g.wait = d.pause; break; }
    }
  }

  function advanceTarget(g) {
    const n = g.path.length;
    if (g.def.loop !== false) { g.target = (g.target + 1) % n; return; }
    if (g.target + g.dir >= n || g.target + g.dir < 0) g.dir = -g.dir;
    g.target += g.dir;
  }

  function turnToward(cur, want, maxStep) {
    const diff = U.wrapAngle(want - cur);
    if (Math.abs(diff) <= maxStep) return want;
    return cur + Math.sign(diff) * maxStep;
  }

  function update(state, dt) {
    const sec = state.security;
    if (!sec) return;
    const detectable = Heist.Player.isDetectable(state);
    const check = (req) => !!req && Heist.Tasks.check(state, req);
    let seen = false;

    for (const cam of sec.cameras) {
      cam.active = !check(cam.def.disabledBy);
      cam.seenT = Math.max(0, cam.seenT - dt);
      cam.seeing = false;
      if (!cam.active) continue;
      cam.t += dt;
      cam.facing = cameraFacing(cam);
      if (detectable && seesPlayer(state, cam.x, cam.y, cam.facing, cam.def.fov || 50, cam.def.range || 6)) {
        cam.seeing = true; cam.seenT = SEEN_FLASH_TIME; seen = true;
        Heist.Game.addAlert(CAMERA_ALERT_RATE * dt);
      }
    }

    for (const g of sec.guards) {
      g.active = !check(g.def.disabledBy);
      g.seenT = Math.max(0, g.seenT - dt);
      g.seeing = false;
      if (!g.active) continue;
      updateGuard(g, dt);
      if (g.wait <= 0 && g.path.length > 1) g.step += dt;
      if (g.heading !== undefined) g.facing = turnToward(g.facing, g.heading, GUARD_TURN_RATE * dt);
      if (detectable && seesPlayer(state, g.x, g.y, g.facing, g.def.fov || 70, g.def.range || 5)) {
        g.seeing = true; g.seenT = SEEN_FLASH_TIME; seen = true;
        Heist.Game.addAlert(GUARD_ALERT_RATE * dt);
      }
    }

    const p = state.player;
    for (const l of sec.lasers) {
      l.active = !check(l.def.disabledBy);
      l.on = l.active && laserPhaseOn(l.def, state.time);
      if (!l.on || !detectable || state.status !== 'playing') continue;
      if (U.distToSegment(p.x, p.y, l.x1, l.y1, l.x2, l.y2) < p.r) {
        Heist.Game.maxAlert('Tripped a laser');
      }
    }

    sec.sfxCooldown = Math.max(0, sec.sfxCooldown - dt);
    if (seen && !sec.wasSeen && sec.sfxCooldown <= 0) {
      Heist.Game.sfx('spotted');
      sec.sfxCooldown = SPOTTED_SFX_COOLDOWN;
    }
    sec.wasSeen = seen;
    sec.seenThisFrame = seen;
  }

  function laserPhaseOn(d, time) {
    if (!(d.period > 0)) return true;
    const ph = (((time + (d.offset || 0)) % d.period) + d.period) % d.period;
    return ph < (d.onTime || 0);
  }

  // ---- Draw ----
  function conePolygon(L, ox, oy, facing, fovDeg, rangeTiles) {
    const fov = U.deg(fovDeg), range = rangeTiles * C.TILE;
    const n = Math.max(MIN_RAYS, Math.min(MAX_RAYS, Math.round(fovDeg * RAYS_PER_DEGREE)));
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const a = facing - fov / 2 + (fov * i) / n;
      const d = U.castRay(L, ox, oy, a, range);
      pts.push([ox + Math.cos(a) * d, oy + Math.sin(a) * d]);
    }
    return { pts, range };
  }

  function drawCone(ctx, L, ox, oy, facing, fovDeg, rangeTiles, seeing, t) {
    const { pts, range } = conePolygon(L, ox, oy, facing, fovDeg, rangeTiles);
    const pulse = seeing ? 0.5 + 0.5 * Math.sin(t * 20) : 0;
    const a0 = seeing ? 0.45 + 0.15 * pulse : 0.28;
    const a1 = seeing ? 0.18 : 0.06;
    const g = ctx.createRadialGradient(ox, oy, 4, ox, oy, range);
    g.addColorStop(0, `rgba(255,${seeing ? 70 : 40},${seeing ? 40 : 50},${a0})`);
    g.addColorStop(1, `rgba(255,30,40,${a1})`);
    ctx.beginPath();
    ctx.moveTo(ox, oy);
    for (const [x, y] of pts) ctx.lineTo(x, y);
    ctx.closePath();
    ctx.fillStyle = g;
    ctx.fill();
    // Edge outline.
    ctx.strokeStyle = seeing ? 'rgba(255,120,100,0.8)' : 'rgba(255,60,60,0.35)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  function drawAlertMark(ctx, x, y, seenT, t) {
    if (seenT <= 0) return;
    ctx.save();
    ctx.globalAlpha = Math.min(1, seenT / SEEN_FLASH_TIME + 0.2);
    const bob = Math.sin(t * 12) * 1.5;
    ctx.fillStyle = '#ffdf3b';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 3;
    ctx.font = 'bold 18px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.strokeText('!', x, y - 22 + bob);
    ctx.fillText('!', x, y - 22 + bob);
    ctx.restore();
  }

  function drawCamera(ctx, cam, t) {
    ctx.save();
    ctx.translate(cam.x, cam.y);
    // Wall mount (behind the sweep center).
    ctx.strokeStyle = '#555c6b';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-Math.cos(cam.base) * 14, -Math.sin(cam.base) * 14);
    ctx.stroke();
    ctx.rotate(cam.facing);
    ctx.fillStyle = cam.active ? '#c9ced8' : '#4a4f5a';
    ctx.strokeStyle = '#1b1e25';
    ctx.lineWidth = 1.5;
    ctx.fillRect(-7, -5, 14, 10);
    ctx.strokeRect(-7, -5, 14, 10);
    ctx.fillStyle = cam.active ? '#2a2d35' : '#33363d';
    ctx.fillRect(7, -3.5, 4, 7); // lens hood
    ctx.restore();
    // Status LED.
    const on = cam.active && (cam.seeing || Math.sin(t * 6) > -0.3);
    ctx.fillStyle = cam.active ? (on ? '#ff3030' : '#661515') : '#2a2a2a';
    ctx.beginPath();
    ctx.arc(cam.x, cam.y, 2, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawGuard(ctx, g) {
    const bob = g.active ? Math.sin(g.step * 10) * 1.2 : 0;
    ctx.save();
    ctx.translate(g.x, g.y);
    ctx.rotate(g.facing);
    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath(); ctx.ellipse(1, 2, 12, 11, 0, 0, Math.PI * 2); ctx.fill();
    // Shoulders
    ctx.fillStyle = g.active ? '#2f4a8a' : '#2a3247';
    ctx.beginPath(); ctx.ellipse(0, 0, 8, 12, 0, 0, Math.PI * 2); ctx.fill();
    // Flashlight arm
    ctx.fillStyle = '#1b1e25';
    ctx.fillRect(4, 5 + bob * 0.5, 9, 3);
    if (g.active) {
      ctx.fillStyle = '#fff3b0';
      ctx.beginPath(); ctx.arc(13, 6.5 + bob * 0.5, 2, 0, Math.PI * 2); ctx.fill();
    }
    // Head + cap brim
    ctx.fillStyle = '#d9b38c';
    ctx.beginPath(); ctx.arc(0, 0, 5.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = g.active ? '#1d2f5c' : '#23293a';
    ctx.beginPath(); ctx.arc(0, 0, 5.5, Math.PI * 0.6, Math.PI * 1.4, true); ctx.fill();
    ctx.fillRect(3, -3, 3, 6);
    ctx.restore();
    if (!g.active) {
      ctx.fillStyle = 'rgba(200,210,255,0.7)';
      ctx.font = 'bold 10px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('z', g.x + 9, g.y - 12);
      ctx.textAlign = 'left';
    }
  }

  function drawLaser(ctx, l, t) {
    const node = (x, y) => {
      ctx.fillStyle = '#2b2f38';
      ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = l.on ? '#ff2a2a' : l.active ? '#5a1a1a' : '#333';
      ctx.beginPath(); ctx.arc(x, y, 2.5, 0, Math.PI * 2); ctx.fill();
    };
    ctx.save();
    if (l.on) {
      const flicker = 0.85 + 0.15 * Math.sin(t * 37 + l.x1) * Math.sin(t * 23 + l.y2);
      ctx.lineCap = 'round';
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = `rgba(255,0,0,${0.18 * flicker})`;
      ctx.lineWidth = 12;
      line(ctx, l);
      ctx.strokeStyle = `rgba(255,30,30,${0.45 * flicker})`;
      ctx.lineWidth = 5;
      line(ctx, l);
      ctx.strokeStyle = `rgba(255,200,200,${0.95 * flicker})`;
      ctx.lineWidth = 1.5;
      line(ctx, l);
      ctx.globalCompositeOperation = 'source-over';
    } else if (l.active) {
      // Blinking laser in its off phase: faint dotted guide.
      ctx.strokeStyle = 'rgba(255,60,60,0.25)';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 5]);
      line(ctx, l);
      ctx.setLineDash([]);
    }
    ctx.restore();
    node(l.x1, l.y1);
    node(l.x2, l.y2);
  }

  function line(ctx, l) {
    ctx.beginPath(); ctx.moveTo(l.x1, l.y1); ctx.lineTo(l.x2, l.y2); ctx.stroke();
  }

  function draw(ctx, state) {
    const sec = state.security;
    if (!sec) return;
    const L = state.level, t = state.time;
    // Cones first so bodies draw on top of them.
    for (const cam of sec.cameras) {
      if (cam.active) drawCone(ctx, L, cam.x, cam.y, cam.facing, cam.def.fov || 50, cam.def.range || 6, cam.seeing, t);
    }
    for (const g of sec.guards) {
      if (g.active) drawCone(ctx, L, g.x, g.y, g.facing, g.def.fov || 70, g.def.range || 5, g.seeing, t);
    }
    for (const l of sec.lasers) drawLaser(ctx, l, t);
    for (const g of sec.guards) drawGuard(ctx, g);
    for (const cam of sec.cameras) drawCamera(ctx, cam, t);
    for (const cam of sec.cameras) drawAlertMark(ctx, cam.x, cam.y, cam.seenT, t);
    for (const g of sec.guards) drawAlertMark(ctx, g.x, g.y, g.seenT, t);
  }

  return {
    init, update, draw,
    CAMERA_ALERT_RATE, GUARD_ALERT_RATE,
    _laserPhaseOn: laserPhaseOn,
  };
})();
