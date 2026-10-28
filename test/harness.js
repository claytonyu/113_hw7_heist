// Minimal headless test harness. Tests drive the real game with simulated
// key presses and fixed time steps. Results are written into <pre id="out">
// so they can be read with `chrome --headless --dump-dom`.
window.HEIST_NO_AUTOSTART = true;

const T = {
  tests: [],
  add(name, fn) { this.tests.push({ name, fn }); },

  // Start a level by index or id; returns state.
  load(which) {
    const i = typeof which === 'number' ? which : Heist.LEVELS.findIndex((l) => l.id === which);
    if (i < 0) throw new Error('No level ' + which);
    Heist.Game.loadLevel(i);
    return Heist.Game.state;
  },
  key(k, type) { window.dispatchEvent(new KeyboardEvent(type, { key: k })); },
  // Run n seconds of game time at 60 fps.
  run(seconds) {
    const n = Math.round(seconds * 60);
    for (let i = 0; i < n; i++) Heist.Game.step(1 / 60);
  },
  // Hold keys (string or array) for `seconds`, then release.
  hold(keys, seconds) {
    keys = [].concat(keys);
    keys.forEach((k) => this.key(k, 'keydown'));
    this.run(seconds);
    keys.forEach((k) => this.key(k, 'keyup'));
  },
  press(k) { this.key(k, 'keydown'); Heist.Game.step(1 / 60); this.key(k, 'keyup'); },
  // Put the player at the center of tile (tx, ty).
  teleport(tx, ty) {
    const s = Heist.Game.state, S = Heist.CONFIG.TILE;
    s.player.x = (tx + 0.5) * S; s.player.y = (ty + 0.5) * S;
  },
  assert(cond, msg) { if (!cond) throw new Error('Assertion failed: ' + msg); },
};

window.addEventListener('load', () => {
  const canvas = document.getElementById('game');
  Heist.Render.setup(canvas);
  const lines = [];
  let pass = 0, fail = 0;
  for (const t of T.tests) {
    try { t.fn(); pass++; lines.push('PASS ' + t.name); }
    catch (e) { fail++; lines.push('FAIL ' + t.name + '\n     ' + (e.stack || e).toString().split('\n').slice(0, 3).join('\n     ')); }
  }
  lines.unshift(`RESULT ${pass} passed, ${fail} failed`);
  document.getElementById('out').textContent = lines.join('\n');
});
window.addEventListener('error', (e) => {
  const out = document.getElementById('out');
  out.textContent += '\nUNCAUGHT ' + e.message + ' @ ' + e.filename + ':' + e.lineno;
});
