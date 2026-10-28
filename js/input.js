// Keyboard state. `down` = held; `pressed` = went down this frame.
Heist.Input = (function () {
  const down = new Set();
  let pressed = new Set();

  const norm = (e) => (e.key.length === 1 ? e.key.toLowerCase() : e.key);

  window.addEventListener('keydown', (e) => {
    const k = norm(e);
    if (!down.has(k)) pressed.add(k);
    down.add(k);
    if ([' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) e.preventDefault();
  });
  window.addEventListener('keyup', (e) => down.delete(norm(e)));
  window.addEventListener('blur', () => down.clear());

  return {
    isDown: (k) => down.has(k),
    wasPressed: (k) => pressed.has(k),
    endFrame: () => { pressed = new Set(); },
  };
})();
