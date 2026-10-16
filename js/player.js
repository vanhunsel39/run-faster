/*
 * Begeleide training: stap-voor-stap timer met gesproken aanwijzingen, piepjes en trillen.
 * Tijd wordt berekend met Date.now() (niet met tellen van ticks), zodat de timer klopt als de telefoon even hapert.
 */
(function (RF) {
  'use strict';
  const u = RF.u, P = RF.planner;

  const KIND = { warmup: 'Warming-up', cooldown: 'Cooling-down', recovery: 'Herstel', active: '' };
  const STRENGTH = ['Squats of split squats', 'Kuitheffen (langzaam zakken)', 'Éénbenige deadlift', 'Bil-brug', 'Plank', 'Step-downs van een traptree'];

  /** Platte lijst stappen (herhalingen uitgeschreven). targetFn(step) -> { label, text }. */
  function buildSequence(w, ctx, targetFn) {
    const seq = [];
    if (w.type === 'strength') {
      for (let r = 1; r <= 3; r++) {
        STRENGTH.forEach((name, i) => {
          seq.push({ kind: 'active', label: name, target: `Ronde ${r} van 3 · rustig en gecontroleerd`, sec: 40, rep: { i: r, n: 3 }, high: true });
          if (!(r === 3 && i === STRENGTH.length - 1)) seq.push({ kind: 'recovery', label: 'Pauze', target: `Hierna: ${STRENGTH[(i + 1) % STRENGTH.length]}`, sec: 20, rep: null, high: false });
        });
      }
      return seq;
    }
    const push = (s, rep) => {
      const t = targetFn(s);
      const tz = RF.zones.TARGETS[s.zone];
      const item = { kind: s.kind, zone: s.zone, label: s.label || t.label, target: t.text, sec: null, estSec: null, distM: null, rep, high: !!(tz && !tz.low) };
      if (s.dur.type === 'time') item.sec = s.dur.sec;
      else if (s.dur.type === 'dist') { item.distM = s.dur.m; item.estSec = Math.round(s.dur.m / 1000 * P.flatPace(s.zone, ctx.paces, s.pace)); }
      seq.push(item);
    };
    for (const s of w.steps || []) {
      if (s.kind === 'repeat') for (let i = 1; i <= s.reps; i++) s.steps.forEach((x) => push(x, { i, n: s.reps }));
      else push(s, null);
    }
    return seq;
  }

  const plannedSec = (seq) => seq.reduce((s, x) => s + (x.sec || x.estSec || 0), 0);

  /* ---------- geluid, spraak, trillen ---------- */
  let audio = null;
  function beep(freq = 880, ms = 150, vol = 0.25) {
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      const o = audio.createOscillator(), g = audio.createGain();
      o.frequency.value = freq; g.gain.value = vol;
      o.connect(g); g.connect(audio.destination);
      o.start(); o.stop(audio.currentTime + ms / 1000);
    } catch (e) { /* geen audio */ }
  }
  function speak(text) {
    try {
      if (!window.speechSynthesis) return;
      window.speechSynthesis.cancel();
      const ut = new SpeechSynthesisUtterance(text);
      ut.lang = 'nl-NL'; ut.rate = 1.02;
      const v = window.speechSynthesis.getVoices().find((x) => /^nl/i.test(x.lang));
      if (v) ut.voice = v;
      window.speechSynthesis.speak(ut);
    } catch (e) { /* geen spraak */ }
  }
  const vibrate = (p) => { try { if (navigator.vibrate) navigator.vibrate(p); } catch (e) { /* niets */ } };

  /* ---------- speler ---------- */
  let P0 = null; // actieve sessie

  function open(opts) {
    // opts: { workout, seq, prefs, onFinish(elapsedSec, completedSteps), onPrefs(prefs) }
    const el = document.getElementById('player');
    P0 = { ...opts, idx: 0, running: false, acc: 0, startedAt: 0, totalAcc: 0, totalStart: 0, timer: null, said: {}, lock: null, done: false, el };
    el.hidden = false;
    document.body.classList.add('player-open');
    render(true);
    el.querySelector('[data-pl="toggle"]').focus();
  }

  function close() {
    if (!P0) return;
    stopTimer();
    releaseLock();
    try { if (window.speechSynthesis) window.speechSynthesis.cancel(); } catch (e) { /* niets */ }
    P0.el.hidden = true;
    document.body.classList.remove('player-open');
    P0 = null;
  }

  const now = () => Date.now();
  const stepElapsed = () => (P0.acc + (P0.running ? now() - P0.startedAt : 0)) / 1000;
  const totalElapsed = () => (P0.totalAcc + (P0.running ? now() - P0.totalStart : 0)) / 1000;

  function startTimer() { stopTimer(); P0.timer = setInterval(tick, 250); }
  function stopTimer() { if (P0 && P0.timer) { clearInterval(P0.timer); P0.timer = null; } }

  async function lock() {
    try { if ('wakeLock' in navigator) P0.lock = await navigator.wakeLock.request('screen'); } catch (e) { /* niet ondersteund */ }
  }
  function releaseLock() { try { if (P0 && P0.lock) { P0.lock.release(); P0.lock = null; } } catch (e) { /* niets */ } }
  document.addEventListener('visibilitychange', () => { if (P0 && P0.running && !document.hidden) lock(); });

  function cue(text, kindOfBeep) {
    const pr = P0.prefs;
    if (pr.sound !== false) {
      if (kindOfBeep === 'go') { beep(1320, 350, 0.3); }
      else if (kindOfBeep === 'tick') beep(880, 120, 0.2);
    }
    if (pr.vibrate !== false) vibrate(kindOfBeep === 'go' ? [250, 120, 250] : 80);
    if (text) {
      if (pr.voice !== false) speak(text);
      const live = P0.el.querySelector('.pl-live');
      if (live) live.textContent = text;
    }
  }

  function stepTitle(s) {
    if (s.rep && s.high) return `Herhaling ${s.rep.i} van ${s.rep.n}`;
    if (s.rep) return `Herstel ${s.rep.i} van ${s.rep.n}`;
    return KIND[s.kind] || (s.high ? 'Hard blok' : 'Rustig blok');
  }
  function durWords(s) {
    if (s.distM) return s.distM < 1000 ? `${s.distM} meter` : `${u.num(s.distM / 1000, s.distM % 1000 ? 1 : 0)} kilometer`;
    const sec = s.sec;
    if (sec < 120) return `${sec} seconden`;
    const m = Math.round(sec / 60);
    return `${m} minuten`;
  }

  function announceStep() {
    const s = P0.seq[P0.idx];
    const words = `${stepTitle(s)}. ${durWords(s)} ${s.label.toLowerCase()}. ${s.target.split(' · ').filter((x) => !/vlak-equivalent/.test(x)).slice(0, 2).join(', ').replace(/–/g, ' tot ')}.`;
    cue(words, 'go');
  }

  function tick() {
    if (!P0 || !P0.running) return;
    const s = P0.seq[P0.idx];
    const el = stepElapsed();
    if (s.sec) {
      const left = Math.ceil(s.sec - el);
      const key = `${P0.idx}:${left}`;
      if (left <= 3 && left >= 1 && !P0.said[key]) { P0.said[key] = 1; cue(null, 'tick'); }
      if (s.sec >= 240 && left === Math.round(s.sec / 2) && !P0.said[`${P0.idx}:half`]) { P0.said[`${P0.idx}:half`] = 1; cue('Halverwege.', null); }
      if (s.sec >= 60 && left === 10 && !P0.said[`${P0.idx}:10`]) { P0.said[`${P0.idx}:10`] = 1; cue(P0.idx + 1 < P0.seq.length ? `Nog tien seconden. Hierna ${P0.seq[P0.idx + 1].label.toLowerCase()}.` : 'Nog tien seconden.', null); }
      if (el >= s.sec) { go(P0.idx + 1, true); return; }
    }
    updateClock();
  }

  function go(i, auto) {
    if (!P0) return;
    if (i >= P0.seq.length) { finish(); return; }
    if (i < 0) i = 0;
    P0.idx = i;
    P0.acc = 0;
    P0.startedAt = now();
    render();
    if (P0.running || auto) announceStep();
  }

  function toggle() {
    if (P0.done) return;
    if (P0.running) {
      P0.acc += now() - P0.startedAt; P0.totalAcc += now() - P0.totalStart;
      P0.running = false; stopTimer(); releaseLock();
      cue('Gepauzeerd.', null);
    } else {
      const first = P0.totalAcc === 0 && P0.acc === 0;
      P0.running = true; P0.startedAt = now(); P0.totalStart = now();
      if (first) beep(660, 1, 0.001); // audio ontgrendelen op iOS
      startTimer(); lock();
      if (first) announceStep(); else cue('Verder.', null);
    }
    render();
  }

  function finish() {
    if (P0.running) { P0.totalAcc += now() - P0.totalStart; P0.running = false; }
    stopTimer(); releaseLock();
    P0.done = true;
    cue('Training klaar. Goed gedaan!', 'go');
    render();
  }

  function updateClock() {
    const s = P0.seq[P0.idx];
    const el = stepElapsed();
    const clock = P0.el.querySelector('.pl-clock');
    if (clock) clock.textContent = s.sec ? u.clock(Math.max(0, Math.ceil(s.sec - el))) : u.clock(el);
    const tot = P0.el.querySelector('.pl-elapsed');
    if (tot) tot.textContent = u.clock(totalElapsed());
    const bar = P0.el.querySelector('.pl-progress span');
    if (bar) {
      const before = P0.seq.slice(0, P0.idx).reduce((a, x) => a + (x.sec || x.estSec || 0), 0);
      const cur = Math.min(el, s.sec || s.estSec || el);
      bar.style.width = `${Math.min(100, (before + cur) / Math.max(1, plannedSec(P0.seq)) * 100).toFixed(1)}%`;
    }
  }

  const esc = (x) => RF.charts.esc(x);
  function render(first) {
    const el = P0.el;
    const w = P0.workout;
    if (P0.done) {
      const t = totalElapsed();
      el.innerHTML = `<div class="pl-wrap pl-done"><div class="pl-top"><p class="pl-wtitle" id="plTitle">${esc(w.title)}</p></div>
        <div class="pl-main"><p class="pl-kind">Klaar!</p><h2 class="pl-step">Goed gedaan</h2><p class="pl-clock">${u.clock(t)}</p><p class="pl-target">Totale tijd · ${P0.idx >= P0.seq.length - 1 ? 'alle blokken' : `${P0.idx + 1} van ${P0.seq.length} blokken`}</p></div>
        <div class="pl-controls"><button type="button" class="btn" data-pl="close">Sluiten</button><button type="button" class="btn primary" data-pl="save">Opslaan & evaluatie</button></div>
        <p class="pl-live sr-only" aria-live="assertive"></p></div>`;
      el.querySelector('[data-pl="save"]').focus();
      return;
    }
    const s = P0.seq[P0.idx];
    const nx = P0.seq[P0.idx + 1];
    const prefs = P0.prefs;
    el.innerHTML = `<div class="pl-wrap ${s.high ? 'pl-high' : s.kind === 'recovery' ? 'pl-rest' : 'pl-low'}">
      <div class="pl-top"><button type="button" class="icon-btn" data-pl="stop" aria-label="Training stoppen"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
        <p class="pl-wtitle" id="plTitle">${esc(w.title)}</p><span class="pl-elapsed" aria-label="Totale tijd">0:00</span></div>
      <div class="pl-progress" aria-hidden="true"><span></span></div>
      <div class="pl-main">
        <p class="pl-kind">${esc(stepTitle(s))} · blok ${P0.idx + 1}/${P0.seq.length}</p>
        <h2 class="pl-step">${esc(s.label)}</h2>
        <p class="pl-clock" role="timer" aria-live="off">${s.sec ? u.clock(s.sec) : '0:00'}</p>
        <p class="pl-target">${esc(s.target)}</p>
        ${s.distM ? `<p class="pl-hint">${s.distM < 1000 ? `${s.distM} m` : u.km(s.distM / 1000, 1)} · ≈ ${u.clock(s.estSec)} · tik op <strong>Volgende</strong> als je klaar bent</p>` : ''}
      </div>
      <p class="pl-next">${nx ? `Hierna: <strong>${esc(nx.label)}</strong> · ${nx.sec ? u.clock(nx.sec) : nx.distM ? (nx.distM < 1000 ? `${nx.distM} m` : u.km(nx.distM / 1000, 1)) : ''}` : 'Laatste blok'}</p>
      <div class="pl-controls">
        <button type="button" class="btn" data-pl="prev" ${P0.idx === 0 ? 'disabled' : ''}>Vorige</button>
        <button type="button" class="btn primary pl-big" data-pl="toggle">${P0.running ? 'Pauze' : P0.totalAcc ? 'Verder' : 'Start'}</button>
        <button type="button" class="btn" data-pl="next">${nx ? 'Volgende' : 'Klaar'}</button>
      </div>
      <div class="pl-prefs" role="group" aria-label="Aanwijzingen">
        ${[['voice', 'Stem'], ['sound', 'Piep'], ['vibrate', 'Tril']].map(([k, l]) => `<label class="pl-pref"><input type="checkbox" data-pref="${k}" ${prefs[k] !== false ? 'checked' : ''}><span>${l}</span></label>`).join('')}
      </div>
      ${first ? '<p class="pl-note">Houd je scherm aan tijdens de training: telefoons pauzeren web-apps op de achtergrond.</p>' : ''}
      <p class="pl-live sr-only" aria-live="assertive"></p>
    </div>`;
    updateClock();
  }

  document.addEventListener('click', (e) => {
    if (!P0) return;
    const b = e.target.closest('[data-pl]');
    if (!b || !P0.el.contains(b)) return;
    const a = b.dataset.pl;
    if (a === 'toggle') toggle();
    if (a === 'next') { P0.said = {}; go(P0.idx + 1, P0.running); }
    if (a === 'prev') { P0.said = {}; go(P0.idx - 1, P0.running); }
    if (a === 'stop') {
      if (!b.dataset.armed) { b.dataset.armed = '1'; b.setAttribute('aria-label', 'Tik nogmaals om te stoppen'); b.classList.add('armed'); setTimeout(() => { if (b.isConnected) { delete b.dataset.armed; b.classList.remove('armed'); b.setAttribute('aria-label', 'Training stoppen'); } }, 3000); return; }
      if (totalElapsed() > 60) finish(); else close();
    }
    if (a === 'close') close();
    if (a === 'save') { const t = Math.round(totalElapsed()); const cb = P0.onFinish; close(); if (cb) cb(t); }
  });
  document.addEventListener('change', (e) => {
    if (!P0) return;
    const k = e.target.dataset && e.target.dataset.pref;
    if (!k) return;
    P0.prefs[k] = e.target.checked;
    if (P0.onPrefs) P0.onPrefs(P0.prefs);
  });
  document.addEventListener('keydown', (e) => { if (P0 && e.key === 'Escape' && !P0.running) close(); });

  RF.player = { buildSequence, plannedSec, open, close, get active() { return !!P0; }, _debug: () => P0 };
})(window.RF = window.RF || {});
