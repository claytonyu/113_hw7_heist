// Level design tests: static validation + solvability for every real level
// (ids l1, l2, l3, ...). Fixture levels from other test files are ignored.
(function () {
  const FLOOR = new Set(['.', 'S', 'T', 'v']);
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const MAX_VENT_RUN = 18;
  const realLevels = () => Heist.LEVELS.filter((l) => /^l\d+$/.test(l.id));
  const k = (x, y) => x + ',' + y;

  function charAt(def, x, y) {
    const r = def.map[y];
    return r === undefined ? ' ' : (r[x] || ' ');
  }
  function ventAt(def, x, y) {
    if (!def.ventMap) return ' ';
    const r = def.ventMap[y];
    return r === undefined ? ' ' : (r[x] || ' ');
  }
  const isVentWalk = (c) => c === '=' || c === 'O';
  function doorDef(def, x, y) { return (def.doors || []).find((d) => d.x === x && d.y === y); }
  function inBounds(def, x, y) {
    return Number.isInteger(x) && Number.isInteger(y) && y >= 0 && y < def.map.length && x >= 0 && x < def.map[0].length;
  }
  function segTiles(x1, y1, x2, y2) {
    const out = [];
    const dx = Math.sign(x2 - x1), dy = Math.sign(y2 - y1);
    let x = x1, y = y1;
    out.push([x, y]);
    while (x !== x2 || y !== y2) { x += dx; y += dy; out.push([x, y]); }
    return out;
  }

  // What keys/flags can this level hand out at all?
  function provided(def) {
    const p = new Set(['treasure', 'escape']);
    (def.items || []).forEach((it) => {
      if (it.type === 'keycard') p.add('key:' + it.color);
      if (it.sets) p.add('flag:' + it.sets);
    });
    (def.computers || []).forEach((c) => c.sets && p.add('flag:' + c.sets));
    return p;
  }

  // Vent graph: from opening (x,y), BFS distance to every other opening.
  function ventDistances(def, sx, sy) {
    const dist = new Map([[k(sx, sy), 0]]);
    const q = [[sx, sy]];
    const found = [];
    while (q.length) {
      const [x, y] = q.shift();
      const d = dist.get(k(x, y));
      if ((x !== sx || y !== sy) && ventAt(def, x, y) === 'O') found.push({ x, y, d });
      for (const [dx, dy] of DIRS) {
        const nx = x + dx, ny = y + dy;
        if (dist.has(k(nx, ny)) || !isVentWalk(ventAt(def, nx, ny))) continue;
        dist.set(k(nx, ny), d + 1);
        q.push([nx, ny]);
      }
    }
    return found;
  }

  // ---------- Progression solver ----------
  // BFS over the main floor. Locked doors are solid until their requirement
  // is met; static lasers (period 0) block their tiles until disabled;
  // blinking lasers are passable (they have a timing window). Vent openings
  // connected by ducts let the player jump between their 'v' tiles.
  // `banned` = requirement strings that may never be granted (for necessity tests).
  function makeSolver(def, banned) {
    banned = banned || new Set();
    const have = new Set();
    const check = (req) => !req || have.has(req);
    const laserTiles = (def.lasers || []).filter((l) => !(l.period > 0)).map((l) => ({
      l, tiles: new Set(segTiles(l.x1, l.y1, l.x2, l.y2).map(([x, y]) => k(x, y))),
    }));
    function passable(x, y) {
      const c = charAt(def, x, y);
      if (c === 'D') { const d = doorDef(def, x, y); if (d && d.requires && !check(d.requires)) return false; }
      else if (!FLOOR.has(c)) return false;
      for (const lt of laserTiles) if (lt.tiles.has(k(x, y)) && !check(lt.l.disabledBy)) return false;
      return true;
    }
    function reach(sx, sy) {
      const seen = new Set([k(sx, sy)]);
      const q = [[sx, sy]];
      while (q.length) {
        const [x, y] = q.shift();
        const nbrs = DIRS.map(([dx, dy]) => [x + dx, y + dy]);
        if (charAt(def, x, y) === 'v' && ventAt(def, x, y) === 'O') {
          ventDistances(def, x, y).forEach((o) => nbrs.push([o.x, o.y]));
        }
        for (const [nx, ny] of nbrs) {
          if (seen.has(k(nx, ny)) || !passable(nx, ny)) continue;
          seen.add(k(nx, ny));
          q.push([nx, ny]);
        }
      }
      return seen;
    }
    function grant(req, log, what) {
      if (!req || have.has(req) || banned.has(req)) return false;
      have.add(req); log.push({ req, ...what });
      return true;
    }
    // Iterate to a fixpoint from the start tile.
    function run() {
      const S = findChar(def, 'S'), Tt = findChar(def, 'T');
      const log = [];
      let r;
      for (let guard = 0; guard < 100; guard++) {
        r = reach(S.x, S.y);
        let changed = false;
        for (const it of def.items || []) {
          if (!r.has(k(it.x, it.y))) continue;
          if (it.type === 'keycard') changed = grant('key:' + it.color, log, { kind: 'item', x: it.x, y: it.y }) || changed;
          if (it.sets) changed = grant('flag:' + it.sets, log, { kind: 'item', x: it.x, y: it.y }) || changed;
        }
        for (const c of def.computers || []) {
          const spot = [[c.x, c.y], ...DIRS.map(([dx, dy]) => [c.x + dx, c.y + dy])].find(([x, y]) => r.has(k(x, y)));
          if (!spot || !check(c.requires)) continue;
          changed = grant('flag:' + c.sets, log, { kind: 'computer', x: c.x, y: c.y, sx: spot[0], sy: spot[1], c }) || changed;
        }
        if (!changed) break;
      }
      const treasure = r.has(k(Tt.x, Tt.y));
      if (treasure) have.add('treasure');
      const back = treasure && reach(Tt.x, Tt.y).has(k(S.x, S.y));
      return { treasure, back, log, have };
    }
    return { run, reach, have };
  }

  function findChar(def, ch) {
    for (let y = 0; y < def.map.length; y++) {
      const x = def.map[y].indexOf(ch);
      if (x >= 0) return { x, y };
    }
    return null;
  }

  // ---------- Static validation ----------
  function validate(def) {
    const errs = [];
    const E = (m) => errs.push(m);
    const W = def.map[0].length, H = def.map.length;

    def.map.forEach((r, y) => { if (r.length !== W) E(`map row ${y} length ${r.length} != ${W}`); });
    let sCount = 0, tCount = 0;
    def.map.forEach((r) => { for (const c of r) { if (c === 'S') sCount++; if (c === 'T') tCount++; } });
    if (sCount !== 1) E(`expected one S, got ${sCount}`);
    if (tCount !== 1) E(`expected one T, got ${tCount}`);
    def.map.forEach((r, y) => [...r].forEach((c, x) => {
      if (!'#. STDv'.includes(c)) E(`bad map char '${c}' at ${x},${y}`);
    }));

    // Doors
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (charAt(def, x, y) === 'D' && !doorDef(def, x, y)) E(`D at ${x},${y} has no doors entry`);
    }
    (def.doors || []).forEach((d) => {
      if (charAt(def, d.x, d.y) !== 'D') E(`door entry ${d.x},${d.y} not on a D`);
      // Doors sit in a 1-tile gap: walls on one axis, walkable on the other.
      const wallH = !FLOOR.has(charAt(def, d.x - 1, d.y)) && !FLOOR.has(charAt(def, d.x + 1, d.y));
      const wallV = !FLOOR.has(charAt(def, d.x, d.y - 1)) && !FLOOR.has(charAt(def, d.x, d.y + 1));
      const openV = FLOOR.has(charAt(def, d.x, d.y - 1)) && FLOOR.has(charAt(def, d.x, d.y + 1));
      const openH = FLOOR.has(charAt(def, d.x - 1, d.y)) && FLOOR.has(charAt(def, d.x + 1, d.y));
      if (!((wallH && openV) || (wallV && openH))) E(`door ${d.x},${d.y} is not in a 1-tile wall gap`);
    });

    // Vents
    if (def.ventMap) {
      if (def.ventMap.length !== H) E(`ventMap has ${def.ventMap.length} rows, map has ${H}`);
      def.ventMap.forEach((r, y) => { if (r.length > W) E(`ventMap row ${y} too wide`); });
    }
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const m = charAt(def, x, y), v = ventAt(def, x, y);
      if (v === 'O' && m !== 'v') E(`vent opening ${x},${y} not over a 'v' tile`);
      if (m === 'v' && v !== 'O') E(`'v' tile ${x},${y} has no vent opening above`);
      if (v === 'O') {
        const others = ventDistances(def, x, y);
        if (!others.length) E(`vent opening ${x},${y} leads nowhere`);
        else {
          const near = Math.min(...others.map((o) => o.d));
          if (near > MAX_VENT_RUN) E(`vent run from ${x},${y} is ${near} tiles (> ${MAX_VENT_RUN})`);
        }
      }
    }

    // Entities in bounds / on floor
    const onFloor = (o, what) => {
      if (!inBounds(def, o.x, o.y)) E(`${what} at ${o.x},${o.y} out of bounds`);
      else if (!FLOOR.has(charAt(def, o.x, o.y))) E(`${what} at ${o.x},${o.y} not on floor`);
    };
    (def.items || []).forEach((it) => onFloor(it, 'item'));
    (def.computers || []).forEach((c) => onFloor(c, 'computer'));
    (def.cameras || []).forEach((c) => onFloor(c, 'camera'));
    (def.decor || []).forEach((d) => {
      const w = d.w || 1, h = d.h || 1;
      if (!inBounds(def, d.x, d.y) || !inBounds(def, d.x + w - 1, d.y + h - 1)) E(`decor ${d.type} at ${d.x},${d.y} out of bounds`);
    });
    // Nothing interactive stacked on the same tile.
    const occupied = new Map();
    [...(def.items || []), ...(def.computers || [])].forEach((o) => {
      const key = k(o.x, o.y);
      if (occupied.has(key)) E(`two items/computers on ${key}`);
      occupied.set(key, o);
    });
    const Tp = findChar(def, 'T'), Sp = findChar(def, 'S');
    if (Tp && occupied.has(k(Tp.x, Tp.y))) E('item on treasure tile');
    if (Sp && occupied.has(k(Sp.x, Sp.y))) E('item on start tile');

    // Guards: axis-aligned segments over walkable, never-locked tiles.
    const guardOk = (x, y) => {
      const c = charAt(def, x, y);
      if (c === 'D') { const d = doorDef(def, x, y); return !(d && d.requires); }
      return FLOOR.has(c);
    };
    (def.guards || []).forEach((g, gi) => {
      if (!g.path || g.path.length < 2) { E(`guard ${gi} path too short`); return; }
      const pts = g.path.slice();
      if (g.loop) pts.push(pts[0]);
      for (let i = 0; i + 1 < pts.length; i++) {
        const [x1, y1] = pts[i], [x2, y2] = pts[i + 1];
        if (x1 !== x2 && y1 !== y2) { E(`guard ${gi} segment ${i} not axis-aligned`); continue; }
        segTiles(x1, y1, x2, y2).forEach(([x, y]) => { if (!guardOk(x, y)) E(`guard ${gi} walks over ${x},${y} ('${charAt(def, x, y)}')`); });
      }
      if (!(g.speed > 0)) E(`guard ${gi} needs speed > 0`);
    });

    // Lasers: axis-aligned, endpoints and whole beam over floor.
    (def.lasers || []).forEach((l, li) => {
      if (l.x1 !== l.x2 && l.y1 !== l.y2) { E(`laser ${li} not axis-aligned`); return; }
      segTiles(l.x1, l.y1, l.x2, l.y2).forEach(([x, y]) => { if (!FLOOR.has(charAt(def, x, y))) E(`laser ${li} crosses non-floor ${x},${y}`); });
      if (l.period > 0) {
        if (l.period < 2) E(`laser ${li} blinks too fast (period ${l.period})`);
        if (!(l.onTime > 0) || l.onTime > 0.6 * l.period) E(`laser ${li} onTime ${l.onTime} not in (0, 60% of period]`);
      }
    });

    // Requirement strings reference something obtainable.
    const prov = provided(def);
    const reqs = [];
    (def.doors || []).forEach((d) => d.requires && reqs.push(['door', d.requires]));
    (def.computers || []).forEach((c) => c.requires && reqs.push(['computer', c.requires]));
    (def.objectives || []).forEach((o) => reqs.push(['objective', o.done]));
    ['cameras', 'lasers', 'guards'].forEach((n) => (def[n] || []).forEach((o) => o.disabledBy && reqs.push([n, o.disabledBy])));
    reqs.forEach(([what, r]) => { if (!/^(key|flag):\w+$|^treasure$|^escape$/.test(r)) E(`${what} requirement '${r}' malformed`); else if (!prov.has(r)) E(`${what} requirement '${r}' is never provided`); });
    (def.computers || []).forEach((c) => { if (!c.sets) E(`computer at ${c.x},${c.y} sets nothing`); });

    return errs;
  }

  // ---------- Engine-driven route checks (real security + vents) ----------
  const TILE = () => Heist.CONFIG.TILE;
  const tileX = (s) => Math.floor(s.player.x / TILE());
  const tileY = (s) => Math.floor(s.player.y / TILE());
  // Wait until laser `i` has just switched off (start of its off window).
  function waitFreshOff(s, i) {
    const l = s.security.lasers[i];
    for (let n = 0; n < 600 && l.on === false; n++) T.run(1 / 60);
    for (let n = 0; n < 600 && l.on !== false; n++) T.run(1 / 60);
  }
  function laserIndex(def, x1, y1) { return def.lasers.findIndex((l) => l.x1 === x1 && l.y1 === y1); }

  T.add('levels l1 route: west corridor laser leaves a walkable bottom lane', () => {
    const s = T.load('l1');
    s.alertMax = 1e9;
    T.teleport(10, 13);
    T.hold('a', 2);
    T.assert(s.status === 'playing', 'lost: ' + s.loseReason);
    T.assert(tileX(s) <= 2, 'reached the west end, x=' + tileX(s));
    T.teleport(10, 12);
    T.hold('a', 1.5);
    T.assert(s.status === 'lost', 'middle lane trips the laser');
  });

  T.add('levels l2 route: executive corridor lasers block until the grid is hacked', () => {
    let s = T.load('l2');
    s.alertMax = 1e9;
    T.teleport(15, 10);
    T.hold('w', 1);
    T.assert(s.status === 'lost', 'laser grid trips before hacking');
    s = T.load('l2');
    s.alertMax = 1e9;
    s.flags.add('grid_off');
    s.player.keys.add('green');
    T.teleport(15, 10);
    T.hold('w', 1.5);
    T.assert(s.status === 'playing', 'lost: ' + s.loseReason);
    T.assert(tileY(s) <= 5, 'walked through the green door into the office, y=' + tileY(s));
  });

  T.add('levels l2 route: laser gallery is passable using the blink windows', () => {
    const def = Heist.LEVELS.find((l) => l.id === 'l2');
    const s = T.load('l2');
    s.alertMax = 1e9;  // ignore cameras/guards; this checks lasers only
    T.teleport(34, 20);
    waitFreshOff(s, laserIndex(def, 33, 19));
    T.hold('w', 0.55);                         // to rows 17-18, right lane
    T.assert(s.status === 'playing' && tileY(s) >= 17 && tileY(s) <= 18 && tileX(s) === 34, `after beam 19 at ${tileX(s)},${tileY(s)} ${s.loseReason}`);
    waitFreshOff(s, laserIndex(def, 33, 16));
    T.hold('w', 0.45);                         // to row 15
    T.hold('a', 0.3);                          // switch to the left lane
    T.hold('w', 0.3);                          // rows 13-14, left lane
    T.assert(s.status === 'playing' && tileX(s) === 33 && tileY(s) >= 13 && tileY(s) <= 14, `after beam 16 at ${tileX(s)},${tileY(s)} ${s.loseReason}`);
    waitFreshOff(s, laserIndex(def, 33, 12));
    T.hold('w', 0.6);                          // rows 10-11
    T.assert(s.status === 'playing' && tileY(s) <= 11, `after beam 12 at ${tileX(s)},${tileY(s)} ${s.loseReason}`);
  });

  T.add('levels l2 route: executive office vent reaches Vault Control well before overheating', () => {
    const s = T.load('l2');
    s.player.stealth = true;
    T.teleport(19, 2); T.run(0.05);
    T.press('q'); T.run(0.4);
    T.assert(s.player.layer === 'vent', 'climbed in');
    T.hold('d', 2.2);
    T.hold('s', 0.9);
    T.press('e'); T.run(0.3);
    T.assert(s.player.layer === 'main', 'dropped out');
    T.assert(tileX(s) === 24 && tileY(s) === 4, `landed in Vault Control at ${tileX(s)},${tileY(s)}`);
    T.assert(s.temp < s.tempMax * 0.6, 'temperature stayed low: ' + s.temp.toFixed(1));
    T.assert(s.status === 'playing', 'still playing');
  });

  if (Heist.LEVELS.some((l) => l.id === 'l3')) {
    T.add('levels l3 route: antechamber curtains can be crossed in their off windows', () => {
      const def = Heist.LEVELS.find((l) => l.id === 'l3');
      const s = T.load('l3');
      s.alertMax = 1e9;
      T.teleport(18, 14);
      const at = (msg) => `${msg} at ${tileX(s)},${tileY(s)} ${s.loseReason}`;
      waitFreshOff(s, laserIndex(def, 16, 11)); T.hold('a', 0.8);
      T.assert(s.status === 'playing' && tileX(s) <= 15, at('west of curtain 16'));
      waitFreshOff(s, laserIndex(def, 16, 11)); T.hold('d', 0.65);
      T.assert(s.status === 'playing' && tileX(s) >= 17 && tileX(s) <= 19, at('back east of 16'));
      waitFreshOff(s, laserIndex(def, 20, 11)); T.hold('d', 0.8);
      T.assert(s.status === 'playing' && tileX(s) >= 21 && tileX(s) <= 22, at('east of 20'));
      waitFreshOff(s, laserIndex(def, 23, 11)); T.hold('d', 0.6);
      T.assert(s.status === 'playing' && tileX(s) === 24, at('east of 23'));
    });

    T.add('levels l3 route: annex vent reaches the time-lock room', () => {
      const s = T.load('l3');
      s.player.stealth = true;
      T.teleport(17, 2); T.run(0.05);
      T.press('q'); T.run(0.4);
      T.hold('d', 2.2); T.hold('s', 0.9);
      T.press('e'); T.run(0.3);
      T.assert(s.player.layer === 'main' && tileX(s) === 22 && tileY(s) === 4, `landed at ${tileX(s)},${tileY(s)}`);
      T.assert(s.temp < s.tempMax * 0.6, 'temperature ' + s.temp.toFixed(1));
    });
  }

  // ---------- Tests ----------
  T.add('levels: validator and solver catch broken levels', () => {
    const bad = {
      id: 'bad',
      map: [
        '##########',
        '#S..D...T#',
        '#..v#......',
        '##########',
      ],
      ventMap: ['', '', '   O', ''],
      doors: [{ x: 4, y: 1, requires: 'key:red' }, { x: 6, y: 2 }],
      items: [{ type: 'keycard', x: 4, y: 0, color: 'blue' }],
      guards: [{ path: [[1, 1], [8, 2]], speed: 1 }, { path: [[1, 2], [8, 2]], speed: 1 }],
      lasers: [{ x1: 2, y1: 1, x2: 2, y2: 2, period: 1, onTime: 0.9 }],
      objectives: [{ text: 'x', done: 'flag:nope' }],
    };
    const errs = validate(bad).join('\n');
    ['row 2 length', 'door entry 6,2', 'leads nowhere', 'not on floor', 'not axis-aligned',
      'walks over 4,2', 'blinks too fast', "'key:red' is never provided", "'flag:nope' is never provided"]
      .forEach((m) => T.assert(errs.includes(m), `expected error containing "${m}", got: ${errs.replace(/\n/g, ' | ')}`));
    T.assert(!makeSolver(bad).run().treasure, 'solver: red door with no red key is unsolvable');
  });

  T.add('levels: real levels l1 and l2 are registered in order', () => {
    const ids = realLevels().map((l) => l.id);
    T.assert(ids[0] === 'l1' && ids[1] === 'l2', 'got ' + ids.join(','));
    T.assert(!Heist.LEVELS.find((l) => l.id === 'l1').ventMap, 'level 1 has no vents');
    T.assert(!Heist.LEVELS.find((l) => l.id === 'l1').map.some((r) => r.includes('v')), 'level 1 has no vent tiles');
    T.assert(Heist.LEVELS.find((l) => l.id === 'l2').ventMap, 'level 2 has vents');
  });

  realLevels().forEach((def) => {
    T.add(`levels ${def.id}: static validation`, () => {
      const errs = validate(def);
      T.assert(errs.length === 0, errs.length + ' problems: ' + errs.join(' | '));
    });

    T.add(`levels ${def.id}: parses; locked rooms and the vault are fogged at start`, () => {
      const s = T.load(def.id);
      const L = s.level;
      const sr = L.regionOf[L.start.ty][L.start.tx];
      const tr = L.regionOf[L.treasure.ty][L.treasure.tx];
      T.assert(tr !== sr, 'treasure not in the start region');
      T.assert(Heist.Level.isRegionHidden(L, tr, sr), 'treasure room hidden at start');
      // Each locked door must close off a fully enclosed (hidden) room.
      L.doors.filter((d) => d.locked).forEach((d) => {
        const adj = DIRS.map(([dx, dy]) => (L.regionOf[d.ty + dy] || [])[d.tx + dx]).filter((r) => r >= 0);
        T.assert(adj.some((r) => Heist.Level.isRegionHidden(L, r, sr)), `locked door ${d.tx},${d.ty} does not seal a room`);
      });
      T.assert(s.level.objectives.length >= 3, 'has objectives');
      T.assert(s.level.objectives[s.level.objectives.length - 1].done === 'escape', 'last objective is escape');
    });

    T.add(`levels ${def.id}: treasure is NOT reachable at the start`, () => {
      const sv = makeSolver(def);
      const S = findChar(def, 'S'), Tt = findChar(def, 'T');
      T.assert(!sv.reach(S.x, S.y).has(k(Tt.x, Tt.y)), 'treasure reachable with no tasks done');
    });

    T.add(`levels ${def.id}: solvable (treasure reachable, then back to start)`, () => {
      const res = makeSolver(def).run();
      T.assert(res.treasure, 'treasure unreachable; got ' + res.log.map((l) => l.req).join(', '));
      T.assert(res.back, 'cannot return to start from the treasure');
      (def.objectives || []).forEach((o) => {
        if (o.done !== 'escape') T.assert(res.have.has(o.done), `objective '${o.text}' (${o.done}) unattainable`);
      });
    });

    T.add(`levels ${def.id}: every objective task is required for the treasure`, () => {
      (def.objectives || []).forEach((o) => {
        if (o.done === 'treasure' || o.done === 'escape') return;
        const res = makeSolver(def, new Set([o.done])).run();
        T.assert(!res.treasure, `treasure reachable without '${o.done}'`);
      });
    });

    T.add(`levels ${def.id}: standing at the start is safe`, () => {
      const s = T.load(def.id);
      T.run(30);
      T.assert(s.status === 'playing', 'status ' + s.status + ' (' + s.loseReason + ')');
      T.assert(s.alert === 0, 'alert rose to ' + s.alert + ' while idle at start');
    });

    // Drive the real task system: visit each pickup/computer in solver order.
    T.add(`levels ${def.id}: scripted playthrough with real tasks wins`, () => {
      const res = makeSolver(def).run();
      const s = T.load(def.id);
      s.player.stealth = true;  // isolate task logic from security
      for (const step of res.log) {
        if (step.kind === 'item') { T.teleport(step.x, step.y); T.run(0.05); }
        else {
          T.teleport(step.sx, step.sy);
          T.hold('f', (step.c.hackTime || Heist.CONFIG.INTERACT_TIME) + 0.3);
        }
        T.assert(Heist.Tasks.check(s, step.req), `did not get ${step.req} at ${step.x},${step.y}`);
        // Key doors unlock on touch: brush every door this key opens.
        if (step.req.startsWith('key:')) {
          s.level.doors.filter((d) => d.requires === step.req).forEach((d) => {
            const n = DIRS.map(([dx, dy]) => [d.tx + dx, d.ty + dy]).find(([x, y]) => FLOOR.has(charAt(def, x, y)) && s.level.regionOf[y][x] >= 0);
            T.teleport(n[0], n[1]); T.run(0.05);
            T.assert(!d.locked, `door ${d.tx},${d.ty} did not unlock with ${step.req}`);
          });
        }
      }
      s.level.doors.forEach((d) => T.assert(!d.locked, `door ${d.label || d.id} still locked at the end`));
      T.teleport(s.level.treasure.tx, s.level.treasure.ty); T.run(0.05);
      T.assert(s.player.hasTreasure, 'picked up treasure');
      T.teleport(s.level.start.tx, s.level.start.ty); T.run(0.05);
      T.assert(s.status === 'won', 'won, status ' + s.status);
    });
  });
})();
