// Player creation, WASD movement, tile collision for both layers.
Heist.Player = (function () {
  const C = Heist.CONFIG;

  function create(level) {
    return {
      x: level.start.x, y: level.start.y,
      r: C.PLAYER_RADIUS,
      facing: 0,             // radians, last movement direction
      moving: false,
      layer: 'main',         // 'main' | 'vent'
      keys: new Set(),       // keycard colors held
      hasTreasure: false,
      stealth: false,        // reserved for Stealth Mode powerup
    };
  }

  // Can a circle of radius r centered at (x,y) stand here on `layer`?
  // Approximates the circle with its bounding box corners + edge midpoints.
  function canOccupy(state, x, y, layer, r) {
    const level = state.level;
    const rr = r - 0.5;
    const pts = [
      [x - rr, y - rr], [x + rr, y - rr], [x - rr, y + rr], [x + rr, y + rr],
      [x, y - rr], [x, y + rr], [x - rr, y], [x + rr, y],
    ];
    for (const [px, py] of pts) {
      const tx = Math.floor(px / C.TILE), ty = Math.floor(py / C.TILE);
      if (layer === 'vent') { if (!Heist.Level.isVentWalkable(level, tx, ty)) return false; }
      else if (Heist.Level.isSolid(level, tx, ty)) return false;
    }
    return true;
  }

  function update(state, dt) {
    const p = state.player;
    const I = Heist.Input;
    let dx = 0, dy = 0;
    if (I.isDown('w') || I.isDown('ArrowUp')) dy -= 1;
    if (I.isDown('s') || I.isDown('ArrowDown')) dy += 1;
    if (I.isDown('a') || I.isDown('ArrowLeft')) dx -= 1;
    if (I.isDown('d') || I.isDown('ArrowRight')) dx += 1;
    p.moving = dx !== 0 || dy !== 0;
    if (!p.moving) return;

    const len = Math.hypot(dx, dy);
    dx /= len; dy /= len;
    p.facing = Math.atan2(dy, dx);
    const speed = p.layer === 'vent' ? C.VENT_SPEED : C.PLAYER_SPEED;
    // In vents the player is smaller (crawling) so 1-tile ducts are comfortable.
    const r = p.layer === 'vent' ? p.r * 0.8 : p.r;

    // Axis-separated movement gives wall sliding for free.
    const nx = p.x + dx * speed * dt;
    if (canOccupy(state, nx, p.y, p.layer, r)) p.x = nx;
    const ny = p.y + dy * speed * dt;
    if (canOccupy(state, p.x, ny, p.layer, r)) p.y = ny;
  }

  // Security systems call this before counting a sighting.
  function isDetectable(state) {
    const p = state.player;
    return p.layer === 'main' && !p.stealth;
  }

  return { create, update, canOccupy, isDetectable };
})();
