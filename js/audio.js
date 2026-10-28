// Sound: WebAudio-synthesized SFX + a quiet ambient loop. No asset files.
//
// Heist.Game.sfx(name) calls Heist.Audio.play(name). The AudioContext is
// created lazily on the first real (trusted) keydown/pointerdown, as browsers
// require a user gesture. Before that, and wherever WebAudio is missing
// (headless tests), play() is a silent no-op. 'm' toggles mute.
//
// SFX names: pickup, unlock, hack, treasure, win, lose, spotted, vent_up,
// vent_down, temp_warning. Unknown names are silent.
Heist.Audio = (function () {
  let ac = null, master = null, sfxBus = null, musicBus = null, noiseBuf = null;
  let failed = false, muted = false, musicTimer = null, nextBeat = 0, beat = 0;
  const lastPlayed = {};
  const MIN_GAP = { spotted: 0.35, temp_warning: 0.4 };

  function ensure() {
    if (ac || failed) return ac;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) { failed = true; return null; }
      ac = new AC();
      const comp = ac.createDynamicsCompressor();
      comp.threshold.value = -14; comp.ratio.value = 4;
      master = ac.createGain();
      master.gain.value = muted ? 0 : 0.8;
      master.connect(comp); comp.connect(ac.destination);
      sfxBus = ac.createGain(); sfxBus.gain.value = 0.9; sfxBus.connect(master);
      musicBus = ac.createGain(); musicBus.gain.value = 0.22; musicBus.connect(master);
      noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    } catch (e) {
      failed = true; ac = null;
    }
    return ac;
  }

  // ---- building blocks ----
  function tone(freq, t0, dur, o) {
    o = o || {};
    const osc = ac.createOscillator(), g = ac.createGain();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.to), t0 + (o.glide || dur));
    if (o.detune) osc.detune.value = o.detune;
    const vol = o.vol == null ? 0.25 : o.vol, att = o.attack || 0.005;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + att);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    let node = osc;
    if (o.lp) {
      const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = o.lp;
      osc.connect(f); node = f;
    }
    node.connect(g); g.connect(o.dest || sfxBus);
    osc.start(t0); osc.stop(t0 + dur + 0.05);
  }
  function noise(t0, dur, o) {
    o = o || {};
    const src = ac.createBufferSource(); src.buffer = noiseBuf;
    const f = ac.createBiquadFilter();
    f.type = o.filter || 'bandpass';
    f.frequency.setValueAtTime(o.freq || 1000, t0);
    if (o.to) f.frequency.exponentialRampToValueAtTime(o.to, t0 + dur);
    f.Q.value = o.q || 1;
    const g = ac.createGain();
    const vol = o.vol == null ? 0.2 : o.vol;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + (o.attack || 0.005));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f); f.connect(g); g.connect(o.dest || sfxBus);
    src.start(t0, Math.random() * 0.5); src.stop(t0 + dur + 0.05);
  }

  // ---- sound effects ----
  const SFX = {
    pickup(t) {
      tone(880, t, 0.09, { type: 'triangle', vol: 0.22 });
      tone(1320, t + 0.07, 0.16, { type: 'triangle', vol: 0.22 });
      tone(2640, t + 0.07, 0.12, { type: 'sine', vol: 0.05 });
    },
    unlock(t) {
      noise(t, 0.04, { filter: 'highpass', freq: 2500, vol: 0.25 });
      tone(150, t, 0.16, { type: 'sine', to: 70, vol: 0.35 });
      noise(t + 0.12, 0.05, { filter: 'highpass', freq: 3000, vol: 0.2 });
      noise(t + 0.15, 0.35, { filter: 'bandpass', freq: 800, to: 300, q: 0.7, vol: 0.08 });
      tone(660, t + 0.16, 0.25, { type: 'triangle', vol: 0.1 });
    },
    hack(t) {
      [1200, 900, 1500, 1800, 1100].forEach((f, i) => tone(f, t + i * 0.045, 0.04, { type: 'square', vol: 0.06 }));
      tone(660, t + 0.25, 0.35, { type: 'sine', vol: 0.18 });
      tone(830, t + 0.25, 0.35, { type: 'sine', vol: 0.14 });
      tone(990, t + 0.32, 0.4, { type: 'sine', vol: 0.12 });
    },
    treasure(t) {
      [1047, 1319, 1568, 2093, 2637].forEach((f, i) => tone(f, t + i * 0.07, 0.6, { type: 'triangle', vol: 0.14 }));
      tone(4186, t + 0.35, 0.5, { type: 'sine', vol: 0.04 });
      noise(t, 0.8, { filter: 'highpass', freq: 6000, vol: 0.04, attack: 0.2 });
      tone(262, t, 0.9, { type: 'sine', vol: 0.15 });
    },
    win(t) {
      [523, 659, 784].forEach((f, i) => tone(f, t + i * 0.12, 0.25, { type: 'square', vol: 0.06, lp: 2500 }));
      [523, 659, 784, 1047].forEach((f) => tone(f, t + 0.38, 1.2, { type: 'sawtooth', vol: 0.05, lp: 1800, attack: 0.02 }));
      tone(131, t + 0.38, 1.2, { type: 'triangle', vol: 0.2 });
      tone(2093, t + 0.5, 0.8, { type: 'sine', vol: 0.05 });
    },
    lose(t) {
      for (let i = 0; i < 3; i++) {
        tone(880, t + i * 0.36, 0.18, { type: 'square', vol: 0.08, lp: 2200 });
        tone(660, t + i * 0.36 + 0.18, 0.18, { type: 'square', vol: 0.08, lp: 2200 });
      }
      tone(110, t, 0.9, { type: 'sawtooth', to: 40, vol: 0.18, lp: 600 });
      noise(t, 0.5, { filter: 'lowpass', freq: 400, vol: 0.25 });
    },
    spotted(t) {
      tone(1000, t, 0.07, { type: 'square', vol: 0.08, lp: 3000 });
      tone(1400, t + 0.08, 0.12, { type: 'square', vol: 0.08, lp: 3000 });
      tone(200, t, 0.2, { type: 'sawtooth', vol: 0.06, lp: 800 });
    },
    vent_up(t) {
      noise(t, 0.28, { filter: 'bandpass', freq: 400, to: 1800, q: 1.2, vol: 0.18 });
      tone(320, t + 0.12, 0.18, { type: 'square', vol: 0.05, lp: 1500 });
      tone(480, t + 0.14, 0.25, { type: 'triangle', vol: 0.06 });
    },
    vent_down(t) {
      noise(t, 0.25, { filter: 'bandpass', freq: 1800, to: 350, q: 1.2, vol: 0.18 });
      tone(95, t + 0.2, 0.2, { type: 'sine', to: 50, vol: 0.4 });
      noise(t + 0.2, 0.08, { filter: 'lowpass', freq: 500, vol: 0.2 });
    },
    temp_warning(t) {
      tone(1760, t, 0.08, { type: 'sine', vol: 0.15 });
      tone(1760, t + 0.14, 0.08, { type: 'sine', vol: 0.15 });
      tone(880, t + 0.28, 0.12, { type: 'triangle', vol: 0.08 });
    },
  };

  function play(name) {
    try {
      if (!ac || muted || !SFX[name]) return;
      if (ac.state === 'suspended') ac.resume().catch(() => {});
      const now = ac.currentTime;
      if (now - (lastPlayed[name] ?? -1) < (MIN_GAP[name] || 0.04)) return;
      lastPlayed[name] = now;
      SFX[name](now + 0.01);
    } catch (e) { /* never throw from audio */ }
  }

  // ---- ambient loop ----
  // Low detuned drone + a sparse minor bass pulse; ticks get busier as the
  // alert meter fills.
  const BASS = [55, 55, 65.41, 55, 49, 55, 41.2, 46.25]; // A1 A1 C2 A1 G1 A1 E1 F#1
  function startMusic() {
    if (!ac || musicTimer) return;
    try {
      const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 260; lp.Q.value = 3;
      const lfo = ac.createOscillator(), lfoG = ac.createGain();
      lfo.frequency.value = 0.07; lfoG.gain.value = 120;
      lfo.connect(lfoG); lfoG.connect(lp.frequency); lfo.start();
      const dg = ac.createGain(); dg.gain.value = 0.25;
      for (const [f, det] of [[55, -6], [55, 7], [82.4, 0]]) {
        const o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = det;
        o.connect(lp); o.start();
      }
      lp.connect(dg); dg.connect(musicBus);
      nextBeat = ac.currentTime + 0.2;
      musicTimer = setInterval(schedule, 100);
    } catch (e) { /* ignore */ }
  }
  function schedule() {
    try {
      if (!ac) return;
      const spb = 60 / 84 / 2; // eighth notes at 84 bpm
      const st = Heist.state;
      const playing = !st || st.status === 'playing';
      const tension = st && st.alertMax ? st.alert / st.alertMax : 0;
      while (nextBeat < ac.currentTime + 0.3) {
        const b = beat % 16;
        if (playing) {
          if (b % 4 === 0) tone(BASS[(beat / 4) % BASS.length | 0], nextBeat, spb * 3.5, { type: 'triangle', vol: 0.5, lp: 400, dest: musicBus, attack: 0.02 });
          if (b % 4 === 2) noise(nextBeat, 0.03, { filter: 'highpass', freq: 7000, vol: 0.05, dest: musicBus });
          if (tension > 0.35 && b % 2 === 1) noise(nextBeat, 0.025, { filter: 'highpass', freq: 8000, vol: 0.035, dest: musicBus });
          if (tension > 0.65 && b % 8 === 7) tone(880, nextBeat, 0.1, { type: 'sine', vol: 0.06, dest: musicBus });
          if (b === 14 && (beat / 16 | 0) % 2 === 1) tone(220, nextBeat, 0.8, { type: 'sine', vol: 0.08, dest: musicBus, attack: 0.05 });
        }
        nextBeat += spb; beat++;
      }
    } catch (e) { /* ignore */ }
  }

  function setMuted(m) {
    muted = !!m;
    try { if (master) master.gain.setTargetAtTime(muted ? 0 : 0.8, ac.currentTime, 0.03); } catch (e) { /* ignore */ }
  }

  function onGesture(e) {
    if (!e || e.isTrusted === false) return; // ignore synthetic test events
    try {
      if (e.type === 'keydown' && (e.key === 'm' || e.key === 'M') && !e.repeat) setMuted(!muted);
      if (!ensure()) return;
      if (ac.state === 'suspended') ac.resume().catch(() => {});
      startMusic();
    } catch (err) { /* ignore */ }
  }
  try {
    window.addEventListener('keydown', onGesture);
    window.addEventListener('pointerdown', onGesture);
  } catch (e) { /* ignore */ }

  return {
    play,
    toggleMute() { setMuted(!muted); },
    get muted() { return muted; },
    get ready() { return !!ac; },
  };
})();
