/* ことば相撲 — tiny WebAudio synth. No audio files needed. */
(function () {
  'use strict';
  let ctx = null, master = null, muted = false, heartId = null;
  try { muted = localStorage.getItem('kz_mute') === '1'; } catch (e) {}

  function ac() {
    if (!ctx) {
      const C = window.AudioContext || window.webkitAudioContext;
      if (!C) return null;
      ctx = new C();
      master = ctx.createGain(); master.gain.value = 0.5; master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function noiseBuf(sec) {
    const b = ctx.createBuffer(1, ctx.sampleRate * sec, ctx.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }

  function tone(freq, dur, type, vol, slideTo, when) {
    const c = ac(); if (!c || muted) return;
    const t = c.currentTime + (when || 0);
    const o = c.createOscillator(), g = c.createGain();
    o.type = type || 'sine'; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(vol || 0.3, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.02);
  }

  function noise(dur, vol, filt, freq, when, q) {
    const c = ac(); if (!c || muted) return;
    const t = c.currentTime + (when || 0);
    const s = c.createBufferSource(); s.buffer = noiseBuf(dur);
    const f = c.createBiquadFilter(); f.type = filt || 'bandpass'; f.frequency.value = freq || 1200; f.Q.value = q || 1;
    const g = c.createGain(); g.gain.setValueAtTime(vol || 0.3, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f); f.connect(g); g.connect(master); s.start(t);
  }

  const SFX = {
    taiko() { tone(110, 0.45, 'sine', 0.7, 45); noise(0.12, 0.25, 'lowpass', 400); },
    clack() { noise(0.05, 0.5, 'bandpass', 2600, 0, 8); noise(0.05, 0.5, 'bandpass', 2900, 0.18, 8); },
    slap(p) { noise(0.09, 0.35 + 0.35 * (p || 0.5), 'highpass', 1500); tone(180, 0.12, 'triangle', 0.35 * (p || 0.5), 70); },
    thud() { tone(80, 0.3, 'sine', 0.6, 40); noise(0.2, 0.3, 'lowpass', 300); },
    whoosh() { const c = ac(); if (!c || muted) return; const t = c.currentTime;
      const s = c.createBufferSource(); s.buffer = noiseBuf(0.5);
      const f = c.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 2; f.frequency.setValueAtTime(3000, t); f.frequency.exponentialRampToValueAtTime(200, t + 0.45);
      const g = c.createGain(); g.gain.setValueAtTime(0.35, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
      s.connect(f); f.connect(g); g.connect(master); s.start(t); },
    ping() { tone(1760, 0.18, 'square', 0.12); tone(2637, 0.25, 'sine', 0.1, null, 0.06); },
    tick() { tone(1200, 0.03, 'square', 0.06); },
    good() { tone(784, 0.1, 'square', 0.15); tone(1175, 0.18, 'square', 0.15, null, 0.08); },
    bad() { tone(196, 0.22, 'sawtooth', 0.18, 110); },
    mash() { tone(300 + Math.random() * 120, 0.05, 'square', 0.08); },
    cheer() { noise(1.4, 0.22, 'bandpass', 900, 0, 0.6); noise(1.0, 0.15, 'bandpass', 1800, 0.15, 0.8); },
    gong() { tone(220, 1.6, 'sine', 0.35, 200); tone(331, 1.4, 'sine', 0.18, 300); },
    heartStart() {
      SFX.heartStop();
      const beat = () => { tone(60, 0.15, 'sine', 0.6, 40); tone(55, 0.15, 'sine', 0.45, 38, 0.22); };
      beat(); heartId = setInterval(beat, 750);
    },
    heartStop() { if (heartId) { clearInterval(heartId); heartId = null; } },
  };

  window.KZAudio = {
    sfx: SFX,
    unlock: ac,
    get muted() { return muted; },
    setMuted(m) { muted = m; try { localStorage.setItem('kz_mute', m ? '1' : '0'); } catch (e) {} if (m) SFX.heartStop(); },
  };
})();
