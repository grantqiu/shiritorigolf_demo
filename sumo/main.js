/* ことば相撲 — screens, career, input and the frame loop. */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const D = window.KZ_DATA;
  const dict = KZ.makeDict(D);
  const sfx = KZAudio.sfx;
  const TOPIC = {}; D.topics.forEach((t) => { TOPIC[t.key] = t; });
  const PLAYER_LOOK = KZRender.look('#f0c8a0', '#b3261e');
  const BASHO_DAYS = 5;

  /* ---------------- storage ---------------- */
  function load(key, fb) { try { const v = JSON.parse(localStorage.getItem(key)); return v == null ? fb : v; } catch (e) { return fb; } }
  function save(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) {} }

  let defaultName = 'ことば山';
  try { const u = localStorage.getItem('kg_user'); if (u && u !== 'ゲスト') defaultName = u.slice(0, 8); } catch (e) {}
  const career = Object.assign({ name: defaultName, rank: 0, wins: 0, losses: 0, basho: 0, yusho: 0, best: 0, cur: null, stats: {} }, load('kz_career', {}));
  function saveCareer() { save('kz_career', career); }

  /* ---------------- screens ---------------- */
  function show(id) {
    document.querySelectorAll('.screen').forEach((s) => { s.hidden = s.id !== id; });
    window.scrollTo(0, 0);
  }

  function renderTitle() {
    $('shikona').value = career.name;
    $('tRank').textContent = KZ.RANKS[career.rank];
    const cur = career.cur ? '　場所中 ' + career.cur.results.filter(Boolean).length + '勝' + career.cur.results.filter((r) => !r).length + '敗' : '';
    $('tRecord').textContent = '通算 ' + career.wins + '勝' + career.losses + '敗 · ' + career.basho + '場所' + (career.yusho ? ' · 優勝' + career.yusho + '回' : '') + cur;
    $('tLadder').innerHTML = KZ.RANKS.map((r, i) => '<span class="' + (i === career.rank ? 'cur' : i <= career.best ? 'done' : '') + '">' + r + '</span>').join('');
    $('btnBasho').textContent = career.cur ? '場所のつづき（' + (career.cur.results.length + 1) + '日目）' : '本場所へ';
    $('btnMute').textContent = KZAudio.muted ? '🔇 音なし' : '🔊 音あり';
    show('scTitle');
  }

  $('shikona').addEventListener('change', () => { career.name = $('shikona').value.trim().slice(0, 8) || defaultName; saveCareer(); });
  $('btnMute').onclick = () => { KZAudio.setMuted(!KZAudio.muted); renderTitle(); };
  $('btnHowto').onclick = () => { $('howto').hidden = false; };
  $('btnHowtoClose').onclick = () => { $('howto').hidden = true; save('kz_seen', 1); };
  document.querySelectorAll('[data-back]').forEach((b) => { b.onclick = renderTitle; });
  $('btnHome').onclick = renderTitle;

  /* ---------------- opponents ---------------- */
  function rikishiLook(rk) { return KZRender.look(rk.skin, rk.color); }

  function pickBashoOpponents(rank) {
    let w = 1, pool = [];
    while (pool.length < BASHO_DAYS && w < 10) {
      pool = KZ.ROSTER.map((r, i) => i).filter((i) => Math.abs(KZ.ROSTER[i][2] - rank) <= w);
      w++;
    }
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    // weakest first, strongest on the final day
    return pool.slice(0, BASHO_DAYS).sort((a, b) => KZ.ROSTER[a][2] - KZ.ROSTER[b][2]);
  }

  $('btnBasho').onclick = () => {
    KZAudio.unlock();
    if (!career.cur) { career.cur = { results: [], opp: pickBashoOpponents(career.rank) }; saveCareer(); }
    startPre('basho', career.cur.opp[career.cur.results.length]);
  };

  $('btnPractice').onclick = () => {
    KZAudio.unlock();
    $('pickGrid').innerHTML = KZ.ROSTER.map((r, i) => '<button class="pick" data-i="' + i + '"><canvas class="face" width="32" height="32"></canvas><span><b>' + r[0] + '</b><small>' + KZ.RANKS[r[2]] + ' · ' + KZ.STYLES[r[3]].label + '<br>得意 ' + TOPIC[r[4]].icon + TOPIC[r[4]].label + '</small></span></button>').join('');
    $('pickGrid').querySelectorAll('.pick').forEach((b) => {
      const rk = KZ.makeRikishi(KZ.ROSTER[+b.dataset.i]);
      KZRender.drawFace(b.querySelector('canvas'), rikishiLook(rk), 'normal');
      b.onclick = () => startPre('practice', +b.dataset.i);
    });
    show('scPick');
  };

  /* ---------------- pre-bout: pick & ban ---------------- */
  let match = null;   // { mode, oppIdx, rk, bans:[mine, cpu] }

  function startPre(mode, oppIdx) {
    const rk = KZ.makeRikishi(KZ.ROSTER[oppIdx]);
    match = { mode, oppIdx, rk, bans: [] };
    $('preDay').textContent = mode === 'basho'
      ? KZ.RANKS[career.rank] + '　' + (career.cur.results.length + 1) + '日目 / ' + BASHO_DAYS + '日'
      : '稽古 · 一番勝負';
    $('preName0').textContent = career.name; $('preRank0').textContent = KZ.RANKS[career.rank];
    $('preName1').textContent = rk.name; $('preRank1').textContent = rk.rankName + '（' + rk.reading + '）';
    $('preStyle1').textContent = rk.styleLabel + ' · 得意 ' + TOPIC[rk.strong].icon + TOPIC[rk.strong].label;
    KZRender.drawFace($('preFace0'), PLAYER_LOOK, 'normal');
    KZRender.drawFace($('preFace1'), rikishiLook(rk), 'normal');
    $('banPhase').textContent = 'お題を1つ封じろ（BAN）— 相手の得意を消すのが定石';
    $('banMsg').textContent = '';
    $('btnToRing').hidden = true;
    renderBan();
    show('scPre');
  }

  function renderBan() {
    $('banGrid').innerHTML = D.topics.map((t) => {
      const i = match.bans.indexOf(t.key);
      const cls = 'topic' + (t.key === match.rk.strong ? ' strong' : '') + (i > -1 ? ' banned ' + (i === 0 ? 'byme' : 'bycpu') : '');
      return '<button class="' + cls + '" data-k="' + t.key + '"' + (i > -1 || match.bans.length ? ' disabled' : '') + '><span class="ic">' + t.icon + '</span>' + t.label + '</button>';
    }).join('');
    $('banGrid').querySelectorAll('.topic:not(:disabled)').forEach((b) => { b.onclick = () => playerBan(b.dataset.k); });
  }

  function playerBan(k) {
    match.bans.push(k); sfx.slap(0.4); renderBan();
    $('banMsg').textContent = '相手が考えている…';
    setTimeout(() => {
      const k2 = cpuBan(match.bans[0], match.rk.strong);
      match.bans.push(k2); sfx.slap(0.6); renderBan();
      $('banMsg').textContent = match.rk.name + 'は「' + TOPIC[k2].label + '」を封じた！';
      $('btnToRing').hidden = false;
    }, 800);
  }

  // The opponent bans the topic the player has been best at; random when there's no history.
  function cpuBan(mine, own) {
    const keys = D.topics.map((t) => t.key).filter((k) => k !== mine && k !== own);
    let best = null, bestRate = -1;
    keys.forEach((k) => {
      const st = career.stats[k];
      if (!st || st[0] + st[1] < 4) return;
      const rate = st[0] / (st[0] + st[1]);
      if (rate > bestRate) { bestRate = rate; best = k; }
    });
    return best || keys[Math.floor(Math.random() * keys.length)];
  }

  $('btnToRing').onclick = startBout;

  /* ---------------- bout ---------------- */
  const renderer = new KZRender.Renderer($('stage'));
  let bout = null, raf = 0, lastT = 0, calloutTimer = 0, faceState = ['', ''];

  function startBout() {
    const topics = D.topics.filter((t) => match.bans.indexOf(t.key) < 0);
    bout = new KZ.Bout({ cpu: KZ.makeCpu(match.rk, Math.random), topics, dict, onEvent });
    renderer.reset(bout, [PLAYER_LOOK, rikishiLook(match.rk)]);
    $('hudName0').textContent = career.name + '（' + KZ.RANKS[career.rank] + '）';
    $('hudName1').textContent = match.rk.name + '（' + match.rk.rankName + '）';
    faceState = ['', ''];
    $('kimarite').hidden = true;
    buildMoves();
    setMode('intro');
    show('scBout');
    $('ans').value = '';
    focusInput();
    renderer.salt(); sfx.clack();
    callout('塩をまけ…', false, 1.6);
    cancelAnimationFrame(raf); lastT = performance.now(); raf = requestAnimationFrame(loop);
  }

  function loop(now) {
    const dt = Math.min(0.05, (now - lastT) / 1000); lastT = now;
    if (bout) {
      bout.update(dt);
      renderer.frame(dt);
      updateHud();
      if (calloutTimer > 0 && (calloutTimer -= dt) <= 0) $('callout').style.opacity = 0;
    }
    if (!$('scBout').hidden) raf = requestAnimationFrame(loop);
  }

  function callout(text, big, secs) {
    const c = $('callout'); c.textContent = text; c.classList.toggle('big', !!big); c.style.opacity = 1;
    calloutTimer = secs || 1.4;
  }

  function buildMoves() {
    $('moves').innerHTML = KZ.MOVE_LIST.map((m) => {
      const mv = KZ.MOVES[m];
      const cost = mv.ki ? '気' + mv.ki : '体' + mv.tai;
      return '<button class="move" data-m="' + m + '"><span class="k">' + mv.key + '</span><b>' + mv.name + '</b><small>' + cost + (mv.grip ? '·廻し' : '') + ' · ' + (mv.tier === 'hard' ? '意味' : '読み') + '</small></button>';
    }).join('');
    $('moves').querySelectorAll('.move').forEach((b) => {
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); tryMove(b.dataset.m); });
    });
  }

  function tryMove(m) { if (bout && bout.phase === 'neutral') { KZAudio.unlock(); bout.playerMove(m); } }

  let mode = '';
  function setMode(m) {
    mode = m;
    const word = m === 'word';
    $('qte').hidden = !(m === 'word' || m === 'mash' || m === 'timing');
    $('moves').hidden = !$('qte').hidden;
    $('moves').classList.toggle('ready', m === 'neutral');
    $('moves').classList.toggle('idle', m !== 'neutral');
    $('ans').parentElement.hidden = !(word || m === 'neutral' || m === 'recover');
    $('ans').placeholder = word ? '漢字で入力 → Enter' : '1〜4 で技をえらぶ';
    $('btnAct').textContent = word ? '打' : (m === 'mash' ? '連打' : (m === 'miai' || m === 'hakkeyoi' || m === 'timing') ? '押す' : '打');
    $('qMash').hidden = m !== 'mash';
    $('qTimer').parentElement.hidden = m === 'timing';
    const hints = {
      intro: '仕切り中…',
      miai: '「はっけよい！」の瞬間に、どれかのキー（スマホは土俵をタップ）',
      hakkeyoi: '今だ！',
      neutral: '先に仕掛けろ！ 1押し 2突き 3差し 4投げ — 待つと相手が来る',
      recover: '',
      word: '',
      mash: 'どのキーでも連打！（タップでもOK）',
      timing: '輪が重なった瞬間に押せ！',
      over: '',
    };
    $('hint').textContent = hints[m] != null ? hints[m] : '';
  }

  function focusInput() { try { $('ans').focus({ preventScroll: true }); } catch (e) {} }

  function onEvent(type, d) {
    switch (type) {
      case 'call': callout(d.text, d.big, d.big ? 0.9 : 1.6); if (d.big) sfx.taiko(); break;
      case 'phase':
        if (d.phase === 'qte') break;   // set by qteStart
        setMode(d.phase);
        if (d.phase === 'neutral') { $('ans').value = ''; }
        break;
      case 'matta': callout('待った！' + (d.count >= 2 ? ' 二度目は負け…' : ''), true, 1.2); sfx.bad(); break;
      case 'tachiai': {
        let msg;
        if (d.foul) msg = '待ったが重なり、立合い負け…';
        else if (d.winner === 0) msg = (d.sharp ? '鋭い立合い！ ' : '立合い勝ち！ ') + (d.rt * 1000 | 0) + 'ms';
        else msg = '相手が先に立った… 相手 ' + (d.cpuRt * 1000 | 0) + 'ms';
        callout(msg, false, 1.6);
        sfx.taiko();
        break;
      }
      case 'hit': renderer.onHit(d.by, d.power, d.move); sfx.slap(d.power); break;
      case 'cant': {
        const mv = KZ.MOVES[d.move], s = bout.s[0];
        $('hint').textContent = mv.grip && s.grip < 1 ? '投げは廻しを取ってから（3 差し）' : s.ki < mv.ki ? '気が足りない（' + mv.ki + '必要）' : '体力が足りない';
        sfx.bad();
        break;
      }
      case 'qteStart': startQteUi(d); break;
      case 'qteWrong': {
        const m = { wrong: '「' + d.text + '」…違う！', notword: '辞書にない語', }[d.kind] || '違う！';
        qmsg(m, 'bad'); sfx.bad();
        const a = $('ans'); a.classList.remove('lock'); void a.offsetWidth; a.classList.add('lock');
        break;
      }
      case 'qteHint': if (d.kind === 'kana') qmsg('漢字に変換しよう！', ''); break;
      case 'qteEnd': endQteUi(d); break;
      case 'edge': sfx.whoosh(); break;
      case 'mash': sfx.mash(); break;
      case 'over': onOver(d); break;
    }
  }

  function qmsg(text, cls) { const m = $('qMsg'); m.textContent = text; m.className = 'qmsg ' + (cls || ''); }

  function startQteUi(q) {
    setMode(q.type);
    $('qte').classList.toggle('atk', q.attacker === 0);
    $('qCall').textContent = q.call;
    qmsg('', '');
    if (q.type === 'word') {
      const e = q.pick.e, t = TOPIC[q.pick.topic];
      $('qTier').textContent = (q.tier === 'easy' ? '読み→漢字' : '意味→熟語') + ' ' + t.icon + t.label;
      $('qClue').textContent = q.tier === 'easy' ? e[1] : e[2];
      $('ans').value = '';
      focusInput();
    } else {
      $('qTier').textContent = q.type === 'mash' ? '土俵際' : '寄り';
      $('qClue').textContent = q.type === 'mash' ? '踏ん張れ！' : '寄り切れ！';
    }
    sfx.whoosh(); sfx.ping(); sfx.heartStart();
  }

  function endQteUi(d) {
    sfx.heartStop();
    let text = '', good = false;
    const ans = d.answer ? d.answer + '（' + d.reading + '）' : '';
    switch (d.result) {
      case 'hit': text = d.grade.kind === 'exact' ? '決まった！' : d.grade.kind === 'alt' ? '別解で決まった！ 本命は ' + ans : '浅い！ 正解は ' + ans; good = true; break;
      case 'whiff': text = '空振り！ 正解は ' + ans; break;
      case 'blocked': text = '受けられた！ 押し返される…'; break;
      case 'counter': text = 'いなした！ 反撃！'; good = true; break;
      case 'block': text = '受けた！'; good = true; break;
      case 'partial': text = '惜しい！ 正解は ' + ans; break;
      case 'fail': text = '受けそこねた！ 正解は ' + ans; break;
      case 'saved': text = '残った！'; good = true; break;
      case 'out': text = '土俵を割った…'; break;
      case 'finish': text = d.err < 0.06 ? 'ドンピシャ！' : '寄り切った！'; good = true; break;
      case 'escaped': text = 'こらえられた！'; break;
    }
    callout(text, false, 1.8);
    if (good) { sfx.good(); renderer.onCheer(); } else sfx.bad();
    if (d.result === 'counter' || d.result === 'block') renderer.onBlock();
  }

  function onOver(d) {
    sfx.heartStop(); sfx.gong(); sfx.cheer(); renderer.onCheer();
    $('kimarite').innerHTML = '<b>' + d.kimarite + '</b><span>' + (d.winner === 0 ? career.name + 'の勝ち' : match.rk.name + 'の勝ち') + '</span>';
    $('kimarite').hidden = false;
    setMode('over');
    setTimeout(() => showResult(d), 2600);
  }

  function setBar(id, v) {
    const el = $(id); el.style.width = Math.max(0, Math.min(100, v)) + '%';
    el.classList.toggle('low', v < 25);
  }

  function updateHud() {
    const b = bout;
    for (let i = 0; i < 2; i++) {
      const s = b.s[i];
      setBar('b' + i + 'tai', s.tai); setBar('b' + i + 'ki', s.ki); setBar('b' + i + 'an', s.an);
      $('grip' + i).textContent = (s.grip > 0 ? '✊' : '✋') + (s.grip > 1 ? '✊' : '✋');
      let ex = 'normal';
      if (b.phase === 'over') ex = b.winner === i ? 'win' : 'lose';
      else if (s.an < 30 || (b.qte && b.qte.target === i)) ex = 'strain';
      if (faceState[i] !== ex) { faceState[i] = ex; KZRender.drawFace($('hudFace' + i), i === 0 ? PLAYER_LOOK : rikishiLook(match.rk), ex); }
    }
    if (b.qte) {
      const k = Math.max(0, b.qte.left / b.qte.T);
      const ti = $('qTimer'); ti.style.width = (k * 100) + '%'; ti.classList.toggle('hot', k < 0.3);
      if (b.qte.type === 'mash') $('qMashFill').style.width = (b.qte.fill * 100) + '%';
    }
    if (b.phase === 'neutral') {
      $('moves').querySelectorAll('.move').forEach((el) => { el.disabled = !b.canAfford(0, el.dataset.m); });
    }
  }

  /* ---- input ---- */
  const PRESS_PHASES = { miai: 1, hakkeyoi: 1 };
  function isPressMode() { return bout && (PRESS_PHASES[bout.phase] || (bout.phase === 'qte' && bout.qte && bout.qte.type !== 'word')); }

  function submit() {
    if (!bout || bout.phase !== 'qte' || !bout.qte || bout.qte.type !== 'word') return;
    const v = $('ans').value;
    if (!v.trim()) return;
    const r = bout.answer(v);
    if (r && r.kind !== 'locked' && r.kind !== 'kana') $('ans').value = '';
  }

  let composing = false;
  $('ans').addEventListener('compositionstart', () => { composing = true; });
  $('ans').addEventListener('compositionend', () => { composing = false; setTimeout(checkDigit, 0); });
  $('ans').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.isComposing && !composing && e.keyCode !== 229) { e.preventDefault(); submit(); }
  });
  // With a Japanese IME on, digits arrive as composed full-width text.
  function checkDigit() {
    if (!bout || bout.phase !== 'neutral') { if (bout && bout.phase !== 'qte') $('ans').value = ''; return; }
    const m = $('ans').value.match(/[1-4１-４]/);
    if (m) { const n = '1234１２３４'.indexOf(m[0]) % 4; $('ans').value = ''; tryMove(KZ.MOVE_LIST[n]); }
  }
  $('ans').addEventListener('input', () => { if (!composing) checkDigit(); });

  document.addEventListener('keydown', (e) => {
    if ($('scBout').hidden || !bout) return;
    if (e.ctrlKey || e.metaKey || e.altKey || ['Shift', 'Control', 'Alt', 'Meta', 'Tab'].indexOf(e.key) > -1) return;
    if (isPressMode()) {
      e.preventDefault();
      if (!e.repeat) { KZAudio.unlock(); bout.press(); }
      return;
    }
    if (bout.phase === 'neutral' && /^[1-4]$/.test(e.key)) { e.preventDefault(); tryMove(KZ.MOVE_LIST[+e.key - 1]); }
  }, true);

  $('stageWrap').addEventListener('pointerdown', (e) => {
    if (isPressMode()) { e.preventDefault(); KZAudio.unlock(); bout.press(); }
    else if (bout && bout.phase === 'qte') focusInput();
  });
  $('btnAct').addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (isPressMode()) { KZAudio.unlock(); bout.press(); } else submit();
    if (bout && bout.phase === 'qte' && bout.qte && bout.qte.type === 'word') focusInput();
  });

  /* ---------------- result ---------------- */
  function showResult(d) {
    cancelAnimationFrame(raf);
    sfx.heartStop();
    const win = d.winner === 0;
    // per-topic stats feed the opponent's ban choice next time
    bout.log.forEach((l) => {
      const st = career.stats[l.topic] || (career.stats[l.topic] = [0, 0]);
      st[l.ok ? 0 : 1]++;
    });
    let rec = '';
    if (match.mode === 'basho') {
      career.cur.results.push(win);
      if (win) career.wins++; else career.losses++;
      const w = career.cur.results.filter(Boolean).length, l = career.cur.results.length - w;
      rec = (career.cur.results.length) + '日目終了 · ' + w + '勝' + l + '敗';
      $('btnNext').textContent = career.cur.results.length >= BASHO_DAYS ? '千秋楽の結果へ' : '次の取組（' + (career.cur.results.length + 1) + '日目）';
    } else {
      rec = '稽古 · ' + match.rk.name;
      $('btnNext').textContent = 'もう一番';
    }
    saveCareer();
    $('resBig').textContent = win ? '勝ち' : '負け';
    $('resBig').className = 'resbig ' + (win ? 'win' : 'lose');
    $('resKim').textContent = '決まり手：' + d.kimarite;
    $('resRec').textContent = rec;

    const seen = {}, rows = [];
    bout.log.forEach((l) => { if (!l.ok && !seen[l.w]) { seen[l.w] = 1; rows.push(l); } });
    const whyText = { timeout: '時間切れ', wrong: '別の語', notword: '辞書外', homophone: '同音異字', close: '近い語', alt: '別解' };
    $('repList').innerHTML = rows.length ? rows.map((l) =>
      '<label class="reprow"><input type="checkbox" class="repck" value="' + l.w + '" checked><b>' + l.w + '</b><small>' + l.reading + (l.en ? ' — ' + l.en : '') + '<br>' + l.desc + '　[' + (l.role === 'attack' ? '攻め' : '受け') + '・' + (whyText[l.why] || l.why) + (l.typed ? '「' + l.typed + '」' : '') + ']</small></label>'
    ).join('') : '<div class="banmsg">課題なし — 完璧な取組！🏆</div>';
    $('repTools').hidden = !rows.length;
    $('btnSaveNotes').disabled = false; $('btnSaveNotes').textContent = '選んだ語をジムに保存';
    show('scResult');
  }

  // Saves into the main game's study notes (same storage the gym tab reads).
  $('btnSaveNotes').onclick = () => {
    const notes = load('kanjigolf_notes', {});
    const byWord = {}; bout.log.forEach((l) => { byWord[l.w] = l; });
    let n = 0;
    document.querySelectorAll('.repck:checked').forEach((c) => {
      const l = byWord[c.value];
      if (!notes[c.value]) { notes[c.value] = [l.reading || '', l.en || '', Date.now(), null, null]; n++; }
    });
    save('kanjigolf_notes', notes);
    $('btnSaveNotes').textContent = n + '語をジムに保存した';
    $('btnSaveNotes').disabled = true;
  };

  $('btnNext').onclick = () => {
    if (match.mode === 'practice') return startPre('practice', match.oppIdx);
    if (career.cur.results.length >= BASHO_DAYS) return showBashoEnd();
    startPre('basho', career.cur.opp[career.cur.results.length]);
  };

  /* ---------------- basho end ---------------- */
  function showBashoEnd() {
    const res = career.cur.results, w = res.filter(Boolean).length, l = res.length - w;
    const from = career.rank;
    let to = from;
    if (w === BASHO_DAYS) to = from + 2;
    else if (w >= 3) to = from + 1;
    else to = from - 1;
    if (from === 8 && w < 4) to = Math.max(to, 8);          // 大関 needs 4+ wins to become 横綱, and keeps rank on 3
    if (from === 9) to = 9;                                   // 横綱 is never demoted
    to = Math.max(0, Math.min(9, to));
    career.rank = to; career.best = Math.max(career.best, to); career.basho++;
    if (w === BASHO_DAYS) career.yusho++;
    career.cur = null; saveCareer();
    $('bsHead').textContent = w === BASHO_DAYS ? '全勝優勝！' : w >= 3 ? '勝ち越し！' : '負け越し…';
    $('bsRec').textContent = w + '勝' + l + '敗';
    $('bsStars').textContent = res.map((r) => (r ? '○' : '●')).join('');
    $('bsMove').innerHTML = to > from ? KZ.RANKS[from] + ' → <b>' + KZ.RANKS[to] + '</b><br>昇進！'
      : to < from ? KZ.RANKS[from] + ' → <b>' + KZ.RANKS[to] + '</b><br>陥落…来場所こそ。'
      : '<b>' + KZ.RANKS[to] + '</b> 据え置き';
    if (w >= 3) { sfx.gong(); sfx.cheer(); }
    show('scBasho');
  }
  $('btnBashoDone').onclick = renderTitle;

  /* ---------------- boot ---------------- */
  renderTitle();
  if (!load('kz_seen', 0)) $('howto').hidden = false;
  // debug/automation hook
  window.KZGame = { get bout() { return bout; }, career };
})();
