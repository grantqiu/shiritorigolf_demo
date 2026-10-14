/* ことば相撲 — 384x216 pixel-art renderer.
 * Reads bout state, never changes it. Slow motion, zoom and pings are driven by
 * bout.phase === 'qte' and the active bout.qte.
 */
(function () {
  'use strict';
  const W = 384, H = 216;
  const RING = { cx: 192, cy: 164, rx: 136, ry: 22 };
  const FEET_Y = 168;
  const SC = 1.35;   // rikishi sprite scale
  const OUTLINE = '#22130a';
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;

  function rngFrom(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
  function off(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

  /* ---------------- static backdrop ---------------- */
  function buildBack() {
    const c = off(W, H), g = c.getContext('2d');
    const grd = g.createLinearGradient(0, 0, 0, H);
    grd.addColorStop(0, '#120a18'); grd.addColorStop(1, '#2a1a24');
    g.fillStyle = grd; g.fillRect(0, 0, W, H);
    return c;
  }

  function buildCrowd() {
    const c = off(W, 150), g = c.getContext('2d'), r = rngFrom(7);
    const shirts = ['#b33a3a', '#3a63b3', '#d9d2c0', '#2f6b4a', '#7a4fa0', '#c98b2e', '#444', '#8a5a3a', '#e7a1b0', '#5a7d9a', '#ddd'];
    const skins = ['#f0c8a0', '#e3b488', '#d9a273', '#f3d2b3'];
    for (let row = 0; row < 12; row++) {
      const y = 30 + row * 9, step = 8, shift = (row % 2) * 4;
      const dark = 0.55 - row * 0.04;
      for (let x = -4 + shift; x < W + 4; x += step + (r() < 0.15 ? 1 : 0)) {
        if (r() < 0.05) continue;
        g.fillStyle = shirts[Math.floor(r() * shirts.length)];
        g.fillRect(x, y + 3, 7, 7);
        g.fillStyle = skins[Math.floor(r() * skins.length)];
        g.fillRect(x + 2, y - 1, 4, 4);
        g.fillStyle = r() < 0.75 ? '#1b1410' : '#6a5a4a';
        g.fillRect(x + 2, y - 2, 4, 2);
      }
      g.fillStyle = 'rgba(10,4,16,' + clamp(dark, 0, 1) + ')';
      g.fillRect(0, y - 3, W, 10);
    }
    // masu-seki rails along the front rows
    g.fillStyle = '#5a3a22';
    for (let y = 104; y < 140; y += 9) g.fillRect(0, y + 9, W, 1);
    return c;
  }

  function buildFront() {
    const c = off(W, H), g = c.getContext('2d'), r = rngFrom(11);
    // roof beam + curtain (tsuriyane / mizuhiki-maku)
    g.fillStyle = '#3a2414'; g.fillRect(0, 0, W, 12);
    g.fillStyle = '#c9a227'; g.fillRect(0, 11, W, 2);
    g.fillStyle = '#4b1f6e'; g.fillRect(0, 13, W, 12);
    for (let x = 0; x < W; x += 24) {
      g.beginPath(); g.moveTo(x, 25); g.quadraticCurveTo(x + 12, 33, x + 24, 25); g.fill();
      g.fillStyle = '#f4e7c5'; g.fillRect(x + 11, 16, 2, 2); g.fillStyle = '#4b1f6e';
    }
    g.fillStyle = '#6d3797'; g.fillRect(0, 13, W, 2);
    // tassels: green (left) and red (right)
    [[10, '#2f8f4e'], [W - 14, '#c0392b']].forEach(([x, col]) => {
      g.fillStyle = col; g.fillRect(x + 1, 25, 2, 26);
      g.beginPath(); g.moveTo(x - 3, 51); g.lineTo(x + 7, 51); g.lineTo(x + 8, 70); g.lineTo(x - 4, 70); g.closePath(); g.fill();
      g.fillStyle = 'rgba(0,0,0,.25)'; for (let i = 0; i < 6; i++) g.fillRect(x - 3 + i * 2, 54, 1, 16);
      g.fillStyle = col;
    });
    // dohyo platform
    g.fillStyle = '#c99d63';
    g.beginPath(); g.moveTo(26, 140); g.lineTo(W - 26, 140); g.lineTo(W - 2, 194); g.lineTo(2, 194); g.closePath(); g.fill();
    for (let i = 0; i < 900; i++) {
      const y = 140 + r() * 54, inset = 26 - (y - 140) * (24 / 54);
      const x = inset + r() * (W - inset * 2);
      g.fillStyle = r() < 0.5 ? 'rgba(255,240,200,.18)' : 'rgba(90,60,30,.16)';
      g.fillRect(x | 0, y | 0, 1, 1);
    }
    // inner ring sand, lighter
    g.fillStyle = '#ddb97e';
    g.beginPath(); g.ellipse(RING.cx, RING.cy, RING.rx - 3, RING.ry - 1, 0, 0, Math.PI * 2); g.fill();
    // tawara (straw bales)
    g.strokeStyle = '#7a6338'; g.lineWidth = 5;
    g.beginPath(); g.ellipse(RING.cx, RING.cy + 1, RING.rx, RING.ry, 0, 0, Math.PI * 2); g.stroke();
    g.strokeStyle = '#eadba8'; g.lineWidth = 3;
    g.beginPath(); g.ellipse(RING.cx, RING.cy, RING.rx, RING.ry, 0, 0, Math.PI * 2); g.stroke();
    g.fillStyle = '#9c8350';
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 22) {
      g.fillRect((RING.cx + Math.cos(a) * RING.rx) | 0, (RING.cy + Math.sin(a) * RING.ry - 1) | 0, 1, 3);
    }
    // shikiri-sen
    g.fillStyle = '#fbf6e8';
    g.fillRect(RING.cx - 14, RING.cy - 5, 2, 9); g.fillRect(RING.cx + 12, RING.cy - 5, 2, 9);
    // front face with steps
    g.fillStyle = '#8f6236'; g.fillRect(0, 194, W, 22);
    g.fillStyle = '#a5743f'; g.fillRect(0, 194, W, 3);
    g.fillStyle = '#74491f';
    for (let x = 0; x < W; x += 16) g.fillRect(x, 198, 1, 18);
    g.fillStyle = '#b8864b'; g.fillRect(170, 200, 44, 6); g.fillRect(166, 206, 52, 10);
    // salt boxes
    g.fillStyle = '#7a4a22'; g.fillRect(36, 142, 10, 6); g.fillRect(W - 46, 142, 10, 6);
    g.fillStyle = '#fff'; g.fillRect(37, 141, 8, 2); g.fillRect(W - 45, 141, 8, 2);
    return c;
  }

  /* ---------------- figures ---------------- */
  function drawRikishi(g, x, y, f, o) {
    const crouch = o.crouch || 0, lean = o.lean || 0, reach = o.reach || 0;
    g.save();
    g.translate(Math.round(x + (o.jitter || 0)), Math.round(y));
    g.scale(f * SC, SC);
    if (o.fallen) { g.rotate(-o.fallen * Math.PI / 2); g.translate(0, -o.fallen * 6); }
    const hipY = -26 + 8 * crouch;
    g.lineWidth = 1; g.strokeStyle = OUTLINE;
    // legs
    g.fillStyle = o.skinDark;
    leg(g, -9, hipY, -14 - 5 * crouch, crouch);
    g.fillStyle = o.skin;
    leg(g, 8, hipY, 12 + 6 * crouch, crouch);
    // upper body, rotated around hips
    g.save();
    g.translate(0, hipY);
    g.rotate(lean + crouch * 0.55);
    const br = 1 + (o.breathe || 0) * 0.04;
    // torso
    g.fillStyle = o.skin;
    g.beginPath(); g.ellipse(1, -15, 14 * br, 17 * br, 0, 0, Math.PI * 2); g.fill(); g.stroke();
    g.beginPath(); g.ellipse(8, -8, 9 * br, 9 * br, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = o.skinDark; g.fillRect(9, -23, 3, 2);
    // back arm
    arm(g, o.skinDark, -2, -26, 18 + reach * 8, -21 + reach * 3);
    // head
    g.fillStyle = o.skin;
    g.beginPath(); g.arc(7, -36, 7, 0, Math.PI * 2); g.fill(); g.stroke();
    g.fillStyle = '#16100c';
    g.beginPath(); g.arc(6, -38, 7, Math.PI * 0.95, Math.PI * 1.95); g.fill();
    g.fillRect(0, -39, 4, 6);
    g.beginPath(); g.ellipse(7, -45, 5, 2.2, -0.15, 0, Math.PI * 2); g.fill();   // chonmage
    g.fillStyle = OUTLINE; g.fillRect(11, -37, 1, 2);                          // eye
    if (o.strain) { g.fillStyle = '#fff'; g.fillRect(12, -33, 2, 1); }
    // front arm
    arm(g, o.skin, 4, -24, 22 + reach * 9, -18 + reach * 2);
    g.restore();
    // mawashi (drawn last so it sits over the torso)
    g.fillStyle = o.mawashi;
    g.fillRect(-14, hipY - 6, 28, 9); g.strokeRect(-14.5, hipY - 6.5, 29, 10);
    g.fillStyle = 'rgba(255,255,255,.22)'; g.fillRect(-14, hipY - 6, 28, 2);
    g.fillStyle = o.mawashi;
    for (let i = 0; i < 5; i++) g.fillRect(2 + i * 2.4, hipY + 3, 1.4, 7);           // sagari
    g.restore();
  }

  function leg(g, x, hipY, footX, crouch) {
    const kneeX = (x + footX) / 2 + 5 * Math.sign(footX || 1) * crouch, kneeY = hipY / 2 + 2;
    g.beginPath();
    g.moveTo(x - 6, hipY); g.lineTo(x + 6, hipY);
    g.lineTo(kneeX + 5, kneeY); g.lineTo(footX + 5, -3); g.lineTo(footX + 7, 0);
    g.lineTo(footX - 5, 0); g.lineTo(footX - 4, -3); g.lineTo(kneeX - 5, kneeY);
    g.closePath(); g.fill(); g.stroke();
  }

  function arm(g, col, sx, sy, hx, hy) {
    g.strokeStyle = OUTLINE; g.lineWidth = 7; g.lineCap = 'round';
    g.beginPath(); g.moveTo(sx, sy); g.lineTo(hx, hy); g.stroke();
    g.strokeStyle = col; g.lineWidth = 5;
    g.beginPath(); g.moveTo(sx, sy); g.lineTo(hx, hy); g.stroke();
    g.lineWidth = 1; g.lineCap = 'butt';
  }

  function drawGyoji(g, x, y, point, t) {
    g.save(); g.translate(Math.round(x), Math.round(y));
    g.strokeStyle = OUTLINE; g.lineWidth = 1;
    g.fillStyle = '#6a2c8a'; g.beginPath(); g.moveTo(-8, 0); g.lineTo(8, 0); g.lineTo(6, -22); g.lineTo(-6, -22); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = '#e8c35a'; for (let i = -5; i <= 5; i += 5) g.fillRect(i - 1, -16 + (i & 3), 2, 2);
    g.fillStyle = '#f0c8a0'; g.beginPath(); g.arc(0, -26, 4, 0, Math.PI * 2); g.fill(); g.stroke();
    g.fillStyle = '#111'; g.beginPath(); g.moveTo(-4, -28); g.lineTo(4, -28); g.lineTo(2, -37); g.lineTo(-3, -35); g.closePath(); g.fill();
    const ax = point ? point * 13 : 6, ay = point ? -30 : -24 + Math.sin(t * 3) * 1.5;
    g.strokeStyle = '#6a2c8a'; g.lineWidth = 3; g.beginPath(); g.moveTo(point ? point * 4 : 4, -19); g.lineTo(ax, ay); g.stroke();
    g.fillStyle = '#1b1b1b'; g.beginPath(); g.ellipse(ax + (point || 0) * 3, ay - 4, 4, 5, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#c9a227'; g.fillRect(ax + (point || 0) * 3 - 1, ay - 5, 2, 2);
    g.restore();
  }

  /* ---------------- portrait ---------------- */
  function drawFace(canvas, look, expr) {
    const g = canvas.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.clearRect(0, 0, 32, 32);
    const grd = g.createLinearGradient(0, 0, 0, 32); grd.addColorStop(0, '#3b2f66'); grd.addColorStop(1, '#14102a');
    g.fillStyle = grd; g.fillRect(0, 0, 32, 32);
    g.fillStyle = look.mawashi; g.fillRect(0, 28, 32, 4);
    g.fillStyle = look.skin; g.beginPath(); g.ellipse(16, 30, 14, 6, 0, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.ellipse(16, 17, 10, 11, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#16100c';
    g.beginPath(); g.ellipse(16, 10, 10.5, 6, 0, Math.PI, 0); g.fill();
    g.fillRect(5, 9, 3, 8); g.fillRect(24, 9, 3, 8);
    g.beginPath(); g.ellipse(16, 4, 5, 2.5, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#16100c';
    const brow = expr === 'strain' ? 1 : 0;
    g.fillRect(9, 14 - brow, 5, 1); g.fillRect(18, 14 - brow, 5, 1);
    if (expr === 'lose') { g.fillRect(10, 17, 3, 1); g.fillRect(19, 17, 3, 1); }
    else { g.fillRect(11, 16, 2, 2); g.fillRect(19, 16, 2, 2); }
    g.fillStyle = look.skinDark; g.fillRect(15, 18, 2, 3);
    g.fillStyle = '#5a1e14';
    if (expr === 'win') { g.fillRect(12, 23, 8, 1); g.fillRect(13, 24, 6, 1); }
    else if (expr === 'strain') { g.fillStyle = '#fff'; g.fillRect(12, 23, 8, 2); g.fillStyle = '#5a1e14'; g.fillRect(12, 24, 8, 0.5); g.fillStyle = '#9ad'; g.fillRect(25, 12, 2, 3); }
    else if (expr === 'lose') { g.fillRect(13, 24, 6, 1); g.fillRect(12, 23, 1, 1); g.fillRect(19, 23, 1, 1); }
    else g.fillRect(13, 23, 6, 1);
  }

  function shade(hex, k) {
    const n = parseInt(hex.slice(1), 16);
    const r = clamp(Math.round(((n >> 16) & 255) * k), 0, 255), gg = clamp(Math.round(((n >> 8) & 255) * k), 0, 255), b = clamp(Math.round((n & 255) * k), 0, 255);
    return '#' + ((1 << 24) | (r << 16) | (gg << 8) | b).toString(16).slice(1);
  }
  function look(skin, mawashi) { return { skin, skinDark: shade(skin, 0.82), mawashi }; }

  /* ---------------- renderer ---------------- */
  function Renderer(canvas) {
    this.c = canvas; this.g = canvas.getContext('2d');
    this.g.imageSmoothingEnabled = false;
    this.back = buildBack(); this.crowd = buildCrowd(); this.front = buildFront();
    this.reset(null, [look('#f0c8a0', '#b3261e'), look('#e7b98f', '#2f5fb3')]);
  }
  const R = Renderer.prototype;

  R.reset = function (bout, looks) {
    this.bout = bout; this.looks = looks || this.looks;
    this.dpos = 0; this.slow = 0; this.zoom = 1; this.fx = W / 2; this.fy = H / 2;
    this.shake = 0; this.flash = 0; this.hitstop = 0; this.time = 0; this.parts = []; this.pops = [];
    this.bounce = 0; this.charge = 0; this.recoil = [0, 0]; this.fallT = 0; this.overT = 0;
  };

  // Hooks called by main.js on engine events.
  R.onHit = function (by, power, move) {
    this.hitstop = 0.06 + 0.06 * power;
    this.shake = 3 + 5 * power;
    this.flash = 0.25 + 0.35 * power;
    this.recoil[1 - by] = 1;
    const x = RING.cx + this.dpos * 1.02 + (by === 0 ? 6 : -6);
    this.dust(x, FEET_Y, 10 + 10 * power);
    this.pop(move === 'tsuki' ? 'バシッ！' : move === 'nage' ? 'グイッ！' : move === 'sashi' ? 'ガシッ！' : 'ドン！', x, 92, by === 0 ? '#f6c544' : '#ff6b5e');
    this.bounce = 1;
  };
  R.onBlock = function (x) { this.shake = 2; this.pop('受け！', x || RING.cx + this.dpos, 100, '#9ad7ff'); };
  R.onCheer = function () { this.bounce = 1.5; };
  R.salt = function () {
    [RING.cx - 40, RING.cx + 40].forEach((x, i) => {
      for (let k = 0; k < 22; k++) this.parts.push({ x, y: 128, vx: (i ? -1 : 1) * (20 + Math.random() * 40), vy: -60 - Math.random() * 40, g: 160, life: 1.1, max: 1.1, col: '#ffffff', s: 1 });
    });
  };
  R.dust = function (x, y, n) {
    for (let k = 0; k < n; k++) this.parts.push({ x: x + (Math.random() - 0.5) * 16, y, vx: (Math.random() - 0.5) * 70, vy: -20 - Math.random() * 40, g: 90, life: 0.7, max: 0.7, col: Math.random() < 0.5 ? '#e8cf9a' : '#b98e57', s: Math.random() < 0.3 ? 2 : 1 });
  };
  R.pop = function (txt, x, y, col) { this.pops.push({ txt, x, y, col, life: 0.9, max: 0.9 }); };

  // World positions of each rikishi's feet and body facing.
  R.layout = function () {
    const b = this.bout;
    if (!b) return [{ x: RING.cx - 40, crouch: 1 }, { x: RING.cx + 40, crouch: 1 }];
    const ph = b.phase;
    if (ph === 'intro' || ph === 'miai' || ph === 'hakkeyoi') {
      const go = ph === 'hakkeyoi' ? 1 : 0;
      return [{ x: RING.cx - 40 + go * 5, crouch: 1, lean: 0.2 }, { x: RING.cx + 40 - go * 5, crouch: 1, lean: 0.2 }];
    }
    const cx = RING.cx + this.dpos * 1.02;
    const out = [{ x: cx - 22, crouch: 0.35, lean: 0.42, reach: 1 }, { x: cx + 22, crouch: 0.35, lean: 0.42, reach: 1 }];
    if (ph === 'over') {
      const w = b.winner, l = 1 - w;
      out[w].lean = 0.1; out[w].crouch = 0.2; out[w].reach = 0.5;
      if (b.fall === l) { out[l].fallen = clamp(this.overT * 3, 0, 1); out[l].x += (l === 0 ? -1 : 1) * 20 * out[l].fallen; out[l].reach = 0; }
      else { out[l].lean = -0.25; out[l].crouch = 0.6; }
    }
    return out;
  };

  // Anchor of a body part, in world coords. Mirrors the transforms in drawRikishi.
  R.partPos = function (who, part) {
    const L = this.layout()[who], f = who === 0 ? 1 : -1;
    const crouch = L.crouch || 0, hipY = -26 + 8 * crouch, a = (L.lean || 0) + crouch * 0.55;
    const local = { chest: [10, -14], throat: [9, -30], belt: [4, 0], hips: [-8, 0], feet: [10, 0] }[part] || [0, -20];
    let px, py;
    if (part === 'feet') { px = local[0]; py = -2; }
    else if (part === 'belt' || part === 'hips') { px = local[0]; py = hipY - 2; }
    else {
      const cs = Math.cos(a), sn = Math.sin(a);
      px = local[0] * cs - local[1] * sn; py = hipY + local[0] * sn + local[1] * cs;
    }
    return { x: L.x + px * f * SC, y: FEET_Y + py * SC };
  };

  R.frame = function (dtReal) {
    const b = this.bout, g = this.g;
    this.time += dtReal;
    const qte = b && b.phase === 'qte' ? b.qte : null;
    this.slow = lerp(this.slow, qte ? 1 : 0, 1 - Math.pow(0.0015, dtReal));
    let dt = dtReal * lerp(1, 0.2, this.slow);
    if (this.hitstop > 0) { this.hitstop -= dtReal; dt = 0; }
    if (b) {
      const target = b.phase === 'over' && b.fall == null ? b.pos : clamp(b.pos, -100, 100);
      this.dpos = lerp(this.dpos, target, 1 - Math.pow(0.02, dt));
      if (b.phase === 'over') this.overT += dt;
    }
    this.shake *= Math.pow(0.002, dtReal); this.flash *= Math.pow(0.0005, dtReal);
    this.bounce *= Math.pow(0.05, dtReal);
    this.recoil = this.recoil.map((r) => r * Math.pow(0.01, dt));

    // camera: zoom toward the pinged body part during slow motion
    let focus = { x: W / 2, y: H / 2 };
    if (qte) focus = this.partPos(qte.target, qte.part);
    this.zoom = 1 + 0.38 * this.slow;
    const fx = lerp(W / 2, focus.x, this.slow), fy = lerp(H / 2, focus.y, this.slow);
    const hw = W / (2 * this.zoom), hh = H / (2 * this.zoom);
    this.fx = clamp(fx, hw, W - hw); this.fy = clamp(fy, hh, H - hh);

    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, W, H);
    const sx = (Math.random() - 0.5) * this.shake, sy = (Math.random() - 0.5) * this.shake;
    g.setTransform(this.zoom, 0, 0, this.zoom, W / 2 - this.fx * this.zoom + sx, H / 2 - this.fy * this.zoom + sy);

    g.drawImage(this.back, 0, 0);
    g.drawImage(this.crowd, 0, Math.round(-Math.abs(Math.sin(this.time * 18)) * this.bounce * 2));
    g.drawImage(this.front, 0, 0);
    // dim everything but the fighters while time is slowed
    if (this.slow > 0.01) { g.fillStyle = 'rgba(12,4,32,' + (0.5 * this.slow) + ')'; g.fillRect(0, 0, W, H); }

    const L = this.layout();
    const cx = (L[0].x + L[1].x) / 2;
    let point = 0;
    if (b && b.phase === 'over') point = b.winner === 0 ? -1 : 1;
    drawGyoji(g, cx, RING.cy - 16, point, this.time);

    // shadows
    g.fillStyle = 'rgba(40,20,5,.35)';
    L.forEach((l) => { g.beginPath(); g.ellipse(l.x, FEET_Y, 26, 5, 0, 0, Math.PI * 2); g.fill(); });

    const strainOf = (who) => qte && qte.target === who;
    for (let who = 0; who < 2; who++) {
      const l = L[who], lk = this.looks[who], f = who === 0 ? 1 : -1;
      const jitter = strainOf(who) ? Math.sin(this.time * 60) * 0.6 : 0;
      drawRikishi(g, l.x - f * this.recoil[who] * 4, FEET_Y, f, {
        crouch: l.crouch, lean: (l.lean || 0) - this.recoil[who] * 0.25, reach: l.reach, fallen: l.fallen,
        skin: lk.skin, skinDark: lk.skinDark, mawashi: lk.mawashi,
        breathe: Math.sin(this.time * 2.4 * lerp(1, 0.25, this.slow) + who), strain: strainOf(who), jitter,
      });
    }

    // particles
    this.parts = this.parts.filter((p) => (p.life -= dt) > 0);
    this.parts.forEach((p) => {
      p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.y > FEET_Y + 6) { p.y = FEET_Y + 6; p.vy *= -0.2; p.vx *= 0.6; }
      g.globalAlpha = clamp(p.life / p.max, 0, 1); g.fillStyle = p.col; g.fillRect(p.x | 0, p.y | 0, p.s, p.s);
    });
    g.globalAlpha = 1;

    if (qte) this.drawQte(g, qte);

    // text pops
    this.pops = this.pops.filter((p) => (p.life -= dtReal) > 0);
    this.pops.forEach((p) => {
      const k = 1 - p.life / p.max;
      g.font = '14px DotGothic16, monospace'; g.textAlign = 'center';
      g.globalAlpha = clamp(p.life * 3, 0, 1);
      g.lineWidth = 3; g.strokeStyle = '#000'; g.strokeText(p.txt, p.x, p.y - k * 14);
      g.fillStyle = p.col; g.fillText(p.txt, p.x, p.y - k * 14);
    });
    g.globalAlpha = 1;

    // screen-space overlays
    g.setTransform(1, 0, 0, 1, 0, 0);
    if (this.slow > 0.01) {
      const vg = g.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, W * 0.62);
      vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,' + (0.75 * this.slow) + ')');
      g.fillStyle = vg; g.fillRect(0, 0, W, H);
      const bar = Math.round(16 * this.slow);
      g.fillStyle = '#000'; g.fillRect(0, 0, W, bar); g.fillRect(0, H - bar, W, bar);
    }
    if (this.flash > 0.02) { g.fillStyle = 'rgba(255,255,255,' + this.flash + ')'; g.fillRect(0, 0, W, H); }
  };

  R.drawQte = function (g, q) {
    const p = this.partPos(q.target, q.part);
    const col = q.attacker === 0 ? '246,197,68' : '255,80,64';
    const t = this.time;
    if (q.type === 'timing') {
      // closing ring: press when it meets the target circle
      const k = clamp(q.left / q.T, -0.2, 1);
      const r = 8 + 46 * Math.max(0, k);
      const hit = Math.abs(q.left) < 0.16;
      g.lineWidth = 2;
      g.strokeStyle = hit ? '#7dffb0' : 'rgba(' + col + ',1)';
      g.beginPath(); g.arc(p.x, p.y - 8, 8, 0, Math.PI * 2); g.stroke();
      g.strokeStyle = 'rgba(255,255,255,.9)';
      g.beginPath(); g.arc(p.x, p.y - 8, r, 0, Math.PI * 2); g.stroke();
      if (hit) { g.fillStyle = 'rgba(125,255,176,.35)'; g.beginPath(); g.arc(p.x, p.y - 8, 8, 0, Math.PI * 2); g.fill(); }
      this.label(g, '今だ！', p.x, p.y - 26, hit ? '#7dffb0' : '#fff');
      return;
    }
    // expanding sonar rings (real time, so they stay urgent while the world is slowed)
    for (let i = 0; i < 3; i++) {
      const ph = ((t * 1.6) + i / 3) % 1;
      g.strokeStyle = 'rgba(' + col + ',' + (1 - ph) + ')'; g.lineWidth = 1.5;
      g.beginPath(); g.arc(p.x, p.y, 4 + ph * 22, 0, Math.PI * 2); g.stroke();
    }
    g.fillStyle = 'rgba(' + col + ',1)';
    g.beginPath(); g.arc(p.x, p.y, 2.5, 0, Math.PI * 2); g.fill();
    // countdown arc
    const k = clamp(q.left / q.T, 0, 1);
    g.lineWidth = 2.5; g.strokeStyle = k < 0.3 ? '#ff5040' : '#ffffff';
    g.beginPath(); g.arc(p.x, p.y, 9, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k); g.stroke();
    if (q.type === 'mash') {
      g.fillStyle = '#4cc38a'; g.fillRect(p.x - 14, p.y + 12, 28 * q.fill, 3);
      g.strokeStyle = '#000'; g.lineWidth = 1; g.strokeRect(p.x - 14.5, p.y + 11.5, 29, 4);
    }
    this.label(g, q.partName, p.x, p.y - 16, 'rgb(' + col + ')');
  };

  R.label = function (g, txt, x, y, col) {
    g.font = '10px DotGothic16, monospace'; g.textAlign = 'center';
    const w = g.measureText(txt).width + 6;
    g.fillStyle = 'rgba(0,0,0,.75)'; g.fillRect(Math.round(x - w / 2), Math.round(y - 9), Math.round(w), 12);
    g.fillStyle = col; g.fillText(txt, x, y);
  };

  window.KZRender = { Renderer, drawFace, look, W, H };
})();
