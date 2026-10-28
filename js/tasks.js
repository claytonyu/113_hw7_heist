// Task system: keycards, locked doors, hackable computers, treasure, exit.
//
// Requirements are strings evaluated by `check`:
//   'key:<color>'  player holds that keycard
//   'flag:<name>'  a flag was set (computers set flags when hacked)
//   'treasure'     player holds the treasure
//   'escape'       level won
Heist.Tasks = (function () {
  const C = Heist.CONFIG;
  const U = () => Heist.Util;

  function check(state, req) {
    if (!req) return true;
    const [kind, val] = req.split(':');
    if (kind === 'key') return state.player.keys.has(val);
    if (kind === 'flag') return state.flags.has(val);
    if (kind === 'treasure') return state.player.hasTreasure;
    if (kind === 'escape') return state.status === 'won';
    return false;
  }

  function setFlag(state, flag, msg) {
    if (state.flags.has(flag)) return;
    state.flags.add(flag);
    if (msg) Heist.Game.toast(msg);
  }

  function update(state, dt) {
    const p = state.player;
    const level = state.level;
    state.interact = null;
    if (p.layer !== 'main') return;
    const near = (o, extra = 0) => U().dist(p.x, p.y, o.x, o.y) < C.INTERACT_RANGE + extra;

    // Pick up items by touch.
    for (const it of level.items) {
      if (it.taken || !near(itemPos(it), -8)) continue;
      it.taken = true;
      if (it.type === 'keycard') {
        p.keys.add(it.color);
        Heist.Game.toast(`Picked up ${it.color} keycard`);
        Heist.Game.sfx('pickup');
      }
      if (it.sets) setFlag(state, it.sets);
    }

    // Doors: key doors unlock when touched with the key; flag doors unlock
    // as soon as the flag is set (anywhere on the map).
    for (const d of level.doors) {
      if (!d.locked) continue;
      const [kind] = d.requires.split(':');
      if (kind === 'flag' && check(state, d.requires)) {
        d.locked = false;
        Heist.Game.sfx('unlock');
      } else if (kind === 'key' && near(d, 4)) {
        if (check(state, d.requires)) {
          d.locked = false;
          Heist.Game.toast(`${d.label || 'Door'} unlocked`);
          Heist.Game.sfx('unlock');
        } else {
          state.hint = `Locked: needs ${d.requires.split(':')[1]} keycard`;
        }
      }
    }

    // Computers: hold F nearby to hack.
    for (const c of level.computers) {
      const pos = itemPos(c);
      if (c.hacked || !near(pos)) continue;
      if (c.requires && !check(state, c.requires)) {
        state.hint = c.lockedHint || 'Computer is locked';
        continue;
      }
      if (Heist.Input.isDown('f')) {
        c.progress += dt;
        state.interact = { target: c, progress: c.progress / (c.hackTime || C.INTERACT_TIME) };
        if (c.progress >= (c.hackTime || C.INTERACT_TIME)) {
          c.hacked = true;
          setFlag(state, c.sets, c.message || `${c.label || 'Computer'} hacked`);
          Heist.Game.sfx('hack');
        }
      } else {
        c.progress = 0;
        state.hint = `Hold F: ${c.label || 'hack computer'}`;
      }
    }

    // Treasure.
    const t = level.treasure;
    if (!t.taken && near(t, -8)) {
      t.taken = true;
      p.hasTreasure = true;
      Heist.Game.toast('Got the treasure! Return to the start.');
      Heist.Game.sfx('treasure');
    }

    // Escape: back on the start tile with the treasure.
    if (p.hasTreasure && near(level.start, -16)) Heist.Game.win();
  }

  // Entities are authored in tile coords; convert to pixel center.
  function itemPos(o) {
    return { x: (o.x + 0.5) * C.TILE, y: (o.y + 0.5) * C.TILE };
  }

  return { check, setFlag, update, itemPos };
})();
