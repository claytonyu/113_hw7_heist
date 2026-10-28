// Rendering: world, entities, fog of locked rooms, player, HUD, overlays.
//
// Draw order (inside camera transform):
//   static layer (floor/walls/vent grates/decor, pre-rendered in init)
//   -> door slabs -> darkness/light layer (night mood, punched by lights)
//   -> live glows (door lights, server LEDs, lamps) -> start/exit pad,
//      items, computers, treasure
//   -> Security.draw (cones, lasers, guards, cameras)
//   -> dust + player (if on main floor) -> fog over hidden rooms
//   -> Vents.draw (vent layer overlay + player in vents)
// Then screen-space: vignette, alert/flash tint, HUD, toasts, hint,
// title card, win/lose overlay.
//
// Visual language: red = security/danger, green = exit/hacked/success,
// blue = idle computer, purple = system-locked (flag) door, keycard colors
// on key doors, cyan = treasure, orange = vent heat / warnings.
Heist.Render = (function () {
  const C = Heist.CONFIG;
  const T = Heist.TILES;
  const S = C.TILE;
  const TAU = Math.PI * 2;
  const KEY_COLORS = { red: '#ff4d4d', blue: '#4da6ff', green: '#4dff88', yellow: '#ffd84d' };
  const COL = {
    exit: '#3ddc84', hacked: '#3ddc84', computer: '#4da6ff', locked: '#ff5a5a',
    flagDoor: '#b07cff', treasure: '#7ff3ff', warn: '#ff9f1c', danger: '#ff3b3b',
    text: '#e3e9f4', dim: '#8b95a7', panel: 'rgba(9,11,17,0.78)', edge: 'rgba(160,175,205,0.16)',
  };
  const FONT = '"Avenir Next", "Segoe UI", "Helvetica Neue", Arial, sans-serif';
  const MONO = 'ui-monospace, Menlo, Consolas, monospace';

  let canvas, ctx;
  let staticCv = null, fogCv = null, fogCtx = null, fogSig = '';
  let lightCv = null, lightCtx = null, vignetteCv = null, redCv = null, hatchCv = null;
  let doorInfo = new Map();     // door -> { orient: 'h'|'v', open: 0..1 }
  let lamps = [], leds = [], regionCenters = [];
  let particles = [], lastTime = 0, dustT = 0;
  let prevAlert = 0, alertPulse = 0;
  let endFrames = 0;

  // ---------- helpers ----------
  function hash(a, b, c) {
    let n = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) + Math.imul(c | 0, 1274126177)) | 0;
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    n ^= n >>> 16;
    return (n >>> 0) / 4294967296;
  }
  function mk(w, h) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, w); c.height = Math.max(1, h);
    return c;
  }
  function rr(g, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }
  function fillRR(g, x, y, w, h, r, fill, stroke, lw) {
    rr(g, x, y, w, h, r);
    if (fill) { g.fillStyle = fill; g.fill(); }
    if (stroke) { g.strokeStyle = stroke; g.lineWidth = lw || 1; g.stroke(); }
  }
  function circle(g, x, y, r, fill, stroke, lw) {
    g.beginPath(); g.arc(x, y, Math.max(0.1, r), 0, TAU);
    if (fill) { g.fillStyle = fill; g.fill(); }
    if (stroke) { g.strokeStyle = stroke; g.lineWidth = lw || 1; g.stroke(); }
  }
  function glow(g, x, y, r, color, alpha) {
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, rgba(color, alpha));
    gr.addColorStop(1, rgba(color, 0));
    g.fillStyle = gr;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  const rgbCache = {};
  function rgba(hex, a) {
    let c = rgbCache[hex];
    if (!c) {
      const h = hex.replace('#', '');
      const f = h.length === 3 ? h.split('').map((x) => x + x).join('') : h;
      c = rgbCache[hex] = [parseInt(f.slice(0, 2), 16), parseInt(f.slice(2, 4), 16), parseInt(f.slice(4, 6), 16)];
    }
    return `rgba(${c[0]},${c[1]},${c[2]},${Math.max(0, Math.min(1, a))})`;
  }
  const clamp01 = (v) => Math.max(0, Math.min(1, v));
  function tileAt(L, tx, ty) {
    if (tx < 0 || ty < 0 || tx >= L.w || ty >= L.h) return T.VOID;
    return L.tiles[ty][tx];
  }
  function regionOf(L, tx, ty) {
    const r = L.regionOf && L.regionOf[ty];
    return r ? (r[tx] ?? -1) : -1;
  }
  function reqColor(req) {
    if (!req) return COL.exit;
    const [kind, val] = String(req).split(':');
    if (kind === 'key') return KEY_COLORS[val] || '#cccccc';
    return COL.flagDoor;
  }

  // ---------- setup / init ----------
  function setup(c) {
    canvas = c;
    ctx = c.getContext('2d');
    lightCv = mk(C.VIEW_W, C.VIEW_H);
    lightCtx = lightCv.getContext('2d');
    vignetteCv = buildVignette('#000000', 0.62, 0.45);
    redCv = buildVignette('#ff1e1e', 0.9, 0.35);
    hatchCv = mk(12, 12);
    const h = hatchCv.getContext('2d');
    h.strokeStyle = 'rgba(120,135,170,0.07)';
    h.lineWidth = 1;
    h.beginPath(); h.moveTo(0, 12); h.lineTo(12, 0); h.moveTo(-6, 6); h.lineTo(6, -6); h.moveTo(6, 18); h.lineTo(18, 6); h.stroke();
  }
  function buildVignette(color, alpha, inner) {
    const v = mk(C.VIEW_W, C.VIEW_H), g = v.getContext('2d');
    const cx = C.VIEW_W / 2, cy = C.VIEW_H / 2, R = Math.hypot(cx, cy);
    const gr = g.createRadialGradient(cx, cy, R * inner, cx, cy, R);
    gr.addColorStop(0, rgba(color, 0));
    gr.addColorStop(1, rgba(color, alpha));
    g.fillStyle = gr;
    g.fillRect(0, 0, C.VIEW_W, C.VIEW_H);
    return v;
  }

  function init(state) {
    if (!ctx && !lightCv) setup(document.createElement('canvas'));
    const L = state.level;
    doorInfo = new Map();
    lamps = []; leds = []; particles = [];
    lastTime = 0; dustT = 0; prevAlert = 0; alertPulse = 0; endFrames = 0;
    fogSig = '';
    for (const d of L.doors || []) {
      const wl = tileAt(L, d.tx - 1, d.ty) === T.WALL, wr = tileAt(L, d.tx + 1, d.ty) === T.WALL;
      const wu = tileAt(L, d.tx, d.ty - 1) === T.WALL, wd = tileAt(L, d.tx, d.ty + 1) === T.WALL;
      const orient = (wl || wr) && !(wu && wd && !(wl && wr)) ? 'h' : 'v';
      doorInfo.set(d, { orient, open: d.locked ? 0 : 1 });
    }
    // Region centroids for the fog "locked" badge.
    regionCenters = [];
    const acc = Array.from({ length: L.regionCount || 0 }, () => [0, 0, 0]);
    for (let ty = 0; ty < L.h; ty++) for (let tx = 0; tx < L.w; tx++) {
      const r = regionOf(L, tx, ty);
      if (r >= 0 && acc[r]) { acc[r][0] += tx; acc[r][1] += ty; acc[r][2]++; }
    }
    regionCenters = acc.map(([x, y, n]) => (n ? { x: (x / n + 0.5) * S, y: (y / n + 0.5) * S, n } : null));
    staticCv = mk(L.w * S, L.h * S);
    fogCv = mk(L.w * S, L.h * S);
    fogCtx = fogCv.getContext('2d');
    try { buildStatic(L, staticCv.getContext('2d')); }
    catch (e) { if (window.console) console.warn('Render.buildStatic failed', e); }
  }

  // ---------- static layer ----------
  const FLOOR_STYLES = ['carpet', 'tile', 'wood', 'carpet2', 'marble', 'tile'];
  function regionStyles(L) {
    const st = [];
    const startR = L.start ? regionOf(L, L.start.tx, L.start.ty) : -1;
    for (let r = 0; r < (L.regionCount || 0); r++) {
      st[r] = r === startR ? 'lobby' : FLOOR_STYLES[Math.floor(hash(r, 7, 3) * FLOOR_STYLES.length)];
    }
    return st;
  }

  function buildStatic(L, g) {
    const styles = regionStyles(L);
    // Outside: dark asphalt with faint speckle.
    g.fillStyle = '#06080c';
    g.fillRect(0, 0, L.w * S, L.h * S);
    for (let ty = 0; ty < L.h; ty++) for (let tx = 0; tx < L.w; tx++) {
      const c = L.tiles[ty][tx];
      const x = tx * S, y = ty * S;
      if (c === T.VOID) {
        if (hash(tx, ty, 9) < 0.3) { g.fillStyle = 'rgba(120,140,170,0.035)'; g.fillRect(x + hash(tx, ty, 10) * S, y + hash(tx, ty, 11) * S, 2, 2); }
        continue;
      }
      if (c === T.WALL) continue; // walls after floors (they overhang shadows)
      if (c === T.DOOR) { drawThreshold(g, x, y); continue; }
      const r = regionOf(L, tx, ty);
      drawFloor(g, x, y, tx, ty, styles[r] || 'tile');
    }
    // Ambient occlusion on floors next to walls.
    for (let ty = 0; ty < L.h; ty++) for (let tx = 0; tx < L.w; tx++) {
      const c = L.tiles[ty][tx];
      if (c === T.WALL || c === T.VOID) continue;
      const x = tx * S, y = ty * S;
      if (tileAt(L, tx, ty - 1) === T.WALL) {
        const gr = g.createLinearGradient(0, y, 0, y + 12);
        gr.addColorStop(0, 'rgba(0,0,0,0.45)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = gr; g.fillRect(x, y, S, 12);
      }
      if (tileAt(L, tx - 1, ty) === T.WALL) {
        const gr = g.createLinearGradient(x, 0, x + 7, 0);
        gr.addColorStop(0, 'rgba(0,0,0,0.3)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = gr; g.fillRect(x, y, 7, S);
      }
      if (tileAt(L, tx + 1, ty) === T.WALL) {
        const gr = g.createLinearGradient(x + S, 0, x + S - 5, 0);
        gr.addColorStop(0, 'rgba(0,0,0,0.25)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = gr; g.fillRect(x + S - 5, y, 5, S);
      }
    }
    // Walls.
    for (let ty = 0; ty < L.h; ty++) for (let tx = 0; tx < L.w; tx++) {
      if (L.tiles[ty][tx] === T.WALL) drawWall(g, L, tx, ty);
    }
    // Vent grates and the treasure plinth glow.
    for (let ty = 0; ty < L.h; ty++) for (let tx = 0; tx < L.w; tx++) {
      if (L.tiles[ty][tx] === T.VENT) drawVentGrate(g, tx * S, ty * S);
    }
    // Decor: rugs first, then the rest.
    const decor = (L.decor || []).slice().sort((a, b) => (a.type === 'rug' ? 0 : 1) - (b.type === 'rug' ? 0 : 1));
    for (const d of decor) {
      try { drawDecorItem(g, d); } catch (e) { /* never let one bad decor entry break rendering */ }
    }
  }

  function drawFloor(g, x, y, tx, ty, style) {
    const n = hash(tx, ty, 1);
    if (style === 'lobby' || style === 'marble') {
      const lobby = style === 'lobby';
      const big = ((tx >> 1) + (ty >> 1)) & 1;
      g.fillStyle = lobby ? (big ? '#2e3546' : '#283040') : (big ? '#2a2d36' : '#25282f');
      g.fillRect(x, y, S, S);
      g.fillStyle = lobby ? '#1b202b' : '#1c1e24';
      if (!(tx & 1)) g.fillRect(x, y, 1, S);
      if (!(ty & 1)) g.fillRect(x, y, S, 1);
      if (n < 0.3) {
        g.strokeStyle = 'rgba(210,220,245,0.05)'; g.lineWidth = 1;
        g.beginPath();
        g.moveTo(x + hash(tx, ty, 2) * S, y);
        g.quadraticCurveTo(x + hash(tx, ty, 3) * S, y + S / 2, x + hash(tx, ty, 4) * S, y + S);
        g.stroke();
      }
    } else if (style === 'tile') {
      g.fillStyle = (tx + ty) & 1 ? '#242a33' : '#20252d';
      g.fillRect(x, y, S, S);
      g.fillStyle = '#171b22';
      g.fillRect(x, y, S, 1); g.fillRect(x, y, 1, S);
      g.fillStyle = 'rgba(255,255,255,0.025)';
      g.fillRect(x + 1, y + 1, S - 1, 1);
    } else if (style === 'wood') {
      g.fillStyle = '#2a2019';
      g.fillRect(x, y, S, S);
      for (let r = 0; r < 4; r++) {
        const k = 0.85 + hash(tx, ty * 4 + r, 5) * 0.3;
        g.fillStyle = `rgb(${(58 * k) | 0},${(44 * k) | 0},${(34 * k) | 0})`;
        g.fillRect(x, y + r * 8, S, 7);
        const seam = Math.floor(hash(tx * 3 + r, ty, 6) * S);
        g.fillStyle = '#231a14';
        g.fillRect(x + seam, y + r * 8, 1, 7);
        g.fillStyle = 'rgba(255,230,200,0.03)';
        g.fillRect(x, y + r * 8, S, 1);
      }
    } else if (style === 'carpet') {
      g.fillStyle = '#331d26';
      g.fillRect(x, y, S, S);
      if ((tx + ty) & 1) {
        g.fillStyle = '#3d2330';
        g.beginPath(); g.moveTo(x + S / 2, y + 6); g.lineTo(x + S - 6, y + S / 2); g.lineTo(x + S / 2, y + S - 6); g.lineTo(x + 6, y + S / 2); g.closePath(); g.fill();
      }
    } else { // carpet2: teal office carpet with dots
      g.fillStyle = '#1a2b30';
      g.fillRect(x, y, S, S);
      g.fillStyle = '#21363c';
      g.fillRect(x, y, 2, 2); g.fillRect(x + S / 2, y + S / 2, 2, 2);
    }
    // Speckle noise.
    for (let i = 0; i < 3; i++) {
      g.fillStyle = hash(tx, ty, 20 + i) < 0.5 ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.12)';
      g.fillRect(x + ((hash(tx, ty, 30 + i) * S) | 0), y + ((hash(tx, ty, 40 + i) * S) | 0), 1, 1);
    }
  }

  function drawThreshold(g, x, y) {
    g.fillStyle = '#1b1f27';
    g.fillRect(x, y, S, S);
    g.fillStyle = '#262b35';
    for (let i = 2; i < S; i += 5) g.fillRect(x + 2, y + i, S - 4, 2);
  }

  function drawWall(g, L, tx, ty) {
    const x = tx * S, y = ty * S;
    const isW = (dx, dy) => tileAt(L, tx + dx, ty + dy) === T.WALL;
    const isV = (dx, dy) => tileAt(L, tx + dx, ty + dy) === T.VOID;
    g.fillStyle = '#343c50';
    g.fillRect(x, y, S, S);
    // Subtle top texture.
    g.fillStyle = 'rgba(255,255,255,0.03)';
    if (hash(tx, ty, 50) < 0.5) g.fillRect(x + 4, y + 10, S - 8, 1);
    g.fillStyle = 'rgba(0,0,0,0.1)';
    g.fillRect(x, y + S / 2, S, 1);
    // Rims on sides that face open space.
    if (!isW(0, -1)) { g.fillStyle = isV(0, -1) ? '#252b39' : '#55607d'; g.fillRect(x, y, S, 2); }
    if (!isW(-1, 0)) { g.fillStyle = isV(-1, 0) ? '#252b39' : '#47516a'; g.fillRect(x, y, 2, S); }
    if (!isW(1, 0)) { g.fillStyle = isV(1, 0) ? '#202533' : '#2a3142'; g.fillRect(x + S - 2, y, 2, S); }
    // Faux-3D front face where the wall meets the floor (or outside) below.
    if (!isW(0, 1)) {
      const fh = 10;
      const gr = g.createLinearGradient(0, y + S - fh, 0, y + S);
      gr.addColorStop(0, isV(0, 1) ? '#1d2230' : '#262d3e');
      gr.addColorStop(1, isV(0, 1) ? '#12151d' : '#1a1f2b');
      g.fillStyle = gr;
      g.fillRect(x, y + S - fh, S, fh);
      g.fillStyle = '#5c6888';
      g.fillRect(x, y + S - fh, S, 1);
      // Baseboard trim.
      g.fillStyle = 'rgba(0,0,0,0.35)';
      g.fillRect(x, y + S - 2, S, 2);
    }
  }

  function drawVentGrate(g, x, y) {
    const m = 5;
    fillRR(g, x + m - 1, y + m - 1, S - 2 * m + 2, S - 2 * m + 2, 2, '#596273');
    g.fillStyle = '#0d0f13';
    g.fillRect(x + m + 1, y + m + 1, S - 2 * m - 2, S - 2 * m - 2);
    g.fillStyle = '#7b8496';
    for (let i = 0; i < 5; i++) g.fillRect(x + m + 1, y + m + 2 + i * 4, S - 2 * m - 2, 2);
    g.fillStyle = '#aab3c2';
    for (const [sx, sy] of [[m + 1, m + 1], [S - m - 2, m + 1], [m + 1, S - m - 2], [S - m - 2, S - m - 2]]) g.fillRect(x + sx, y + sy, 1, 1);
  }

  // ---------- decor ----------
  // Each drawer is called with the origin at the decor's center, rotated by
  // `rot`. (w, h) are the local dims: the footprint (d.w x d.h tiles, in world
  // space) with w/h swapped for 90/270 so the footprint stays as authored.
  // "Front" of an object faces local +y (down at rot 0).
  let SOX = 2, SOY = 4; // shadow offset in local space
  function shadow(g, x, y, w, h, r) { fillRR(g, x + SOX, y + SOY, w, h, r, 'rgba(0,0,0,0.38)'); }
  function shadowC(g, x, y, r) { circle(g, x + SOX, y + SOY, r, 'rgba(0,0,0,0.38)'); }

  function drawDecorItem(g, d) {
    const fw = (d.w || 1) * S, fh = (d.h || 1) * S;
    const cx = d.x * S + fw / 2, cy = d.y * S + fh / 2;
    const rot = (((d.rot || 0) % 360) + 360) % 360;
    const q = Math.round(rot / 90) % 4;
    const w = q % 2 ? fh : fw, h = q % 2 ? fw : fh;
    const a = (rot * Math.PI) / 180;
    SOX = 2 * Math.cos(-a) - 4 * Math.sin(-a);
    SOY = 2 * Math.sin(-a) + 4 * Math.cos(-a);
    const seed = ((d.x | 0) * 31 + (d.y | 0) * 17 + (d.w | 0) * 7) | 0;
    g.save();
    g.translate(cx, cy);
    g.rotate(a);
    (DECOR[d.type] || DECOR._box)(g, w, h, seed);
    g.restore();
    // Live parts (world space).
    if (d.type === 'lamp') lamps.push({ x: cx, y: cy, r: 70 + Math.min(fw, fh) * 1.2, tx: d.x | 0, ty: d.y | 0 });
    if (d.type === 'server') {
      const rows = Math.max(2, Math.floor((h - 8) / 5));
      for (let i = 0; i < rows; i++) {
        for (let k = 0; k < 2; k++) {
          const lx = w / 2 - 6 - k * 4, ly = -h / 2 + 6 + i * 5;
          leds.push({
            x: cx + lx * Math.cos(a) - ly * Math.sin(a), y: cy + lx * Math.sin(a) + ly * Math.cos(a),
            phase: hash(seed, i, k) * 10, rate: 0.6 + hash(seed, i, k + 5) * 3,
            color: hash(seed, i, k + 9) < 0.75 ? '#3dff8a' : (hash(seed, i, k + 3) < 0.5 ? '#ffb43d' : '#4da6ff'),
            tx: Math.floor(cx / S), ty: Math.floor(cy / S),
          });
        }
      }
    }
  }

  const BOOKS = ['#7a2e2e', '#2e4f7a', '#2e7a4f', '#7a6a2e', '#5b2e7a', '#8a8a8a', '#a0522d', '#33363d'];
  const DECOR = {
    _box(g, w, h) {
      shadow(g, -w / 2 + 3, -h / 2 + 3, w - 6, h - 6, 3);
      fillRR(g, -w / 2 + 3, -h / 2 + 3, w - 6, h - 6, 3, '#2d333f', '#434a59', 1.5);
    },
    desk(g, w, h, s) {
      const x = -w / 2 + 3, y = -h / 2 + 4, dw = w - 6, dh = h - 8;
      shadow(g, x, y, dw, dh, 3);
      fillRR(g, x, y, dw, dh, 3, '#56402f', '#6f5340', 1.5);
      g.fillStyle = 'rgba(255,230,200,0.06)'; g.fillRect(x + 2, y + 2, dw - 4, 2);
      const n = Math.max(1, Math.round(w / S));
      for (let i = 0; i < n; i++) {
        const mx = x + (i + 0.5) * (dw / n);
        // screen glow spilling onto the desk
        g.fillStyle = 'rgba(90,150,255,0.16)';
        g.beginPath(); g.moveTo(mx - 8, y + 6); g.lineTo(mx + 8, y + 6); g.lineTo(mx + 12, y + dh - 2); g.lineTo(mx - 12, y + dh - 2); g.closePath(); g.fill();
        fillRR(g, mx - 9, y + 2, 18, 4, 1, '#121419');
        g.fillStyle = '#5d8fd8'; g.fillRect(mx - 8, y + 5, 16, 1);
        fillRR(g, mx - 7, y + 10, 14, 4, 1, '#2a2d35');
        if (hash(s, i, 1) < 0.6) {
          g.save(); g.translate(mx + 10 * (hash(s, i, 2) < 0.5 ? -1 : 1), y + dh - 7); g.rotate(hash(s, i, 3) - 0.5);
          g.fillStyle = 'rgba(220,214,200,0.75)'; g.fillRect(-4, -3, 8, 6); g.restore();
        }
        if (hash(s, i, 4) < 0.5) circle(g, mx + (hash(s, i, 5) < 0.5 ? -11 : 11), y + 9, 2.4, '#d8d8d8', '#888', 0.5);
      }
    },
    chair(g, w, h) {
      const r = Math.min(w, h) * 0.26;
      g.fillStyle = '#0f1115';
      for (let i = 0; i < 5; i++) { const t = (i / 5) * TAU - Math.PI / 2; circle(g, Math.cos(t) * (r + 2), Math.sin(t) * (r + 2) + 1, 1.6, '#0f1115'); }
      shadowC(g, 0, 0, r);
      circle(g, 0, 1, r, '#30353f', '#4a505d', 1);
      fillRR(g, -r - 1, -r - 3, 2 * r + 2, 5, 2.5, '#3c424e', '#555c6a', 1);
      fillRR(g, -r - 3, -r * 0.4, 3, r * 1.1, 1.5, '#262a32');
      fillRR(g, r, -r * 0.4, 3, r * 1.1, 1.5, '#262a32');
    },
    plant(g, w, h, s) {
      const m = Math.min(w, h);
      const pr = m * 0.24;
      shadowC(g, 0, 0, pr + 2);
      circle(g, 0, 0, pr, '#6b4a35', '#8a6248', 1.5);
      circle(g, 0, 0, pr * 0.75, '#2a1d14');
      const n = 7 + (s & 3);
      for (let i = 0; i < n; i++) {
        const t = (i / n) * TAU + hash(s, i, 1) * 0.6;
        const len = m * (0.3 + hash(s, i, 2) * 0.14);
        g.save(); g.rotate(t); g.translate(len * 0.5, 0);
        g.beginPath(); g.ellipse(0, 0, len * 0.55, len * 0.2, 0, 0, TAU);
        g.fillStyle = i & 1 ? '#2f6b3a' : '#3d8c4a'; g.fill();
        g.strokeStyle = '#21492a'; g.lineWidth = 0.8; g.beginPath(); g.moveTo(-len * 0.5, 0); g.lineTo(len * 0.5, 0); g.stroke();
        g.restore();
      }
      circle(g, 0, 0, m * 0.06, '#4fa35d');
    },
    cabinet(g, w, h) {
      const x = -w / 2 + 4, y = -h / 2 + 4, cw = w - 8, ch = h - 8;
      shadow(g, x, y, cw, ch, 2);
      fillRR(g, x, y, cw, ch, 2, '#4a5263', '#5f687b', 1.5);
      const n = Math.max(1, Math.round(w / S));
      for (let i = 1; i < n; i++) { g.fillStyle = '#353c4a'; g.fillRect(x + (cw / n) * i, y, 1, ch); }
      g.fillStyle = '#394050'; g.fillRect(x, y + ch - 6, cw, 6);
      for (let i = 0; i < n; i++) {
        const mx = x + (cw / n) * (i + 0.5);
        g.fillStyle = '#b8c0cf'; g.fillRect(mx - 3, y + ch - 4, 6, 2);
        g.fillStyle = 'rgba(230,230,210,0.5)'; g.fillRect(mx - 4, y + 4, 8, 5);
      }
      g.fillStyle = 'rgba(255,255,255,0.06)'; g.fillRect(x + 1, y + 1, cw - 2, 1);
    },
    bookshelf(g, w, h, s) {
      const x = -w / 2 + 2, y = -h / 2 + 5, bw = w - 4, bh = h - 10;
      shadow(g, x, y, bw, bh, 2);
      fillRR(g, x, y, bw, bh, 2, '#3d2b1f', '#55402f', 1.5);
      g.fillStyle = '#1e140d'; g.fillRect(x + 2, y + 2, bw - 4, bh - 4);
      let bx = x + 3, i = 0;
      while (bx < x + bw - 4) {
        const bwid = 2 + Math.floor(hash(s, i, 1) * 4);
        const depth = (bh - 6) * (0.6 + hash(s, i, 2) * 0.4);
        if (hash(s, i, 4) > 0.08) {
          g.fillStyle = BOOKS[Math.floor(hash(s, i, 3) * BOOKS.length)];
          g.fillRect(bx, y + bh - 3 - depth, Math.min(bwid, x + bw - 3 - bx), depth);
        }
        bx += bwid + 0.5; i++;
      }
      g.fillStyle = 'rgba(255,255,255,0.05)'; g.fillRect(x + 2, y + bh - 3, bw - 4, 1);
    },
    sofa(g, w, h, s) {
      const cols = [['#5b2f35', '#6e3a41'], ['#2f4a5b', '#3a5a6e'], ['#3d3d46', '#4b4b56']];
      const [dark, light] = cols[Math.abs(s) % cols.length];
      const x = -w / 2 + 2, y = -h / 2 + 3, sw = w - 4, sh = h - 6;
      shadow(g, x, y, sw, sh, 6);
      fillRR(g, x, y, sw, sh, 6, dark, 'rgba(0,0,0,0.4)', 1);
      const arm = 6;
      const n = Math.max(1, Math.round(w / S));
      const cw = (sw - arm * 2) / n;
      for (let i = 0; i < n; i++) {
        fillRR(g, x + arm + i * cw + 0.5, y + sh * 0.34, cw - 1, sh * 0.62, 3, light, 'rgba(0,0,0,0.25)', 1);
        g.fillStyle = 'rgba(255,255,255,0.06)'; g.fillRect(x + arm + i * cw + 2, y + sh * 0.34 + 2, cw - 4, 1.5);
      }
      fillRR(g, x + 2, y + 1, sw - 4, sh * 0.3, 4, dark, 'rgba(255,255,255,0.06)', 1);
    },
    table(g, w, h, s) {
      const round = Math.abs(w - h) < 1;
      if (round) {
        const r = Math.min(w, h) * 0.4;
        shadowC(g, 0, 0, r);
        circle(g, 0, 0, r, '#4f3b2d', '#6a5040', 2);
        circle(g, 0, 0, r * 0.75, null, 'rgba(255,230,200,0.06)', 1);
        circle(g, r * 0.25, -r * 0.2, 2.5, '#d8d8d8', '#888', 0.5);
      } else {
        const x = -w / 2 + 4, y = -h / 2 + 4, tw = w - 8, th = h - 8;
        shadow(g, x, y, tw, th, 4);
        fillRR(g, x, y, tw, th, 4, '#3c4f5a', '#5f7987', 1.5); // glass-topped meeting table
        g.fillStyle = 'rgba(200,230,255,0.07)';
        g.beginPath(); g.moveTo(x + 4, y + th - 2); g.lineTo(x + tw * 0.4, y + 2); g.lineTo(x + tw * 0.5, y + 2); g.lineTo(x + 12, y + th - 2); g.closePath(); g.fill();
        const n = Math.max(1, Math.round(w / S));
        for (let i = 0; i < n; i++) {
          if (hash(s, i, 1) < 0.6) {
            g.save(); g.translate(x + (i + 0.5) * (tw / n), y + th / 2 + (hash(s, i, 2) - 0.5) * th * 0.4); g.rotate(hash(s, i, 3) - 0.5);
            g.fillStyle = 'rgba(225,220,205,0.8)'; g.fillRect(-4, -5, 8, 10); g.restore();
          }
        }
      }
    },
    rug(g, w, h, s) {
      const cols = [['#4a1f26', '#8a6a3a'], ['#1f344a', '#9a8a5a'], ['#3a2a1a', '#a07a4a']];
      const [base, trim] = cols[Math.abs(s) % cols.length];
      const x = -w / 2 + 4, y = -h / 2 + 3, rw = w - 8, rh = h - 6;
      g.fillStyle = 'rgba(220,210,180,0.35)';
      for (let fy = y + 2; fy < y + rh - 1; fy += 3) { g.fillRect(x - 3, fy, 3, 1); g.fillRect(x + rw, fy, 3, 1); }
      fillRR(g, x, y, rw, rh, 2, base);
      g.strokeStyle = trim; g.lineWidth = 2; g.strokeRect(x + 4, y + 4, rw - 8, rh - 8);
      g.strokeStyle = rgba(trim, 0.5); g.lineWidth = 1; g.strokeRect(x + 7.5, y + 7.5, rw - 15, rh - 15);
      g.fillStyle = rgba(trim, 0.5);
      const m = Math.min(rw, rh) * 0.28;
      g.beginPath(); g.moveTo(0, -m); g.lineTo(m * 1.3, 0); g.lineTo(0, m); g.lineTo(-m * 1.3, 0); g.closePath(); g.fill();
      g.fillStyle = base;
      g.beginPath(); g.moveTo(0, -m * 0.5); g.lineTo(m * 0.65, 0); g.lineTo(0, m * 0.5); g.lineTo(-m * 0.65, 0); g.closePath(); g.fill();
    },
    crate(g, w, h) {
      const x = -w / 2 + 3, y = -h / 2 + 3, cw = w - 6, ch = h - 6;
      shadow(g, x, y, cw, ch, 1);
      fillRR(g, x, y, cw, ch, 1, '#7a5a36', '#4a361f', 2);
      g.fillStyle = 'rgba(0,0,0,0.18)';
      for (let py = y + ch / 4; py < y + ch - 1; py += ch / 4) g.fillRect(x + 1, py, cw - 2, 1);
      g.strokeStyle = '#5e4428'; g.lineWidth = 3;
      g.beginPath(); g.moveTo(x + 2, y + 2); g.lineTo(x + cw - 2, y + ch - 2); g.moveTo(x + cw - 2, y + 2); g.lineTo(x + 2, y + ch - 2); g.stroke();
      g.strokeStyle = '#8f6d45'; g.lineWidth = 1; g.strokeRect(x + 1.5, y + 1.5, cw - 3, ch - 3);
      g.fillStyle = '#c0c0c0';
      for (const [nx, ny] of [[x + 3, y + 3], [x + cw - 4, y + 3], [x + 3, y + ch - 4], [x + cw - 4, y + ch - 4]]) g.fillRect(nx, ny, 1, 1);
    },
    server(g, w, h) {
      const x = -w / 2 + 3, y = -h / 2 + 2, sw = w - 6, sh = h - 4;
      shadow(g, x, y, sw, sh, 2);
      fillRR(g, x, y, sw, sh, 2, '#15181e', '#2f3540', 1.5);
      const rows = Math.max(2, Math.floor((h - 8) / 5));
      for (let i = 0; i < rows; i++) {
        g.fillStyle = '#20252e'; g.fillRect(x + 2, y + 2 + i * 5, sw - 4, 4);
        g.fillStyle = '#0b0d11'; g.fillRect(x + 4, y + 3 + i * 5, sw - 16, 1);
      }
    },
    watercooler(g, w, h) {
      const m = Math.min(w, h) * 0.7;
      shadow(g, -m / 2, -m / 2, m, m, 3);
      fillRR(g, -m / 2, -m / 2, m, m, 3, '#b9c0cc', '#8b93a1', 1);
      circle(g, 0, -1, m * 0.36, 'rgba(77,166,255,0.55)', 'rgba(170,215,255,0.8)', 1);
      g.strokeStyle = 'rgba(255,255,255,0.6)'; g.lineWidth = 1.5;
      g.beginPath(); g.arc(0, -1, m * 0.26, Math.PI * 1.1, Math.PI * 1.5); g.stroke();
      circle(g, 0, -1, m * 0.1, '#2a6fbf');
      g.fillStyle = '#d03b3b'; g.fillRect(-4, m / 2 - 3, 3, 2);
      g.fillStyle = '#3b7bd0'; g.fillRect(1, m / 2 - 3, 3, 2);
    },
    printer(g, w, h) {
      const x = -w / 2 + 4, y = -h / 2 + 5, pw = w - 8, ph = h - 12;
      g.fillStyle = '#f2f2f2'; g.fillRect(-pw * 0.3, y + ph - 2, pw * 0.6, 7);
      shadow(g, x, y, pw, ph, 3);
      fillRR(g, x, y, pw, ph, 3, '#c3c7cf', '#8d929c', 1);
      fillRR(g, x + 3, y + 3, pw - 6, ph * 0.45, 2, '#3a3e47');
      g.fillStyle = '#9ea3ad'; g.fillRect(x + 3, y + ph - 4, pw - 6, 2);
      g.fillStyle = '#3ddc84'; g.fillRect(x + pw - 6, y + ph * 0.6, 2, 2);
    },
    painting(g, w, h, s) {
      const x = -w / 2 + 3, y = -h / 2 + 3, pw = w - 6, ph = h - 6;
      shadow(g, x, y, pw, ph, 1);
      fillRR(g, x, y, pw, ph, 1, '#b08a3e', '#5e4720', 1);
      const bgs = ['#1d3a4a', '#4a2a1d', '#2a2a40', '#3a4a2a'];
      g.fillStyle = bgs[Math.abs(s) % bgs.length]; g.fillRect(x + 3, y + 3, pw - 6, ph - 6);
      g.save(); g.beginPath(); g.rect(x + 3, y + 3, pw - 6, ph - 6); g.clip();
      const pal = ['#e0b04a', '#c94d3a', '#4d9ac9', '#e8e0c8', '#3ac98a'];
      for (let i = 0; i < 3; i++) {
        g.fillStyle = rgba(pal[Math.floor(hash(s, i, 1) * pal.length)], 0.8);
        const bx = x + 3 + hash(s, i, 2) * (pw - 6), by = y + 3 + hash(s, i, 3) * (ph - 6);
        if (hash(s, i, 4) < 0.5) circle(g, bx, by, 2 + hash(s, i, 5) * Math.min(pw, ph) * 0.3, g.fillStyle);
        else g.fillRect(bx - 4, by - 3, 4 + hash(s, i, 6) * pw * 0.4, 3 + hash(s, i, 7) * ph * 0.3);
      }
      g.restore();
      g.fillStyle = 'rgba(255,240,200,0.25)'; g.fillRect(x + 1, y + 1, pw - 2, 1);
    },
    pedestal(g, w, h, s) {
      const m = Math.min(w, h) * 0.78;
      shadow(g, -m / 2, -m / 2, m, m, 2);
      fillRR(g, -m / 2, -m / 2, m, m, 2, '#7e818c', '#5b5e68', 1);
      fillRR(g, -m / 2 + 3, -m / 2 + 3, m - 6, m - 6, 2, '#a9acb6');
      const art = Math.abs(s) % 3;
      if (art === 0) { circle(g, 0, 0, m * 0.18, '#d4a93a', '#8f6f20', 1); circle(g, -1.5, -1.5, m * 0.06, '#ffe9a8'); }
      else if (art === 1) { circle(g, 0, 0, m * 0.2, '#3a6fa8', '#1f3d5e', 1); circle(g, 0, 0, m * 0.08, '#0f2036'); }
      else { g.fillStyle = '#c9c2b0'; g.beginPath(); g.ellipse(0, 0, m * 0.22, m * 0.13, 0.5, 0, TAU); g.fill(); }
      g.strokeStyle = 'rgba(180,230,255,0.45)'; g.lineWidth = 1;
      g.strokeRect(-m / 2 + 1.5, -m / 2 + 1.5, m - 3, m - 3);
      g.strokeStyle = 'rgba(255,255,255,0.35)';
      g.beginPath(); g.moveTo(-m / 2 + 4, m / 2 - 8); g.lineTo(-m / 2 + 10, -m / 2 + 4); g.stroke();
    },
    safe(g, w, h) {
      const x = -w / 2 + 3, y = -h / 2 + 3, sw = w - 6, sh = h - 6;
      shadow(g, x, y, sw, sh, 3);
      fillRR(g, x, y, sw, sh, 3, '#3f4652', '#262b33', 2);
      fillRR(g, x + 4, y + 4, sw - 8, sh - 8, 2, '#4b5361', 'rgba(255,255,255,0.08)', 1);
      const r = Math.min(sw, sh) * 0.2;
      circle(g, 0, 0, r, '#9aa3b2', '#2a2f38', 1.5);
      for (let i = 0; i < 8; i++) {
        const t = (i / 8) * TAU;
        g.fillStyle = '#2a2f38'; g.fillRect(Math.cos(t) * r * 0.75 - 0.5, Math.sin(t) * r * 0.75 - 0.5, 1, 1);
      }
      circle(g, 0, 0, r * 0.35, '#5d6574');
      g.strokeStyle = '#b8c0cf'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(sw / 2 - 9, -4); g.lineTo(sw / 2 - 9, 4); g.stroke();
    },
    lamp(g, w, h) {
      const m = Math.min(w, h);
      shadowC(g, 0, 0, m * 0.22);
      circle(g, 0, 0, m * 0.24, '#d8c48f', '#a08850', 1);
      circle(g, 0, 0, m * 0.15, '#fff1c4');
      circle(g, 0, 0, m * 0.05, '#ffffff');
    },
    trash(g, w, h, s) {
      const r = Math.min(w, h) * 0.2;
      shadowC(g, 0, 0, r);
      circle(g, 0, 0, r, '#3a3f48', '#5a616d', 1.5);
      circle(g, 0, 0, r * 0.75, '#15181d');
      for (let i = 0; i < 3; i++) {
        if (hash(s, i, 1) < 0.35) continue;
        circle(g, (hash(s, i, 2) - 0.5) * r, (hash(s, i, 3) - 0.5) * r, r * 0.28, '#d9d6cc', '#9a978e', 0.5);
      }
    },
  };

  // ---------- live world drawing ----------
  function drawDoors(L) {
    for (const d of L.doors || []) {
      let info = doorInfo.get(d);
      if (!info) { info = { orient: 'h', open: d.locked ? 0 : 1 }; doorInfo.set(d, info); }
      info.open += ((d.locked ? 0 : 1) - info.open) * 0.18;
      if (Math.abs(info.open - (d.locked ? 0 : 1)) < 0.01) info.open = d.locked ? 0 : 1;
      const color = reqColor(d.requires);
      ctx.save();
      ctx.translate(d.x, d.y);
      if (info.orient === 'v') ctx.rotate(Math.PI / 2);
      // Slab halves slide into the wall.
      ctx.save();
      ctx.beginPath(); ctx.rect(-S / 2 + 3, -S / 2, S - 6, S); ctx.clip();
      const slide = info.open * (S / 2 - 2);
      const kind = d.requires ? d.requires.split(':')[0] : null;
      const slab = kind === 'key' ? '#3e4453' : '#3d3650';
      for (const side of [-1, 1]) {
        const x0 = side < 0 ? -S / 2 - slide : slide;
        fillRR(ctx, x0, -5, S / 2, 10, 1.5, slab, '#1a1d24', 1);
        ctx.fillStyle = 'rgba(255,255,255,0.1)'; ctx.fillRect(x0 + 1, -4, S / 2 - 2, 1);
        ctx.fillStyle = rgba(color, 0.55); ctx.fillRect(x0 + 2, 2, S / 2 - 4, 1.5);
      }
      ctx.restore();
      // Door frame posts.
      fillRR(ctx, -S / 2, -7, 4, 14, 1, '#59637c');
      fillRR(ctx, S / 2 - 4, -7, 4, 14, 1, '#59637c');
      ctx.restore();
    }
  }

  function drawDoorLights(L, t) {
    for (const d of L.doors || []) {
      const info = doorInfo.get(d) || { orient: 'h', open: 1 };
      const color = reqColor(d.requires);
      ctx.save();
      ctx.translate(d.x, d.y);
      if (info.orient === 'v') ctx.rotate(Math.PI / 2);
      if (d.locked || info.open < 0.5) {
        const pulse = 0.75 + 0.25 * Math.sin(t * 3 + d.tx);
        glow(ctx, 0, 0, 18, color, 0.35 * pulse);
        const kind = d.requires ? d.requires.split(':')[0] : null;
        ctx.rotate(info.orient === 'v' ? -Math.PI / 2 : 0); // keep icons upright
        if (kind === 'key') {
          // Card-reader icon: colored card with stripe.
          fillRR(ctx, -5, -4, 10, 8, 1.5, color, '#0d0f14', 1);
          ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(-5, -1.5, 10, 1.5);
        } else {
          // Padlock.
          ctx.strokeStyle = color; ctx.lineWidth = 1.6;
          ctx.beginPath(); ctx.arc(0, -2, 3, Math.PI, 0); ctx.stroke();
          fillRR(ctx, -4.5, -2, 9, 7, 1.5, color, '#0d0f14', 1);
          ctx.fillStyle = '#0d0f14'; ctx.fillRect(-0.5, 0, 1, 3);
        }
      } else {
        // Open: small green status LEDs on the posts.
        ctx.fillStyle = COL.exit;
        ctx.fillRect(-S / 2 + 1, -1, 2, 2); ctx.fillRect(S / 2 - 3, -1, 2, 2);
      }
      ctx.restore();
    }
  }

  function inView(state, x, y, m) {
    const cx = state.cam.x, cy = state.cam.y;
    return x > cx - m && y > cy - m && x < cx + C.VIEW_W + m && y < cy + C.VIEW_H + m;
  }

  function drawLiveDecor(state, hidden) {
    const t = state.time;
    const L = state.level;
    const vis = (o) => { const r = regionOf(L, o.tx, o.ty); return !(r >= 0 && hidden[r]); };
    for (const l of leds) {
      if (!inView(state, l.x, l.y, 10)) continue;
      const on = Math.sin(t * l.rate * 3 + l.phase) > -0.3;
      ctx.fillStyle = on ? l.color : '#16301f';
      ctx.fillRect(l.x - 1, l.y - 1, 2, 2);
    }
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const l of lamps) {
      if (!inView(state, l.x, l.y, l.r) || !vis(l)) continue;
      const flick = 0.95 + 0.05 * Math.sin(t * 7 + l.x);
      glow(ctx, l.x, l.y, l.r * 0.8, '#ffbe6e', 0.13 * flick);
    }
    ctx.restore();
  }

  function drawLighting(state, hidden) {
    const g = lightCtx, p = state.player, L = state.level;
    const cx = state.cam.x, cy = state.cam.y;
    g.globalCompositeOperation = 'source-over';
    g.clearRect(0, 0, C.VIEW_W, C.VIEW_H);
    g.fillStyle = 'rgba(3,5,14,0.58)';
    g.fillRect(0, 0, C.VIEW_W, C.VIEW_H);
    g.globalCompositeOperation = 'destination-out';
    const hole = (x, y, r, a) => {
      x -= cx; y -= cy;
      if (x < -r || y < -r || x > C.VIEW_W + r || y > C.VIEW_H + r) return;
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, `rgba(0,0,0,${a})`);
      gr.addColorStop(0.5, `rgba(0,0,0,${a * 0.65})`);
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    };
    hole(p.x, p.y, p.layer === 'vent' ? 150 : 250, 0.95);
    for (const l of lamps) {
      const r = regionOf(L, l.tx, l.ty);
      if (r >= 0 && hidden[r]) continue;
      hole(l.x, l.y, l.r, 0.85);
    }
    for (const c of L.computers || []) hole((c.x + 0.5) * S, (c.y + 0.5) * S, 48, 0.6);
    if (L.treasure && !L.treasure.taken) hole(L.treasure.x, L.treasure.y, 80, 0.7);
    if (L.start) hole(L.start.x, L.start.y, p.hasTreasure ? 90 : 60, 0.6);
    g.globalCompositeOperation = 'source-over';
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(lightCv, 0, 0);
    ctx.restore();
  }

  function drawStart(state) {
    const st = state.level.start;
    if (!st) return;
    const t = state.time, has = state.player.hasTreasure;
    const x = st.tx * S, y = st.ty * S;
    const pulse = has ? 0.5 + 0.5 * Math.sin(t * 6) : 0.5 + 0.5 * Math.sin(t * 2);
    glow(ctx, st.x, st.y, has ? 46 : 26, COL.exit, (has ? 0.35 : 0.15) + 0.15 * pulse);
    ctx.fillStyle = rgba(COL.exit, 0.08 + 0.06 * pulse);
    ctx.fillRect(x + 3, y + 3, S - 6, S - 6);
    ctx.strokeStyle = rgba(COL.exit, 0.45 + 0.45 * pulse);
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 3]);
    ctx.strokeRect(x + 3, y + 3, S - 6, S - 6);
    ctx.setLineDash([]);
    // Corner brackets.
    ctx.strokeStyle = rgba(COL.exit, 0.9);
    ctx.lineWidth = 2;
    for (const [sx, sy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
      const bx = x + 2 + sx * (S - 4), by = y + 2 + sy * (S - 4), dx = sx ? -6 : 6, dy = sy ? -6 : 6;
      ctx.beginPath(); ctx.moveTo(bx + dx, by); ctx.lineTo(bx, by); ctx.lineTo(bx, by + dy); ctx.stroke();
    }
    ctx.fillStyle = rgba(COL.exit, 0.75 + 0.25 * pulse);
    ctx.font = `bold 8px ${MONO}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('EXIT', st.x, st.y);
    if (has) {
      for (let k = 0; k < 2; k++) {
        const ph = ((t * 0.8 + k * 0.5) % 1);
        ctx.strokeStyle = rgba(COL.exit, 0.6 * (1 - ph));
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(st.x, st.y, 10 + ph * 40, 0, TAU); ctx.stroke();
      }
    }
    ctx.textAlign = 'left';
  }

  function drawKeycard(x, y, color, t) {
    const bob = Math.sin(t * 3 + x) * 2;
    glow(ctx, x, y, 22, color, 0.35 + 0.1 * Math.sin(t * 4));
    ctx.save();
    ctx.translate(x, y + bob);
    ctx.rotate(-0.2 + Math.sin(t * 1.5) * 0.08);
    fillRR(ctx, -7, -3.5, 16, 11, 2, 'rgba(0,0,0,0.4)');
    ctx.translate(-8, -5.5);
    fillRR(ctx, 0, 0, 16, 11, 2, color, 'rgba(255,255,255,0.7)', 1);
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(0, 2.5, 16, 2);
    fillRR(ctx, 2, 6, 4, 3, 0.5, '#e8d38a');
    ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.fillRect(8, 6.5, 6, 1); ctx.fillRect(8, 8.5, 4, 1);
    ctx.restore();
  }

  function drawEntities(state) {
    const L = state.level, t = state.time;
    for (const it of L.items || []) {
      if (it.taken) continue;
      const x = (it.x + 0.5) * S, y = (it.y + 0.5) * S;
      if (it.type === 'keycard') drawKeycard(x, y, KEY_COLORS[it.color] || '#ffffff', t);
      else {
        // Generic pickup (e.g. a data drive): amber chip.
        const bob = Math.sin(t * 3 + x) * 2;
        glow(ctx, x, y, 20, COL.warn, 0.3);
        fillRR(ctx, x - 6, y - 6 + bob, 12, 12, 2, '#2a2f38', COL.warn, 1.5);
        ctx.fillStyle = COL.warn; ctx.fillRect(x - 2, y - 2 + bob, 4, 4);
      }
    }
    for (const c of L.computers || []) drawComputer(state, c);
    const tr = L.treasure;
    if (tr && !tr.taken) drawTreasure(tr.x, tr.y, t);
  }

  function drawComputer(state, c) {
    const x = (c.x + 0.5) * S, y = (c.y + 0.5) * S, t = state.time;
    const needs = c.requires && !Heist.Tasks.check(state, c.requires);
    const hacking = state.interact && state.interact.target === c;
    const col = c.hacked ? COL.hacked : needs ? COL.locked : COL.computer;
    glow(ctx, x, y, 30, col, (c.hacked ? 0.3 : 0.25) + (hacking ? 0.2 : 0) + 0.05 * Math.sin(t * 2 + c.x));
    // Console body.
    fillRR(ctx, x - 13 + 2, y - 11 + 3, 26, 22, 3, 'rgba(0,0,0,0.4)');
    fillRR(ctx, x - 13, y - 11, 26, 22, 3, '#1c2029', '#3c4352', 1.5);
    // Screen.
    fillRR(ctx, x - 10, y - 8, 20, 12, 1.5, '#06080c');
    ctx.fillStyle = rgba(col, 0.85);
    ctx.fillRect(x - 9, y - 7, 18, 10);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    for (let i = 0; i < 5; i++) ctx.fillRect(x - 9, y - 7 + i * 2, 18, 1);
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    if (c.hacked) {
      ctx.strokeStyle = '#06200f'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x - 4, y - 2); ctx.lineTo(x - 1, y + 1); ctx.lineTo(x + 5, y - 5); ctx.stroke();
    } else if (needs) {
      ctx.fillRect(x - 2, y - 3, 4, 4); ctx.fillRect(x - 1, y - 5, 2, 2);
    } else {
      const lines = hacking ? 4 : 3;
      for (let i = 0; i < lines; i++) {
        const lw = 4 + Math.floor(hash(c.x, i, Math.floor(t * (hacking ? 12 : 1))) * 10);
        ctx.fillRect(x - 8, y - 6 + i * 2.4, lw, 1.2);
      }
    }
    // Keyboard.
    ctx.fillStyle = '#2b303b'; ctx.fillRect(x - 8, y + 6, 16, 3);
    if (hacking) {
      const pr = clamp01(state.interact.progress);
      ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(x, y, 20, 0, TAU); ctx.stroke();
      ctx.strokeStyle = COL.computer; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(x, y, 20, -Math.PI / 2, -Math.PI / 2 + pr * TAU); ctx.stroke();
    }
  }

  function drawTreasure(x, y, t) {
    glow(ctx, x, y, 44, COL.treasure, 0.32 + 0.08 * Math.sin(t * 2));
    // Plinth.
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath(); ctx.ellipse(x + 1, y + 9, 11, 4, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#5c6070';
    ctx.beginPath(); ctx.ellipse(x, y + 7, 11, 4.5, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#8b90a0';
    ctx.beginPath(); ctx.ellipse(x, y + 6, 9, 3.2, 0, 0, TAU); ctx.fill();
    const by = y - 4 + Math.sin(t * 2.5) * 2;
    // Diamond: crown (top band) + pavilion (point).
    const w = 10, top = by - 6, girdle = by - 1, tip = by + 9;
    ctx.fillStyle = '#bff8ff';
    ctx.beginPath(); ctx.moveTo(x - w * 0.55, top); ctx.lineTo(x + w * 0.55, top); ctx.lineTo(x + w, girdle); ctx.lineTo(x - w, girdle); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#5fdcef';
    ctx.beginPath(); ctx.moveTo(x - w, girdle); ctx.lineTo(x + w, girdle); ctx.lineTo(x, tip); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#3cb8d6';
    ctx.beginPath(); ctx.moveTo(x, girdle); ctx.lineTo(x + w, girdle); ctx.lineTo(x, tip); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(x - w * 0.55, top); ctx.lineTo(x - w * 0.3, girdle); ctx.lineTo(x, top); ctx.lineTo(x + w * 0.3, girdle); ctx.lineTo(x + w * 0.55, top);
    ctx.moveTo(x - w * 0.3, girdle); ctx.lineTo(x, tip); ctx.lineTo(x + w * 0.3, girdle);
    ctx.stroke();
    // Sparkles.
    for (let i = 0; i < 3; i++) {
      const ph = (t * 0.9 + i / 3) % 1;
      const a = Math.sin(ph * Math.PI);
      const ang = i * 2.1 + Math.floor(t * 0.9 + i / 3) * 1.3;
      const sx = x + Math.cos(ang) * 11, sy = by + Math.sin(ang) * 8;
      sparkle(sx, sy, 2 + a * 3, a);
    }
  }
  function sparkle(x, y, r, a) {
    ctx.fillStyle = `rgba(255,255,255,${a})`;
    ctx.beginPath();
    ctx.moveTo(x, y - r); ctx.lineTo(x + r * 0.25, y - r * 0.25); ctx.lineTo(x + r, y); ctx.lineTo(x + r * 0.25, y + r * 0.25);
    ctx.lineTo(x, y + r); ctx.lineTo(x - r * 0.25, y + r * 0.25); ctx.lineTo(x - r, y); ctx.lineTo(x - r * 0.25, y - r * 0.25);
    ctx.closePath(); ctx.fill();
  }

  function updateDust(state) {
    const t = state.time, p = state.player;
    let dt = t - lastTime;
    lastTime = t;
    if (dt < 0 || dt > 0.1) dt = 0;
    if (p.moving && p.layer === 'main' && state.status === 'playing') {
      dustT -= dt;
      if (dustT <= 0 && particles.length < 40) {
        dustT = 0.09;
        particles.push({
          x: p.x - Math.cos(p.facing) * 7 + (Math.random() - 0.5) * 6,
          y: p.y - Math.sin(p.facing) * 7 + (Math.random() - 0.5) * 6 + 4,
          vx: -Math.cos(p.facing) * 10 + (Math.random() - 0.5) * 8, vy: -Math.sin(p.facing) * 10 - 4,
          life: 0.5, max: 0.5,
        });
      }
    }
    for (const q of particles) { q.life -= dt; q.x += q.vx * dt; q.y += q.vy * dt; }
    particles = particles.filter((q) => q.life > 0);
  }
  function drawDust() {
    for (const q of particles) {
      const k = q.life / q.max;
      ctx.fillStyle = `rgba(170,180,200,${0.22 * k})`;
      ctx.beginPath(); ctx.arc(q.x, q.y, 1.5 + (1 - k) * 2.5, 0, TAU); ctx.fill();
    }
  }

  function drawPlayer(state) {
    const p = state.player, t = state.time;
    ctx.save();
    if (p.stealth) ctx.globalAlpha = 0.4 + 0.1 * Math.sin(t * 8);
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.beginPath(); ctx.ellipse(p.x + 2, p.y + 4, p.r + 1, p.r * 0.85, 0, 0, TAU); ctx.fill();
    // Soft ring underfoot keeps the player readable on any floor.
    ctx.strokeStyle = 'rgba(220,230,255,0.18)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r + 4, 0, TAU); ctx.stroke();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.facing || 0);
    const step = p.moving ? Math.sin(t * 14) : 0;
    // Treasure bag on the back.
    if (p.hasTreasure) {
      circle(ctx, -8, 0, 6, '#3a3226', '#1c1810', 1);
      glow(ctx, -8, 0, 10, COL.treasure, 0.35 + 0.15 * Math.sin(t * 5));
      circle(ctx, -8, -1, 1.5, '#bff8ff');
    }
    // Hands.
    circle(ctx, 5 + step * 2, -8, 2.6, '#1c1f26', '#9aa6bd', 1);
    circle(ctx, 5 - step * 2, 8, 2.6, '#1c1f26', '#9aa6bd', 1);
    // Shoulders / torso.
    ctx.beginPath(); ctx.ellipse(0, 0, 6.5, 10, 0, 0, TAU);
    ctx.fillStyle = '#4a5468'; ctx.fill();
    ctx.strokeStyle = '#dfe6f4'; ctx.lineWidth = 1.5; ctx.stroke();
    // Head (black beanie) with a skin strip at the front (balaclava eye slit).
    circle(ctx, 1, 0, 5.5, '#111318', '#525b6e', 1);
    ctx.fillStyle = '#c99f84';
    ctx.fillRect(4.5, -3, 1.6, 6);
    ctx.restore();
  }

  // ---------- fog ----------
  function updateFog(L, hidden, sig) {
    if (sig === fogSig) return;
    fogSig = sig;
    const g = fogCtx;
    g.clearRect(0, 0, fogCv.width, fogCv.height);
    if (sig.indexOf('1') < 0) return;
    g.fillStyle = '#07080d';
    for (let ty = 0; ty < L.h; ty++) for (let tx = 0; tx < L.w; tx++) {
      const r = regionOf(L, tx, ty);
      if (r >= 0 && hidden[r]) g.fillRect(tx * S, ty * S, S, S);
    }
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = g.createPattern(hatchCv, 'repeat');
    g.fillRect(0, 0, fogCv.width, fogCv.height);
    g.globalCompositeOperation = 'source-over';
    // Inner edge shading so the fog reads as a sealed room, not a glitch.
    g.fillStyle = 'rgba(70,80,110,0.12)';
    for (let ty = 0; ty < L.h; ty++) for (let tx = 0; tx < L.w; tx++) {
      const r = regionOf(L, tx, ty);
      if (!(r >= 0 && hidden[r])) continue;
      if (tileAt(L, tx, ty - 1) !== T.WALL && regionOf(L, tx, ty - 1) !== r) g.fillRect(tx * S, ty * S, S, 1);
    }
    for (let r = 0; r < hidden.length; r++) {
      const c = regionCenters[r];
      if (!hidden[r] || !c || c.n < 4) continue;
      g.save();
      g.translate(c.x, c.y);
      g.strokeStyle = 'rgba(140,150,175,0.28)'; g.lineWidth = 2;
      g.beginPath(); g.arc(0, -6, 5, Math.PI, 0); g.stroke();
      fillRR(g, -7, -6, 14, 11, 2, 'rgba(140,150,175,0.22)');
      g.fillStyle = '#07080d'; g.fillRect(-1, -3, 2, 4);
      g.fillStyle = 'rgba(140,150,175,0.3)';
      g.font = `bold 9px ${MONO}`; g.textAlign = 'center'; g.textBaseline = 'top';
      g.fillText('LOCKED', 0, 9);
      g.restore();
    }
  }

  // ---------- main draw ----------
  function draw(state) {
    if (!ctx || !state || !state.level) return;
    const L = state.level;
    if (!staticCv) init(state);
    const t = state.time || 0;
    const pr = Heist.Level.regionAt(L, state.player.x, state.player.y);
    const hidden = [];
    let sig = '';
    for (let r = 0; r < (L.regionCount || 0); r++) {
      hidden[r] = Heist.Level.isRegionHidden(L, r, pr);
      sig += hidden[r] ? '1' : '0';
    }
    updateDust(state);

    ctx.save();
    ctx.fillStyle = '#05060a';
    ctx.fillRect(0, 0, C.VIEW_W, C.VIEW_H);
    const sx = state.shake ? (Math.random() - 0.5) * state.shake : 0;
    const sy = state.shake ? (Math.random() - 0.5) * state.shake : 0;
    ctx.translate(Math.round(-state.cam.x + sx), Math.round(-state.cam.y + sy));
    ctx.drawImage(staticCv, 0, 0);
    drawDoors(L);
    drawLighting(state, hidden);
    drawLiveDecor(state, hidden);
    drawDoorLights(L, t);
    drawStart(state);
    drawEntities(state);
    if (Heist.Security && Heist.Security.draw) Heist.Security.draw(ctx, state);
    if (state.player.layer === 'main') { drawDust(); drawPlayer(state); }
    updateFog(L, hidden, sig);
    ctx.drawImage(fogCv, 0, 0);
    if (Heist.Vents && Heist.Vents.draw) Heist.Vents.draw(ctx, state);
    ctx.restore();

    // Screen-space mood + feedback.
    ctx.drawImage(vignetteCv, 0, 0);
    const rising = state.status === 'playing' &&
      (state.alert > prevAlert + 1e-6 || !!(state.security && state.security.seenThisFrame));
    alertPulse = rising ? Math.min(1, alertPulse + 0.25) : Math.max(0, alertPulse - 0.04);
    prevAlert = state.alert;
    if (alertPulse > 0) {
      ctx.globalAlpha = alertPulse * (0.45 + 0.25 * Math.sin(t * 18));
      ctx.drawImage(redCv, 0, 0);
      ctx.globalAlpha = 1;
    }
    if (state.flash > 0) {
      ctx.globalAlpha = clamp01(state.flash);
      ctx.drawImage(redCv, 0, 0);
      ctx.globalAlpha = 1;
      ctx.fillStyle = `rgba(255,30,30,${state.flash * 0.12})`;
      ctx.fillRect(0, 0, C.VIEW_W, C.VIEW_H);
    }
    drawExitArrow(state);
    drawHUD(state);
    drawTitleCard(state);
    if (state.status !== 'playing') { endFrames++; drawOverlay(state); } else endFrames = 0;
  }

  // ---------- HUD ----------
  function panel(x, y, w, h) {
    fillRR(ctx, x, y, w, h, 6, COL.panel, COL.edge, 1);
  }
  function meter(x, y, w, label, frac, color, valueText, pulse, t) {
    frac = clamp01(frac);
    ctx.font = `bold 10px ${FONT}`;
    ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
    ctx.fillStyle = pulse > 0 ? rgba('#ffffff', 0.7 + 0.3 * Math.sin(t * 20)) : COL.dim;
    ctx.fillText(label, x, y + 9);
    ctx.textAlign = 'right';
    ctx.font = `bold 11px ${MONO}`;
    ctx.fillStyle = pulse > 0 ? '#ffffff' : COL.text;
    ctx.fillText(valueText, x + w, y + 9);
    ctx.textAlign = 'left';
    const by = y + 14, bh = 10;
    fillRR(ctx, x, by, w, bh, 3, 'rgba(255,255,255,0.06)', 'rgba(255,255,255,0.08)', 1);
    if (frac > 0) {
      const gr = ctx.createLinearGradient(x, 0, x + w, 0);
      gr.addColorStop(0, rgba(color, 0.65));
      gr.addColorStop(1, color);
      fillRR(ctx, x + 1, by + 1, Math.max(4, (w - 2) * frac), bh - 2, 2, gr);
      if (pulse > 0) {
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        fillRR(ctx, x + 1, by + 1, Math.max(4, (w - 2) * frac), bh - 2, 2, rgba('#ffffff', 0.3 * pulse));
        ctx.restore();
      }
    }
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    for (let i = 1; i < 10; i++) ctx.fillRect(x + (w * i) / 10, by + 1, 1, bh - 2);
  }

  function drawHUD(state) {
    const t = state.time || 0, L = state.level;
    // Meters (top-left).
    const hasVents = !!L.ventTiles;
    const pw = 250, ph = hasVents ? 72 : 42;
    const jitter = alertPulse > 0.3 ? (Math.random() - 0.5) * 2 * alertPulse : 0;
    panel(12, 12, pw, ph);
    const af = state.alert / (state.alertMax || 100);
    const aColor = af > 0.66 ? '#ff3b3b' : af > 0.33 ? '#ff6a3d' : '#e0583e';
    meter(24 + jitter, 20, pw - 24, 'ALERT', af, aColor,
      `${Math.floor(state.alert)} / ${state.alertMax}`, alertPulse, t);
    if (hasVents) {
      const tf = (state.temp || 0) / (state.tempMax || 100);
      const hot = tf > 0.7 ? 1 : 0;
      meter(24, 50, pw - 24, state.player.layer === 'vent' ? 'VENT TEMP  \u00B7  IN VENTS' : 'VENT TEMP',
        tf, '#ff9f1c', `${Math.floor(tf * 100)}%`, hot, t);
    }
    drawObjectives(state);
    drawInventory(state);
    // Hint / hack progress (bottom center).
    const cx = C.VIEW_W / 2;
    if (state.interact) {
      const w = 260;
      panel(cx - w / 2, C.VIEW_H - 74, w, 40);
      ctx.font = `bold 10px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = COL.computer;
      const label = (state.interact.target && state.interact.target.label) || 'Hacking';
      ctx.fillText(`HACKING  \u00B7  ${label.toUpperCase()}`, cx, C.VIEW_H - 59);
      fillRR(ctx, cx - w / 2 + 12, C.VIEW_H - 52, w - 24, 8, 3, 'rgba(255,255,255,0.08)');
      fillRR(ctx, cx - w / 2 + 12, C.VIEW_H - 52, Math.max(4, (w - 24) * clamp01(state.interact.progress)), 8, 3, COL.computer);
    } else if (state.hint) {
      ctx.font = `600 13px ${FONT}`;
      const tw = ctx.measureText(state.hint).width + 32;
      panel(cx - tw / 2, C.VIEW_H - 64, tw, 28);
      ctx.fillStyle = COL.text; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(state.hint, cx, C.VIEW_H - 50);
    }
    // Toasts (top center).
    ctx.font = `600 13px ${FONT}`;
    (state.toasts || []).forEach((to, i) => {
      const a = clamp01(Math.min(to.t, (3 - to.t) * 4));
      const yy = 16 + i * 32 - (1 - a) * 8;
      const tw = ctx.measureText(to.text).width + 30;
      ctx.globalAlpha = a;
      fillRR(ctx, cx - tw / 2, yy, tw, 26, 13, 'rgba(30,26,12,0.85)', 'rgba(255,224,138,0.45)', 1);
      ctx.fillStyle = '#ffe08a'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(to.text, cx, yy + 13.5);
    });
    ctx.globalAlpha = 1;
    // Sound indicator.
    if (Heist.Audio && typeof Heist.Audio.muted === 'boolean') {
      ctx.font = `10px ${FONT}`; ctx.textAlign = 'right'; ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = 'rgba(160,170,190,0.55)';
      ctx.fillText(Heist.Audio.muted ? 'SOUND OFF  (M)' : 'SOUND ON  (M)', C.VIEW_W - 14, C.VIEW_H - 12);
    }
    ctx.textAlign = 'left';
  }

  function drawObjectives(state) {
    const L = state.level, objs = L.objectives || [];
    ctx.font = `600 12px ${FONT}`;
    let w = 0;
    for (const o of objs) w = Math.max(w, ctx.measureText(o.text || '').width);
    ctx.font = `bold 13px ${FONT}`;
    w = Math.max(w + 30, ctx.measureText(L.name || '').width) + 28;
    w = Math.min(Math.max(w, 180), 380);
    const h = 36 + objs.length * 20;
    const x = C.VIEW_W - 12 - w, y = 12;
    panel(x, y, w, h);
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = COL.text;
    ctx.fillText(L.name || '', x + 14, y + 20);
    ctx.fillStyle = COL.edge; ctx.fillRect(x + 14, y + 27, w - 28, 1);
    let firstOpen = true;
    objs.forEach((o, i) => {
      let done = false;
      try { done = Heist.Tasks.check(state, o.done); } catch (e) { done = false; }
      const oy = y + 36 + i * 20;
      const active = !done && firstOpen;
      if (active) firstOpen = false;
      fillRR(ctx, x + 14, oy, 12, 12, 2, done ? COL.exit : 'rgba(255,255,255,0.04)',
        done ? COL.exit : active ? '#e3e9f4' : 'rgba(160,170,190,0.5)', 1.2);
      if (done) {
        ctx.strokeStyle = '#08200f'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(x + 17, oy + 6); ctx.lineTo(x + 19.5, oy + 9); ctx.lineTo(x + 24, oy + 3); ctx.stroke();
      }
      ctx.font = `${active ? 600 : 500} 12px ${FONT}`;
      ctx.fillStyle = done ? 'rgba(61,220,132,0.7)' : active ? COL.text : COL.dim;
      ctx.fillText(o.text || '', x + 34, oy + 10);
      if (done) {
        const tw = ctx.measureText(o.text || '').width;
        ctx.fillStyle = 'rgba(61,220,132,0.5)'; ctx.fillRect(x + 34, oy + 6, tw, 1);
      }
    });
  }

  function drawInventory(state) {
    const keys = state.player.keys ? Array.from(state.player.keys) : [];
    const has = state.player.hasTreasure;
    if (!keys.length && !has) return;
    const w = 24 + Math.max(1, keys.length) * 26 + (has ? 30 : 0) + 6;
    const x = 12, y = C.VIEW_H - 52;
    panel(x, y, Math.max(w, 96), 40);
    ctx.font = `bold 9px ${FONT}`; ctx.fillStyle = COL.dim; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.fillText('INVENTORY', x + 12, y + 13);
    let kx = x + 12;
    for (const k of keys) {
      const col = KEY_COLORS[k] || '#ffffff';
      fillRR(ctx, kx, y + 19, 20, 13, 2, col, 'rgba(255,255,255,0.6)', 1);
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(kx, y + 22, 20, 2);
      fillRR(ctx, kx + 2, y + 26, 5, 4, 0.5, '#e8d38a');
      kx += 26;
    }
    if (has) {
      const dx = kx + 10, dy = y + 26, t = state.time;
      glow(ctx, dx, dy, 14, COL.treasure, 0.4 + 0.15 * Math.sin(t * 5));
      ctx.fillStyle = '#7ff3ff';
      ctx.beginPath(); ctx.moveTo(dx - 7, dy - 2); ctx.lineTo(dx - 4, dy - 6); ctx.lineTo(dx + 4, dy - 6); ctx.lineTo(dx + 7, dy - 2); ctx.lineTo(dx, dy + 7); ctx.closePath(); ctx.fill();
    }
  }

  function drawExitArrow(state) {
    const p = state.player, st = state.level.start;
    if (!p.hasTreasure || state.status !== 'playing' || !st) return;
    const sx = st.x - state.cam.x, sy = st.y - state.cam.y;
    const m = 40;
    if (sx > m && sy > m && sx < C.VIEW_W - m && sy < C.VIEW_H - m) return;
    const cx = C.VIEW_W / 2, cy = C.VIEW_H / 2;
    const ang = Math.atan2(sy - cy, sx - cx);
    const k = Math.min((cx - m) / Math.abs(Math.cos(ang) || 1e-6), (cy - m) / Math.abs(Math.sin(ang) || 1e-6));
    const ax = cx + Math.cos(ang) * k, ay = cy + Math.sin(ang) * k;
    const pulse = 0.6 + 0.4 * Math.sin(state.time * 6);
    ctx.save();
    ctx.translate(ax, ay);
    glow(ctx, 0, 0, 24, COL.exit, 0.3 * pulse);
    ctx.rotate(ang);
    ctx.fillStyle = rgba(COL.exit, 0.6 + 0.4 * pulse);
    ctx.beginPath(); ctx.moveTo(12, 0); ctx.lineTo(-6, -9); ctx.lineTo(-2, 0); ctx.lineTo(-6, 9); ctx.closePath(); ctx.fill();
    ctx.restore();
    ctx.font = `bold 9px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = rgba(COL.exit, 0.9);
    ctx.fillText('EXIT', ax - Math.cos(ang) * 22, ay - Math.sin(ang) * 22);
    ctx.textAlign = 'left';
  }

  function drawTitleCard(state) {
    const t = state.time || 0;
    if (state.status !== 'playing' || t > 2.6) return;
    const a = t < 0.8 ? 1 : clamp01(1 - (t - 0.8) / 1.8);
    if (a <= 0) return;
    const cy = C.VIEW_H * 0.42;
    ctx.globalAlpha = a;
    const gr = ctx.createLinearGradient(0, cy - 60, 0, cy + 60);
    gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.5, 'rgba(0,0,0,0.7)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gr; ctx.fillRect(0, cy - 60, C.VIEW_W, 120);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const n = (Heist.LEVELS || []).length;
    ctx.font = `bold 11px ${FONT}`;
    ctx.fillStyle = COL.dim;
    ctx.fillText(`MISSION ${(state.levelIndex || 0) + 1}${n ? ' / ' + n : ''}`, C.VIEW_W / 2, cy - 26);
    ctx.font = `bold 34px ${FONT}`;
    ctx.fillStyle = '#ffffff';
    ctx.fillText(state.level.name || '', C.VIEW_W / 2, cy + 6 + (1 - a) * -6);
    ctx.fillStyle = rgba(COL.treasure, 0.7);
    ctx.fillRect(C.VIEW_W / 2 - 40, cy + 32, 80, 2);
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';
  }

  function drawOverlay(state) {
    const a = clamp01(endFrames / 24);
    const won = state.status === 'won';
    ctx.fillStyle = `rgba(3,4,8,${0.72 * a})`;
    ctx.fillRect(0, 0, C.VIEW_W, C.VIEW_H);
    ctx.globalAlpha = a;
    const cx = C.VIEW_W / 2, cy = C.VIEW_H / 2 + (1 - a) * 12;
    const w = 440, h = 210;
    const accent = won ? COL.exit : COL.danger;
    fillRR(ctx, cx - w / 2, cy - h / 2, w, h, 10, 'rgba(12,14,20,0.94)', rgba(accent, 0.5), 1.5);
    ctx.fillStyle = accent; ctx.fillRect(cx - w / 2 + 20, cy - h / 2, w - 40, 3);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `bold 11px ${FONT}`; ctx.fillStyle = COL.dim;
    ctx.fillText(won ? 'MISSION SUCCESS' : 'MISSION FAILED', cx, cy - 72);
    ctx.font = `bold 40px ${FONT}`; ctx.fillStyle = accent;
    ctx.fillText(won ? 'HEIST COMPLETE' : 'BUSTED', cx, cy - 40);
    if (!won && state.loseReason) {
      ctx.font = `500 13px ${FONT}`; ctx.fillStyle = '#ffb3b3';
      ctx.fillText(state.loseReason, cx, cy - 8);
    }
    // Stats.
    const time = state.time || 0;
    const mm = Math.floor(time / 60), ss = (time % 60).toFixed(1).padStart(4, '0');
    const stats = [['TIME', `${mm}:${ss}`], ['ALERT', `${Math.floor(state.alert)} / ${state.alertMax}`]];
    stats.forEach(([k, v], i) => {
      const sx = cx + (i ? 80 : -80);
      ctx.font = `bold 9px ${FONT}`; ctx.fillStyle = COL.dim; ctx.fillText(k, sx, cy + 22);
      ctx.font = `bold 20px ${MONO}`; ctx.fillStyle = COL.text; ctx.fillText(v, sx, cy + 42);
    });
    const last = (state.levelIndex || 0) >= (Heist.LEVELS || []).length - 1;
    ctx.font = `600 12px ${FONT}`; ctx.fillStyle = rgba('#ffffff', 0.55 + 0.35 * Math.sin(endFrames / 12));
    ctx.fillText(won ? (last ? 'All missions complete  \u00B7  Enter to play again' : 'Enter for next mission')
      : 'Enter to retry  \u00B7  R restart', cx, cy + 78);
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';
  }

  return { setup, init, draw, KEY_COLORS };
})();
