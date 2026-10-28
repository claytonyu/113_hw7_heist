// Level registry + parser. Turns a hand-written level definition into the
// runtime structure every other system reads from (`state.level`).
//
// See js/levels/README.md for the level file format.
Heist.LEVELS = [];
Heist.registerLevel = function (def) { Heist.LEVELS.push(def); };

Heist.Level = (function () {
  const T = Heist.TILES;
  const key = (tx, ty) => tx + ',' + ty;
  const clone = (o) => JSON.parse(JSON.stringify(o || []));

  function parse(def) {
    const TILE = Heist.CONFIG.TILE;
    const rows = def.map;
    const h = rows.length;
    const w = Math.max(...rows.map((r) => r.length));
    const tiles = [];
    let start = null, treasure = null;
    const ventOpenings = [];

    for (let ty = 0; ty < h; ty++) {
      const row = [];
      for (let tx = 0; tx < w; tx++) {
        const c = rows[ty][tx] || T.VOID;
        row.push(c);
        if (c === T.START) start = { tx, ty, x: (tx + 0.5) * TILE, y: (ty + 0.5) * TILE };
        if (c === T.TREASURE) treasure = { tx, ty, x: (tx + 0.5) * TILE, y: (ty + 0.5) * TILE, taken: false };
        if (c === T.VENT) ventOpenings.push({ tx, ty });
      }
      tiles.push(row);
    }
    if (!start) throw new Error(`Level ${def.id}: no start tile 'S'`);
    if (!treasure) throw new Error(`Level ${def.id}: no treasure tile 'T'`);

    // Vent layer (optional). Must have the same dimensions as the main map.
    let ventTiles = null;
    if (def.ventMap) {
      ventTiles = [];
      for (let ty = 0; ty < h; ty++) {
        const row = [];
        for (let tx = 0; tx < w; tx++) row.push((def.ventMap[ty] || '')[tx] || ' ');
        ventTiles.push(row);
      }
    }

    // Doors: every 'D' tile must have a matching entry in def.doors (by tx,ty).
    const doorDefs = {};
    (def.doors || []).forEach((d) => { doorDefs[key(d.x, d.y)] = d; });
    const doors = [];
    const doorAt = {};
    for (let ty = 0; ty < h; ty++) for (let tx = 0; tx < w; tx++) {
      if (tiles[ty][tx] !== T.DOOR) continue;
      const d = doorDefs[key(tx, ty)] || {};
      const door = {
        id: d.id || `door_${tx}_${ty}`,
        tx, ty,
        x: (tx + 0.5) * TILE, y: (ty + 0.5) * TILE,
        requires: d.requires || null,   // null | 'key:<color>' | 'flag:<name>'
        locked: !!d.requires,
        label: d.label || null,
      };
      doors.push(door);
      doorAt[key(tx, ty)] = door;
    }

    const level = {
      def, id: def.id, name: def.name || def.id,
      w, h, tiles, ventTiles, ventOpenings,
      start, treasure, doors, doorAt,
      alertMax: def.alertMax || Heist.CONFIG.ALERT_MAX,
      objectives: clone(def.objectives),
      items: clone(def.items).map((it) => ({ ...it, taken: false })),
      computers: clone(def.computers).map((c) => ({ ...c, hacked: false, progress: 0 })),
      cameras: clone(def.cameras),
      guards: clone(def.guards),
      lasers: clone(def.lasers),
      decor: clone(def.decor),
    };
    computeRegions(level);
    return level;
  }

  // Flood-fill walkable tiles into regions, using doors as boundaries.
  // regionOf[ty][tx] = region id, or -1 for walls/void/doors.
  function computeRegions(level) {
    const { w, h, tiles } = level;
    const regionOf = [];
    for (let ty = 0; ty < h; ty++) regionOf.push(new Array(w).fill(-1));
    let next = 0;
    for (let sy = 0; sy < h; sy++) for (let sx = 0; sx < w; sx++) {
      if (regionOf[sy][sx] !== -1 || !isFloorChar(tiles[sy][sx])) continue;
      const id = next++;
      const stack = [[sx, sy]];
      regionOf[sy][sx] = id;
      while (stack.length) {
        const [x, y] = stack.pop();
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          if (regionOf[ny][nx] !== -1 || !isFloorChar(tiles[ny][nx])) continue;
          regionOf[ny][nx] = id;
          stack.push([nx, ny]);
        }
      }
    }
    const regionDoors = Array.from({ length: next }, () => []);
    for (const door of level.doors) {
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const r = (regionOf[door.ty + dy] || [])[door.tx + dx];
        if (r !== undefined && r >= 0 && !regionDoors[r].includes(door)) regionDoors[r].push(door);
      }
    }
    level.regionOf = regionOf;
    level.regionDoors = regionDoors;
    level.regionCount = next;
  }

  function isFloorChar(c) {
    return c === T.FLOOR || c === T.START || c === T.TREASURE || c === T.VENT;
  }

  function tileAt(level, tx, ty) {
    if (tx < 0 || ty < 0 || tx >= level.w || ty >= level.h) return T.VOID;
    return level.tiles[ty][tx];
  }

  // Solid for movement on the main floor.
  function isSolid(level, tx, ty) {
    const c = tileAt(level, tx, ty);
    if (c === T.WALL || c === T.VOID) return true;
    if (c === T.DOOR) return level.doorAt[key(tx, ty)].locked;
    return false;
  }

  // Blocks line of sight (cameras, guards, fog). Same as solid for now.
  function blocksSight(level, tx, ty) { return isSolid(level, tx, ty); }

  function isVentWalkable(level, tx, ty) {
    if (!level.ventTiles) return false;
    if (tx < 0 || ty < 0 || tx >= level.w || ty >= level.h) return false;
    const c = level.ventTiles[ty][tx];
    return c === Heist.VENT_TILES.DUCT || c === Heist.VENT_TILES.OPENING;
  }

  function regionAt(level, x, y) {
    const TILE = Heist.CONFIG.TILE;
    const r = level.regionOf[Math.floor(y / TILE)];
    return r ? (r[Math.floor(x / TILE)] ?? -1) : -1;
  }

  // A region is hidden ("can't see into locked rooms") when the player is not
  // inside it and every door bordering it is still locked.
  function isRegionHidden(level, region, playerRegion) {
    if (region < 0 || region === playerRegion) return false;
    const ds = level.regionDoors[region];
    return ds.length > 0 && ds.every((d) => d.locked);
  }

  return { parse, tileAt, isSolid, blocksSight, isVentWalkable, regionAt, isRegionHidden, key };
})();
