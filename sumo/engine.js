/* ことば相撲 — bout engine.
 * Pure game logic: no DOM, no timers. The host calls update(dt) every frame and
 * listens to events. Side 0 is the player (left), side 1 the opponent (right).
 * pos runs -100..100; positive means side 0 is driving side 1 toward the right edge.
 * The opponent is a controller object (see makeCpu) so a network player can
 * replace it later without touching the rules.
 */
(function (root) {
  'use strict';

  const RANKS = ['序ノ口', '序二段', '三段目', '幕下', '十両', '前頭', '小結', '関脇', '大関', '横綱'];

  // tier: which clue the attacker must answer. easy = reading in kana, hard = description.
  const MOVES = {
    oshi:  { id: 'oshi',  name: '押し', key: '1', tier: 'easy', part: 'chest',  partName: '胸',   tai: 8,  ki: 0,  time: 6.5, call: '押せ！' },
    tsuki: { id: 'tsuki', name: '突き', key: '2', tier: 'hard', part: 'throat', partName: '喉',   tai: 6,  ki: 30, time: 10,  call: '突け！' },
    sashi: { id: 'sashi', name: '差し', key: '3', tier: 'easy', part: 'belt',   partName: '廻し', tai: 8,  ki: 0,  time: 6.5, call: '廻しを取れ！' },
    nage:  { id: 'nage',  name: '投げ', key: '4', tier: 'hard', part: 'hips',   partName: '腰',   tai: 10, ki: 40, time: 10,  call: '投げろ！', grip: 1 },
  };
  const MOVE_LIST = ['oshi', 'tsuki', 'sashi', 'nage'];
  // Seconds the defender gets to answer an incoming attack (before rank scaling).
  const DEFENSE_TIME = { oshi: 5.5, tsuki: 4.8, sashi: 5.5, nage: 6 };
  const DEFENSE_CALL = { oshi: '押されている！受けろ！', tsuki: '突きが来る！受けろ！', sashi: '廻しを狙われた！切れ！', nage: '投げられる！こらえろ！' };

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;

  /* ---------------- dictionary + grading ---------------- */
  function makeDict(data) {
    const words = new Set(data.wL || []);
    const w2 = data.w2 || '';
    for (let i = 0; i < w2.length; i += 2) words.add(w2.slice(i, i + 2));
    return { has: (w) => words.has(w) };
  }

  function normalize(text) {
    return String(text || '').replace(/[\s　]/g, '');
  }

  // entry: [answer, reading, description, alts, english, homophones]
  function grade(entry, tier, raw, dict) {
    const t = normalize(raw);
    const [ans, reading, , alts, , homo] = entry;
    if (!t) return { g: 0, kind: 'empty' };
    if (t === ans) return { g: 1, kind: 'exact' };
    if (alts.indexOf(t) > -1) return { g: 0.85, kind: 'alt' };
    if (t === reading) return { g: 0, kind: 'kana' };   // not a miss: they just need to convert
    if (tier === 'easy' && homo.indexOf(t) > -1) return { g: 0.5, kind: 'homophone' };
    const isWord = dict && dict.has(t);
    if (tier === 'hard' && isWord) {
      for (const ch of t) if (ans.indexOf(ch) > -1) return { g: 0.4, kind: 'close' };
    }
    return { g: 0, kind: isWord ? 'wrong' : 'notword' };
  }

  /* ---------------- opponents ---------------- */
  const STYLES = {
    oshi:  { label: '押し相撲', w: { oshi: 5, tsuki: 3, sashi: 1, nage: 1 } },
    yotsu: { label: '四つ相撲', w: { oshi: 2, tsuki: 1, sashi: 5, nage: 4 } },
    tsuki: { label: '突き押し', w: { oshi: 3, tsuki: 6, sashi: 1, nage: 1 } },
    waza:  { label: '技能派',   w: { oshi: 2, tsuki: 2, sashi: 3, nage: 3 } },
  };

  const ROSTER = [
    // [shikona, reading, rank, style, strong topic, mawashi colour, skin tone]
    ['豆乃山', 'まめのやま', 0, 'oshi', 'food', '#3D6FB6', '#F0C8A0'],
    ['若ひばり', 'わかひばり', 0, 'waza', 'kokoro', '#2E8B57', '#EBC29A'],
    ['土鍋川', 'どなべがわ', 1, 'yotsu', 'food', '#7A4FA0', '#E7B98F'],
    ['春一番', 'はるいちばん', 1, 'tsuki', 'nature', '#C9A227', '#F2CBA5'],
    ['白墨海', 'はくぼくうみ', 2, 'oshi', 'school', '#2F4F4F', '#EDC39C'],
    ['電光丸', 'でんこうまる', 2, 'tsuki', 'science', '#1E6FA8', '#E9BE95'],
    ['朝稽古', 'あさげいこ', 3, 'yotsu', 'sumo', '#5A3E2B', '#E4B68A'],
    ['判官錦', 'ほうがんにしき', 3, 'waza', 'law', '#8B1E3F', '#F0C9A3'],
    ['給料日', 'きゅうりょうび', 4, 'oshi', 'work', '#22577A', '#EDC6A0'],
    ['嵐ノ峰', 'あらしのみね', 4, 'tsuki', 'nature', '#3B3B98', '#E3B488'],
    ['金鯱', 'きんしゃち', 5, 'yotsu', 'sports', '#B8860B', '#EBC09A'],
    ['顕微鏡', 'けんびきょう', 5, 'waza', 'science', '#00796B', '#E8BD93'],
    ['憲法山', 'けんぽうやま', 6, 'oshi', 'law', '#4A148C', '#EFC7A1'],
    ['黒板城', 'こくばんじょう', 6, 'yotsu', 'school', '#263238', '#E6B98E'],
    ['剛力', 'ごうりき', 7, 'tsuki', 'sports', '#B71C1C', '#E2B286'],
    ['心ノ海', 'こころのうみ', 7, 'waza', 'kokoro', '#0D47A1', '#ECC39B'],
    ['大嵐', 'おおあらし', 8, 'tsuki', 'nature', '#1B5E20', '#E5B78B'],
    ['錦鵬', 'きんぽう', 8, 'yotsu', 'work', '#6A1B9A', '#EAC098'],
    ['白鵬山', 'はくほうざん', 9, 'yotsu', 'sumo', '#111111', '#E8BC92'],
    ['天照富士', 'あまてらすふじ', 9, 'waza', 'sports', '#880E4F', '#EDC49D'],
  ];

  function cpuParams(rank) {
    const t = clamp(rank / 9, 0, 1);
    return {
      def: lerp(0.22, 0.66, t),      // base chance to block an attack
      pow: lerp(0.6, 1.1, t),        // effect strength of its attacks
      tempo: lerp(2.7, 1.3, t),      // seconds between initiatives
      react: lerp(430, 235, t),      // tachiai reaction (ms)
      mash: lerp(9, 17, t),          // presses the player needs to survive at the edge
      defT: lerp(1.25, 0.72, t),     // multiplier on the player's defense time
      counter: lerp(0.35, 0.6, t),   // fraction of defense time left needed to counter
    };
  }

  function makeRikishi(row) {
    const [name, reading, rank, style, strong, color, skin] = row;
    return { name, reading, rank, rankName: RANKS[rank], style, styleLabel: STYLES[style].label, strong, color, skin, p: cpuParams(rank) };
  }

  // Default opponent controller. A network opponent would implement the same three methods.
  function makeCpu(rikishi, rng) {
    return {
      rikishi,
      nextDelay() { return rikishi.p.tempo * (0.55 + 0.9 * rng()); },
      chooseMove(bout) {
        const me = bout.s[1], foe = bout.s[0];
        const w = Object.assign({}, STYLES[rikishi.style].w);
        if (foe.an < 35) w.nage *= 2;
        if (bout.pos < -55) { w.oshi *= 1.6; w.tsuki *= 1.6; }
        const opts = MOVE_LIST.filter((m) => bout.canAfford(1, m));
        if (!opts.length) return null;
        let sum = 0; opts.forEach((m) => { sum += w[m]; });
        let r = rng() * sum;
        for (const m of opts) { r -= w[m]; if (r <= 0) return m; }
        return opts[opts.length - 1];
      },
      blockChance(bout, q, entryTopic) {
        const bonus = entryTopic === rikishi.strong ? 0.15 : 0;
        return clamp(rikishi.p.def + bonus - 0.55 * q + 0.2, 0.05, 0.85);
      },
    };
  }

  /* ---------------- bout ---------------- */
  function side() { return { tai: 100, ki: 40, an: 100, grip: 0 }; }

  function Bout(opts) {
    this.rng = opts.rng || Math.random;
    this.cpu = opts.cpu;
    this.topics = opts.topics;         // [{key,label,icon,e:[...]}]
    this.dict = opts.dict;
    this.onEvent = opts.onEvent || function () {};
    this.s = [side(), side()];
    this.pos = 0;
    this.t = 0;
    this.phase = 'intro';
    this.timer = opts.introTime != null ? opts.introTime : 2.6;
    this.matta = 0;
    this.qte = null;
    this.cpuTimer = 0;
    this.lastMove = [null, null];
    this.log = [];                     // per-clue outcomes for the report
    this.deck = [];
    this.winner = -1;
    this.kimarite = '';
    this.exchanges = 0;
  }

  const P = Bout.prototype;

  P.emit = function (type, data) { this.onEvent(type, data || {}); };

  P.timescale = function () { return this.phase === 'qte' ? 0.18 : this.phase === 'recover' ? 0.7 : 1; };

  P.drawEntry = function () {
    if (!this.deck.length) {
      const all = [];
      this.topics.forEach((t) => t.e.forEach((e) => all.push({ e, topic: t.key, label: t.label })));
      for (let i = all.length - 1; i > 0; i--) { const j = Math.floor(this.rng() * (i + 1)); const x = all[i]; all[i] = all[j]; all[j] = x; }
      this.deck = all;
    }
    return this.deck.pop();
  };

  P.canAfford = function (who, m) {
    const mv = MOVES[m], s = this.s[who];
    if (s.tai < mv.tai * 0.5) return false;
    if (s.ki < mv.ki) return false;
    if (mv.grip && s.grip < mv.grip) return false;
    return true;
  };

  /* ---- phases ---- */
  P.update = function (dt) {
    if (this.phase === 'over') return;
    this.t += dt;
    switch (this.phase) {
      case 'intro':
        this.timer -= dt;
        if (this.timer <= 0) this.startMiai();
        break;
      case 'miai':
        this.timer -= dt;
        if (this.timer <= 0) {
          this.phase = 'hakkeyoi'; this.goAt = this.t; this.timer = 1.4;
          this.cpuReact = this.cpu.rikishi.p.react * (0.85 + 0.35 * this.rng()) / 1000;
          this.emit('call', { text: 'はっけよい！', big: true });
          this.emit('phase', { phase: 'hakkeyoi' });
        }
        break;
      case 'hakkeyoi':
        // The opponent fires at its reaction time; if the player hasn't pressed by then, they lose the charge.
        if (this.t - this.goAt >= this.cpuReact) this.resolveTachiai(null);
        break;
      case 'neutral':
        this.regen(dt);
        this.cpuTimer -= dt;
        if (this.cpuTimer <= 0) {
          const m = this.cpu.chooseMove(this);
          if (m) this.startAttack(1, m); else this.cpuTimer = 0.8;
        }
        break;
      case 'qte':
        this.updateQte(dt);
        break;
      case 'recover':
        this.timer -= dt;
        if (this.timer <= 0) this.toNeutral();
        break;
    }
  };

  P.startMiai = function () {
    this.phase = 'miai';
    this.timer = 1.3 + this.rng() * 2.2;
    this.emit('call', { text: '見合って…見合って…' });
    this.emit('phase', { phase: 'miai' });
  };

  // Player pressed the tachiai button (any time during miai / hakkeyoi).
  P.press = function () {
    if (this.phase === 'miai') {
      this.matta++;
      this.emit('matta', { count: this.matta });
      if (this.matta >= 2) { this.tachiaiResult(1, 0, true); return; }
      this.emit('call', { text: '待った！ もう一度。' });
      this.timer = 1.6 + this.rng() * 2.2;
      return;
    }
    if (this.phase === 'hakkeyoi') {
      const rt = this.t - this.goAt;
      // Faster than human reaction means they guessed: treat it as a flying start.
      if (rt < 0.1) { this.phase = 'miai'; this.press(); return; }
      this.resolveTachiai(rt); return;
    }
    if (this.phase === 'qte' && this.qte.type !== 'word') this.qtePress();
  };

  P.resolveTachiai = function (playerRt) {
    const cpuRt = this.cpuReact;
    if (playerRt == null) { this.tachiaiResult(1, cpuRt, false); return; }
    this.tachiaiResult(playerRt <= cpuRt ? 0 : 1, playerRt, false, cpuRt);
  };

  P.tachiaiResult = function (winner, rt, foul, cpuRt) {
    const dir = winner === 0 ? 1 : -1;
    const sharp = winner === 0 && rt < 0.25;
    this.pos = dir * (sharp ? 18 : 12);
    this.s[1 - winner].an -= sharp ? 22 : 14;
    this.s[winner].ki = clamp(this.s[winner].ki + 15, 0, 100);
    this.emit('tachiai', { winner, rt, cpuRt: cpuRt != null ? cpuRt : this.cpuReact, foul, sharp });
    this.emit('hit', { by: winner, power: sharp ? 1 : 0.7, move: 'oshi' });
    this.phase = 'recover'; this.timer = 0.9;
    this.emit('phase', { phase: 'recover' });
  };

  P.toNeutral = function () {
    if (this.phase === 'over') return;
    this.phase = 'neutral';
    this.cpuTimer = this.cpu.nextDelay();
    this.emit('phase', { phase: 'neutral' });
  };

  P.regen = function (dt) {
    this.s.forEach((s) => {
      s.tai = clamp(s.tai + 5 * dt, 0, 100);
      s.ki = clamp(s.ki + 4 * dt, 0, 100);
      s.an = clamp(s.an + 2.5 * dt, 0, 100);
    });
  };

  /* ---- attacks ---- */
  // Player chooses a move in neutral.
  P.playerMove = function (m) {
    if (this.phase !== 'neutral' || !MOVES[m]) return false;
    if (!this.canAfford(0, m)) { this.emit('cant', { move: m }); return false; }
    this.startAttack(0, m);
    return true;
  };

  P.startAttack = function (who, m) {
    const mv = MOVES[m], s = this.s[who];
    s.tai = clamp(s.tai - mv.tai, 0, 100);
    s.ki = clamp(s.ki - mv.ki, 0, 100);
    this.lastMove[who] = m;
    this.exchanges++;
    const pick = this.drawEntry();
    // Player attacking answers the move's tier; player defending always gets the reading.
    const tier = who === 0 ? mv.tier : 'easy';
    let T = who === 0 ? mv.time : DEFENSE_TIME[m] * this.cpu.rikishi.p.defT;
    if (who === 1 && pick.topic === this.cpu.rikishi.strong) T *= 0.85;
    if (this.s[0].tai < 15) T *= 0.8;          // winded
    this.qte = {
      type: 'word', attacker: who, move: m, pick, tier, T, left: T, lock: 0, tries: 0,
      part: mv.part, partName: mv.partName, target: who === 0 ? 1 : 0,
      call: who === 0 ? mv.call : DEFENSE_CALL[m],
    };
    this.phase = 'qte';
    this.emit('qteStart', this.qte);
    this.emit('phase', { phase: 'qte' });
  };

  P.updateQte = function (dt) {
    const q = this.qte;
    q.left -= dt;
    if (q.lock > 0) q.lock -= dt;
    if (q.type === 'mash') {
      q.fill = Math.max(0, q.fill - q.drain * dt);
      if (q.fill >= 1) return this.endMash(true);
    }
    if (q.type === 'timing' && q.left < -0.25) return this.endTiming(false, 9);
    if (q.left <= 0) {
      if (q.type === 'word') this.resolveWord({ g: 0, kind: 'timeout' }, '');
      else if (q.type === 'mash') this.endMash(false);
    }
  };

  // Player submits text during a word QTE. Returns the grade (so the UI can react).
  P.answer = function (text) {
    const q = this.qte;
    if (this.phase !== 'qte' || !q || q.type !== 'word') return null;
    if (q.lock > 0) return { g: 0, kind: 'locked' };
    const r = grade(q.pick.e, q.tier, text, this.dict);
    if (r.kind === 'kana' || r.kind === 'empty') { this.emit('qteHint', { kind: r.kind }); return r; }
    if (r.g === 0) {
      q.tries++; q.lock = 0.7; q.left -= 0.6;
      this.emit('qteWrong', { kind: r.kind, text: normalize(text) });
      return r;
    }
    this.resolveWord(r, normalize(text));
    return r;
  };

  function effect(m, q, attackerGrip) {
    switch (m) {
      case 'oshi':  return { push: 8 + 24 * q, an: 12 * q, grip: 0 };
      case 'tsuki': return { push: 10 + 36 * q, an: 18 * q, grip: 0, breakGrip: true };
      case 'sashi': return { push: 6, an: 10, grip: 1 };
      case 'nage':  return { push: 8, an: (15 + 45 * q) * (attackerGrip >= 2 ? 1.3 : 1), grip: 0 };
    }
    return { push: 0, an: 0, grip: 0 };
  }

  P.resolveWord = function (r, typed) {
    const q = this.qte, a = q.attacker, d = 1 - a, dir = a === 0 ? 1 : -1;
    const speed = clamp(q.left / q.T, 0, 1);
    const quality = r.g * (0.6 + 0.4 * speed);
    const entry = q.pick.e;
    const missed = r.g < 1;
    if (missed) this.log.push({ w: entry[0], reading: entry[1], desc: entry[2], en: entry[4], topic: q.pick.topic, why: r.kind, typed, role: a === 0 ? 'attack' : 'defense' });
    else this.log.push({ w: entry[0], ok: true, topic: q.pick.topic });
    this.qte = null;
    this.phase = 'resolve';   // a shove below may open an edge QTE
    const out = { attacker: a, move: q.move, grade: r, quality, answer: entry[0], reading: entry[1] };

    if (a === 0) {
      // Player attacked.
      if (r.g === 0) {
        this.s[0].an -= 10; this.s[1].ki = clamp(this.s[1].ki + 8, 0, 100);
        out.result = 'whiff';
        this.emit('qteEnd', out);
        this.shove(1, 6, 'oshi');
        return this.afterExchange();
      }
      const blocked = this.rng() < this.cpu.blockChance(this, quality, q.pick.topic);
      if (blocked) {
        this.s[0].an -= 4; this.s[1].ki = clamp(this.s[1].ki + 6, 0, 100);
        out.result = 'blocked';
        this.emit('qteEnd', out);
        // The block turns into a riposte.
        this.s[0].an -= 6;
        return this.shove(1, 4 + 6 * this.cpu.rikishi.p.pow, 'oshi');
      }
      out.result = 'hit';
      this.s[0].ki = clamp(this.s[0].ki + 10, 0, 100);
      this.emit('qteEnd', out);
      return this.applyEffect(0, q.move, effect(q.move, quality, this.s[0].grip), quality);
    }

    // CPU attacked, player defended.
    const pw = this.cpu.rikishi.p.pow;
    if (r.g >= 0.85 && speed >= this.cpu.rikishi.p.counter) {
      // Clean, quick answer: sidestep and counter.
      this.s[0].ki = clamp(this.s[0].ki + 10, 0, 100);
      this.s[1].an -= 14;
      out.result = 'counter';
      this.emit('qteEnd', out);
      if (this.s[1].an <= 0) return this.finish(0, 'はたき込み');
      this.shove(0, 7, 'counter');
      return this.afterExchange();
    }
    if (r.g >= 0.85) {
      this.s[0].ki = clamp(this.s[0].ki + 6, 0, 100);
      out.result = 'block';
      this.emit('qteEnd', out);
      this.s[0].an -= 3;
      return this.shove(1, 2 + 4 * pw, q.move, true);
    }
    const mult = r.g > 0 ? 0.5 : 1;
    out.result = r.g > 0 ? 'partial' : 'fail';
    this.s[1].ki = clamp(this.s[1].ki + 10, 0, 100);
    this.emit('qteEnd', out);
    return this.applyEffect(1, q.move, effect(q.move, pw * mult, this.s[1].grip), pw * mult);
  };

  P.applyEffect = function (a, m, ef, power) {
    const d = 1 - a;
    this.s[d].an -= ef.an;
    this.s[d].tai = clamp(this.s[d].tai - 5, 0, 100);
    if (ef.grip) this.s[a].grip = Math.min(2, this.s[a].grip + ef.grip);
    if (ef.breakGrip) this.s[d].grip = 0;
    this.emit('hit', { by: a, power: clamp(power, 0.3, 1), move: m });
    if (this.s[d].an <= 0) return this.finish(a, fallName(m));
    return this.shove(a, ef.push, m);
  };

  function fallName(m) { return { oshi: '押し倒し', tsuki: '突き倒し', sashi: '寄り倒し', nage: '上手投げ' }[m] || '突き落とし'; }

  function outName(m, grip) {
    if (m === 'tsuki') return '突き出し';
    if (m === 'nage') return '寄り切り';
    if (m === 'sashi' || grip > 0) return '寄り切り';
    return '押し出し';
  }

  // Move the pair toward the defender's edge. May trigger an edge QTE.
  P.shove = function (a, amount, m, soft) {
    const dir = a === 0 ? 1 : -1, d = 1 - a;
    const prev = this.pos;
    const next = this.pos + dir * amount;
    if (Math.abs(next) >= 100 && !soft) {
      const fromOwnEdge = a === 0 ? prev < -75 : prev > 75;
      if (this.s[d].tai < 12) return this.finish(a, fromOwnEdge ? 'うっちゃり' : outName(m, this.s[a].grip));
      this.pos = dir * 96;
      return this.startEdge(a, m, fromOwnEdge);
    }
    this.pos = clamp(next, -99, 99);
    this.emit('shove', { by: a, amount, pos: this.pos });
    return this.afterExchange();
  };

  P.afterExchange = function () {
    if (this.phase === 'over' || this.phase === 'qte') return;
    this.phase = 'recover'; this.timer = 0.85;
    this.emit('phase', { phase: 'recover' });
  };

  /* ---- edge QTEs ---- */
  P.startEdge = function (a, m, fromOwnEdge) {
    if (a === 1) {
      // Player is being driven out: mash to dig in at the tawara.
      const need = this.cpu.rikishi.p.mash * (this.s[0].tai < 30 ? 1.25 : 1);
      this.qte = { type: 'mash', attacker: 1, move: m, T: 2.6, left: 2.6, fill: 0.15, per: 1 / need, drain: 0.16,
        part: 'feet', partName: '足', target: 0, call: '踏ん張れ！ 連打！', fromOwnEdge };
    } else {
      // Opponent is at the tawara: time the final drive.
      this.qte = { type: 'timing', attacker: 0, move: m, T: 1.5, left: 1.5, part: 'feet', partName: '足', target: 1,
        call: m === 'nage' ? '投げ切れ！' : '寄り切れ！ タイミング！', fromOwnEdge };
    }
    this.phase = 'qte';
    this.emit('edge', { attacker: a });
    this.emit('qteStart', this.qte);
    this.emit('phase', { phase: 'qte' });
  };

  P.qtePress = function () {
    const q = this.qte;
    if (!q) return;
    if (q.type === 'mash') {
      q.fill = Math.min(1, q.fill + q.per);
      this.emit('mash', { fill: q.fill });
      if (q.fill >= 1) this.endMash(true);
    } else if (q.type === 'timing') {
      // Ring closes at left = 0. |left| is the timing error in seconds.
      this.endTiming(Math.abs(q.left) < 0.16, Math.abs(q.left));
    }
  };

  P.endMash = function (ok) {
    const q = this.qte; this.qte = null; this.phase = 'resolve';
    this.emit('qteEnd', { type: 'mash', result: ok ? 'saved' : 'out' });
    if (!ok) return this.finish(1, outName(q.move, this.s[1].grip));
    this.s[0].tai = clamp(this.s[0].tai - 18, 0, 100);
    this.s[0].an = clamp(this.s[0].an + 10, 0, 100);
    this.pos = -82;
    this.emit('call', { text: '残った、残った！' });
    this.phase = 'recover'; this.timer = 0.8;
    this.emit('phase', { phase: 'recover' });
  };

  P.endTiming = function (ok, err) {
    const q = this.qte; this.qte = null; this.phase = 'resolve';
    this.emit('qteEnd', { type: 'timing', result: ok ? 'finish' : 'escaped', err });
    if (ok) return this.finish(0, q.fromOwnEdge ? 'うっちゃり' : outName(q.move, this.s[0].grip));
    this.s[1].tai = clamp(this.s[1].tai - 18, 0, 100);
    this.pos = 84;
    this.emit('call', { text: '残った！ 相手がこらえた！' });
    this.phase = 'recover'; this.timer = 0.8;
    this.emit('phase', { phase: 'recover' });
  };

  P.finish = function (winner, kimarite) {
    this.qte = null;
    this.phase = 'over';
    this.winner = winner;
    this.kimarite = kimarite;
    if (kimarite.indexOf('倒し') > -1 || kimarite.indexOf('投げ') > -1 || kimarite === 'はたき込み') this.fall = 1 - winner;
    else this.pos = winner === 0 ? 124 : -124;
    this.emit('over', { winner, kimarite });
    this.emit('phase', { phase: 'over' });
  };

  const api = { RANKS, MOVES, MOVE_LIST, STYLES, ROSTER, grade, normalize, makeDict, makeRikishi, makeCpu, cpuParams, Bout };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.KZ = api;
})(typeof window !== 'undefined' ? window : globalThis);
