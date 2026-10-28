// Vent system: climbing in/out (Q / E), temperature sensor, vent-layer rendering.
//
// Movement inside vents is done by Player.update (layer 'vent', ventTiles
// collision, slower speed, 0.8 * radius). This module runs right after it.
//
// state.ventFx = {
//   anim: null | { dir: 'up' | 'down', t, dur, x, y }   // climb transition
//   warned: bool                                         // temp_warning edge
// }
Heist.Vents = (function () {
  const C = Heist.CONFIG;
  const V = () => Heist.VENT_TILES;
  const UP_TIME = 0.25;      // seconds to climb in (input ignored)
  const DOWN_TIME = 0.15;    // seconds to drop down (input ignored; kept short, player is visible)
  const WARN_FRAC = 0.7;     // temp_warning when crossing this fraction of tempMax
  const WARN_RESET = 0.6;    // re-arm the warning once it cools below this
  const OVERLAY_ALPHA = 0.62;

  // ---- helpers ----
  const tileOf = (v) => Math.floor(v / C.TILE);
  const center = (t) => (t + 0.5) * C.TILE;

  function ventChar(level, tx, ty) {
    if (!level.ventTiles || ty < 0 || tx < 0 || ty >= level.h || tx >= level.w) return null;
    return level.ventTiles[ty][tx];
  }
  function isOpening(level, tx, ty) { return ventChar(level, tx, ty) === V().OPENING; }
  function enabled(state) { return !(state.powerups && state.powerups.vents === false); }

  // Main-floor tile under the player is a 'v' with an 'O' above it.
  function usableVentAt(state, tx, ty) {
    const L = state.level;
    return !!L.ventTiles && Heist.Level.tileAt(L, tx, ty) === Heist.TILES.VENT && isOpening(L, tx, ty);
  }

  function init(state) {
    state.ventFx = { anim: null, warned: false };
  }

  function startAnim(state, dir, x, y) {
    state.ventFx.anim = { dir, t: 0, dur: dir === 'up' ? UP_TIME : DOWN_TIME, x, y };
  }

  function update(state, dt) {
    const p = state.player, L = state.level, I = Heist.Input;
    if (!state.ventFx) init(state);
    const fx = state.ventFx;

    // Transition: pin the player in place, ignore input.
    if (fx.anim) {
      fx.anim.t += dt;
      p.x = fx.anim.x; p.y = fx.anim.y;
      if (fx.anim.t >= fx.anim.dur) fx.anim = null;
    } else if (L.ventTiles) {
      const tx = tileOf(p.x), ty = tileOf(p.y);
      if (p.layer === 'main') {
        if (usableVentAt(state, tx, ty)) {
          if (!enabled(state)) {
            state.hint = 'Vent: requires Vent Crawling';
          } else if (I.wasPressed('q')) {
            p.x = center(tx); p.y = center(ty);
            p.layer = 'vent';
            startAnim(state, 'up', p.x, p.y);
            Heist.Game.sfx('vent_up');
          } else {
            state.hint = 'Press Q to climb into the vent';
          }
        }
      } else if (p.layer === 'vent') {
        cornerAssist(state, dt);
        const ctx_ = tileOf(p.x), cty = tileOf(p.y);
        const onOpening = isOpening(L, ctx_, cty);
        const canDrop = onOpening &&
          Heist.Player.canOccupy(state, center(ctx_), center(cty), 'main', p.r);
        if (canDrop && I.wasPressed('e')) {
          p.x = center(ctx_); p.y = center(cty);
          p.layer = 'main';
          startAnim(state, 'down', p.x, p.y);
          Heist.Game.sfx('vent_down');
        } else if (canDrop) {
          state.hint = 'Press E to drop down';
        } else if (onOpening) {
          state.hint = 'Opening blocked below';
        } else if (state.temp >= state.tempMax * WARN_FRAC) {
          state.hint = 'Overheating! Find an opening and drop down (E)';
        }
      }
    }

    updateTemp(state, dt);
  }

  // In 1-wide ducts, nudge the player toward the duct centerline when they
  // push into a side branch they're slightly misaligned with.
  function cornerAssist(state, dt) {
    const p = state.player, L = state.level, I = Heist.Input, S = C.TILE;
    let dx = 0, dy = 0;
    if (I.isDown('w') || I.isDown('ArrowUp')) dy -= 1;
    if (I.isDown('s') || I.isDown('ArrowDown')) dy += 1;
    if (I.isDown('a') || I.isDown('ArrowLeft')) dx -= 1;
    if (I.isDown('d') || I.isDown('ArrowRight')) dx += 1;
    if ((dx !== 0) === (dy !== 0)) return; // need exactly one axis
    const r = p.r * 0.8;
    const step = C.VENT_SPEED * dt;
    // Probe a full step ahead (same as Player.update) to see if we're blocked.
    if (Heist.Player.canOccupy(state, p.x + dx * step, p.y + dy * step, 'vent', r)) return;
    const tx = tileOf(p.x), ty = tileOf(p.y);
    if (!Heist.Level.isVentWalkable(L, tx + dx, ty + dy)) return; // nothing to turn into
    if (dy !== 0) {
      const cx = center(tx), d = cx - p.x;
      const nx = p.x + Math.sign(d) * Math.min(step, Math.abs(d));
      if (Heist.Player.canOccupy(state, nx, p.y, 'vent', r)) p.x = nx;
    } else {
      const cy = center(ty), d = cy - p.y;
      const ny = p.y + Math.sign(d) * Math.min(step, Math.abs(d));
      if (Heist.Player.canOccupy(state, p.x, ny, 'vent', r)) p.y = ny;
    }
  }

  function updateTemp(state, dt) {
    const fx = state.ventFx;
    const inVent = state.player.layer === 'vent';
    const rate = inVent ? C.TEMP_RISE : -C.TEMP_FALL;
    state.temp = Heist.Util.clamp(state.temp + rate * dt, 0, state.tempMax);
    const frac = state.temp / state.tempMax;
    if (!fx.warned && frac >= WARN_FRAC) {
      fx.warned = true;
      Heist.Game.sfx('temp_warning');
    } else if (fx.warned && frac < WARN_RESET) {
      fx.warned = false;
    }
    if (inVent && state.temp >= state.tempMax) {
      Heist.Game.maxAlert('Vent temperature sensor triggered');
    }
  }

  // ---- rendering ----
  // Static duct art is cached per level in an offscreen canvas.
  let cache = null; // { level, canvas }

  function ductCanvas(level) {
    if (cache && cache.level === level) return cache.canvas;
    const S = C.TILE;
    const cv = document.createElement('canvas');
    cv.width = level.w * S; cv.height = level.h * S;
    const g = cv.getContext('2d');
    const walk = (tx, ty) => Heist.Level.isVentWalkable(level, tx, ty);
    for (let ty = 0; ty < level.h; ty++) for (let tx = 0; tx < level.w; tx++) {
      if (!walk(tx, ty)) continue;
      const x = tx * S, y = ty * S;
      const n = walk(tx, ty - 1), s = walk(tx, ty + 1), w = walk(tx - 1, ty), e = walk(tx + 1, ty);
      // Sheet metal base with a soft vertical sheen.
      const grad = g.createLinearGradient(x, y, x + S, y + S);
      grad.addColorStop(0, '#6c7480');
      grad.addColorStop(0.5, '#7d8591');
      grad.addColorStop(1, '#5d646f');
      g.fillStyle = grad;
      g.fillRect(x, y, S, S);
      // Duct walls on closed sides.
      g.fillStyle = '#2c3038';
      if (!n) g.fillRect(x, y, S, 4);
      if (!s) g.fillRect(x, y + S - 4, S, 4);
      if (!w) g.fillRect(x, y, 4, S);
      if (!e) g.fillRect(x + S - 4, y, 4, S);
      g.fillStyle = 'rgba(255,255,255,0.18)';
      if (!n) g.fillRect(x, y + 4, S, 1);
      if (!w) g.fillRect(x + 4, y, 1, S);
      // Seams between sections + rivets along them.
      g.fillStyle = 'rgba(20,22,28,0.55)';
      if (e) g.fillRect(x + S - 1, y + 4, 1, S - 8);
      if (s) g.fillRect(x + 4, y + S - 1, S - 8, 1);
      g.fillStyle = '#3d424b';
      const rivet = (rx, ry) => { g.beginPath(); g.arc(rx, ry, 1.3, 0, Math.PI * 2); g.fill(); };
      if (e) { rivet(x + S - 4, y + 8); rivet(x + S - 4, y + S - 8); }
      if (s) { rivet(x + 8, y + S - 4); rivet(x + S - 8, y + S - 4); }
      // Light diagonal scuffs for texture.
      g.strokeStyle = 'rgba(255,255,255,0.05)';
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(x + 8, y + S - 10); g.lineTo(x + 16, y + S - 18);
      g.stroke();
      if (level.ventTiles[ty][tx] === Heist.VENT_TILES.OPENING) drawGrate(g, x, y, S);
    }
    cache = { level, canvas: cv };
    return cv;
  }

  function drawGrate(g, x, y, S) {
    const m = 5;
    g.fillStyle = '#14161b';
    g.fillRect(x + m, y + m, S - 2 * m, S - 2 * m);
    // Light from the room below.
    const rg = g.createRadialGradient(x + S / 2, y + S / 2, 1, x + S / 2, y + S / 2, S / 2);
    rg.addColorStop(0, 'rgba(255,226,150,0.85)');
    rg.addColorStop(1, 'rgba(255,200,110,0.08)');
    g.fillStyle = rg;
    g.fillRect(x + m, y + m, S - 2 * m, S - 2 * m);
    // Slats.
    g.fillStyle = '#4a505a';
    for (let i = 0; i <= 4; i++) g.fillRect(x + m, y + m + i * ((S - 2 * m - 2) / 4), S - 2 * m, 2);
    g.strokeStyle = '#9aa2ad';
    g.lineWidth = 1;
    g.strokeRect(x + m + 0.5, y + m + 0.5, S - 2 * m - 1, S - 2 * m - 1);
  }

  function drawPlayerCrawling(ctx, state, scale) {
    const p = state.player;
    const r = p.r * 0.8 * scale;
    const t = state.time * 12;
    const wig = p.moving ? Math.sin(t) * 2.5 : 0;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.facing);
    // Shadow.
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath(); ctx.ellipse(1.5, 2, r + 1, r * 0.9, 0, 0, Math.PI * 2); ctx.fill();
    // Limbs (elbows and knees), alternating while moving.
    ctx.fillStyle = '#8c95a3';
    const limb = (lx, ly) => { ctx.beginPath(); ctx.arc(lx, ly, r * 0.32, 0, Math.PI * 2); ctx.fill(); };
    limb(r * 0.45 + wig, -r * 0.85); limb(r * 0.45 - wig, r * 0.85);
    limb(-r * 0.6 - wig, -r * 0.7); limb(-r * 0.6 + wig, r * 0.7);
    // Body, slightly elongated (lying down).
    ctx.fillStyle = '#c9d2dc';
    ctx.beginPath(); ctx.ellipse(0, 0, r * 1.1, r * 0.8, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#3a404a'; ctx.lineWidth = 1.5; ctx.stroke();
    // Head.
    ctx.fillStyle = '#111';
    ctx.beginPath(); ctx.arc(r * 0.55, 0, r * 0.35, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    // Headlamp glow ahead of the player.
    const lx = p.x + Math.cos(p.facing) * 22, ly = p.y + Math.sin(p.facing) * 22;
    const lg = ctx.createRadialGradient(lx, ly, 2, lx, ly, 26);
    lg.addColorStop(0, `rgba(255,250,220,${0.18 * scale})`);
    lg.addColorStop(1, 'rgba(255,250,220,0)');
    ctx.fillStyle = lg;
    ctx.fillRect(lx - 26, ly - 26, 52, 52);
  }

  // Heat vignette in world coords covering the current view.
  function drawHeat(ctx, state, amount) {
    const frac = state.temp / state.tempMax;
    if (frac <= 0.02 || amount <= 0) return;
    const pulse = frac >= WARN_FRAC ? 0.75 + 0.25 * Math.sin(state.time * 10) : 1;
    const a = Math.min(0.75, Math.pow(frac, 1.4) * 0.7) * pulse * amount;
    const pad = 20;
    const x0 = state.cam.x - pad, y0 = state.cam.y - pad;
    const w = C.VIEW_W + pad * 2, h = C.VIEW_H + pad * 2;
    const cx = x0 + w / 2, cy = y0 + h / 2;
    const inner = Math.min(w, h) * (0.55 - 0.3 * frac);
    const g = ctx.createRadialGradient(cx, cy, Math.max(10, inner), cx, cy, Math.hypot(w, h) / 2);
    g.addColorStop(0, 'rgba(255,90,20,0)');
    g.addColorStop(1, `rgba(255,70,10,${a})`);
    ctx.fillStyle = g;
    ctx.fillRect(x0, y0, w, h);
    // Overall warm cast.
    ctx.fillStyle = `rgba(255,120,40,${0.08 * frac * amount})`;
    ctx.fillRect(x0, y0, w, h);
  }

  // Faint pulse on usable vents near the player while on the main floor.
  function drawMainHints(ctx, state) {
    const L = state.level, p = state.player, S = C.TILE;
    if (!enabled(state)) return;
    const pulse = 0.5 + 0.5 * Math.sin(state.time * 4);
    for (const o of L.ventOpenings) {
      if (!isOpening(L, o.tx, o.ty)) continue;
      const d = Heist.Util.dist(p.x, p.y, center(o.tx), center(o.ty));
      if (d > S * 2.5) continue;
      if (Heist.Level.isRegionHidden(L, L.regionOf[o.ty][o.tx], Heist.Level.regionAt(L, p.x, p.y))) continue;
      const a = (1 - d / (S * 2.5)) * (0.25 + 0.35 * pulse);
      ctx.strokeStyle = `rgba(140,220,255,${a})`;
      ctx.lineWidth = 2;
      ctx.strokeRect(o.tx * S + 3, o.ty * S + 3, S - 6, S - 6);
    }
  }

  function drawVentLayer(ctx, state, k) {
    const L = state.level, S = C.TILE;
    if (k <= 0) return;
    ctx.save();
    ctx.globalAlpha = k;
    ctx.fillStyle = `rgba(4,6,12,${OVERLAY_ALPHA})`;
    ctx.fillRect(0, 0, L.w * S, L.h * S);
    ctx.drawImage(ductCanvas(L), 0, 0);
    // Flicker on openings so they read as "light from below".
    const fl = 0.08 + 0.06 * Math.sin(state.time * 3);
    ctx.fillStyle = `rgba(255,220,140,${fl})`;
    for (const o of L.ventOpenings) {
      if (!isOpening(L, o.tx, o.ty)) continue;
      ctx.fillRect(o.tx * S + 5, o.ty * S + 5, S - 10, S - 10);
    }
    ctx.restore();
  }

  function draw(ctx, state) {
    const L = state.level, p = state.player;
    if (!L.ventTiles) return;
    const fx = state.ventFx || { anim: null };
    const anim = fx.anim;
    const prog = anim ? Math.min(1, anim.t / anim.dur) : 1;

    if (p.layer === 'vent') {
      const k = anim && anim.dir === 'up' ? prog : 1;
      drawVentLayer(ctx, state, k);
      if (anim && anim.dir === 'up') {
        // Rising out of the floor: start full size, settle into crawl size.
        ctx.save();
        ctx.globalAlpha = 0.4 + 0.6 * prog;
        drawPlayerCrawling(ctx, state, 1.25 - 0.25 * prog);
        ctx.restore();
      } else {
        drawPlayerCrawling(ctx, state, 1);
      }
      drawHeat(ctx, state, k);
    } else {
      if (anim && anim.dir === 'down') {
        drawVentLayer(ctx, state, 1 - prog);
        // Landing dust ring.
        ctx.strokeStyle = `rgba(200,210,220,${0.6 * (1 - prog)})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(anim.x, anim.y, p.r + 4 + prog * 14, 0, Math.PI * 2);
        ctx.stroke();
        drawHeat(ctx, state, 1 - prog);
      } else {
        drawMainHints(ctx, state);
      }
    }
  }

  return { init, update, draw, usableVentAt };
})();
