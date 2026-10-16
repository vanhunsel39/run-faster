/* Run Faster – weergaven en interactie. */
(function (RF) {
  'use strict';
  const u = RF.u, esc = RF.charts.esc, P = RF.planner;

  let state = RF.store.load();
  const HASH = { today: 'vandaag', plan: 'schema', progress: 'voortgang', goals: 'doelen' };
  const fromHash = () => Object.keys(HASH).find((k) => HASH[k] === location.hash.slice(1)) || 'today';
  let view = fromHash();
  let wizardStep = 0;
  let pendingImport = null;
  let pendingIntensity = null;
  let openSect = null;
  let calY = new Date().getFullYear(), calM = new Date().getMonth(), yearSel = calY;

  /* ---------- iconen ---------- */
  const svg = (d, extra = '') => `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"${extra}>${d}</svg>`;
  const ICON = {
    check: svg('<path d="M5 12.5l4.5 4.5L19 7.5"/>'),
    cross: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
    skip: svg('<path d="M5 12h14M13 6l6 6-6 6"/>'),
    alert: svg('<path d="M12 3l9.5 17h-19z"/><path d="M12 10v4.5M12 17.5v.01"/>'),
    info: svg('<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.01"/>'),
    upload: svg('<path d="M12 16V4M7 9l5-5 5 5M4 16v4h16v-4"/>'),
    watch: svg('<rect x="6" y="6" width="12" height="12" rx="3"/><path d="M9 6V3h6v3M9 18v3h6v-3M12 9.5V12l1.5 1"/>'),
    pen: svg('<path d="M4 20h4L19 9l-4-4L4 16z"/>'),
    calendar: svg('<rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>'),
    heart: svg('<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>'),
    plus: svg('<path d="M12 5v14M5 12h14"/>'),
    bolt: svg('<path d="M13 3L5 14h6l-1 7 8-11h-6l1-7z"/>'),
    route: svg('<circle cx="6" cy="18" r="2"/><circle cx="18" cy="6" r="2"/><path d="M8 18h7a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h7"/>'),
    run: svg('<circle cx="14" cy="4.5" r="1.8"/><path d="M8 21l2.5-6 3 2.5V21M6.5 12l3-3.5 3.5 1 2 3h3M10.5 8.5l1.2 6"/>'),
    dumbbell: svg('<path d="M6.5 7v10M3.5 9.5v5M17.5 7v10M20.5 9.5v5M6.5 12h11"/>'),
    ball: svg('<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c3 3 3 14 0 17M12 3.5c-3 3-3 14 0 17"/>'),
    moon: svg('<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>'),
    flag: svg('<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>'),
    target: svg('<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1"/>'),
    sun: svg('<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>'),
    layers: svg('<path d="M12 3l9 5-9 5-9-5 9-5z"/><path d="M3 13l9 5 9-5"/>'),
    trash: svg('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>'),
    more: svg('<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>'),
    play: svg('<path d="M7 4.5v15l12-7.5z"/>'),
    swap: svg('<path d="M4 8h13l-3-3M20 16H7l3 3"/>'),
    chevL: svg('<path d="M15 5l-7 7 7 7"/>'),
    chevR: svg('<path d="M9 5l7 7-7 7"/>'),
  };

  const TYPE_LABEL = {
    easy: 'Rustige duurloop', long: 'Lange duurloop', mlr: 'Middellange duurloop', fartlek: 'Fartlek', progression: 'Progressieve duurloop',
    hills: 'Heuvels', stairs: 'Trappen', threshold: 'Drempel', subthreshold: 'Sub-drempel', intervals: 'Intervallen', reps: 'Snelheid',
    steady: 'Marathontempo', racepace: 'Wedstrijdtempo', tt: 'Tijdrit', race: 'Wedstrijd', downhill: 'Bergaf-techniek', runwalk: 'Run-walk', strength: 'Kracht', cross: 'Andere sport',
  };
  const RPE_TEXT = ['', '1 – heel licht', '2 – licht', '3 – rustig', '4 – rustig, praten gaat', '5 – gemiddeld', '6 – stevig', '7 – zwaar', '8 – heel zwaar', '9 – bijna maximaal', '10 – maximaal'];
  const LEVEL_LABEL = { beginner: 'Beginner', intermediate: 'Gemiddeld', advanced: 'Gevorderd' };

  /* ---------- hulpjes ---------- */
  const $ = (sel, root = document) => root.querySelector(sel);
  function persist() { RF.store.save(state); }
  function zs() { return RF.zones.zones(state.profile); }
  function todayCond() { const t = state.todayCond; return t && t.date === u.today() ? t : null; }
  function raceCondObj() { const c = RF.goal.raceCond(state.goal); return { preset: 'race', tempC: c.tempC, humidity: c.humidity, altitudeM: c.altitudeM, terrain: c.terrain }; }
  /** Omstandigheden: eigen instelling van de training > wedstrijd > vandaag > standaard. */
  function condFor(date, w) {
    if (w && w.cond) return w.cond;
    if (w && w.type === 'race') return raceCondObj();
    return date === u.today() && todayCond() ? todayCond() : state.conditions;
  }
  function ctx(date, w) { return { paces: RF.vdot.paces(state.fitness.vdot), cond: condFor(date || u.today(), w), zs: zs() }; }
  const effortCond = (c) => c && (c.terrain === 'steep' || c.terrain === 'trail');

  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => t.classList.remove('show'), 3500);
  }

  function logFor(w) { return state.logs.find((l) => l.workoutId === w.id); }
  function statusOf(w) {
    if (logFor(w)) return 'done';
    if (w.skipped) return 'skipped';
    if (w.date < u.today() && !P.NONRUN.has(w.type)) return 'missed';
    return 'planned';
  }
  function statusBadge(w) {
    const s = statusOf(w);
    if (s === 'done') return `<span class="status status-done">${ICON.check} Gedaan</span>`;
    if (s === 'missed') return `<span class="status status-missed">${ICON.cross} Gemist</span>`;
    if (s === 'skipped') return `<span class="status status-skipped">${ICON.skip} Overgeslagen</span>`;
    return '';
  }
  const phaseChip = (p) => `<span class="chip phase-${p}"><span class="dot" aria-hidden="true"></span>${P.PHASE_LABEL[p] || p}</span>`;

  /** Type → kleurklasse + icoon (altijd samen met een tekstlabel). */
  function typeClass(w) {
    if (!w) return 'tc-rest';
    if (w.type === 'cross') return 'tc-cross';
    if (w.type === 'strength') return 'tc-strength';
    if (w.type === 'long' || w.type === 'mlr') return 'tc-long';
    if (w.key) return 'tc-key';
    return 'tc-easy';
  }
  function typeIcon(w) {
    if (!w) return ICON.moon;
    if (w.type === 'race') return ICON.flag;
    if (w.type === 'cross') return ICON.ball;
    if (w.type === 'strength') return ICON.dumbbell;
    if (w.type === 'long' || w.type === 'mlr') return ICON.route;
    if (w.key) return ICON.bolt;
    return ICON.run;
  }
  const typeLabel = (w) => (w.type === 'cross' ? RF.sports.label(w.sport) : TYPE_LABEL[w.type] || w.type);

  function currentWeek() {
    if (!state.plan) return null;
    const t = u.today();
    return state.plan.weeks.find((w) => t >= w.start && t <= u.addDays(w.start, 6)) || null;
  }

  /* ---------- formulier-bouwstenen ---------- */
  function fld(o) {
    const hid = o.hint ? `h-${o.id}` : '';
    const attrs = [
      `id="${o.id}"`, o.name ? `name="${o.name}"` : '', o.f ? `data-f="${o.f}"` : '', `type="${o.type || 'number'}"`,
      o.mode ? `inputmode="${o.mode}"` : '', o.min != null ? `min="${o.min}"` : '', o.max != null ? `max="${o.max}"` : '',
      o.step ? `step="${o.step}"` : '', o.ph ? `placeholder="${esc(o.ph)}"` : '', hid ? `aria-describedby="${hid}"` : '',
      `value="${esc(o.value ?? '')}"`,
    ].filter(Boolean).join(' ');
    return `<div class="field${o.wide ? ' wide' : ''}"${o.show ? ` data-show="${o.show}"` : ''}${o.showDist ? ` data-show-dist="${o.showDist}"` : ''}>
      <label for="${o.id}">${o.label}${o.unit ? `<span class="sr-only"> (${o.unit})</span>` : ''}</label>
      <div class="input${o.unit ? ' has-unit' : ''}"><input ${attrs}>${o.unit ? `<span class="unit" aria-hidden="true">${o.unit}</span>` : ''}</div>
      ${o.hint ? `<span class="hint" id="${hid}">${o.hint}</span>` : ''}</div>`;
  }
  function sel(o) {
    return `<div class="field${o.wide ? ' wide' : ''}"${o.show ? ` data-show="${o.show}"` : ''}><label for="${o.id}">${o.label}</label>
      <select id="${o.id}"${o.name ? ` name="${o.name}"` : ''}${o.f ? ` data-f="${o.f}"` : ''}>${o.options.map(([v, l]) => `<option value="${v}" ${String(v) === String(o.value) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>
      ${o.hint ? `<span class="hint">${o.hint}</span>` : ''}</div>`;
  }
  /**
   * Tijdveld met losse vakjes voor uren, minuten en seconden (gewoon cijfertoetsenbord, geen dubbele punt nodig).
   * Een verborgen veld (met de oorspronkelijke name / data-f) bevat de tijd als "u:mm:ss" voor de bestaande logica.
   */
  function timeFld(o) {
    const sec = o.sec > 0 ? Math.round(o.sec) : 0;
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    const val = (n) => (sec ? n : '');
    const part = (k, unit, max, v, word) => `<label class="tpart"><span class="sr-only">${o.label}: ${word}</span><input type="number" inputmode="numeric" pattern="[0-9]*" min="0" max="${max}" step="1" data-tpart="${k}" value="${v}" placeholder="0" aria-describedby="err-${o.id}"><span class="unit" aria-hidden="true">${unit}</span></label>`;
    return `<div class="field wide"${o.show ? ` data-show="${o.show}"` : ''}><span class="label" id="lbl-${o.id}">${o.label}</span>
      <div class="tparts" role="group" aria-labelledby="lbl-${o.id}" data-time="${o.id}">
        ${part('h', 'uur', 99, val(h), 'uren')}${part('m', 'min', 59, val(m), 'minuten')}${part('s', 'sec', 59, val(s), 'seconden')}
      </div>
      <input type="hidden" id="${o.id}"${o.name ? ` name="${o.name}"` : ''}${o.f ? ` data-f="${o.f}"` : ''} value="${sec ? u.clock(sec) : ''}">
      ${o.hint ? `<span class="hint">${o.hint}</span>` : ''}<span class="terr" id="err-${o.id}" aria-live="polite"></span></div>`;
  }

  /** Lees de drie vakjes, valideer (min/sec 0–59) en zet de verborgen waarde. */
  function syncTime(group) {
    const get = (k) => group.querySelector(`[data-tpart="${k}"]`);
    const raw = ['h', 'm', 's'].map((k) => get(k).value.trim());
    const hidden = document.getElementById(group.dataset.time);
    const err = document.getElementById(`err-${group.dataset.time}`);
    const [h, m, s] = raw.map((x) => (x === '' ? 0 : Number(x)));
    const problems = [];
    if ([h, m, s].some((x) => !Number.isFinite(x) || x < 0 || x % 1)) problems.push('Gebruik alleen hele getallen.');
    if (m > 59) problems.push('Minuten: 0 tot en met 59.');
    if (s > 59) problems.push('Seconden: 0 tot en met 59.');
    get('m').setAttribute('aria-invalid', m > 59 ? 'true' : 'false');
    get('s').setAttribute('aria-invalid', s > 59 ? 'true' : 'false');
    if (err) err.textContent = problems.join(' ');
    const total = h * 3600 + m * 60 + s;
    hidden.value = !problems.length && total > 0 ? u.clock(total) : (raw.every((x) => x === '') ? '' : (problems.length ? 'ongeldig' : ''));
  }

  /** Zet een tijdveld van buitenaf (bijv. 'Gebruik de haalbare tijd'). */
  function setTimeFld(id, sec) {
    const group = document.querySelector(`[data-time="${id}"]`);
    if (!group) return;
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = Math.round(sec % 60);
    group.querySelector('[data-tpart="h"]').value = h;
    group.querySelector('[data-tpart="m"]').value = m;
    group.querySelector('[data-tpart="s"]').value = s;
    syncTime(group);
  }

  function seg(name, opts, cur, label, cls = '') {
    const id = `lbl-${name}`;
    return `<div class="field"><span class="label" id="${id}">${label}</span><div class="seg ${cls}" role="radiogroup" aria-labelledby="${id}">${opts.map(([v, l]) => `<label><input type="radio" name="${name}" value="${v}" ${String(v) === String(cur) ? 'checked' : ''}><span>${esc(l)}</span></label>`).join('')}</div></div>`;
  }
  function daysPick(o) {
    const id = `lbl-${o.key}`;
    return `<div class="field"><span class="label" id="${id}">${o.label}</span><div class="days" role="group" aria-labelledby="${id}">
      ${[1, 2, 3, 4, 5, 6, 7].map((d) => `<label><input type="checkbox" ${o.name ? `name="${o.name}"` : `data-f="${o.f}"`} value="${d}" ${(o.value || []).includes(d) ? 'checked' : ''}><span>${u.DAY_SHORT[d]}<span class="sr-only"> (${u.DAY_LONG[d]})</span></span></label>`).join('')}
      </div>${o.hint ? `<span class="hint">${o.hint}</span>` : ''}</div>`;
  }
  const sw = (name, checked, title, sub, attrs = '') => `<label class="switch"${attrs}><span class="sw-text">${title}${sub ? `<small>${sub}</small>` : ''}</span><input type="checkbox" name="${name}" ${checked ? 'checked' : ''}><span class="sw" aria-hidden="true"></span></label>`;
  const radio = (name, value, cur, label, desc) => `<label class="choice"><input type="radio" name="${name}" value="${value}" ${String(cur) === String(value) ? 'checked' : ''}><span><strong>${label}</strong>${desc || ''}</span></label>`;
  const sub = (title, body, show) => `<div class="sub"${show ? ` data-show="${show}"` : ''}><h3 class="sub-title">${title}</h3>${body}</div>`;
  const stripTags = (s) => String(s).replace(/<[^>]*>/g, '');

  function rtable(head, rows) {
    return `<div class="table-wrap"><table class="rtable"><thead><tr>${head.map((h) => `<th scope="col">${h}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr><th scope="row">${r[0]}</th>${r.slice(1).map((c, i) => `<td data-label="${esc(stripTags(head[i + 1]))}">${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  }
  const kv = (rows) => `<dl class="kv">${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>`;

  /* ---------- training ---------- */
  function stepDur(s) {
    if (s.dur.type === 'time') {
      const sec = s.dur.sec;
      if (sec < 120) return `${sec} s`;
      return sec % 60 ? u.clock(sec) : `${sec / 60} min`;
    }
    if (s.dur.type === 'dist') return s.dur.m < 1000 ? `${s.dur.m} m` : u.km(s.dur.m / 1000, s.dur.m % 1000 ? 1 : 0);
    return 'open';
  }

  function targetText(step, c) {
    const t = P.targetFor(step, c);
    const parts = [];
    const hr = t.hr ? `hartslag ${t.hr[0]}–${t.hr[1]}` : null;
    if (t.effortBased) {
      if (hr) parts.push(hr);
      parts.push(`RPE ${t.rpe}`);
      if (t.flat) parts.push(`vlak-equivalent ${u.paceRange(t.flat[0], t.flat[1])}`);
    } else {
      if (t.adjusted) parts.push(u.paceRange(t.adjusted[0], t.adjusted[1]));
      if (hr) parts.push(hr);
      parts.push(`RPE ${t.rpe}`);
    }
    return { label: t.label, text: parts.join(' · ') };
  }

  function stepsHtml(w) {
    if (!w.steps || !w.steps.length) return '';
    const c = ctx(w.date, w);
    const kindLabel = { warmup: 'Warming-up', cooldown: 'Cooling-down', recovery: 'Herstel' };
    const cls = (s) => { const t = RF.zones.TARGETS[s.zone]; if (!t || t.low) return ['walk', 'rec'].includes(s.zone) ? 'tl-rest' : 'tl-low'; return 'tl-high'; };
    const inner = (s) => {
      const t = targetText(s, c);
      return `${kindLabel[s.kind] ? `<span class="step-kind">${kindLabel[s.kind]}</span>` : ''}<span class="step-name">${esc(stepDur(s))} · ${esc(s.label || t.label)}</span><span class="step-target">${esc(t.text)}</span>`;
    };
    return `<ol class="timeline">${w.steps.map((s) => (s.kind === 'repeat'
      ? `<li class="rep"><div class="rep-box"><span class="rep-title">${s.reps} × herhalen</span><ol>${s.steps.map((x) => `<li class="${cls(x)}">${inner(x)}</li>`).join('')}</ol></div></li>`
      : `<li class="${cls(s)}">${inner(s)}</li>`)).join('')}</ol>`;
  }

  /** Belangrijkste doel van een training (zone + RPE). */
  function mainTarget(w) {
    let best = null, bestSec = -1;
    P.walkSteps(w.steps || [], (s, m) => {
      const t = RF.zones.TARGETS[s.zone];
      if (s.kind !== 'active' || !t) return;
      const sec = (s.dur.type === 'time' ? s.dur.sec : (s.dur.m || 0) / 3) * m * (t.low ? 0.3 : 1);
      if (sec > bestSec) { bestSec = sec; best = t; }
    });
    return best ? `${best.label} · RPE ${best.rpe}` : '–';
  }

  function metaText(w) {
    if (w.type === 'strength') return 'Ca. 25 minuten, thuis of in de sportschool';
    if (w.type === 'cross') { const leg = RF.sports.legLoad({ type: w.sport, intensity: w.intensity, durationMin: w.crossMin }); return `${u.dur(w.estSec)} · ${RF.sports.INTENSITY[w.intensity] ? RF.sports.INTENSITY[w.intensity].label.toLowerCase() : 'gemiddeld'} · ${leg >= 3 ? 'zware dag voor je benen' : leg >= 2 ? 'gemiddelde beenbelasting' : 'lichte beenbelasting'}`; }
    const c = condFor(w.date, w);
    if (effortCond(c)) return `≈ ${u.dur(w.estSec)} · ≈ ${u.km(w.estKm)} vlak-equivalent`;
    return `≈ ${u.km(w.estKm)} · ≈ ${u.dur(w.estSec)}`;
  }

  function condSummary(c) {
    const h = RF.cond.heat(c.tempC, c.humidity);
    const alt = RF.cond.altitude(c.altitudeM);
    const ter = RF.cond.TERRAIN[c.terrain] || RF.cond.TERRAIN.road;
    const bits = [`${u.temp(c.tempC)}, ${u.num(c.humidity, 0)} % luchtvochtigheid (dauwpunt ${u.temp(h.dewC)})`];
    bits.push(h.pct > 0 ? `hitte: +${u.num(h.pct * 100, 1)} % trager` : 'geen hittecorrectie');
    bits.push(alt > 0 ? `hoogte ${u.meters(c.altitudeM)}: +${u.num(alt * 100, 1)} %` : `hoogte ${u.meters(c.altitudeM || 0)}: geen effect`);
    bits.push(ter.effort ? `${ter.label}: loop op hartslag en RPE` : ter.pct ? `${ter.label}: +${u.num(ter.pct * 100, 0)} %` : ter.label);
    if (!h.hardOk) bits.push('te heet voor harde trainingen – alleen op gevoel');
    return bits.join(' · ');
  }

  function metricsHtml(w) {
    if (w.type === 'cross') {
      const leg = RF.sports.legLoad({ type: w.sport, intensity: w.intensity, durationMin: w.crossMin });
      return `<div class="metrics"><div class="metric"><span class="metric-label">Duur</span><span class="metric-value">${u.dur(w.estSec)}</span></div><div class="metric"><span class="metric-label">Benen</span><span class="metric-value">${leg >= 3 ? 'Zwaar' : leg >= 2 ? 'Gemiddeld' : 'Licht'}</span></div><div class="metric"><span class="metric-label">RPE</span><span class="metric-value">~${RF.sports.rpe({ type: w.sport, intensity: w.intensity })}</span></div></div>`;
    }
    if (w.type === 'strength') return '';
    const eff = effortCond(condFor(w.date, w));
    return `<div class="metrics"><div class="metric"><span class="metric-label">Duur</span><span class="metric-value">≈ ${u.dur(w.estSec)}</span></div><div class="metric"><span class="metric-label">${eff ? 'Afstand (vlak)' : 'Afstand'}</span><span class="metric-value">≈ ${u.km(w.estKm)}</span></div><div class="metric"><span class="metric-label">Doel</span><span class="metric-value">${esc(mainTarget(w))}</span></div></div>`;
  }

  /* ---------- workout-kaart ---------- */
  function workoutCard(w, opts = {}) {
    const wk = state.plan ? state.plan.weeks.find((x) => x.workouts.includes(w)) : null;
    const log = logFor(w);
    const notes = w.notes && w.notes.length ? (opts.hero
      ? `<details class="disclosure"><summary>Tips van de coach (${w.notes.length})</summary><ul class="notes">${w.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul></details>`
      : `<ul class="notes">${w.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>`) : '';
    const canPlay = !log && ((w.steps && w.steps.length) || w.type === 'strength') && w.date <= u.addDays(u.today(), 1);
    const logBtn = w.type === 'strength'
      ? `<button type="button" class="btn${canPlay ? '' : ' primary'}" data-action="quickDone" data-id="${esc(w.id)}">${ICON.check} Gedaan</button>`
      : `<button type="button" class="btn${canPlay ? '' : ' primary'}" data-action="logWorkout" data-id="${esc(w.id)}">${ICON.pen} ${w.type === 'cross' ? 'Activiteit loggen' : canPlay ? 'Loggen' : 'Training loggen'}</button>`;
    const primary = !log
      ? (canPlay ? `<button type="button" class="btn primary" data-action="startPlayer" data-id="${esc(w.id)}">${ICON.play} Start training</button>` : logBtn)
      : '';
    const secondary = [
      !log && canPlay ? logBtn : '',
      !log && w.type !== 'strength' ? `<button type="button" class="btn" data-action="importFor" data-id="${esc(w.id)}">${ICON.upload} Garmin</button>` : '',
      w.steps && w.steps.length && !log ? `<button type="button" class="btn" data-action="exportFit" data-id="${esc(w.id)}">${ICON.watch} Naar horloge</button>` : '',
      opts.hero ? `<button type="button" class="btn" data-action="openWorkout" data-id="${esc(w.id)}">${ICON.more} Meer</button>` : '',
    ].filter(Boolean).join('');
    const body = `
      <div class="card-head"><p class="eyebrow">${esc(typeLabel(w))}${wk ? ` · week ${wk.n || wk.i + 1}` : ''}</p>${statusBadge(w)}</div>
      <h2 class="workout-title">${esc(w.title)}</h2>
      <div class="workout-meta">${wk ? phaseChip(wk.phase) : ''}${w.moved ? '<span class="chip">verplaatst</span>' : ''}${w.original ? '<span class="chip">aangepast</span>' : ''}${w.type === 'cross' || w.type === 'strength' ? `<span class="small muted">${esc(metaText(w))}</span>` : ''}</div>
      ${metricsHtml(w)}
      ${stepsHtml(w)}
      ${notes}
      ${log ? logSummary(log) : ''}
      ${primary || secondary ? `<div class="actions">${primary}${secondary ? `<div class="secondary">${secondary}</div>` : ''}</div>` : ''}`;
    if (opts.inModal) return `<div class="${typeClass(w)}">${body}</div>`;
    return `<article class="card ${opts.hero ? 'hero ' : ''}${typeClass(w)}">${body}</article>`;
  }

  function logSummary(l) {
    const rows = [];
    if (!RF.sports.isRunLog(l)) rows.push(['Activiteit', RF.sports.label(l.activity)]);
    rows.push(['Afstand', l.distanceKm ? u.km(l.distanceKm, 2) : '–'], ['Tijd', u.clock(l.durationSec)]);
    if (l.distanceKm && RF.sports.isRunLog(l)) rows.push(['Gem. tempo', `${u.pace(l.durationSec / l.distanceKm)} · ${u.speed(l.durationSec / l.distanceKm)}`]);
    if (l.gapSecPerKm) rows.push(['GAP (hellingen)', u.pace(l.gapSecPerKm)]);
    if (l.elevGain != null) rows.push(['Hoogtemeters', `+${u.meters(l.elevGain)} / −${u.meters(l.elevLoss || 0)}`]);
    if (l.avgHr) rows.push(['Hartslag', `gem. ${l.avgHr}${l.maxHr ? `, max. ${l.maxHr}` : ''} spm`]);
    if (l.rpe) rows.push(['RPE', RPE_TEXT[l.rpe]]);
    rows.push(['Belasting', `${u.num(RF.load.sessionLoad(l, zs()), 0)} (RPE × min)`]);
    if (l.vdot) rows.push(['VDOT uit deze prestatie', `${u.num(l.vdot, 1)}${l.vdotCorrected ? ' (gecorrigeerd)' : ''}`]);
    if (l.conditions) rows.push(['Omstandigheden', `${u.temp(l.conditions.tempC)}, ${u.num(l.conditions.humidity, 0)} % · ${u.meters(l.conditions.altitudeM || 0)}${l.maxAlt ? ` (max. ${u.meters(l.maxAlt)})` : ''}`]);
    let extra = '';
    if (l.zoneSec) {
      const tot = l.zoneSec.reduce((a, b) => a + b, 0) || 1;
      extra += RF.charts.hbars({ title: 'Tijd per hartslagzone', rows: l.zoneSec.map((s, i) => ({ label: `Zone ${i + 1}`, value: s, text: `${u.dur(s)} · ${u.num(s / tot * 100, 0)} %` })) });
    }
    if (l.splits && l.splits.length > 1) {
      extra += `<details class="disclosure"><summary>Kilometersplits</summary>${rtable(['Km', 'Tempo', 'GAP', 'Stijging'], l.splits.map((s) => [s.km, u.pace(s.pace), s.gap ? u.pace(s.gap) : '–', `+${s.gain} m`]))}</details>`;
    }
    return `<h3 class="sub-title" style="margin-top:var(--s4)">Jouw resultaat</h3>${kv(rows)}${l.notes ? `<p class="muted">${esc(l.notes)}</p>` : ''}${extra}${l.review && l.id !== 'tmp' ? reviewHtml(l.review) : ''}`;
  }

  function dayButton(w) {
    const isToday = w.date === u.today();
    const st = statusOf(w);
    const stTxt = { done: 'gedaan', missed: 'gemist', skipped: 'overgeslagen', planned: '' }[st];
    const d = u.parseISO(w.date);
    return `<li><button type="button" class="day-btn${isToday ? ' is-today' : ''}" data-action="openWorkout" data-id="${esc(w.id)}">
      <span class="d">${u.DAY_SHORT[u.weekday(w.date)]}<small>${d.getDate()} ${u.MONTHS[d.getMonth()]}</small></span>
      <span class="type-ico ${typeClass(w)}">${typeIcon(w)}</span>
      <span class="t">${esc(w.title)}<small>${esc(typeLabel(w))}${w.key ? ' · zwaar' : ''} · ${esc(metaText(w))}</small></span>
      <span class="status status-${st}">${st === 'done' ? ICON.check : st === 'missed' ? ICON.cross : st === 'skipped' ? ICON.skip : ''}<span class="sr-only">${stTxt}</span></span>
    </button></li>`;
  }

  /* ---------- coach-weergaven ---------- */
  const LEVEL_ICON = { good: ICON.check, info: ICON.info, warn: ICON.alert, bad: ICON.alert };
  const LEVEL_TEXT = { good: 'Goed', info: 'Info', warn: 'Let op', bad: 'Probleem' };
  const SCORE_ICON = { good: ICON.check, ok: ICON.alert, adjust: ICON.alert };

  function pointsList(items) {
    return `<ul class="review">${items.map((p) => `<li class="rv-${p.level}">${LEVEL_ICON[p.level]}<span><span class="sr-only">${LEVEL_TEXT[p.level]}: </span>${esc(p.text)}</span></li>`).join('')}</ul>`;
  }

  function notice(level, title, text, action) {
    return `<div class="notice ${level === 'warn' ? 'warn' : ''}">${level === 'warn' ? ICON.alert : ICON.info}<div class="notice-body"><h3>${esc(title)}</h3><p>${esc(text)}</p>${action || ''}</div></div>`;
  }

  function goalAnalysisHtml(a, g, inForm) {
    const bad = a.hasTarget && a.level !== 'ok';
    let h = `<div class="card insight ${bad ? 'warn' : ''}" style="margin-top:var(--s3)"><h3>${bad ? ICON.alert : ICON.check}${a.hasTarget ? `Doel ${esc(u.clock(g.targetSec))}: ${esc(a.verdict)}` : 'Wat is haalbaar?'}</h3>`;
    h += kv([
      [`Nu (VDOT ${u.num(a.currentVdot, 1)})`, u.clock(a.nowSec)],
      [`Realistisch na ${a.weeks} weken`, u.clock(a.feasibleSec)],
      ['Als alles meezit', u.clock(a.stretchSec)],
    ].concat(a.hasTarget ? [['Nodige VDOT-winst', `${a.needed > 0 ? `+${u.num(a.needed, 1)}` : 'geen'} (realistisch +${u.num(a.gain, 1)})`]] : []));
    h += '<ul class="notes">';
    if (a.hasTarget && a.weeksNeeded > a.weeks) h += `<li>Voor je doel is ${a.weeksNeeded > 52 ? '<strong>meer dan een jaar</strong> training' : `~<strong>${a.weeksNeeded} weken</strong> training`} nodig.</li>`;
    if (a.crossMin) h += `<li>Je andere sporten (${u.dur(a.crossMin * 60)} per week) tellen mee: CrossFit als krachttraining, en aerobe sporten geven een kleine extra.</li>`;
    const ca = a.course ? a.course.attempts : [];
    if (ca.length) {
      h += `<li>Jouw pogingen op dit parcours:<ul>${ca.map((x) => `<li>${esc(u.dateShort(x.date))}: ${u.km(x.distanceKm, 1)} in <strong>${u.clock(x.timeSec)}</strong> (${esc(RF.goal.EFFORT_LABEL[x.effort] || '')}${x.tempC != null ? `, ${u.temp(x.tempC)}` : ''})${x.factor ? ` → parcours ${x.factor >= 1 ? '+' : ''}${u.num((x.factor - 1) * 100, 1)} % t.o.v. vlak${a.course.basis === x ? ' <strong>(gebruikt)</strong>' : ''}` : ' → je fitheid van toen is onbekend: vul je 5 km-tijd van die periode in om het parcours te meten'}</li>`).join('')}</ul></li>`;
      const full = ca.filter((x) => Math.abs(x.distanceKm - a.dist) < 0.4).sort((x, y) => x.timeSec - y.timeSec)[0];
      if (full) {
        const diff = a.feasibleSec - full.timeSec;
        h += `<li>Je beste tijd op dit parcours: <strong>${u.clock(full.timeSec)}</strong> (${esc(u.dateShort(full.date))}). Verwacht na je training: <strong>${u.clock(a.feasibleSec)}</strong>, dat is ${u.clock(Math.abs(diff))} ${diff < 0 ? 'sneller' : 'langzamer'}${full.effort !== 'max' ? ' (toen niet alles gegeven)' : ''}.</li>`;
      }
    }
    if (a.cf.parts.length) h += `<li>Wedstrijdomstandigheden meegerekend: ${esc(a.cf.parts.join(', '))} (samen +${u.num(a.cf.total * 100, 1)} % t.o.v. vlak en koel).</li>`;
    h += '</ul>';
    if (bad && a.options.length) {
      h += `<p><strong>Wat helpt om je doel te halen?</strong></p><ul class="notes">${a.options.map((o) => `<li><strong>${esc(o.label)}</strong>${o.weeksOption ? '' : ` → haalbaar ~${u.clock(o.sec)}${o.reaches ? ' (doel binnen bereik)' : ''}`}. <span class="muted">${esc(o.how)}</span></li>`).join('')}</ul>`;
      h += '<p class="small muted">Elke optie los bekeken; combineren telt op. Snelheid winnen kost tijd: het grootste effect komt van consequent trainen, maanden achter elkaar.</p>';
    }
    if (bad) h += `<button type="button" class="btn small" data-action="useFeasible" data-sec="${Math.round(a.feasibleSec)}" data-inform="${inForm ? 1 : 0}">Gebruik de haalbare tijd (${u.clock(a.feasibleSec)})</button>`;
    return `${h}</div>`;
  }

  function reviewHtml(r) {
    return `<section class="card score ${r.verdict}" aria-label="Evaluatie"><div class="score-ico">${SCORE_ICON[r.verdict] || ICON.info}</div>
      <div><p class="score-label">Evaluatie</p><p class="score-title">${esc(r.headline)}</p></div>
      <div class="score-details">${pointsList(r.points)}<p><strong>Advies:</strong> ${esc(r.suggestion)}</p>${r.action ? `<button type="button" class="btn small" data-action="insight" data-fn="${esc(r.action.fn)}">${esc(r.action.label)}</button>` : ''}</div></section>`;
  }

  function onTrackHtml(o, open) {
    if (!o) return '';
    const proj = o.projectedSec ? `Verwacht: <strong>${u.clock(o.projectedSec)}</strong>${o.goalSec ? ` · doel ${u.clock(o.goalSec)}` : ''}` : 'Gebaseerd op je trainingen van de laatste 2 weken';
    return `<section class="card score ${o.status}" aria-labelledby="scoreTitle"><div class="score-ico">${SCORE_ICON[o.status]}</div>
      <div><p class="score-label">Op koers?</p><p class="score-title" id="scoreTitle">${esc(o.headline)}</p><p class="score-sub">${proj}</p></div>
      <details class="score-details disclosure"${open ? ' open' : ''}><summary>Details (${o.items.length})</summary>${pointsList(o.items)}${o.suggestions.map((s) => `<p>${esc(s.text)} <button type="button" class="btn small" data-action="insight" data-fn="${esc(s.action.fn)}">${esc(s.action.label)}</button></p>`).join('')}</details></section>`;
  }

  /** Eerdere pogingen op het wedstrijdparcours, voor het wedstrijdplan. */
  function courseSection(rp) {
    const cal = rp.analysis.course;
    if (!cal || !cal.attempts.length) return '';
    let h = `<h3>Jouw pogingen op dit parcours</h3>${rtable(['Datum', 'Afstand', 'Tijd', 'Tempo', 'Toen'], cal.attempts.map((x) => [esc(u.dateShort(x.date)), u.km(x.distanceKm, 1), u.clock(x.timeSec), u.pace(x.timeSec / x.distanceKm), `${esc(RF.goal.EFFORT_LABEL[x.effort] || '')}${x.tempC != null ? `, ${u.temp(x.tempC)}` : ''}`]))}`;
    if (cal.basis) {
      const d = rp.pace - cal.basis.timeSec / cal.basis.distanceKm;
      h += `<p>Gemeten parcoursfactor: <strong>${cal.factor >= 1 ? '+' : ''}${u.num((cal.factor - 1) * 100, 1)} %</strong> t.o.v. vlak en koel. Je plan-tempo (${u.pace(rp.pace)}) is ${u.clock(Math.abs(d))} per km ${d < 0 ? 'sneller' : 'langzamer'} dan je tempo op ${esc(u.dateShort(cal.basis.date))}${cal.basis.effort !== 'max' ? ' (toen niet maximaal)' : ''}.</p>`;
    } else h += '<p class="small muted">Vul bij Doelen je 5 km-tijd uit die periode in. Dan meet de coach hoe zwaar dit parcours voor je is.</p>';
    return h;
  }

  function racePlanHtml(rp) {
    if (!rp) return '<p>Stel een wedstrijd in als doel om een wedstrijdplan te krijgen.</p>';
    const g = state.goal;
    let h = `<p>${esc(u.km(rp.dist, rp.dist % 1 ? 1 : 0))} op ${esc(u.dateLong(g.raceDate))}.</p><p class="small muted">${esc(condSummary(raceCondObj()))}${rp.cond.gain ? ` · ${u.meters(rp.cond.gain)} hoogtemeters` : ''}.</p>`;
    h += `<h3>Je doelen</h3>${rtable(['Doel', 'Tijd', 'Tempo', 'Wanneer'], [
      ['A – droom', u.clock(rp.A), u.pace(rp.A / rp.dist), 'alles zit mee'],
      ['B – realistisch', `<strong>${u.clock(rp.B)}</strong>`, u.pace(rp.B / rp.dist), '<strong>hierop pace je</strong>'],
      ['C – minimaal', u.clock(rp.C), u.pace(rp.C / rp.dist), 'zware dag, warm of tegenwind'],
    ])}`;
    h += courseSection(rp);
    h += `<h3>Pacing</h3><p>${esc(rp.tips[0])}</p>${rtable(['Punt', 'Tempo', 'Doorkomst'], rp.splits.map((s) => [esc(s.label), u.pace(s.pace), u.clock(s.at)]))}`;
    if (rp.hills.length) h += `<h3>Hellingen: gelijke inspanning</h3>${rtable(['Helling', 'Tempo bij dezelfde inspanning'], rp.hills.map((x) => [`${x.grade > 0 ? '+' : ''}${x.grade} %`, `${u.pace(x.pace)}${x.grade < 0 ? ' <span class="small muted">(laat lopen, niet remmen)</span>' : ''}`]))}`;
    h += `<h3>Voeding tijdens de race</h3><ul class="notes"><li>${esc(rp.carbText)}</li>`;
    if (rp.gels.length) h += `<li>Schema (gel ≈ 25 g): ${rp.gels.map((x) => `${x.min} min (~km ${u.num(x.km, 1)})`).join(' · ')}. Neem elke gel met een paar slokken water.</li>`;
    h += `<li>Drinken: ${esc(rp.fluids)}.</li><li>Zout: ${esc(rp.sodium)}.</li></ul>`;
    h += `<h3>Voor de race</h3><ul class="notes">${rp.pre.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>${state.profile.weightKg ? '' : '<p class="small muted">Vul je gewicht in bij Doelen voor exacte hoeveelheden.</p>'}`;
    h += `<h3>Warming-up</h3><p>${esc(rp.warmup)}</p>`;
    h += `<h3>Tips voor wedstrijddag</h3><ul class="notes">${rp.tips.slice(1).map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`;
    h += '<p class="small muted">Voedingsrichtlijnen volgens de ACSM/IOC-consensus voor duursport. Test alles eerst in je lange duurlopen.</p>';
    return h;
  }

  /* ---------- weergaven ---------- */
  function render(focus) {
    const main = $('#view');
    RF.charts.width = Math.min(800, main.clientWidth) - 34;
    if (!state.onboarded) main.innerHTML = renderWizard();
    else if (view === 'plan') main.innerHTML = renderPlan();
    else if (view === 'progress') main.innerHTML = renderProgress();
    else if (view === 'goals') main.innerHTML = renderGoals();
    else main.innerHTML = renderToday();
    const hw = main.querySelector('.heat-wrap');
    if (hw) { const t = u.today(); const frac = yearSel === Number(t.slice(0, 4)) ? u.daysBetween(`${yearSel}-01-01`, t) / 365 : 1; hw.scrollLeft = Math.max(0, hw.scrollWidth * frac - hw.clientWidth * 0.8); }
    RF.charts.bind(main);
    document.querySelectorAll('[data-nav]').forEach((b) => {
      if (b.dataset.nav === view && state.onboarded) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
    $('#fab').hidden = !state.onboarded || view === 'goals';
    renderHeader();
    if (state.onboarded && location.hash.slice(1) !== HASH[view]) history.replaceState(null, '', `#${HASH[view]}`);
    if (!state.onboarded || view === 'goals') updateFormPreviews();
    const titles = { today: 'Vandaag', plan: 'Schema', progress: 'Voortgang', goals: 'Doelen' };
    document.title = state.onboarded ? `${titles[view]} – Run Faster` : 'Welkom – Run Faster';
    if (focus) { const h = main.querySelector('h1'); if (h) { h.setAttribute('tabindex', '-1'); h.focus(); } window.scrollTo(0, 0); }
  }

  function renderHeader() {
    const el = $('#headerStatus');
    const wk = currentWeek();
    if (!state.plan || !wk || !state.onboarded) { el.textContent = ''; return; }
    let s = `Week ${wk.n || wk.i + 1}/${state.plan.weeks.length} · ${P.PHASE_LABEL[wk.phase]}`;
    if (state.goal.type === 'race' && state.goal.raceDate >= u.today()) s += ` · ${u.daysBetween(u.today(), state.goal.raceDate)} d`;
    el.textContent = s;
  }

  function weekStrip(wk) {
    const days = [];
    for (let i = 0; i < 7; i++) {
      const date = u.addDays(wk.start, i);
      const ws = wk.workouts.filter((w) => w.date === date && w.type !== 'strength');
      const main = ws.find((w) => w.type === 'race') || ws.find((w) => w.key && w.type !== 'long') || ws.find((w) => w.type === 'long') || ws.find((w) => !P.NONRUN.has(w.type)) || ws[0];
      const d = u.parseISO(date);
      const label = main ? `${u.DAY_LONG[i + 1]} ${d.getDate()}: ${main.title}${ws.length > 1 ? ` + ${ws.length - 1} meer` : ''}${logFor(main) ? ', gedaan' : ''}` : `${u.DAY_LONG[i + 1]} ${d.getDate()}: rust`;
      const inner = `<span class="ws-d" aria-hidden="true">${u.DAY_SHORT[i + 1]}</span><span class="ws-n" aria-hidden="true">${d.getDate()}</span><span class="ws-ico ${main ? typeClass(main) : 'rest'}" aria-hidden="true">${main ? (logFor(main) ? ICON.check : typeIcon(main)) : ''}</span>`;
      days.push(main
        ? `<button type="button" class="ws-day${date === u.today() ? ' is-today' : ''}" data-action="openWorkout" data-id="${esc(main.id)}" aria-label="${esc(label)}">${inner}</button>`
        : `<div class="ws-day${date === u.today() ? ' is-today' : ''}" role="img" aria-label="${esc(label)}">${inner}</div>`);
    }
    const legend = [['tc-easy', 'rustig'], ['tc-key', 'zwaar'], ['tc-long', 'lang'], ['tc-cross', 'andere sport']];
    return `<div class="weekstrip">${days.join('')}</div><ul class="ws-legend" aria-hidden="true">${legend.map(([c, l]) => `<li class="${c}"><i></i>${l}</li>`).join('')}</ul>`;
  }

  function renderToday() {
    const t = u.today();
    if (!state.plan) return `<div class="page-head"><h1>Vandaag</h1></div><div class="card empty"><p>Er is nog geen schema.</p><button class="btn primary" type="button" data-nav="goals">Schema maken</button></div>`;
    const all = P.allWorkouts(state);
    const todays = all.filter((w) => w.date === t);
    const next = all.filter((w) => w.date > t && w.type !== 'strength').slice(0, 4);
    const track = RF.coach.onTrack(state, t);
    const trackFns = new Set(track ? track.suggestions.map((s) => s.action.fn) : []);
    const ins = P.insights(state, t).filter((x) => !(x.action && trackFns.has(x.action.fn) && x.id === 'goal'));
    const c = condFor(t);
    const tc = todayCond();
    const wk = currentWeek();
    let html = `<div class="page-head"><h1>Vandaag</h1><p>${esc(u.dateLong(t))}</p></div>`;

    html += onTrackHtml(track);

    const runsToday = todays.filter((w) => !P.NONRUN.has(w.type));
    const otherToday = todays.filter((w) => P.NONRUN.has(w.type));
    if (runsToday.length) html += runsToday.map((w, i) => workoutCard(w, { hero: i === 0 })).join('');
    else {
      const n = next[0];
      html += `<article class="card hero tc-rest"><p class="eyebrow">Rustdag</p><h2 class="workout-title">Vandaag geen run</h2><p class="muted">Herstel is training: je lichaam wordt sterker in de rust. Wandelen, mobiliteit of rustig fietsen mag.</p>${n ? `<p>Volgende: <strong>${esc(n.title)}</strong> · ${esc(u.dateShort(n.date))}</p>` : ''}</article>`;
    }
    if (otherToday.length) html += otherToday.map((w) => workoutCard(w)).join('');

    const g = state.goal;
    if (g.type === 'race' && g.raceDate >= t && u.daysBetween(t, g.raceDate) <= 21) {
      html += `<div class="card hero tc-key"><p class="eyebrow">Wedstrijd over ${u.daysBetween(t, g.raceDate)} dagen</p><h2 class="workout-title">Je wedstrijdplan staat klaar</h2><p class="muted">Doelen, splits per kilometer, hellingstrategie en wanneer je wat eet en drinkt.</p><div class="actions"><button type="button" class="btn primary" data-action="racePlan">${ICON.flag} Wedstrijdplan bekijken</button></div></div>`;
    }

    if (ins.length) {
      html += `<h2 class="section-title">Coach</h2>${ins.map((x) => notice(x.level, x.title, x.text, x.action ? `<button type="button" class="btn small" data-action="insight" data-fn="${esc(x.action.fn)}" data-arg="${esc(x.action.arg || '')}">${esc(x.action.label)}</button>` : '')).join('')}`;
    }

    if (wk) {
      const done = weekDone(wk);
      const pct = Math.min(100, done.min / Math.max(1, wk.targetMin) * 100);
      html += `<h2 class="section-title">Deze week</h2><div class="card">${weekStrip(wk)}
        <p class="small" style="margin:var(--s2) 0 var(--s1)"><strong>${u.dur(done.min * 60)}</strong> van ${u.dur(wk.targetMin * 60)} gelopen · ${u.km(done.km)}${done.crossMin ? ` · + ${u.dur(done.crossMin * 60)} andere sport` : ''}</p>
        <div class="progressbar" role="img" aria-label="${Math.round(pct)} procent van het weekvolume gedaan"><span style="width:${pct.toFixed(0)}%"></span></div></div>`;
    }

    if (next.length) html += `<h2 class="section-title">Komende dagen</h2><div class="card"><ul class="day-list">${next.map(dayButton).join('')}</ul></div>`;

    html += `<h2 class="section-title">Omstandigheden vandaag</h2><div class="card"><p class="small" style="margin:0">${esc(condSummary(c))}</p>
      <details class="disclosure"${tc ? ' open' : ''}><summary>Aanpassen voor vandaag</summary>
      <form data-form="todayCond" aria-label="Omstandigheden vandaag aanpassen">
        <div class="row">
          ${sel({ id: 'tcPreset', name: 'preset', label: 'Situatie', value: tc ? tc.preset : state.conditions.preset, options: presetList(), wide: true })}
          ${fld({ id: 'tcTemp', name: 'tempC', label: 'Temperatuur', unit: '°C', mode: 'decimal', min: -20, max: 50, value: c.tempC })}
          ${fld({ id: 'tcHum', name: 'humidity', label: 'Luchtvochtigheid', unit: '%', mode: 'numeric', min: 5, max: 100, value: c.humidity })}
          ${sel({ id: 'tcTer', name: 'terrain', label: 'Terrein', value: c.terrain, options: terrainList(), wide: true })}
        </div>
        <div class="btn-row"><button type="submit" class="btn primary">Toepassen</button>${tc ? '<button type="button" class="btn" data-action="resetTodayCond">Standaard</button>' : ''}</div>
      </form></details></div>`;
    return html;
  }

  function weekDone(wk) {
    const end = u.addDays(wk.start, 6);
    const all = state.logs.filter((l) => l.date >= wk.start && l.date <= end);
    const logs = all.filter(RF.sports.isRunLog);
    return { min: logs.reduce((s, l) => s + l.durationSec / 60, 0), km: logs.reduce((s, l) => s + (l.distanceKm || 0), 0), crossMin: all.filter((l) => !RF.sports.isRunLog(l)).reduce((s, l) => s + l.durationSec / 60, 0) };
  }

  function goalText(g = state.goal) {
    const dist = g.distanceKm ? u.km(g.distanceKm, g.distanceKm % 1 ? 1 : 0) : '';
    if (g.type === 'race') return `Wedstrijd ${dist}${g.raceDate ? ` op ${u.dateShort(g.raceDate)}` : ''}${g.targetSec ? ` · doel ${u.clock(g.targetSec)}` : ''}`;
    if (g.type === 'speed') return `Sneller op de ${dist}${g.targetSec ? ` · doel ${u.clock(g.targetSec)}` : ''} · ${g.planWeeks} weken`;
    return `Uithoudingsvermogen · lange duurloop naar ${u.dur((g.longRunMin || 120) * 60)}`;
  }

  function renderPlan() {
    if (!state.plan) return `<div class="page-head"><h1>Schema</h1></div><div class="card empty"><p>Er is nog geen schema.</p></div>`;
    const cur = currentWeek();
    let html = `<div class="page-head"><h1>Schema</h1><p>${esc(goalText())}</p></div>`;
    html += `<div class="card"><p class="small muted" style="margin:0">Coachstijl: <strong>${esc(P.STYLE_LABEL[state.coachStyle])}</strong> · ${state.plan.weeks.length} weken. Tik een training aan voor details, loggen of verplaatsen.</p>${state.goal.type === 'race' ? `<div class="btn-row"><button type="button" class="btn small" data-action="racePlan">${ICON.flag} Wedstrijdplan</button><button type="button" class="btn small" data-action="goalDetails">${ICON.target} Haalbaarheid doel</button></div>` : ''}</div>`;
    html += state.plan.weeks.map((wk) => {
      const end = u.addDays(wk.start, 6);
      const done = weekDone(wk);
      const runs = wk.workouts.filter((w) => !P.NONRUN.has(w.type));
      const nDone = runs.filter((w) => logFor(w)).length;
      const pct = Math.min(100, done.min / Math.max(1, wk.targetMin) * 100);
      const isCur = cur && cur.start === wk.start;
      return `<details class="week${isCur ? ' is-current' : ''}" ${isCur ? 'open' : ''}><summary><span class="wk-title">Week ${wk.n || wk.i + 1}${wk.cutback ? ' · herstel' : ''}${isCur ? ' · nu' : ''}</span>${phaseChip(wk.phase)}
        <span class="wk-sub">${esc(u.dateShort(wk.start))} – ${esc(u.dateShort(end))}</span>
        <span class="wk-figs"><span>Gepland <strong>${u.dur(wk.targetMin * 60)}</strong> (≈ ${u.km(wk.targetKm, 0)})</span><span>Gedaan <strong>${u.dur(done.min * 60)}</strong></span><span>Runs <strong>${nDone}/${runs.length}</strong></span>${done.crossMin ? `<span>Andere sport <strong>${u.dur(done.crossMin * 60)}</strong></span>` : ''}</span>
        ${wk.start <= u.today() ? `<span class="progressbar" aria-hidden="true"><span style="width:${pct.toFixed(0)}%"></span></span>` : ''}</summary>
        <div class="week-body"><ul class="day-list">${wk.workouts.length ? wk.workouts.map(dayButton).join('') : '<li class="muted">Geen trainingen.</li>'}</ul></div></details>`;
    }).join('');
    return html;
  }

  /* ---------- kalender & jaaroverzicht ---------- */
  const MONTHS_LONG = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december'];
  const pad2 = (n) => String(n).padStart(2, '0');
  const LV_LABEL = ['geen run', '< 30 min', '30–60 min', '60–90 min', '> 90 min'];

  function mainOf(ws) {
    return ws.find((w) => w.type === 'race') || ws.find((w) => w.key && w.type !== 'long') || ws.find((w) => w.type === 'long') || ws.find((w) => !P.NONRUN.has(w.type)) || ws.find((w) => w.type === 'cross');
  }

  function calendarHtml() {
    const dt = RF.stats.dayTotals(state.logs);
    const t = u.today();
    const first = `${calY}-${pad2(calM + 1)}-01`;
    const daysIn = new Date(calY, calM + 1, 0).getDate();
    const lead = u.weekday(first) - 1;
    const ms = RF.stats.monthSummary(state.logs, calY, calM);
    const all = P.allWorkouts(state).filter((w) => w.date.startsWith(first.slice(0, 7)) && w.type !== 'strength');
    let cells = '';
    for (let i = 0; i < lead; i++) cells += '<li class="cal-empty" aria-hidden="true"></li>';
    for (let d = 1; d <= daysIn; d++) {
      const date = `${calY}-${pad2(calM + 1)}-${pad2(d)}`;
      const tot = dt[date];
      const lv = RF.stats.level(tot ? tot.runMin : 0);
      const plan = date >= t ? mainOf(all.filter((w) => w.date === date)) : null;
      const dots = [];
      if (tot && tot.hard) dots.push('tc-key');
      if (tot && tot.long) dots.push('tc-long');
      if (tot && tot.crossMin) dots.push('tc-cross');
      const parts = [];
      if (tot && tot.runMin) parts.push(`${u.dur(tot.runMin * 60)} hardlopen${tot.km ? `, ${u.km(tot.km)}` : ''}`);
      if (tot && tot.crossMin) parts.push(`${u.dur(tot.crossMin * 60)} andere sport`);
      if (plan) parts.push(`gepland: ${plan.title}`);
      const label = `${u.dateLong(date)}: ${parts.length ? parts.join(', ') : 'geen training'}`;
      cells += `<li><button type="button" class="cal-day lv${lv}${date === t ? ' is-today' : ''}${date > t ? ' future' : ''}" data-action="calDay" data-date="${date}" aria-label="${esc(label)}">
        <span class="cal-n" aria-hidden="true">${d}</span>
        <span class="cal-dots" aria-hidden="true">${dots.map((c) => `<i class="${c}"></i>`).join('')}${plan ? `<i class="plan ${typeClass(plan)}"></i>` : ''}</span></button></li>`;
    }
    return `<div class="card cal-card">
      <div class="cal-head"><button type="button" class="icon-btn" data-action="calMove" data-dir="-1" aria-label="Vorige maand">${ICON.chevL}</button>
        <h2 id="calTitle" tabindex="-1">${MONTHS_LONG[calM]} ${calY}</h2>
        <button type="button" class="icon-btn" data-action="calMove" data-dir="1" aria-label="Volgende maand">${ICON.chevR}</button></div>
      <div class="cal-tot"><span><strong>${u.num(ms.km, 1)}</strong> km</span><span><strong>${u.dur(ms.runMin * 60)}</strong> lopen</span><span><strong>${ms.runs}</strong> runs</span>${ms.cross ? `<span><strong>${ms.cross}</strong> andere sport</span>` : ''}</div>
      <ol class="cal cal-wd" aria-hidden="true">${[1, 2, 3, 4, 5, 6, 7].map((d) => `<li>${u.DAY_SHORT[d]}</li>`).join('')}</ol>
      <ol class="cal" aria-label="Dagen van ${MONTHS_LONG[calM]}">${cells}</ol>
      <ul class="cal-legend" aria-hidden="true">${[1, 2, 3, 4].map((l) => `<li><i class="sw lv${l}"></i>${LV_LABEL[l]}</li>`).join('')}<li><i class="dot tc-key"></i>zwaar</li><li><i class="dot tc-long"></i>lang</li><li><i class="dot tc-cross"></i>andere sport</li><li><i class="dot plan tc-easy"></i>gepland</li></ul>
    </div>`;
  }

  function calDayModal(date) {
    const logs = state.logs.filter((l) => l.date === date);
    const ws = P.allWorkouts(state).filter((w) => w.date === date);
    let h = '';
    if (logs.length) {
      h += `<h3 class="sub-title">Gedaan</h3><ul class="sheet-list">${logs.map((l) => {
        const run = RF.sports.isRunLog(l);
        const bits = [l.distanceKm ? u.km(l.distanceKm) : '', u.clock(l.durationSec), run && l.distanceKm ? u.pace(l.durationSec / l.distanceKm) : '', l.rpe ? `RPE ${l.rpe}` : ''].filter(Boolean).join(' · ');
        return `<li><button type="button" class="sheet-btn" data-action="viewLog" data-id="${esc(l.id)}"><span class="type-ico ${run ? 'tc-easy' : 'tc-cross'}">${run ? ICON.run : ICON.ball}</span><span><strong>${esc(run ? 'Hardlopen' : RF.sports.label(l.activity))}</strong><small>${esc(bits)}</small></span></button></li>`;
      }).join('')}</ul>`;
    }
    if (ws.length) h += `<h3 class="sub-title" style="margin-top:var(--s4)">Schema</h3><ul class="day-list">${ws.map(dayButton).join('')}</ul>`;
    if (!h) h = '<p class="muted">Geen training op deze dag.</p>';
    openModal(u.dateLong(date), h);
  }

  function yearHtml() {
    const thisYear = Number(u.today().slice(0, 4));
    const years = [...new Set(state.logs.map((l) => Number(l.date.slice(0, 4))).concat(thisYear))].sort();
    if (!years.includes(yearSel)) yearSel = years[years.length - 1];
    const y = yearSel;
    const ys = RF.stats.yearSummary(state.logs, y);
    const dt = RF.stats.dayTotals(state.logs);
    // heatmap (weken × dagen)
    const start = u.mondayOf(`${y}-01-01`), end = `${y}-12-31`;
    const STEP = 15, CELL = 12, LEFT = 22, TOP = 16;
    let col = 0, rects = '', months = '';
    let lastMonth = -1;
    for (let m = start; m <= end; m = u.addDays(m, 7), col++) {
      for (let i = 0; i < 7; i++) {
        const date = u.addDays(m, i);
        if (date < `${y}-01-01` || date > end) continue;
        const tot = dt[date];
        const lv = RF.stats.level(tot ? tot.runMin : 0);
        const txt = `${u.dateShort(date)}: ${tot && tot.runMin ? `${u.dur(tot.runMin * 60)} hardlopen` : 'geen run'}${tot && tot.crossMin ? `, ${u.dur(tot.crossMin * 60)} andere sport` : ''}`;
        rects += `<rect class="hm lv${lv}" x="${LEFT + col * STEP}" y="${TOP + i * STEP}" width="${CELL}" height="${CELL}" rx="3"><title>${esc(txt)}</title></rect>`;
        const mo = u.parseISO(date).getMonth();
        if (i === 0 && mo !== lastMonth && u.parseISO(date).getDate() <= 7) { months += `<text class="tick" x="${LEFT + col * STEP}" y="11">${u.MONTHS[mo]}</text>`; lastMonth = mo; }
      }
    }
    const W = LEFT + col * STEP, H = TOP + 7 * STEP;
    const dayLbl = [[0, 'ma'], [2, 'wo'], [4, 'vr'], [6, 'zo']].map(([i, l]) => `<text class="tick" x="0" y="${TOP + i * STEP + 10}">${l}</text>`).join('');
    const heat = `<figure class="chart"><figcaption>Elke dag van ${y}</figcaption>
      <div class="heat-wrap"><svg class="heat" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Heatmap van je hardlooptijd per dag in ${y}: ${ys.activeDays} actieve dagen.">${months}${dayLbl}${rects}</svg></div>
      <ul class="cal-legend" aria-hidden="true"><li>minder</li>${[0, 1, 2, 3, 4].map((l) => `<li><i class="sw lv${l}"></i></li>`).join('')}<li>meer</li></ul>
      <details class="chart-table"><summary>Toon als tabel</summary>${rtable(['Maand', 'Km', 'Tijd', 'Runs', 'Andere sport'], ys.months.map((m, i) => [MONTHS_LONG[i], u.num(m.km, 1), u.dur(m.runMin * 60), m.runs, m.cross]))}</details></figure>`;
    const bars = RF.charts.bars({ title: `Kilometers per maand in ${y}`, categories: u.MONTHS.slice(), series: [{ name: 'Km', cls: 's1', values: ys.months.map((m) => Math.round(m.km * 10) / 10) }], fmt: (v) => `${u.num(v, v % 1 ? 1 : 0)} km` });
    const review = [
      ['Gelopen', `${u.km(ys.km, 0)} · ${u.dur(ys.runMin * 60)}`],
      ['Runs', `${ys.runs} (${ys.activeDays} actieve dagen)`],
      ['Hoogtemeters', `+${u.meters(ys.elev)}`],
    ];
    if (ys.longest) review.push(['Langste run', `${u.km(ys.longest.distanceKm)} · ${u.dateShort(ys.longest.date)}`]);
    if (ys.bestVdot) review.push(['Beste VDOT', u.num(ys.bestVdot, 1)]);
    if (ys.mostActive != null) review.push(['Drukste maand', MONTHS_LONG[ys.mostActive]]);
    review.push(['Langste reeks', `${ys.streak} ${ys.streak === 1 ? 'week' : 'weken'} op rij met 3+ runs`]);
    if (ys.cross) review.push(['Andere sport', `${ys.cross} sessies · ${u.num(ys.crossShare * 100, 0)} % van je tijd`]);
    return `<h2 class="section-title">Jaaroverzicht</h2>
      ${years.length > 1 ? `<div class="seg" role="group" aria-label="Kies een jaar" style="margin-bottom:var(--s3)">${years.map((yy) => `<label><button type="button" class="seg-btn" data-action="setYear" data-year="${yy}" aria-pressed="${yy === y}"><span>${yy}</span></button></label>`).join('')}</div>` : ''}
      <div class="card review-card"><p class="eyebrow">Year in Review</p><h2>${y}${y === thisYear ? ' tot nu toe' : ''}</h2>${kv(review)}</div>
      <div class="card">${heat}</div>
      <div class="card">${bars}</div>`;
  }

  function renderProgress() {
    const t = u.today();
    const z = zs();
    const a = RF.load.acwr(state.logs, t, z);
    const share = RF.load.intensityShare(state.logs, u.addDays(t, -27), t);
    const recentRuns = state.logs.filter((l) => l.date > u.addDays(t, -28) && RF.sports.isRunLog(l));
    const km28 = recentRuns.reduce((s, l) => s + (l.distanceKm || 0), 0);
    let html = `<div class="page-head"><h1>Voortgang</h1><p>Fitheid, belasting en je logboek</p></div><div class="stats">
      <div class="stat"><p class="label">Fitheid (VDOT)</p><p class="value">${u.num(state.fitness.vdot, 1)}</p><p class="sub">${state.plan ? `schemadoel ${u.num(state.plan.goalVdot, 1)}` : ''}</p></div>
      <div class="stat"><p class="label">Laatste 4 weken</p><p class="value">${u.km(km28, 0)}</p><p class="sub">${recentRuns.length} runs · ${state.logs.filter((l) => l.date > u.addDays(t, -28) && !RF.sports.isRunLog(l)).length} andere sport</p></div>
      <div class="stat"><p class="label">Belasting (ACWR)</p><p class="value">${a.ratio ? u.num(a.ratio, 2) : '–'}</p><p class="sub">${!a.reliable ? 'na 3 weken betrouwbaar' : a.ratio > 1.5 ? 'te snelle stijging' : a.ratio < 0.8 ? 'lager dan gewend' : 'in balans (0,8–1,3)'}</p></div>
      <div class="stat"><p class="label">Rustig (zone 1–2)</p><p class="value">${share ? `${u.num(share.low * 100, 0)} %` : '–'}</p><p class="sub">doel ≈ 80 %</p></div>
    </div>`;
    html += `<h2 class="section-title">Kalender</h2>${calendarHtml()}`;

    if (state.plan) {
      const weeks = state.plan.weeks;
      const ci = Math.max(0, weeks.findIndex((w) => w.start === u.mondayOf(t)));
      const sl = weeks.slice(Math.max(0, ci - 9), ci + 3);
      html += `<div class="card">${RF.charts.bars({
        title: 'Volume per week: gepland vs. gedaan',
        categories: sl.map((w) => `W${w.n || w.i + 1}`),
        series: [
          { name: 'Gepland', cls: 's1', values: sl.map((w) => w.targetMin / 60) },
          { name: 'Gedaan', cls: 's2', values: sl.map((w) => (w.start <= t ? weekDone(w).min / 60 : null)) },
        ],
        fmt: (v, tick) => (tick ? `${u.num(v, v % 1 ? 1 : 0)} u` : u.dur(v * 3600)),
        highlight: sl.findIndex((w) => w.start === u.mondayOf(t)),
      })}</div>`;
    }

    const wl = RF.load.weekly(state.logs, t, 10, z);
    if (state.logs.length) {
      html += `<div class="card">${RF.charts.bars({
        title: 'Trainingsbelasting per week',
        categories: wl.map((w) => u.dateShort(w.start).replace(/^\S+ /, '')),
        series: [{ name: 'Hardlopen', cls: 's1', values: wl.map((w) => Math.round(w.runLoad)) }, { name: 'Andere sporten', cls: 's2', values: wl.map((w) => Math.round(w.crossLoad)) }],
        fmt: (v) => u.num(v, 0),
        stacked: true,
      })}<p class="small muted">Belasting = RPE × minuten. ACWR = laatste 7 dagen ÷ gemiddelde week van de laatste 28 dagen; 0,8–1,3 is de sweet spot, boven 1,5 stijgt het blessurerisico.</p></div>`;
      const since = u.addDays(t, -27);
      const other = state.logs.filter((l) => l.date >= since && !RF.sports.isRunLog(l));
      if (other.length || (state.activities || []).length) {
        const by = {};
        other.forEach((l) => { const k = l.activity; by[k] = by[k] || { n: 0, sec: 0, load: 0 }; by[k].n++; by[k].sec += l.durationSec; by[k].load += RF.load.sessionLoad(l, z); });
        const runL = state.logs.filter((l) => l.date >= since && RF.sports.isRunLog(l));
        const rows = [['Hardlopen', runL.length, runL.reduce((s, l) => s + l.durationSec, 0), runL.reduce((s, l) => s + RF.load.sessionLoad(l, z), 0)]].concat(Object.entries(by).map(([k, v]) => [RF.sports.label(k), v.n, v.sec, v.load]));
        const tot = rows.reduce((s, r) => s + r[3], 0) || 1;
        html += `<div class="card"><h2>Alle sporten (28 dagen)</h2>${rtable(['Sport', 'Sessies', 'Tijd', 'Belasting'], rows.map((r) => [esc(r[0]), r[1], u.dur(r[2]), `${u.num(r[3], 0)} (${u.num(r[3] / tot * 100, 0)} %)`]))}${(state.activities || []).length ? `<p class="small muted">Vaste routine: ${state.activities.map((x) => `${esc(RF.sports.label(x.type))} ${x.days.map((d) => u.DAY_SHORT[d]).join('/')} ${x.durationMin} min`).join(' · ')}.</p>` : ''}</div>`;
      }
    }

    const hist = (state.fitness.history || []).slice(-20);
    if (hist.length) html += `<div class="card">${RF.charts.line({ title: 'Fitheid (VDOT) door de tijd', labels: hist.map((h) => u.dateShort(h.date).replace(/^\S+ /, '')), values: hist.map((h) => h.vdot), fmt: (v) => u.num(v, 1) })}</div>`;

    if (share) {
      const zsum = [0, 0, 0, 0, 0];
      state.logs.filter((l) => l.zoneSec && l.date > u.addDays(t, -28)).forEach((l) => l.zoneSec.forEach((s, i) => { zsum[i] += s; }));
      const tot = zsum.reduce((x, y) => x + y, 0) || 1;
      html += `<div class="card">${RF.charts.hbars({ title: 'Tijd per hartslagzone (28 dagen)', rows: zsum.map((s, i) => ({ label: `Zone ${i + 1}`, value: s, text: `${u.dur(s)} · ${u.num(s / tot * 100, 0)} %` })) })}</div>`;
    }

    html += yearHtml();

    const dists = [[1000, '1 km'], [5000, '5 km'], [10000, '10 km'], [21097.5, 'Halve marathon'], [42195, 'Marathon']];
    html += `<div class="card"><h2>Wedstrijdvoorspellingen</h2><p class="small muted">Vlak parcours, koel weer (VDOT-model van Jack Daniels).</p>${rtable(['Afstand', 'Nu', 'Tempo', ...(state.plan ? ['Schemadoel'] : [])], dists.map(([m, l]) => {
      const now = RF.vdot.predict(state.fitness.vdot, m);
      const row = [l, `<strong>${u.clock(now)}</strong>`, u.pace(now / (m / 1000))];
      if (state.plan) row.push(u.clock(RF.vdot.predict(state.plan.goalVdot, m)));
      return row;
    }))}</div>`;

    const c = ctx(t);
    html += `<div class="card"><h2>Jouw trainingstempo's</h2><p class="small muted">Vlak = koel en vlak. Aangepast = met je standaardomstandigheden.</p>${rtable(['Zone', 'Vlak', 'Aangepast', 'Hartslag', 'RPE'], ['E', 'M', 'S', 'T', 'I', 'R'].map((zk) => {
      const tt = P.targetFor({ zone: zk }, { ...c, cond: state.conditions });
      return [esc(tt.label), u.paceRange(tt.flat[0], tt.flat[1]), tt.effortBased ? 'op hartslag/RPE' : u.paceRange(tt.adjusted[0], tt.adjusted[1]), tt.hr ? `${tt.hr[0]}–${tt.hr[1]}` : '–', tt.rpe];
    }))}</div>`;

    html += `<div class="card"><h2>Hartslagzones</h2><p class="small muted">Methode: ${esc(z.method)}. Aanpassen kan bij Doelen → Fitheid & hartslag.</p>${rtable(['Zone', 'Hartslag', 'Gebruik'], z.list.map((x) => [`${x.z} – ${x.name}`, `${x.lo}–${x.hi} spm`, ['Herstel, wandelen', 'Rustige en lange duurlopen', 'Marathontempo, sub-drempel', 'Drempel', 'Intervallen, heuvels'][x.z - 1]]))}</div>`;

    if (state.logs.length) {
      const longest = state.logs.filter(RF.sports.isRunLog).reduce((m, l) => (l.distanceKm > (m ? m.distanceKm : 0) ? l : m), null);
      const climb = state.logs.reduce((m, l) => ((l.elevGain || 0) > (m ? m.elevGain || 0 : 0) ? l : m), null);
      const recs = [['Totaal gelopen', `${u.km(state.logs.filter(RF.sports.isRunLog).reduce((s, l) => s + (l.distanceKm || 0), 0), 0)} in ${state.logs.length} trainingen`]];
      if (longest) recs.unshift(['Langste run', `${u.km(longest.distanceKm)} · ${u.dateShort(longest.date)}`]);
      if (climb && climb.elevGain) recs.splice(1, 0, ['Meeste hoogtemeters', `+${u.meters(climb.elevGain)} · ${u.dateShort(climb.date)}`]);
      html += `<div class="card"><h2>Records</h2>${kv(recs)}</div>`;
      const recent = state.logs.slice().sort((x, y) => (x.date < y.date ? 1 : -1)).slice(0, 25);
      html += `<div class="card"><h2>Logboek</h2>${rtable(['Datum', 'Afstand', 'Tijd', 'Tempo', 'RPE', 'Details'], recent.map((l) => [
        `${esc(u.dateShort(l.date))}${RF.sports.isRunLog(l) ? '' : ` <span class="small muted">· ${esc(RF.sports.label(l.activity))}</span>`}`,
        l.distanceKm ? u.km(l.distanceKm) : '–', u.clock(l.durationSec),
        `${l.distanceKm && RF.sports.isRunLog(l) ? u.pace(l.durationSec / l.distanceKm) : '–'}${l.gapSecPerKm ? ` <span class="small muted">(GAP ${u.pace(l.gapSecPerKm)})</span>` : ''}`,
        l.rpe || '–',
        `<button type="button" class="linklike" data-action="viewLog" data-id="${esc(l.id)}">Bekijk</button>`,
      ]))}</div>`;
    } else html += '<div class="card empty"><p>Nog geen trainingen gelogd.</p><p class="muted small">Tik op + om een run te loggen of een Garmin-bestand te importeren.</p></div>';
    return html;
  }

  /* ---------- formulier (wizard + doelen) ---------- */
  const presetList = () => Object.entries(RF.cond.PRESETS).map(([k, p]) => [k, p.label]).concat([['custom', 'Eigen instelling']]);
  const terrainList = () => Object.entries(RF.cond.TERRAIN).map(([k, t]) => [k, t.label]);
  // compat: opties als HTML (voor openWorkout)
  const terrainOptions = (selv) => terrainList().map(([k, l]) => `<option value="${k}" ${k === selv ? 'selected' : ''}>${esc(l)}</option>`).join('');

  const SECTIONS = [
    { key: 'goal', icon: 'target', title: 'Je doel' },
    { key: 'fit', icon: 'heart', title: 'Fitheid & hartslag' },
    { key: 'plan', icon: 'calendar', title: 'Planning & coachstijl' },
    { key: 'cond', icon: 'sun', title: 'Omstandigheden' },
    { key: 'sports', icon: 'layers', title: 'Andere sporten' },
  ];

  function section(i, body, mode) {
    const s = SECTIONS[i];
    const isStatic = mode === 'wizard';
    const open = isStatic || openSect === s.key;
    const headInner = `<span class="sect-ico">${ICON[s.icon]}</span><span><span class="sect-title">${s.title}</span><span class="sect-sum" id="sum-${s.key}"></span></span><span class="sect-chev" aria-hidden="true"></span>`;
    return `<fieldset class="sect${open ? ' is-open' : ''}${isStatic ? ' static' : ''}" data-step="${i}" data-sect="${s.key}"${isStatic && i !== wizardStep ? ' hidden' : ''}>
      <legend class="sr-only">${i + 1}. ${s.title}</legend>
      ${isStatic ? `<div class="sect-head">${headInner}</div>` : `<button type="button" class="sect-head" data-action="toggleSection" data-key="${s.key}" aria-expanded="${open}" aria-controls="sb-${s.key}">${headInner}</button>`}
      <div class="sect-body" id="sb-${s.key}"${open ? '' : ' hidden'}>${body}</div>
    </fieldset>`;
  }

  function formSections(mode) {
    const g = state.goal, f = state.fitness, fi = f.input || {}, p = state.profile, s = state.schedule, c = state.conditions, fac = state.facilities;
    const distSel = [5, 10, 21.1, 42.2].includes(Number(g.distanceKm)) ? String(g.distanceKm) : 'custom';
    const bodies = [
      sub('Wat wil je bereiken?', `<div class="choices" role="radiogroup" aria-label="Soort doel">
          ${radio('goalType', 'race', g.type, 'Wedstrijd', 'Een race op een datum, met of zonder doeltijd')}
          ${radio('goalType', 'speed', g.type, 'Sneller worden', 'Je tijd op een afstand verbeteren; eindigt met een tijdrit')}
          ${radio('goalType', 'endurance', g.type, 'Uithoudingsvermogen', 'Langer kunnen lopen; opbouwen naar een lange duurloop')}
        </div>`)
      + sub('Afstand & doeltijd', `<div class="row">
          ${sel({ id: 'fDist', name: 'distSel', label: 'Afstand', value: distSel, show: 'race speed', options: [['5', '5 km'], ['10', '10 km'], ['21.1', 'Halve marathon'], ['42.2', 'Marathon'], ['custom', 'Andere afstand…']] })}
          ${fld({ id: 'fDistCustom', name: 'distCustom', label: 'Eigen afstand', unit: 'km', mode: 'decimal', step: '0.1', min: 1, max: 100, value: distSel === 'custom' ? g.distanceKm : '', show: 'race speed', showDist: 'custom' })}
          ${fld({ id: 'fRaceDate', name: 'raceDate', type: 'date', label: 'Wedstrijddatum', value: g.raceDate || '', min: u.addDays(u.today(), 7), show: 'race' })}
          ${timeFld({ id: 'fTarget', name: 'target', label: 'Doeltijd (optioneel)', sec: g.targetSec, show: 'race speed' })}
          ${sel({ id: 'fRaceTer', name: 'raceTerrain', label: 'Parcours', value: g.raceTerrain, show: 'race', options: [['flat', 'Vlak'], ['hilly', 'Heuvelachtig'], ['trail', 'Trail']] })}
          ${fld({ id: 'fWeeks', name: 'planWeeks', label: 'Aantal weken', unit: 'wk', mode: 'numeric', min: 4, max: 30, value: g.planWeeks || 12, show: 'speed endurance' })}
          ${fld({ id: 'fLongMin', name: 'longRunMin', label: 'Doel lange duurloop', unit: 'min', mode: 'numeric', min: 30, max: 300, step: 5, value: g.longRunMin || 120, show: 'endurance' })}
        </div>`)
      + sub('Omstandigheden op wedstrijddag', `<div class="row">
          ${fld({ id: 'fRaceTemp', name: 'raceTempC', label: 'Temperatuur', unit: '°C', mode: 'decimal', min: -20, max: 50, value: g.raceTempC ?? 15 })}
          ${fld({ id: 'fRaceHum', name: 'raceHumidity', label: 'Luchtvochtigheid', unit: '%', mode: 'numeric', min: 5, max: 100, value: g.raceHumidity ?? 60 })}
          ${fld({ id: 'fRaceAlt', name: 'raceAltitudeM', label: 'Hoogte', unit: 'm', mode: 'numeric', min: 0, max: 5000, value: g.raceAltitudeM ?? 0 })}
          ${fld({ id: 'fRaceGain', name: 'raceElevGain', label: 'Hoogtemeters', unit: 'm', mode: 'numeric', min: 0, max: 10000, value: g.raceElevGain ?? 0, hint: 'Totale stijging van het parcours' })}
        </div>`, 'race')
      + sub('Eerdere pogingen op dit parcours', `<p class="hint" style="margin:0 0 var(--s3)">Een eerdere editie of een proefloop op (een deel van) het parcours. Zo meet de coach hoe zwaar dit parcours voor jóu is.</p>
          <div id="courseRows">${(g.courseAttempts || []).map(courseRow).join('')}</div>
          <button type="button" class="btn small" data-action="addCourse">${ICON.plus} Poging toevoegen</button>`, 'race')
      + '<div id="goalPreview" aria-live="polite"></div>',

      sub('Niveau', sel({ id: 'fLevel', name: 'experience', label: 'Ervaring', value: p.experience, options: [['beginner', 'Beginner (< 1 jaar of < 15 km/week)'], ['intermediate', 'Gemiddeld (15–40 km/week)'], ['advanced', 'Gevorderd (> 40 km/week)']] }))
      + sub('Huidige fitheid', `${seg('fitSource', [['race', 'Wedstrijd / tijdrit'], ['easy', 'Rustige duurloop'], ['vdot', 'VDOT bekend']], fi.source || 'race', 'Hoe bepalen we je fitheid?')}
          <div class="row" data-fit="race">
            ${sel({ id: 'fRaceDist', name: 'fitRaceDist', label: 'Afstand', value: fi.raceDist || 5, options: [[3, '3 km'], [5, '5 km'], [10, '10 km'], [21.0975, 'Halve marathon'], [42.195, 'Marathon']] })}
            ${timeFld({ id: 'fRaceTime', name: 'fitRaceTime', label: 'Tijd', sec: u.parseClock(fi.raceTime) })}
          </div>
          <div class="row" data-fit="easy">
            ${fld({ id: 'fEasyKm', name: 'fitEasyKm', label: 'Afstand', unit: 'km', mode: 'decimal', step: '0.1', min: 1, value: fi.easyKm || '' })}
            ${timeFld({ id: 'fEasyTime', name: 'fitEasyTime', label: 'Tijd', sec: u.parseClock(fi.easyTime) })}
          </div>
          <div class="row" data-fit="vdot">${fld({ id: 'fVdot', name: 'fitVdot', label: 'VDOT', mode: 'decimal', step: '0.1', min: 20, max: 85, value: u.num(f.vdot, 1).replace(',', '.') })}</div>
          <p class="preview" id="vdotPreview" aria-live="polite"></p>`)
      + sub('Volume', `<div class="row">
          ${fld({ id: 'fWeekly', name: 'weeklyKm', label: 'Nu per week', unit: 'km', mode: 'decimal', min: 0, max: 250, value: s.weeklyKm })}
          ${fld({ id: 'fLongest', name: 'longestKm', label: 'Langste run (maand)', unit: 'km', mode: 'decimal', min: 0, max: 60, value: s.longestKm })}
          ${fld({ id: 'fWeight', name: 'weightKg', label: 'Gewicht (optioneel)', unit: 'kg', mode: 'decimal', step: '0.5', min: 30, max: 200, value: p.weightKg || '', hint: 'Voor je voedingsplan' })}
        </div>`)
      + sub('Hartslag', `<div class="row">
          ${fld({ id: 'fAge', name: 'age', label: 'Leeftijd', unit: 'jr', mode: 'numeric', min: 12, max: 95, value: p.age || '' })}
          ${fld({ id: 'fMax', name: 'hrMax', label: 'Max. hartslag', unit: 'spm', mode: 'numeric', min: 120, max: 230, value: p.hrMax || '', ph: 'geschat' })}
          ${fld({ id: 'fRest', name: 'hrRest', label: 'Rusthartslag', unit: 'spm', mode: 'numeric', min: 30, max: 100, value: p.hrRest || '', ph: '60' })}
          ${fld({ id: 'fLthr', name: 'lthr', label: 'LTHR (drempel)', unit: 'spm', mode: 'numeric', min: 100, max: 220, value: p.lthr || '', ph: 'optioneel' })}
        </div><p class="hint" style="margin:0">LTHR is het nauwkeurigst (gem. hartslag laatste 20 min van een 30 min tijdrit, of uit je Garmin).</p>`),

      sub('Loopdagen', `${daysPick({ key: 'days', name: 'days', label: 'Op welke dagen kun je lopen?', value: s.days, hint: 'Minimaal 3 dagen aanbevolen. Rustdagen zijn ook training.' })}
          ${sel({ id: 'fLongDay', name: 'longDay', label: 'Dag voor de lange duurloop', value: s.longDay, options: [1, 2, 3, 4, 5, 6, 7].map((d) => [d, u.DAY_LONG[d]]) })}`)
      + sub('Kracht', sw('strength', s.strength, 'Krachttraining toevoegen', '2 × per week, 25 min – sterk aanbevolen tegen blessures. CrossFit telt mee.'))
      + sub('Coachstijl', `<div class="choices" role="radiogroup" aria-label="Coachstijl">
          ${radio('coachStyle', 'balanced', state.coachStyle, 'Gebalanceerd', 'Daniels-tempo’s, 80/20-verdeling, Lydiard/Pfitzinger-opbouw. Voor iedereen.')}
          ${radio('coachStyle', 'norwegian', state.coachStyle, 'Noorse singles', 'Veel sub-drempeltraining + korte heuvels. Voor gemiddeld/gevorderd.')}
          ${radio('coachStyle', 'runwalk', state.coachStyle, 'Run-walk', 'Galloway: hardlopen en wandelen afwisselen. Voor beginners en na een blessure.')}
        </div>`),

      sub('Waar train je meestal?', `<div class="row">
          ${sel({ id: 'fPreset', name: 'preset', label: 'Standaardlocatie', value: c.preset, options: presetList(), wide: true })}
          ${fld({ id: 'fTemp', name: 'tempC', label: 'Temperatuur', unit: '°C', mode: 'decimal', min: -20, max: 50, value: c.tempC })}
          ${fld({ id: 'fHum', name: 'humidity', label: 'Luchtvochtigheid', unit: '%', mode: 'numeric', min: 5, max: 100, value: c.humidity })}
          ${fld({ id: 'fAlt', name: 'altitudeM', label: 'Gemiddelde hoogte', unit: 'm', mode: 'numeric', min: 0, max: 5000, value: c.altitudeM })}
          ${sel({ id: 'fTer', name: 'terrain', label: 'Terrein', value: c.terrain, options: terrainList() })}
        </div><p class="preview" id="condPreview" aria-live="polite"></p>`)
      + sub('Wat heb je tot je beschikking?', `${sw('treadmill', fac.treadmill, 'Loopband', 'Voor tempotraining op vlakke ondergrond')}
          ${sw('track', fac.track, 'Atletiekbaan', '')}
          ${sw('flatRoute', fac.flatRoute, 'Vlak stuk weg', 'Minstens 1 km')}
          ${sw('hills', fac.hills, 'Heuvels of trappen', '')}`),

      sub('Je vaste routine', `<p class="hint" style="margin:0 0 var(--s3)">De coach plant geen zware run op of direct na een zware sportdag, CrossFit vervangt de krachttraining en bij veel andere training gaat het rustige loopvolume iets omlaag.</p>
          <div id="actRows">${(state.activities || []).map(activityRow).join('')}</div>
          <p class="muted small" id="actEmpty" ${(state.activities || []).length ? 'hidden' : ''}>Nog geen andere sporten toegevoegd.</p>
          <button type="button" class="btn small" data-action="addActivity">${ICON.plus} Sport toevoegen</button>
          <p class="preview" id="actPreview" aria-live="polite"></p>`),
    ];
    return bodies.map((b, i) => section(i, b, mode)).join('');
  }

  let actSeq = 0;
  function courseRow(a) {
    const i = `${a.id}`.replace(/[^a-z0-9]/gi, '');
    return `<div class="mini" data-course-row data-id="${esc(a.id)}"${a.logId ? ` data-log="${esc(a.logId)}"` : ''}>
      <div class="mini-head"><span class="mini-title" data-mini-title>Poging</span><button type="button" class="icon-btn" data-action="removeCourse" aria-label="Verwijder deze poging">${ICON.trash}</button></div>
      <div class="row">
        ${fld({ id: `cDate${i}`, f: 'date', type: 'date', label: 'Datum', max: u.today(), value: a.date || '' })}
        ${fld({ id: `cKm${i}`, f: 'km', label: 'Afstand', unit: 'km', mode: 'decimal', step: '0.1', min: 1, value: a.distanceKm ?? '' })}
        ${timeFld({ id: `cTime${i}`, f: 'time', label: 'Tijd', sec: a.timeSec })}
        ${sel({ id: `cEff${i}`, f: 'effort', label: 'Inspanning', value: a.effort || 'max', options: Object.entries(RF.goal.EFFORT_LABEL) })}
        ${fld({ id: `cTemp${i}`, f: 'temp', label: 'Temperatuur toen', unit: '°C', mode: 'decimal', min: -20, max: 50, value: a.tempC ?? '' })}
        ${fld({ id: `cHum${i}`, f: 'hum', label: 'Vochtigheid toen', unit: '%', mode: 'numeric', min: 5, max: 100, value: a.humidity ?? '' })}
        ${timeFld({ id: `cRef${i}`, f: 'ref', label: '5 km-tijd toen (optioneel)', sec: a.ref5kSec, hint: 'Nodig als de poging ouder is dan 2 maanden' })}
      </div>
    </div>`;
  }
  function readCourse(form) {
    return Array.from(form.querySelectorAll('[data-course-row]')).map((r) => {
      const v = (f) => r.querySelector(`[data-f="${f}"]`).value;
      return {
        id: r.dataset.id, logId: r.dataset.log || null, date: v('date'), distanceKm: u.parseNum(v('km')), timeSec: u.parseClock(v('time')),
        effort: v('effort'), tempC: u.parseNum(v('temp')), humidity: u.parseNum(v('hum')), ref5kSec: u.parseClock(v('ref')) || null,
      };
    });
  }
  function activityRow(a) {
    const i = `${a.id}`.replace(/[^a-z0-9]/gi, '');
    return `<div class="mini" data-act-row data-id="${esc(a.id)}">
      <div class="mini-head"><span class="mini-title" data-mini-title>${esc(RF.sports.label(a.type))}</span><button type="button" class="icon-btn" data-action="removeActivity" aria-label="Verwijder deze sport">${ICON.trash}</button></div>
      <div class="row">
        ${sel({ id: `acType${i}`, f: 'type', label: 'Sport', value: a.type, options: Object.entries(RF.sports.TYPES).map(([k, t]) => [k, t.label]) })}
        ${fld({ id: `acDur${i}`, f: 'dur', label: 'Duur', unit: 'min', mode: 'numeric', min: 10, max: 600, step: 5, value: a.durationMin || 60 })}
        ${sel({ id: `acInt${i}`, f: 'int', label: 'Intensiteit', value: a.intensity || 'medium', options: Object.entries(RF.sports.INTENSITY).map(([k, t]) => [k, t.label]), wide: true })}
      </div>
      ${daysPick({ key: `acDays${i}`, f: 'day', label: 'Op welke dagen?', value: a.days || [] })}
    </div>`;
  }

  function readActivities(form) {
    return Array.from(form.querySelectorAll('[data-act-row]')).map((r) => ({
      id: r.dataset.id,
      type: r.querySelector('[data-f="type"]').value,
      durationMin: Math.max(10, Math.min(600, u.parseNum(r.querySelector('[data-f="dur"]').value) || 60)),
      intensity: r.querySelector('[data-f="int"]').value,
      days: Array.from(r.querySelectorAll('[data-f="day"]:checked')).map((x) => Number(x.value)),
    }));
  }

  function renderWizard() {
    const names = SECTIONS.map((s) => s.title);
    const pct = (wizardStep + 1) / names.length * 100;
    return `<div class="page-head"><h1>Welkom bij Run Faster</h1><p>Je persoonlijke hardloopcoach. In vijf korte stappen maken we een schema dat past bij je doel, je fitheid, je week en waar je loopt – ook op Saba, met hitte en steile hellingen.</p></div>
      <div class="wiz-progress" role="progressbar" aria-label="Voortgang" aria-valuemin="1" aria-valuemax="${names.length}" aria-valuenow="${wizardStep + 1}"><span style="width:${pct}%"></span></div>
      <p class="wiz-step">Stap ${wizardStep + 1} van ${names.length} · ${names[wizardStep]}</p>
      <form data-form="settings" data-wizard="1" novalidate>
        ${formSections('wizard')}
        <p class="error" id="formError" role="alert"></p>
        <div class="btn-row">
          ${wizardStep > 0 ? '<button type="button" class="btn" data-action="wizPrev">Vorige</button>' : ''}
          ${wizardStep < names.length - 1 ? '<button type="button" class="btn primary" data-action="wizNext" style="flex:1">Volgende</button>' : '<button type="submit" class="btn primary" style="flex:1">Maak mijn schema</button>'}
        </div>
      </form>`;
  }

  function renderGoals() {
    return `<div class="page-head"><h1>Doelen & instellingen</h1><p>Tik een onderdeel open om het aan te passen.</p></div>
      <form data-form="settings" novalidate>
        ${formSections('goals')}
        <p class="error" id="formError" role="alert"></p>
        <div class="savebar"><span class="savebar-status" id="saveStatus">Alles opgeslagen</span><button type="submit" class="btn primary">Opslaan & herbouw</button></div>
      </form>
      <h2 class="section-title">Meer</h2>
      <div class="card"><details class="disclosure"><summary>Garmin: importeren en naar je horloge</summary>
        <p><strong>Runs importeren:</strong> open in Garmin Connect je activiteit → ⋯ / tandwiel → <em>Exporteer origineel</em> (.zip/.fit) of <em>Exporteer naar GPX/TCX</em>. Kies het bestand via + → Garmin-bestand. Op een laptop kun je het bestand ook in dit venster slepen.</p>
        <p><strong>Training naar je horloge:</strong> ‘Naar horloge’ maakt een .FIT-workout. Sluit je horloge met de kabel aan op je laptop en kopieer het bestand naar <code>GARMIN\\NewFiles</code>. Vanaf een telefoon kan dit niet direct.</p>
      </details></div>
      <div class="card"><details class="disclosure"><summary>Back-up en gegevens</summary>
        <p>Je gegevens staan alleen op dit apparaat. Maak regelmatig een back-up, bijvoorbeeld om je schema van je laptop naar je telefoon te zetten.</p>
        <div class="btn-row"><button type="button" class="btn" data-action="exportBackup">Back-up downloaden</button><button type="button" class="btn" data-action="importBackup">Back-up terugzetten</button><button type="button" class="btn danger" data-action="reset">Alles wissen</button></div>
      </details></div>
      <div class="card"><details class="disclosure"><summary>Hoe de coach werkt</summary><ul class="notes">
        <li><strong>Jack Daniels (VDOT)</strong> – je fitheid en trainingstempo’s komen uit je wedstrijdtijden.</li>
        <li><strong>80/20 (Seiler, Fitzgerald)</strong> – ongeveer 80 % van je tijd rustig, 20 % stevig.</li>
        <li><strong>Lydiard & Pfitzinger</strong> – basis met heuvelwerk, dan opbouw, specifieke fase en taper.</li>
        <li><strong>Hansons</strong> – de lange duurloop blijft begrensd (≤ ~30 % van je week, max. ~3 uur).</li>
        <li><strong>Noorse singles</strong> en <strong>Galloway run-walk</strong> als kiesbare stijlen.</li>
        <li><strong>Omstandigheden</strong> – hitte via temperatuur + dauwpunt, hoogte, hellingen via de Minetti-curve (GAP).</li>
        <li><strong>Veiligheid</strong> – max. ~6–8 % groei per week, elke 4e week herstel, ACWR-bewaking en ‘Niet 100 %’.</li>
      </ul><p class="small muted">Dit is een trainingshulpmiddel, geen medisch advies. Bij pijn, ziekte of hartklachten: stop en raadpleeg een arts.</p></details></div>`;
  }

  /* ---------- formulier lezen ---------- */
  function readSettings(form, partialStep) {
    const fd = new FormData(form);
    const get = (n) => fd.get(n);
    const errors = [];
    const draft = JSON.parse(JSON.stringify({ goal: state.goal, activities: state.activities || [], profile: state.profile, fitness: state.fitness, schedule: state.schedule, conditions: state.conditions, facilities: state.facilities, coachStyle: state.coachStyle }));

    const g = draft.goal;
    g.type = get('goalType') || 'race';
    const ds = get('distSel');
    g.distanceKm = ds === 'custom' ? u.parseNum(get('distCustom')) : Number(ds);
    if (g.type !== 'endurance' && (!g.distanceKm || g.distanceKm < 1)) errors.push([0, 'Vul een geldige afstand in.']);
    g.raceDate = get('raceDate') || g.raceDate;
    if (g.type === 'race' && (!g.raceDate || u.daysBetween(u.today(), g.raceDate) < 7)) errors.push([0, 'Kies een wedstrijddatum minstens een week vooruit.']);
    const tgt = (get('target') || '').trim();
    g.targetSec = tgt ? u.parseClock(tgt) : null;
    if (tgt && !g.targetSec) errors.push([0, 'Doeltijd klopt niet: minuten en seconden moeten tussen 0 en 59 liggen.']);
    g.raceTerrain = get('raceTerrain') || 'flat';
    g.raceAltitudeM = Math.max(0, u.parseNum(get('raceAltitudeM')) ?? 0);
    g.raceElevGain = Math.max(0, u.parseNum(get('raceElevGain')) ?? 0);
    g.raceTempC = u.parseNum(get('raceTempC')) ?? 15;
    g.raceHumidity = u.parseNum(get('raceHumidity')) ?? 60;
    g.courseAttempts = g.type === 'race' ? readCourse(form) : (g.courseAttempts || []);
    if (g.type === 'race' && g.courseAttempts.some((a) => !a.date || !a.distanceKm || !a.timeSec || a.timeSec < 120) && partialStep == null) errors.push([0, 'Vul bij elke parcourspoging een datum, afstand en tijd in (of verwijder de poging).']);
    if (partialStep != null) g.courseAttempts = g.courseAttempts.filter((a) => a.date && a.distanceKm && a.timeSec);
    g.planWeeks = Math.max(4, Math.min(30, u.parseNum(get('planWeeks')) || 12));
    g.longRunMin = Math.max(30, Math.min(300, u.parseNum(get('longRunMin')) || 120));

    const p = draft.profile;
    p.experience = get('experience') || 'intermediate';
    p.age = u.parseNum(get('age')) || null;
    p.hrMax = u.parseNum(get('hrMax')) || null;
    p.hrRest = u.parseNum(get('hrRest')) || null;
    p.lthr = u.parseNum(get('lthr')) || null;
    p.weightKg = u.parseNum(get('weightKg')) || null;
    const fi = { source: get('fitSource') || 'race', raceDist: Number(get('fitRaceDist')), raceTime: get('fitRaceTime'), easyKm: get('fitEasyKm'), easyTime: get('fitEasyTime') };
    const est = estimateVdot(fi, get('fitVdot'));
    if (est == null && (partialStep == null || partialStep >= 1)) errors.push([1, 'Vul een geldige afstand en tijd in om je fitheid te bepalen (minuten en seconden 0–59).']);
    draft.fitness = { ...draft.fitness, input: fi };
    const sameInput = JSON.stringify({ ...(state.fitness.input || {}) }) === JSON.stringify(fi) && fi.source !== 'vdot';
    if (est != null && !sameInput) { draft.fitness.vdot = est; draft.fitness.source = fi.source === 'easy' ? 'easy' : 'race'; }
    draft.schedule.weeklyKm = u.parseNum(get('weeklyKm')) || 0;
    draft.schedule.longestKm = u.parseNum(get('longestKm')) || 0;

    draft.schedule.days = fd.getAll('days').map(Number).sort((a, b) => a - b);
    if (draft.schedule.days.length < 2 && (partialStep == null || partialStep >= 2)) errors.push([2, 'Kies minstens 2 (liefst 3) loopdagen.']);
    draft.schedule.longDay = Number(get('longDay')) || 7;
    if (draft.schedule.days.length && !draft.schedule.days.includes(draft.schedule.longDay)) draft.schedule.longDay = draft.schedule.days[draft.schedule.days.length - 1];
    draft.schedule.strength = fd.get('strength') === 'on';
    draft.coachStyle = get('coachStyle') || 'balanced';

    draft.conditions = {
      preset: get('preset') || 'custom',
      tempC: u.parseNum(get('tempC')) ?? 20,
      humidity: u.parseNum(get('humidity')) ?? 60,
      altitudeM: u.parseNum(get('altitudeM')) ?? 0,
      terrain: get('terrain') || 'road',
    };
    draft.facilities = { treadmill: fd.get('treadmill') === 'on', track: fd.get('track') === 'on', flatRoute: fd.get('flatRoute') === 'on', hills: fd.get('hills') === 'on' };
    draft.activities = readActivities(form);
    if (draft.activities.some((a) => !a.days.length) && (partialStep == null || partialStep >= 4)) errors.push([4, 'Kies minstens één dag per sport, of verwijder de sport.']);
    draft.activities = draft.activities.filter((a) => a.days.length || partialStep != null);
    return { draft, errors };
  }

  function estimateVdot(fi, vdotField) {
    if (fi.source === 'vdot') { const v = u.parseNum(vdotField); return v && v >= 20 && v <= 85 ? v : null; }
    if (fi.source === 'easy') {
      const km = u.parseNum(fi.easyKm), sec = u.parseClock(fi.easyTime);
      return km && sec ? Math.max(20, Math.min(85, RF.vdot.fromEasyRun(km, sec))) : null;
    }
    const sec = u.parseClock(fi.raceTime);
    return fi.raceDist && sec ? Math.max(20, Math.min(85, RF.vdot.fromRace(fi.raceDist * 1000, sec))) : null;
  }

  function setText(id, txt) { const el = document.getElementById(id); if (el) el.textContent = txt; }

  function updateFormPreviews() {
    const form = document.querySelector('form[data-form="settings"]');
    if (!form) return;
    const fd = new FormData(form);
    const type = fd.get('goalType');
    form.querySelectorAll('[data-show]').forEach((el) => {
      let show = el.dataset.show.split(' ').includes(type);
      if (show && el.dataset.showDist) show = fd.get('distSel') === el.dataset.showDist;
      el.hidden = !show;
    });
    const src = fd.get('fitSource') || 'race';
    form.querySelectorAll('[data-fit]').forEach((el) => { el.hidden = el.dataset.fit !== src; });

    const { draft } = readSettings(form, 0);
    const fi = draft.fitness.input;
    const unchanged = JSON.stringify(state.fitness.input || {}) === JSON.stringify(fi) && fi.source !== 'vdot';
    const v = unchanged ? state.fitness.vdot : estimateVdot(fi, fd.get('fitVdot'));
    setText('vdotPreview', v ? `VDOT ${u.num(v, 1)} → 5 km ${u.clock(RF.vdot.predict(v, 5000))} · 10 km ${u.clock(RF.vdot.predict(v, 10000))} · halve marathon ${u.clock(RF.vdot.predict(v, 21097.5))}. Rustig tempo ${u.paceRange(RF.vdot.paces(v).Efast, RF.vdot.paces(v).Eslow)} (vlak, koel).` : '');
    const gp = $('#goalPreview');
    if (gp) {
      const g = draft.goal;
      const validDate = type !== 'race' || (g.raceDate && u.daysBetween(u.today(), g.raceDate) >= 7);
      gp.innerHTML = v && type !== 'endurance' && g.distanceKm && validDate
        ? goalAnalysisHtml(RF.goal.analyze({ ...draft, fitness: { ...draft.fitness, vdot: v } }), g, true)
        : '';
    }

    // samenvattingen in de sectiekoppen
    const acts = draft.activities.filter((a) => a.days.length);
    const sch = draft.schedule;
    setText('sum-goal', goalText(draft.goal));
    setText('sum-fit', `${v ? `VDOT ${u.num(v, 1)} · ` : ''}${LEVEL_LABEL[draft.profile.experience] || ''} · ${u.num(sch.weeklyKm, 0)} km/week`);
    setText('sum-plan', `${sch.days.map((d) => u.DAY_SHORT[d]).join(', ') || 'geen dagen'} · lang op ${u.DAY_SHORT[sch.longDay]} · ${P.STYLE_LABEL[draft.coachStyle]}`);
    const pr = RF.cond.PRESETS[draft.conditions.preset];
    setText('sum-cond', `${pr ? pr.label : 'Eigen'} · ${u.temp(draft.conditions.tempC)} · ${(RF.cond.TERRAIN[draft.conditions.terrain] || {}).label || ''}`);
    setText('sum-sports', acts.length ? acts.map((a) => `${RF.sports.label(a.type)} ${a.days.map((d) => u.DAY_SHORT[d]).join('/')}`).join(' · ') : 'Geen');

    form.querySelectorAll('[data-act-row]').forEach((r) => {
      const days = Array.from(r.querySelectorAll('[data-f="day"]:checked')).map((x) => u.DAY_SHORT[Number(x.value)]);
      const t = r.querySelector('[data-mini-title]');
      if (t) t.textContent = `${RF.sports.label(r.querySelector('[data-f="type"]').value)} · ${days.length ? days.join(', ') : 'kies dagen'} · ${r.querySelector('[data-f="dur"]').value || '?'} min`;
    });
    form.querySelectorAll('[data-course-row]').forEach((r) => {
      const q = (f) => r.querySelector(`[data-f="${f}"]`).value;
      const t = r.querySelector('[data-mini-title]');
      if (t) t.textContent = [q('date') ? u.dateShort(q('date')) : 'Nieuwe poging', q('km') ? `${q('km').replace('.', ',')} km` : '', q('time')].filter(Boolean).join(' · ');
    });

    const ap = $('#actPreview');
    if (ap) {
      const totalMin = acts.reduce((s, a) => s + a.durationMin * a.days.length, 0);
      const cf = RF.sports.crossfitPerWeek(acts);
      const eq = RF.sports.weeklyAerobicMin(acts);
      const heavy = acts.filter((a) => RF.sports.legLoad(a) >= 3).flatMap((a) => a.days).map((d) => u.DAY_SHORT[d]);
      ap.textContent = acts.length ? `Per week ${u.dur(totalMin * 60)} andere sport (≈ ${Math.round(eq)} min hardloop-equivalent). ${cf ? `CrossFit ${cf}× vervangt ${Math.min(2, cf)} krachttraining(en). ` : ''}${heavy.length ? `Zware dagen voor je benen: ${[...new Set(heavy)].join(', ')} – daar en de dag erna geen zware run.` : ''}` : '';
      if (acts.length && sch.days.length >= 3) {
        const dl = RF.sports.dayLoad(acts);
        const prev = (d) => (d === 1 ? 7 : d - 1);
        const bad = (d) => dl[d].leg >= 3 || dl[prev(d)].leg >= 3;
        const q = P.pickQualityDays(sch.days, sch.longDay, sch.days.length >= 4 ? 2 : 1, dl);
        const clash = q.filter(bad);
        if (clash.length) {
          const better = [1, 2, 3, 4, 5, 6, 7].filter((d) => !sch.days.includes(d) && !bad(d) && d !== sch.longDay);
          ap.textContent += ` Let op: met deze loopdagen valt een zware run op of direct na een zware sportdag (${clash.map((d) => u.DAY_LONG[d]).join(', ')}).${better.length ? ` Tip: maak ${better.map((d) => u.DAY_LONG[d]).join(' of ')} een loopdag in plaats van ${clash.map((d) => u.DAY_LONG[d]).join('/')}.` : ''}`;
        }
        if (dl[prev(sch.longDay)].leg >= 2) ap.textContent += ` Je lange duurloop (${u.DAY_LONG[sch.longDay]}) valt na ${dl[prev(sch.longDay)].acts.map((a) => RF.sports.label(a.type)).join(' en ')}; overweeg een andere dag.`;
      }
    }
    setText('condPreview', condSummary(draft.conditions));
  }

  function markDirty() {
    const s = $('#saveStatus');
    if (s && !s.classList.contains('dirty')) { s.textContent = 'Niet-opgeslagen wijzigingen'; s.classList.add('dirty'); }
  }

  function openSection(key, only) {
    document.querySelectorAll('.sect').forEach((f) => {
      if (f.classList.contains('static')) return;
      const isIt = f.dataset.sect === key;
      if (only && !isIt) { f.classList.remove('is-open'); f.querySelector('.sect-body').hidden = true; f.querySelector('.sect-head').setAttribute('aria-expanded', 'false'); }
      if (isIt) { f.classList.add('is-open'); f.querySelector('.sect-body').hidden = false; f.querySelector('.sect-head').setAttribute('aria-expanded', 'true'); }
    });
    openSect = key;
  }

  function saveSettings(form) {
    const { draft, errors } = readSettings(form);
    const errEl = $('#formError');
    if (errors.length) {
      if (form.dataset.wizard) { wizardStep = errors[0][0]; render(); $('#formError').textContent = errors.map((e) => e[1]).join(' '); return; }
      errEl.textContent = errors.map((e) => e[1]).join(' ');
      openSection(SECTIONS[errors[0][0]].key, false);
      const head = form.querySelector(`[data-sect="${SECTIONS[errors[0][0]].key}"] .sect-head`);
      if (head) head.scrollIntoView({ block: 'start', behavior: 'smooth' });
      return;
    }
    const oldVdot = state.fitness.vdot;
    Object.assign(state, draft);
    if (!state.fitness.history) state.fitness.history = [];
    if (!state.fitness.history.length || Math.abs(oldVdot - state.fitness.vdot) > 0.05) state.fitness.history.push({ date: u.today(), vdot: Math.round(state.fitness.vdot * 10) / 10, source: 'instellingen' });
    state.plan = P.rebuild(state, u.today());
    if (state.notFull && state.notFull.to >= u.today()) P.setNotFull(state, u.today(), u.daysBetween(u.today(), state.notFull.to) + 1, state.notFull.mode);
    state.onboarded = true;
    persist();
    view = 'today';
    openSect = null;
    render(true);
    toast('Schema opgebouwd vanaf vandaag.');
  }

  /* ---------- modals ---------- */
  function openModal(title, html) {
    $('#modalTitle').textContent = title;
    $('#modalBody').innerHTML = html;
    RF.charts.bind($('#modalBody'));
    const d = $('#modal');
    if (!d.open) d.showModal();
    $('.modal-inner').scrollTop = 0;
    const first = d.querySelector('#modalBody input:not([type="radio"]):not([type="range"]), #modalBody select, #modalBody button');
    if (first) first.focus({ preventScroll: true });
  }
  function closeModal() { const d = $('#modal'); if (d.open) d.close(); }

  function openWorkout(id) {
    const w = P.findWorkout(state, id);
    if (!w) return;
    const wk = state.plan.weeks.find((x) => x.workouts.includes(w));
    const start = u.today() > u.addDays(w.date, -6) ? u.today() : u.addDays(w.date, -6);
    const dates = [];
    for (let i = 0; i < 14; i++) { const d = u.addDays(start, i); if (d !== w.date) dates.push(d); }
    const log = logFor(w);
    let html = workoutCard(w, { inModal: true });
    if (w.type === 'race') html = `<div class="btn-row" style="margin:0 0 var(--s3)"><button type="button" class="btn primary" data-action="racePlan">${ICON.flag} Wedstrijdplan: pacing & voeding</button></div>${html}`;
    if (!log) {
      html += `<h3 class="sub-title" style="margin-top:var(--s5)">Plannen</h3>
        <form data-form="move" data-id="${esc(w.id)}"><div class="row">${sel({ id: 'mvDate', name: 'date', label: 'Verplaatsen naar', value: '', wide: true, options: dates.map((d) => [d, `${u.dateShort(d)}${P.allWorkouts(state).some((x) => x.date === d && x.type !== 'strength') ? ' (wisselen)' : ''}`]) })}</div>
        <div class="btn-row" style="margin-top:0"><button type="submit" class="btn">${ICON.calendar} Verplaats</button>
        ${w.skipped ? `<button type="button" class="btn" data-action="unskip" data-id="${esc(w.id)}">Toch doen</button>` : `<button type="button" class="btn" data-action="skip" data-id="${esc(w.id)}">${ICON.skip} Overslaan</button>`}
        ${w.original ? `<button type="button" class="btn" data-action="restore" data-id="${esc(w.id)}">Origineel terug</button>` : ''}
        ${w.key && w.type !== 'race' ? `<button type="button" class="btn" data-action="easifyOne" data-id="${esc(w.id)}">Maak rustig</button>` : ''}</div></form>`;
      const alts = P.alternatives(state, w);
      if (alts.length) html += `<h3 class="sub-title" style="margin-top:var(--s5)">Wisselen</h3><ul class="sheet-list">${alts.map((a) => `<li><button type="button" class="sheet-btn" data-action="swapAlt" data-id="${esc(w.id)}" data-key="${a.key}"><span class="type-ico ${a.key.startsWith('alt-swim') || a.key.startsWith('alt-bike') || a.key === 'alt-hike' ? 'tc-cross' : 'tc-easy'}">${ICON.swap}</span><span><strong>${esc(a.label)}</strong><small>${esc(a.desc)}</small></span></button></li>`).join('')}</ul>`;
    } else {
      html += `<div class="btn-row"><button type="button" class="btn danger" data-action="deleteLog" data-id="${esc(log.id)}">${ICON.trash} Log verwijderen</button></div>`;
    }
    if (!log && !P.NONRUN.has(w.type)) {
      const wc = condFor(w.date, w);
      const isRace = w.type === 'race';
      html += `<h3 class="sub-title" style="margin-top:var(--s5)">Omstandigheden voor deze ${isRace ? 'wedstrijd' : 'training'}</h3>
        <p class="small muted">${esc(condSummary(wc))}. ${isRace ? 'Wijzigen past ook je wedstrijddoel en -plan aan.' : w.cond ? 'Eigen instelling voor deze training.' : 'Standaard – pas aan als je ergens anders loopt (bijv. op hoogte of op de loopband).'}</p>
        <form data-form="wcond" data-id="${esc(w.id)}" aria-label="Omstandigheden voor deze training"><div class="row">
          ${fld({ id: 'wcTemp', name: 'tempC', label: 'Temperatuur', unit: '°C', mode: 'decimal', min: -20, max: 50, value: wc.tempC })}
          ${fld({ id: 'wcHum', name: 'humidity', label: 'Luchtvochtigheid', unit: '%', mode: 'numeric', min: 5, max: 100, value: wc.humidity })}
          ${fld({ id: 'wcAlt', name: 'altitudeM', label: 'Hoogte', unit: 'm', mode: 'numeric', min: 0, max: 5000, value: wc.altitudeM || 0 })}
          ${sel({ id: 'wcTer', name: 'terrain', label: 'Terrein', value: wc.terrain, options: terrainList() })}
        </div>
        <div class="btn-row" style="margin-top:0"><button type="submit" class="btn">Opslaan</button>${w.cond && !isRace ? `<button type="button" class="btn" data-action="resetWcond" data-id="${esc(w.id)}">Standaard</button>` : ''}</div></form>`;
    }
    if (wk) html += `<p class="small muted" style="margin-top:var(--s4)">${P.PHASE_LABEL[wk.phase]}-fase · week ${wk.n || wk.i + 1}</p>`;
    openModal(u.dateLong(w.date), html);
  }

  function logForm(prefill, workoutId, analysis) {
    const p = prefill || {};
    pendingIntensity = p.intensity || null;
    const candidates = P.allWorkouts(state).filter((w) => w.type !== 'strength' && (!logFor(w) || w.id === workoutId) && Math.abs(u.daysBetween(w.date, p.date || u.today())) <= 3);
    const pw = workoutId ? P.findWorkout(state, workoutId) : null;
    const lc = p.cond || condFor(p.date || u.today(), pw);
    const act = p.activity || 'run';
    const rpe = Number(p.rpe || 4);
    let html = '';
    if (analysis) {
      html += `<div class="card" style="box-shadow:none"><p class="eyebrow">Geïmporteerd uit ${esc((analysis.source || '').toUpperCase())}</p>${logSummary({ ...analysis, rpe: null, id: 'tmp' })}</div>`;
      if (state.logs.some((l) => l.date === analysis.date && Math.abs((l.distanceKm || 0) - analysis.distanceKm) < 0.05 && Math.abs(l.durationSec - analysis.durationSec) < 30)) html += '<p class="error">Let op: deze activiteit lijkt al gelogd te zijn.</p>';
    }
    html += `<form data-form="log" novalidate>
      ${seg('activity', [['run', 'Hardlopen'], ...Object.keys(RF.sports.TYPES).map((k) => [k, RF.sports.label(k)])], act, 'Activiteit', 'scroll')}
      <div class="row">
        ${timeFld({ id: 'lgTime', name: 'duration', label: 'Tijd', sec: p.durationSec })}
        ${fld({ id: 'lgKm', name: 'distanceKm', label: 'Afstand', unit: 'km', mode: 'decimal', step: '0.01', min: 0, value: p.distanceKm ?? '' })}
        ${fld({ id: 'lgDate', name: 'date', type: 'date', label: 'Datum', max: u.today(), value: p.date || u.today(), wide: true })}
      </div>
      <div class="field"><div class="rpe-head"><label for="lgRpe">Hoe zwaar voelde het?</label><output class="rpe-out" id="rpeOut" for="lgRpe">${RPE_TEXT[rpe]}</output></div>
        <input type="range" id="lgRpe" name="rpe" min="1" max="10" step="1" value="${rpe}" aria-describedby="rpeOut">
        <div class="rpe-scale" aria-hidden="true"><span>1 licht</span><span>5 gemiddeld</span><span>10 max</span></div></div>
      ${sel({ id: 'lgWk', name: 'workoutId', label: 'Hoort bij training', value: workoutId || '', options: [['', 'Losse activiteit (niet gepland)'], ...candidates.map((w) => [w.id, `${u.dateShort(w.date)} – ${w.title}`])] })}
      ${sw('isRace', p.isRace, 'Wedstrijd of tijdrit', 'Maximale inspanning – gebruik om mijn fitheid te meten', ` data-run-only${act === 'run' ? '' : ' hidden'}`)}
      ${state.goal.type === 'race' ? sw('onCourse', p.onCourse, 'Op het parcours van mijn wedstrijd', 'Of een deel ervan – gebruik om het parcours te meten', ` data-run-only${act === 'run' ? '' : ' hidden'}`) : ''}
      <details class="more"><summary>Meer details</summary>
        <div class="row">
          ${fld({ id: 'lgHr', name: 'avgHr', label: 'Gem. hartslag', unit: 'spm', mode: 'numeric', min: 60, max: 230, value: p.avgHr || '' })}
          ${fld({ id: 'lgElev', name: 'elevGain', label: 'Hoogtemeters', unit: 'm', mode: 'numeric', min: 0, value: p.elevGain ?? '' })}
          ${fld({ id: 'lgTemp', name: 'tempC', label: 'Temperatuur', unit: '°C', mode: 'decimal', min: -20, max: 50, value: lc.tempC })}
          ${fld({ id: 'lgHum', name: 'humidity', label: 'Luchtvochtigheid', unit: '%', mode: 'numeric', min: 5, max: 100, value: lc.humidity })}
          ${fld({ id: 'lgAlt', name: 'altitudeM', label: 'Hoogte', unit: 'm', mode: 'numeric', min: 0, max: 5000, value: p.altitudeM ?? lc.altitudeM ?? 0, hint: p.altitudeM != null ? 'Gemiddelde hoogte uit je bestand' : 'Gemiddelde hoogte van je route', wide: true })}
        </div>
        <div class="field"><label for="lgNotes">Notities</label><textarea id="lgNotes" name="notes" placeholder="Hoe voelde het? Weer, route, schoenen…">${esc(p.notes || '')}</textarea></div>
      </details>
      <p class="error" id="logError" role="alert"></p>
      <div class="sheet-foot"><button type="button" class="btn" data-action="closeModal">Annuleren</button><button type="submit" class="btn primary">${ICON.check} Opslaan</button></div>
    </form>`;
    pendingImport = analysis || null;
    openModal(analysis ? 'Geïmporteerde activiteit' : 'Training loggen', html);
  }

  function saveLog(form) {
    const fd = new FormData(form);
    const date = fd.get('date') || u.today();
    const km = u.parseNum(fd.get('distanceKm'));
    const sec = u.parseClock(fd.get('duration'));
    if (!sec || sec < 60) { $('#logError').textContent = 'Vul een geldige tijd in: uren, minuten (0–59) en seconden (0–59).'; document.querySelector('[data-time="lgTime"] input').focus(); return; }
    const a = pendingImport || {};
    const activity = fd.get('activity') || 'run';
    const log = {
      ...a,
      id: `log-${Date.now().toString(36)}`,
      date, distanceKm: km || 0, durationSec: sec,
      rpe: Number(fd.get('rpe')) || null,
      avgHr: u.parseNum(fd.get('avgHr')) || a.avgHr || null,
      elevGain: u.parseNum(fd.get('elevGain')) ?? a.elevGain ?? null,
      workoutId: fd.get('workoutId') || null,
      activity,
      intensity: pendingIntensity || null,
      isRace: fd.get('isRace') === 'on' && activity === 'run',
      notes: (fd.get('notes') || '').trim(),
      source: a.source || 'handmatig',
      conditions: {
        ...condFor(date, fd.get('workoutId') ? P.findWorkout(state, fd.get('workoutId')) : null),
        tempC: u.parseNum(fd.get('tempC')) ?? state.conditions.tempC,
        humidity: u.parseNum(fd.get('humidity')) ?? state.conditions.humidity,
        altitudeM: u.parseNum(fd.get('altitudeM')) ?? 0,
      },
    };
    if (log.isRace && log.distanceKm >= 1.5) {
      const h = RF.cond.heat(log.conditions.tempC, log.conditions.humidity);
      let dist = log.distanceKm, t = log.durationSec, corrected = false;
      if (log.eqDistKm && log.elevGain > 20) { dist = log.eqDistKm; corrected = true; }
      if (h.pct > 0) { t = t / (1 + h.pct); corrected = true; }
      log.vdot = Math.round(RF.vdot.fromRace(dist * 1000, t) * 10) / 10;
      log.vdotCorrected = corrected;
    }
    if (fd.get('onCourse') === 'on' && log.activity === 'run' && log.distanceKm > 0) {
      log.onCourse = true;
      state.goal.courseAttempts = (state.goal.courseAttempts || []).concat({
        id: `c${log.id}`, logId: log.id, date, distanceKm: log.distanceKm, timeSec: sec,
        effort: log.isRace ? 'max' : (log.rpe || 0) >= 8 ? 'hard' : 'easy',
        tempC: log.conditions.tempC, humidity: log.conditions.humidity,
      });
    }
    log.review = RF.coach.evaluate(state, log);
    state.logs.push(log);
    pendingImport = null;
    persist();
    render();
    showEvaluation(log);
  }

  /** Tussentijdse evaluatie direct na het opslaan van een training. */
  function showEvaluation(log) {
    const w = log.workoutId ? P.findWorkout(state, log.workoutId) : null;
    const isRun = RF.sports.isRunLog(log);
    const figs = [['Tijd', u.clock(log.durationSec)]];
    if (log.distanceKm) figs.unshift(['Afstand', u.km(log.distanceKm, 2)]);
    if (isRun && log.distanceKm) figs.push(['Tempo', u.pace(log.durationSec / log.distanceKm)]);
    else figs.push(['RPE', log.rpe ? String(log.rpe) : '–']);
    let html = `<p class="eyebrow">${esc(w ? w.title : isRun ? 'Losse run' : RF.sports.label(log.activity))}</p>
      <div class="metrics">${figs.slice(0, 3).map(([k, v]) => `<div class="metric"><span class="metric-label">${k}</span><span class="metric-value">${esc(v)}</span></div>`).join('')}</div>`;
    html += reviewHtml(log.review);
    if (log.vdot) html += `<p>Gemeten VDOT: <strong>${u.num(log.vdot, 1)}</strong>${log.vdotCorrected ? ' (gecorrigeerd voor hitte en hellingen)' : ''}. Bijwerken kan via Coach op Vandaag.</p>`;
    html += onTrackHtml(RF.coach.onTrack(state, u.today()));
    const next = P.allWorkouts(state).find((x) => x.date > log.date && !P.NONRUN.has(x.type) && !logFor(x));
    if (next) html += `<p class="muted">Volgende training: <strong>${esc(next.title)}</strong> · ${esc(u.dateShort(next.date))}</p>`;
    html += '<div class="sheet-foot"><button type="button" class="btn primary" data-action="closeModal">Klaar</button></div>';
    openModal('Evaluatie', html);
  }

  function notFullModal() {
    const nf = state.notFull;
    openModal('Niet 100 %', `<p class="muted">Ziek, pijntje, slecht geslapen of een drukke periode? De coach verlicht je schema tijdelijk. Daarna pak je het gewoon weer op.</p>
      <form data-form="notFull">
        <div class="choices" role="radiogroup" aria-label="Wat is er aan de hand?" style="margin-bottom:var(--s3)">
          ${radio('mode', 'light', nf ? nf.mode : 'light', 'Moe, druk of klein pijntje', 'Alles rustig, ca. 30–40 % minder volume')}
          ${radio('mode', 'sick', nf ? nf.mode : '', 'Ziek of blessure', 'Rust of heel licht bewegen. Bij koorts: niet lopen.')}
        </div>
        ${seg('days', [3, 5, 7, 10, 14].map((d) => [d, `${d} d`]), 7, 'Hoe lang?')}
        <div class="sheet-foot">${nf ? '<button type="button" class="btn" data-action="insight" data-fn="clearNotFull">Ik ben weer fit</button>' : '<button type="button" class="btn" data-action="closeModal">Annuleren</button>'}<button type="submit" class="btn primary">Schema verlichten</button></div>
      </form>`);
  }

  function quickSheet() {
    const firstSport = (state.activities || [])[0];
    const item = (action, cls, icon, title, text, extra = '') => `<li><button type="button" class="sheet-btn" data-action="${action}"${extra}><span class="type-ico ${cls}">${icon}</span><span><strong>${title}</strong><small>${text}</small></span></button></li>`;
    openModal('Snel invoeren', `<ul class="sheet-list">
      ${item('logFree', 'tc-easy', ICON.run, 'Run loggen', 'Tijd, afstand en hoe het voelde')}
      ${item('logOther', 'tc-cross', ICON.ball, 'Andere sport loggen', firstSport ? `Bijv. ${RF.sports.label(firstSport.type)}` : 'CrossFit, zwemmen, pickleball, hiken…')}
      ${item('importFree', 'tc-long', ICON.upload, 'Garmin-bestand importeren', '.fit, .gpx, .tcx of .zip uit Garmin Connect')}
      ${item('notFull', 'tc-strength', ICON.heart, 'Niet 100 %', 'Schema tijdelijk verlichten')}
      ${state.goal.type === 'race' ? item('racePlan', 'tc-key', ICON.flag, 'Wedstrijdplan', 'Pacing, splits en voeding') : ''}
    </ul>`);
  }

  /* ---------- import / export ---------- */
  let importTarget = null;
  function startImport(workoutId) {
    importTarget = workoutId || null;
    const inp = $('#fileImport');
    inp.value = '';
    inp.click();
  }

  async function handleImportFile(file) {
    if (!file) return;
    try {
      toast('Bestand lezen…');
      const act = await RF.importers.parseFile(file);
      const an = RF.importers.analyze(act, zs());
      if (!an.durationSec) throw new Error('Geen tijd gevonden in dit bestand.');
      let wid = importTarget;
      if (!wid) {
        const cands = P.allWorkouts(state).filter((w) => (an.activity === 'run' ? !P.NONRUN.has(w.type) : w.type === 'cross' && (w.sport === an.activity || an.activity === 'other')) && !logFor(w) && Math.abs(u.daysBetween(w.date, an.date)) <= 1)
          .sort((a, b) => Math.abs(u.daysBetween(a.date, an.date)) - Math.abs(u.daysBetween(b.date, an.date)));
        wid = cands[0] ? cands[0].id : null;
      }
      importTarget = null;
      logForm({ date: an.date, distanceKm: an.distanceKm, durationSec: an.durationSec, avgHr: an.avgHr, elevGain: an.elevGain, altitudeM: an.avgAlt, activity: an.activity }, wid, an);
    } catch (e) {
      toast(`Import mislukt: ${e.message}`);
    }
  }

  function exportFit(id) {
    const w = P.findWorkout(state, id);
    if (!w) return;
    const bytes = RF.fitexport.build(w, ctx(w.date, w));
    const slug = w.title.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
    RF.store.download(new Blob([bytes], { type: 'application/vnd.ant.fit' }), `${w.date}-${slug}.fit`);
    openModal('Training naar je horloge', `<p>Het bestand <strong>${esc(`${w.date}-${slug}.fit`)}</strong> is gedownload.</p>
      <ol class="notes"><li>Sluit je Garmin met de USB-kabel aan op je laptop.</li><li>Open de schijf <strong>GARMIN</strong> en daarin de map <code>GARMIN\\NewFiles</code>.</li><li>Kopieer het .fit-bestand naar die map en koppel het horloge veilig los.</li><li>Op je horloge: <em>Training → Workouts</em> (de naam begint met ‘RF’).</li></ol>
      <p class="small muted">${effortCond(condFor(w.date, w)) ? 'Omdat je op steil terrein/trail loopt, gebruikt de workout hartslagdoelen in plaats van tempo.' : 'De workout gebruikt tempodoelen (aangepast voor de omstandigheden) en hartslag waar tempo niet zinvol is.'} Vanaf een telefoon kun je bestanden niet direct op een Garmin zetten; gebruik daarvoor een laptop.</p>
      <div class="sheet-foot"><button type="button" class="btn primary" data-action="closeModal">Klaar</button></div>`);
  }

  /* ---------- acties ---------- */
  const actions = {
    closeModal,
    fab: quickSheet,
    toggleSection: (d) => {
      const f = document.querySelector(`[data-sect="${d.key}"]`);
      const isOpen = f.classList.contains('is-open');
      if (isOpen) {
        f.classList.remove('is-open'); f.querySelector('.sect-body').hidden = true; f.querySelector('.sect-head').setAttribute('aria-expanded', 'false'); openSect = null;
      } else {
        openSection(d.key, window.innerWidth < 720);
        f.querySelector('.sect-head').scrollIntoView({ block: 'nearest' });
      }
    },
    openWorkout: (d) => openWorkout(d.id),
    startPlayer: (d) => {
      const w = P.findWorkout(state, d.id);
      if (!w) return;
      closeModal();
      const c = ctx(w.date, w);
      const seq = RF.player.buildSequence(w, c, (s) => targetText(s, c));
      if (!seq.length) { toast('Deze training heeft geen stappen om te begeleiden.'); return; }
      RF.player.open({
        workout: w, seq, prefs: { ...state.prefs },
        onPrefs: (p) => { state.prefs = { ...p }; persist(); },
        onFinish: (sec) => {
          if (w.type === 'strength') { actions.quickDone({ id: w.id }); return; }
          const timeOnly = !JSON.stringify(w.steps).includes('"dist"');
          logForm({ date: u.today(), durationSec: sec, distanceKm: timeOnly && effortCond(c.cond) ? null : Math.round(w.estKm * Math.min(1.2, sec / Math.max(1, w.estSec)) * 10) / 10, activity: 'run' }, w.id);
        },
      });
    },
    swapAlt: (d) => {
      const msg = P.applyAlternative(state, d.id, d.key);
      persist(); render(); openWorkout(d.id); toast(msg || 'Gewisseld.');
    },
    calMove: (d) => { const n = Number(d.dir); calM += n; if (calM < 0) { calM = 11; calY--; } if (calM > 11) { calM = 0; calY++; } render(); const c = $('#calTitle'); if (c) c.focus(); },
    calDay: (d) => calDayModal(d.date),
    setYear: (d) => { yearSel = Number(d.year); render(); },
    logWorkout: (d) => {
      const w = P.findWorkout(state, d.id);
      const cross = w.type === 'cross';
      logForm({ date: w.date <= u.today() ? w.date : u.today(), distanceKm: cross ? null : w.estKm, durationSec: w.estSec, activity: cross ? w.sport : 'run', rpe: cross ? RF.sports.rpe({ type: w.sport, intensity: w.intensity }) : null, intensity: w.intensity }, d.id);
    },
    logFree: () => logForm({ date: u.today() }, null),
    logOther: () => { const a = (state.activities || [])[0]; logForm({ date: u.today(), activity: a ? a.type : 'crossfit', rpe: a ? RF.sports.rpe(a) : 6, durationSec: a ? a.durationMin * 60 : null, intensity: a ? a.intensity : null }, null); },
    importFor: (d) => { closeModal(); startImport(d.id); },
    importFree: () => { closeModal(); startImport(null); },
    exportFit: (d) => exportFit(d.id),
    quickDone: (d) => { const w = P.findWorkout(state, d.id); state.logs.push({ id: `log-${Date.now().toString(36)}`, date: w.date > u.today() ? u.today() : w.date, workoutId: w.id, distanceKm: 0, durationSec: 1500, rpe: 5, source: 'kracht' }); persist(); closeModal(); render(); toast('Krachttraining afgevinkt.'); },
    skip: (d) => { P.findWorkout(state, d.id).skipped = true; persist(); closeModal(); render(); toast('Training overgeslagen. Niet inhalen – gewoon door met het schema.'); },
    unskip: (d) => { delete P.findWorkout(state, d.id).skipped; persist(); closeModal(); render(); },
    restore: (d) => { P.restore(P.findWorkout(state, d.id)); persist(); closeModal(); render(); toast('Training teruggezet.'); },
    easifyOne: (d) => { const w = P.findWorkout(state, d.id); P.reduceUpcoming(state, w.date, 1, 0.8, 'op verzoek', false); persist(); closeModal(); render(); toast('Training is nu rustig.'); },
    deleteLog: (d, el) => {
      if (!confirmTwice(el)) return;
      state.logs = state.logs.filter((l) => l.id !== d.id); state.goal.courseAttempts = (state.goal.courseAttempts || []).filter((a) => a.logId !== d.id); persist(); closeModal(); render(); toast('Log verwijderd.');
    },
    viewLog: (d) => {
      const l = state.logs.find((x) => x.id === d.id);
      const w = l.workoutId ? P.findWorkout(state, l.workoutId) : null;
      openModal(u.dateLong(l.date), `<p class="eyebrow">${esc(w ? w.title : RF.sports.isRunLog(l) ? 'Losse run' : RF.sports.label(l.activity))}</p>${logSummary(l)}<div class="btn-row"><button type="button" class="btn danger" data-action="deleteLog" data-id="${esc(l.id)}">${ICON.trash} Log verwijderen</button></div>`);
    },
    notFull: notFullModal,
    resetTodayCond: () => { state.todayCond = null; persist(); render(); },
    goalDetails: () => openModal('Is je doel haalbaar?', goalAnalysisHtml(RF.goal.analyze(state), state.goal, false)),
    racePlan: () => openModal('Wedstrijdplan', racePlanHtml(RF.coach.racePlan(state))),
    useFeasible: (d) => {
      const sec = Number(d.sec);
      if (d.inform === '1') { setTimeFld('fTarget', sec); updateFormPreviews(); markDirty(); toast('Doeltijd ingevuld. Vergeet niet op te slaan.'); return; }
      state.goal.targetSec = sec; state.plan = P.rebuild(state, u.today()); persist(); closeModal(); render(); toast(`Doeltijd aangepast naar ${u.clock(sec)}. Schema herbouwd.`);
    },
    resetWcond: (d) => { delete P.findWorkout(state, d.id).cond; persist(); openWorkout(d.id); render(); },
    insight: (d) => {
      if (d.fn === 'goalDetails') { actions.goalDetails(); return; }
      closeModal();
      const t = u.today();
      if (d.fn === 'easyToday') { const n = P.reduceUpcoming(state, t, 1, 0.8, 'zware dag gisteren', false); toast(n ? 'Training van vandaag is nu rustig.' : 'Niets aan te passen.'); }
      if (d.fn === 'reduceWeek') { const n = P.reduceUpcoming(state, t, 7, 0.85, 'lichtere week', false); toast(`${n} trainingen verlicht voor de komende 7 dagen.`); }
      if (d.fn === 'clearNotFull') { P.clearNotFull(state); toast('Welkom terug! Je schema is hersteld.'); }
      if (d.fn === 'applyVdot') {
        const l = state.logs.find((x) => x.id === d.arg);
        if (l) {
          state.fitness.vdot = l.vdot; l.vdotApplied = true;
          state.fitness.input = { source: 'vdot' };
          state.fitness.history.push({ date: l.date, vdot: l.vdot, source: 'tijdrit' });
          toast(`Tempo’s bijgewerkt naar VDOT ${u.num(l.vdot, 1)}.`);
        }
      }
      persist(); render();
    },
    wizNext: () => {
      const form = $('form[data-form="settings"]');
      const { errors } = readSettings(form, wizardStep);
      const mine = errors.filter((e) => e[0] === wizardStep);
      if (mine.length) { $('#formError').textContent = mine.map((e) => e[1]).join(' '); return; }
      syncDraft(form);
      wizardStep++; render(); focusStep();
    },
    wizPrev: () => { syncDraft($('form[data-form="settings"]')); wizardStep--; render(); focusStep(); },
    addCourse: () => {
      $('#courseRows').insertAdjacentHTML('beforeend', courseRow({ id: `c${Date.now().toString(36)}${actSeq++}`, distanceKm: state.goal.distanceKm, effort: 'max', tempC: state.conditions.tempC, humidity: state.conditions.humidity }));
      const inp = $('#courseRows').lastElementChild.querySelector('input'); if (inp) inp.focus();
      updateFormPreviews(); markDirty();
    },
    removeCourse: (d, el) => { el.closest('[data-course-row]').remove(); updateFormPreviews(); markDirty(); },
    addActivity: () => {
      const box = $('#actRows');
      box.insertAdjacentHTML('beforeend', activityRow({ id: `a${Date.now().toString(36)}${actSeq++}`, type: 'crossfit', days: [], durationMin: 60, intensity: 'medium' }));
      $('#actEmpty').hidden = true;
      const s = box.lastElementChild.querySelector('select'); if (s) s.focus();
      updateFormPreviews(); markDirty();
    },
    removeActivity: (d, el) => {
      el.closest('[data-act-row]').remove();
      $('#actEmpty').hidden = !!document.querySelector('[data-act-row]');
      updateFormPreviews(); markDirty();
    },
    exportBackup: () => RF.store.exportJSON(state),
    importBackup: () => { const i = $('#fileBackup'); i.value = ''; i.click(); },
    resetNow: () => {
      RF.store.reset(); state = RF.store.defaults(); wizardStep = 0; view = 'today'; openSect = null;
      history.replaceState(null, '', location.pathname); closeModal(); render(true); toast('Alle gegevens op dit apparaat zijn gewist.');
    },
    resetCancel: () => { history.replaceState(null, '', location.pathname + location.hash); closeModal(); },
    reset: (d, el) => {
      if (!confirmTwice(el)) return;
      RF.store.reset(); state = RF.store.defaults(); wizardStep = 0; view = 'today'; render(true); toast('Alles gewist.');
    },
  };

  function focusStep() { const t = document.querySelector('fieldset.sect:not([hidden]) .sect-title'); if (t) { t.setAttribute('tabindex', '-1'); t.focus(); } }

  /** Bewaar wizard-invoer tussen stappen (zonder schema te maken). */
  function syncDraft(form) {
    const { draft } = readSettings(form, 0);
    Object.assign(state, draft);
    persist();
  }

  function confirmTwice(el) {
    if (el.dataset.armed) return true;
    el.dataset.armed = '1';
    const old = el.innerHTML;
    el.textContent = 'Tik nogmaals om te bevestigen';
    setTimeout(() => { if (el.isConnected) { delete el.dataset.armed; el.innerHTML = old; } }, 4000);
    return false;
  }

  /* ---------- events ---------- */
  document.addEventListener('click', (e) => {
    const nav = e.target.closest('[data-nav]');
    if (nav) {
      if (!state.onboarded) { toast('Maak eerst je schema.'); return; }
      view = nav.dataset.nav; closeModal(); render(true); return;
    }
    const a = e.target.closest('[data-action]');
    if (a && actions[a.dataset.action]) { e.preventDefault(); actions[a.dataset.action](a.dataset, a); }
  });

  document.addEventListener('submit', (e) => {
    const f = e.target;
    e.preventDefault();
    switch (f.dataset.form) {
      case 'settings': saveSettings(f); break;
      case 'log': saveLog(f); break;
      case 'move': {
        const msg = P.move(state, f.dataset.id, new FormData(f).get('date'));
        persist(); closeModal(); render(); toast(msg || 'Training verplaatst.');
        break;
      }
      case 'notFull': {
        const fd = new FormData(f);
        P.setNotFull(state, u.today(), Number(fd.get('days')), fd.get('mode'));
        persist(); closeModal(); render(); toast('Schema verlicht. Beterschap!');
        break;
      }
      case 'wcond': {
        const fd = new FormData(f);
        const w = P.findWorkout(state, f.dataset.id);
        const c = { preset: 'custom', tempC: u.parseNum(fd.get('tempC')) ?? 20, humidity: u.parseNum(fd.get('humidity')) ?? 60, altitudeM: u.parseNum(fd.get('altitudeM')) ?? 0, terrain: fd.get('terrain') };
        if (w.type === 'race') Object.assign(state.goal, { raceTempC: c.tempC, raceHumidity: c.humidity, raceAltitudeM: c.altitudeM, raceTerrain: c.terrain === 'trail' ? 'trail' : state.goal.raceTerrain });
        else w.cond = c;
        persist(); openWorkout(w.id); render(); toast('Omstandigheden opgeslagen.');
        break;
      }
      case 'todayCond': {
        const fd = new FormData(f);
        state.todayCond = { date: u.today(), preset: fd.get('preset'), tempC: u.parseNum(fd.get('tempC')) ?? 25, humidity: u.parseNum(fd.get('humidity')) ?? 70, altitudeM: state.conditions.altitudeM, terrain: fd.get('terrain') };
        persist(); render(); toast('Tempo’s voor vandaag aangepast.');
        break;
      }
      default: break;
    }
  });

  document.addEventListener('change', (e) => {
    const el = e.target;
    if (el.name === 'preset' && RF.cond.PRESETS[el.value]) {
      const p = RF.cond.PRESETS[el.value];
      const form = el.form;
      for (const k of ['tempC', 'humidity', 'altitudeM']) if (form.elements[k]) form.elements[k].value = p[k];
      if (form.elements.terrain) form.elements.terrain.value = p.terrain;
    } else if (['tempC', 'humidity', 'altitudeM', 'terrain'].includes(el.name) && el.form && el.form.elements.preset) {
      el.form.elements.preset.value = 'custom';
    }
    if (el.name === 'activity' && el.form) el.form.querySelectorAll('[data-run-only]').forEach((x) => { x.hidden = el.value !== 'run'; });
    if (el.form && el.form.dataset.form === 'settings') { updateFormPreviews(); markDirty(); }
    if (el.id === 'fileImport') handleImportFile(el.files[0]);
    if (el.id === 'fileBackup' && el.files[0]) {
      RF.store.importJSON(el.files[0]).then((s) => { state = s; persist(); view = 'today'; render(true); toast('Back-up teruggezet.'); })
        .catch((err) => toast(err.message));
    }
  });
  document.addEventListener('input', (e) => {
    const el = e.target;
    if (el.dataset && el.dataset.tpart) syncTime(el.closest('[data-time]'));
    if (el.id === 'lgRpe') setText('rpeOut', RPE_TEXT[Number(el.value)]);
    if (el.form && el.form.dataset.form === 'settings') { updateFormPreviews(); markDirty(); }
  });

  $('#modal').addEventListener('click', (e) => { if (e.target === e.currentTarget) closeModal(); });
  $('#modal').addEventListener('close', () => { pendingImport = null; });

  let dragDepth = 0;
  window.addEventListener('dragenter', (e) => { if (e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files') && state.onboarded) { dragDepth++; $('#dropHint').hidden = false; } });
  window.addEventListener('dragleave', () => { dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) $('#dropHint').hidden = true; });
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => {
    e.preventDefault(); dragDepth = 0; $('#dropHint').hidden = true;
    const f = e.dataTransfer && e.dataTransfer.files[0];
    if (f && state.onboarded) handleImportFile(f);
  });

  window.addEventListener('hashchange', () => { const v = fromHash(); if (v !== view) { view = v; render(true); } });

  let resizeT;
  window.addEventListener('resize', () => { clearTimeout(resizeT); resizeT = setTimeout(() => { if (view === 'progress' && state.onboarded && !$('#modal').open) render(); }, 250); });

  let lastDay = u.today();
  document.addEventListener('visibilitychange', () => { if (!document.hidden && u.today() !== lastDay) { lastDay = u.today(); render(); } });

  if ('serviceWorker' in navigator && /^https?:/.test(location.protocol)) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }

  RF.app = { toast, get state() { return state; } };
  void terrainOptions;
  render();
  // Reset-link: .../run-faster/?reset – vraagt eerst om bevestiging
  if (new URLSearchParams(location.search).has('reset')) {
    openModal('Alles wissen?', `<p>Hiermee wis je <strong>alle gegevens van Run Faster op dit apparaat</strong>: schema, logboek, doelen en instellingen. Dit kan niet ongedaan worden gemaakt.</p><p class="small muted">Tip: maak eerst een back-up als je iets wilt bewaren (Doelen → Meer → Back-up).</p>
      <div class="sheet-foot"><button type="button" class="btn" data-action="resetCancel">Annuleren</button><button type="button" class="btn danger" data-action="resetNow">Ja, alles wissen</button></div>`);
  }
})(window.RF = window.RF || {});
