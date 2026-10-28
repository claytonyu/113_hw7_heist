// Game state, main loop, win/lose, level switching.
//
// Per-frame order:
//   Player.update -> Vents.update -> Tasks.update -> Security.update
//   Render.draw (which calls Security.draw / Vents.draw at the right layers)
Heist.Game = (function () {
  const C = Heist.CONFIG;
  let state = null;
  let levelIndex = 0;
  let last = 0;

  function loadLevel(i) {
    levelIndex = i;
    const level = Heist.Level.parse(Heist.LEVELS[i]);
    state = {
      level,
      levelIndex: i,
      player: Heist.Player.create(level),
      alert: 0,
      alertMax: level.alertMax,
      temp: 0,
      tempMax: C.TEMP_MAX,
      flags: new Set(),
      status: 'playing',      // 'playing' | 'won' | 'lost'
      loseReason: '',
      time: 0,
      toasts: [],             // { text, t }
      hint: null,             // one-line contextual prompt, reset each frame
      interact: null,         // { target, progress } while hacking
      cam: { x: 0, y: 0 },
      shake: 0,               // screen shake amount (px), decays
      flash: 0,               // red flash 0..1, decays
    };
    Heist.state = state;
    Heist.Vents.init(state);
    Heist.Security.init(state);
    Heist.Render.init(state);
    updateCamera(true);
  }

  // ---- API used by other systems ----
  function addAlert(amount) {
    if (state.status !== 'playing' || amount <= 0) return;
    state.alert = Math.min(state.alertMax, state.alert + amount);
    state.flash = Math.max(state.flash, 0.35);
    if (state.alert >= state.alertMax) lose('Security alert maxed out');
  }
  function maxAlert(reason) {
    if (state.status !== 'playing') return;
    state.alert = state.alertMax;
    state.shake = 10;
    state.flash = 1;
    lose(reason);
  }
  function lose(reason) {
    if (state.status !== 'playing') return;
    state.status = 'lost';
    state.loseReason = reason;
    sfx('lose');
  }
  function win() {
    if (state.status !== 'playing') return;
    state.status = 'won';
    sfx('win');
  }
  function toast(text) { state.toasts.push({ text, t: 3 }); }
  function sfx(name) { if (Heist.Audio && Heist.Audio.play) Heist.Audio.play(name); }

  // ---- Loop ----
  function updateCamera(snap) {
    const p = state.player, L = state.level;
    const worldW = L.w * C.TILE, worldH = L.h * C.TILE;
    let tx = p.x - C.VIEW_W / 2, ty = p.y - C.VIEW_H / 2;
    // Clamp to world, or center if the world is smaller than the view.
    tx = worldW <= C.VIEW_W ? (worldW - C.VIEW_W) / 2 : Heist.Util.clamp(tx, 0, worldW - C.VIEW_W);
    ty = worldH <= C.VIEW_H ? (worldH - C.VIEW_H) / 2 : Heist.Util.clamp(ty, 0, worldH - C.VIEW_H);
    if (snap) { state.cam.x = tx; state.cam.y = ty; }
    else { state.cam.x += (tx - state.cam.x) * 0.15; state.cam.y += (ty - state.cam.y) * 0.15; }
  }

  function update(dt) {
    const I = Heist.Input;
    if (I.wasPressed('r')) { loadLevel(levelIndex); return; }
    if (I.wasPressed('[') && levelIndex > 0) { loadLevel(levelIndex - 1); return; }
    if (I.wasPressed(']') && levelIndex < Heist.LEVELS.length - 1) { loadLevel(levelIndex + 1); return; }

    if (state.status === 'won' && (I.wasPressed('Enter') || I.wasPressed(' '))) {
      loadLevel((levelIndex + 1) % Heist.LEVELS.length);
      return;
    }
    if (state.status === 'lost' && (I.wasPressed('Enter') || I.wasPressed(' '))) {
      loadLevel(levelIndex);
      return;
    }

    state.hint = null;
    if (state.status === 'playing') {
      state.time += dt;
      Heist.Player.update(state, dt);
      Heist.Vents.update(state, dt);
      Heist.Tasks.update(state, dt);
      Heist.Security.update(state, dt);
    }
    state.toasts.forEach((t) => (t.t -= dt));
    state.toasts = state.toasts.filter((t) => t.t > 0);
    state.shake = Math.max(0, state.shake - dt * 30);
    state.flash = Math.max(0, state.flash - dt * 1.5);
    updateCamera(false);
  }

  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000 || 0);
    last = now;
    update(dt);
    Heist.Render.draw(state);
    Heist.Input.endFrame();
    requestAnimationFrame(frame);
  }

  function start() {
    Heist.Render.setup(document.getElementById('game'));
    loadLevel(0);
    requestAnimationFrame((t) => { last = t; requestAnimationFrame(frame); });
  }

  // Deterministic single step, used by test.html.
  function step(dt) {
    update(dt);
    Heist.Render.draw(state);
    Heist.Input.endFrame();
  }

  return { start, step, loadLevel, addAlert, maxAlert, lose, win, toast, sfx, get state() { return state; } };
})();

// test.html sets HEIST_NO_AUTOSTART to drive the game manually.
if (!window.HEIST_NO_AUTOSTART) window.addEventListener('load', () => Heist.Game.start());
