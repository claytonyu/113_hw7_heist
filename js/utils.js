// Geometry helpers shared by security, rendering, and tasks.
Heist.Util = (function () {
  const STEP = 4; // px sampling step for rays

  function dist(ax, ay, bx, by) { return Math.hypot(bx - ax, by - ay); }

  // Wrap angle to (-PI, PI].
  function wrapAngle(a) {
    while (a > Math.PI) a -= 2 * Math.PI;
    while (a <= -Math.PI) a += 2 * Math.PI;
    return a;
  }

  function blockedAt(level, x, y) {
    const TILE = Heist.CONFIG.TILE;
    return Heist.Level.blocksSight(level, Math.floor(x / TILE), Math.floor(y / TILE));
  }

  // True if nothing opaque lies between the two points (main floor).
  function lineOfSight(level, x1, y1, x2, y2) {
    const d = dist(x1, y1, x2, y2);
    const n = Math.ceil(d / STEP);
    for (let i = 1; i < n; i++) {
      const t = i / n;
      if (blockedAt(level, x1 + (x2 - x1) * t, y1 + (y2 - y1) * t)) return false;
    }
    return true;
  }

  // Distance a ray travels from (x,y) at `angle` before hitting an opaque tile,
  // capped at maxDist. Used to clip vision cones against walls.
  function castRay(level, x, y, angle, maxDist) {
    const dx = Math.cos(angle), dy = Math.sin(angle);
    for (let d = STEP; d < maxDist; d += STEP) {
      if (blockedAt(level, x + dx * d, y + dy * d)) return d;
    }
    return maxDist;
  }

  // Is point (px,py) inside a cone at (ox,oy) facing `facing` with total
  // angular width `fov` (radians) and radius `range`, with clear LOS?
  function inCone(level, ox, oy, facing, fov, range, px, py) {
    if (dist(ox, oy, px, py) > range) return false;
    const a = Math.atan2(py - oy, px - ox);
    if (Math.abs(wrapAngle(a - facing)) > fov / 2) return false;
    return lineOfSight(level, ox, oy, px, py);
  }

  // Distance from point to segment.
  function distToSegment(px, py, x1, y1, x2, y2) {
    const vx = x2 - x1, vy = y2 - y1;
    const len2 = vx * vx + vy * vy || 1;
    let t = ((px - x1) * vx + (py - y1) * vy) / len2;
    t = Math.max(0, Math.min(1, t));
    return dist(px, py, x1 + vx * t, y1 + vy * t);
  }

  const deg = (d) => (d * Math.PI) / 180;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  return { dist, wrapAngle, lineOfSight, castRay, inCone, distToSegment, deg, clamp };
})();
