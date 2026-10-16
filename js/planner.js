/*
 * Schemagenerator. Combineert:
 *  - Daniels (VDOT-tempo's), Seiler/Fitzgerald (80/20-intensiteit),
 *  - Lydiard/Pfitzinger (periodisering, heuvelfase, middellange duurloop),
 *  - Hansons (begrensde lange duurloop), Noorse 'singles' (sub-drempel), Galloway (run-walk).
 * Volume wordt intern in minuten gepland; afstanden zijn vlak-equivalent schattingen.
 */
(function (RF) {
  'use strict';
  const u = RF.u;

  /* ---------- stap-bouwstenen ---------- */
  const T = (sec, zone, kind = 'active', label) => ({ kind, dur: { type: 'time', sec: Math.round(sec) }, zone, label });
  const D = (m, zone, kind = 'active', label) => ({ kind, dur: { type: 'dist', m: Math.round(m) }, zone, label });
  const REP = (reps, steps) => ({ kind: 'repeat', reps, steps });
  const WU = (min = 15) => T(min * 60, 'E', 'warmup', 'Inlopen');
  const CD = (min = 10) => T(min * 60, 'E', 'cooldown', 'Uitlopen');
  const r5 = (x) => Math.max(5, Math.round(x / 5) * 5);
  const lerp = (a, b, k) => Math.round(a + (b - a) * k);

  const NONRUN = new Set(['strength', 'cross']);
  const PHASE_LABEL = { base: 'Basis', build: 'Opbouw', peak: 'Specifiek', taper: 'Taper', test: 'Testweek' };
  const STYLE_LABEL = { balanced: 'Gebalanceerd', norwegian: 'Noorse singles', runwalk: 'Run-walk' };

  /* ---------- duur & afstand ---------- */
  function flatPace(zone, p, fixed) {
    if (fixed) return fixed;
    switch (zone) {
      case 'walk': return 540;
      case 'rec': return p.rec;
      case 'E': case 'down': return p.E;
      case 'M': case 'S': case 'T': case 'I': case 'R': return p[zone];
      case 'hill': return p.T * 1.05;
      case 'stairs': return p.E;
      default: return p.T;
    }
  }

  function walkSteps(steps, fn, mult = 1) {
    for (const s of steps) {
      if (s.kind === 'repeat') walkSteps(s.steps, fn, mult * s.reps);
      else fn(s, mult);
    }
  }

  function stepSec(s, p) {
    if (s.dur.type === 'time') return s.dur.sec;
    if (s.dur.type === 'dist') return s.dur.m / 1000 * flatPace(s.zone, p, s.pace);
    return 0;
  }

  function stats(w, p) {
    let sec = 0, km = 0, high = 0;
    walkSteps(w.steps || [], (s, m) => {
      const t = stepSec(s, p) * m;
      sec += t;
      km += s.dur.type === 'dist' ? s.dur.m / 1000 * m : t / flatPace(s.zone, p, s.pace);
      const tz = RF.zones.TARGETS[s.zone];
      if (tz && !tz.low && s.kind === 'active') high += t;
    });
    return { sec, km, high };
  }

  /* ---------- sessies ---------- */
  function flatNote(c) {
    if (!c.saba) return null;
    if (c.fac.treadmill) return 'Doe deze training bij voorkeur op de loopband (1 % helling): dan kloppen de tempo’s.';
    if (c.fac.flatRoute) return 'Kies je vlakste stuk. De tempo’s gelden voor vlak terrein.';
    return 'Geen vlak parcours beschikbaar: loop op hartslag en RPE. Het tempo is een vlak-equivalent.';
  }
  const useDist = (c) => c.fac.track || !c.saba;
  const notes = (...n) => n.filter(Boolean);

  const S = {
    fartlek(c, k) {
      const reps = lerp(6, 10, k);
      return { type: 'fartlek', title: `Fartlek ${reps} × 1 min`, steps: [WU(12), REP(reps, [T(60, 'I', 'active', 'Versnellen'), T(120, 'E', 'recovery', 'Rustig')]), CD(10)],
        notes: notes('Speels: versnel op gevoel tot ‘hard maar beheerst’.', c.saba && 'Op Saba: versnel bij voorkeur bergop of op een vlakker stuk; bergaf rustig.') };
    },
    fartlekRW(c, k) {
      const reps = lerp(4, 8, k);
      return { type: 'fartlek', title: `Speelse run-walk met ${reps} versnellingen`, steps: [T(10 * 60, 'walk', 'warmup', 'Stevig wandelen'), REP(reps, [T(30, 'M', 'active', 'Iets sneller lopen'), T(90, 'walk', 'recovery', 'Wandelen')]), T(5 * 60, 'walk', 'cooldown', 'Uitwandelen')],
        notes: ['Versnel tot een tempo waarbij praten lastig wordt, nooit sprinten.'] };
    },
    progression(c, k) {
      const total = lerp(40, 60, k);
      return { type: 'progression', title: `Progressieve duurloop ${total} min`, steps: [T((total - 15) * 60, 'E'), T(10 * 60, 'M', 'active', 'Naar marathontempo'), T(5 * 60, 'T', 'active', 'Afsluiten op drempel')],
        notes: notes('Begin echt rustig en bouw pas in het laatste kwartier op.', flatNote(c)) };
    },
    hillRepeats(c, k) {
      const reps = lerp(6, 10, k);
      const sec = Math.round((60 + 30 * k) / 15) * 15;
      return { type: 'hills', title: `${c.saba ? 'Heuvelherhalingen op The Road' : 'Heuvelherhalingen'} ${reps} × ${sec} s`,
        steps: [WU(15), REP(reps, [T(sec, 'hill', 'active', 'Bergop – krachtig'), T(sec * 1.5, 'rec', 'recovery', 'Rustig terug naar beneden')]), CD(10)],
        notes: notes('Lydiard-heuvelwerk: kracht en loopeconomie. Hoge knieën, actieve armen, rechtop.',
          c.saba ? 'Kies een stuk van The Road met 8–12 % helling. Bergaf kleine pasjes, beheerst.' : 'Zoek een helling van 5–8 %.') };
    },
    hillSprints(c) {
      return [REP(8, [T(10, 'hill', 'active', 'Heuvelsprint 10 s'), T(110, 'walk', 'recovery', 'Wandelend terug')])];
    },
    stairs(c, k) {
      const reps = lerp(3, 5, k), min = lerp(6, 10, k);
      return { type: 'stairs', title: `Trappen Mount Scenery ${reps} × ${min} min`,
        steps: [WU(15), REP(reps, [T(min * 60, 'stairs', 'active', 'Trap op – stevig, gelijkmatig'), T(min * 60 * 0.8, 'walk', 'recovery', 'Voorzichtig naar beneden')]), CD(10)],
        notes: ['Stevig maar beheerst (zone 3–4). Kleine, snelle stappen; handen op de knieën mag op de steilste stukken.', 'Naar beneden wandelen: de treden zijn vaak nat en glad, vooral in het wolkenwoud.'] };
    },
    tempo(c, k) {
      const min = lerp(15, 30, k);
      return { type: 'threshold', title: `Tempoloop ${min} min op drempel`, steps: [WU(15), T(min * 60, 'T', 'active', 'Drempeltempo'), CD(10)],
        notes: notes('‘Comfortabel zwaar’: je kunt nog korte zinnen zeggen.', flatNote(c)) };
    },
    cruise(c, k) {
      const reps = lerp(3, 5, k);
      const steps = useDist(c)
        ? [WU(15), REP(reps, [D(1600, 'T', 'active', 'Drempel'), T(60, 'rec', 'recovery', 'Dribbelen')]), CD(10)]
        : [WU(15), REP(reps, [T(360, 'T', 'active', 'Drempel'), T(60, 'rec', 'recovery', 'Dribbelen')]), CD(10)];
      return { type: 'threshold', title: `Cruise-intervallen ${reps} × ${useDist(c) ? '1600 m' : '6 min'}`, steps, notes: notes('Daniels cruise-intervallen: korte pauze, gelijkmatig tempo.', flatNote(c)) };
    },
    vo2(c, k) {
      const reps = lerp(5, 6, k);
      const steps = useDist(c)
        ? [WU(15), REP(reps, [D(1000, 'I', 'active', 'Interval'), T(150, 'rec', 'recovery', 'Dribbelpauze')]), CD(10)]
        : [WU(15), REP(reps, [T(lerp(180, 240, k), 'I', 'active', 'Interval'), T(150, 'rec', 'recovery', 'Dribbelpauze')]), CD(10)];
      return { type: 'intervals', title: `VO2max-intervallen ${reps} × ${useDist(c) ? '1000 m' : u.dur(lerp(180, 240, k))}`, steps,
        notes: notes('Hard maar gelijkmatig: de laatste herhaling even snel als de eerste.', flatNote(c)) };
    },
    reps(c, k) {
      const reps = lerp(8, 12, k);
      const steps = useDist(c)
        ? [WU(15), REP(reps, [D(200, 'R', 'active', 'Snel en ontspannen'), D(200, 'rec', 'recovery', 'Dribbelen')]), CD(10)]
        : [WU(15), REP(reps, [T(40, 'R', 'active', 'Snel en ontspannen'), T(80, 'rec', 'recovery', 'Dribbelen')]), CD(10)];
      return { type: 'reps', title: `Snelheid ${reps} × ${useDist(c) ? '200 m' : '40 s'}`, steps, notes: notes('Focus op techniek: snel, licht, ontspannen schouders.', flatNote(c)) };
    },
    steady(c, k) {
      const min = lerp(25, 50, k);
      return { type: 'steady', title: `Duurloop met ${min} min marathontempo`, steps: [WU(15), T(min * 60, 'M', 'active', 'Marathontempo'), CD(10)], notes: notes(flatNote(c)) };
    },
    subT(c, k, variant) {
      const v = variant % 3;
      let title, main;
      if (v === 0) { const n = lerp(5, 6, k); title = `Sub-drempel ${n} × 6 min`; main = REP(n, [T(360, 'S', 'active', 'Net onder drempel'), T(60, 'rec', 'recovery', 'Dribbelen')]); }
      else if (v === 1) {
        const n = lerp(8, 10, k);
        title = `Sub-drempel ${n} × ${useDist(c) ? '1000 m' : '3 min'}`;
        main = REP(n, [useDist(c) ? D(1000, 'S', 'active', 'Net onder drempel') : T(180, 'S', 'active', 'Net onder drempel'), T(60, 'rec', 'recovery', 'Dribbelen')]);
      } else { const n = lerp(8, 10, k); title = `Sub-drempel 3 × ${n} min`; main = REP(3, [T(n * 60, 'S', 'active', 'Net onder drempel'), T(90, 'rec', 'recovery', 'Dribbelen')]); }
      return { type: 'subthreshold', title, steps: [WU(15), main, CD(10)],
        notes: notes('Noorse methode: bewust NET onder je drempel blijven (RPE 6). Je moet na afloop het gevoel hebben dat je meer kon.', flatNote(c)) };
    },
    nwHills(c, k) {
      const n = lerp(10, 15, k);
      return { type: 'hills', title: `Korte heuvels ${n} × 45 s`, steps: [WU(15), REP(n, [T(45, 'hill', 'active', 'Bergop – snel'), T(75, 'rec', 'recovery', 'Terug joggen')]), CD(10)],
        notes: notes('Het ‘X’-element van de Noorse singles: kort en snel, niet verzuren.', c.saba && 'The Road heeft genoeg korte steile stukken – perfect hiervoor.') };
    },
    racePace(c, k) {
      const gp = c.goalPace;
      const g = c.goalKm;
      let reps, m, rest;
      if (g <= 6) { reps = lerp(4, 6, k); m = 1000; rest = 120; }
      else if (g <= 12) { reps = lerp(3, 4, k); m = 2000; rest = 120; }
      else if (g <= 25) { reps = 3; m = lerp(3000, 5000, k); rest = 180; }
      else { reps = 2; m = lerp(5000, 8000, k); rest = 180; }
      const step = useDist(c) ? D(m, 'GP', 'active', 'Doeltempo') : T(m / 1000 * gp, 'GP', 'active', 'Doeltempo');
      step.pace = gp;
      const flatRace = c.raceTerrain === 'flat' && c.saba;
      return { type: 'racepace', title: `Wedstrijdtempo ${reps} × ${useDist(c) ? u.km(m / 1000, m % 1000 ? 1 : 0) : u.dur(m / 1000 * gp)}`,
        steps: [WU(15), REP(reps, [step, T(rest, 'rec', 'recovery', 'Dribbelpauze')]), CD(10)],
        notes: notes('Leer je doeltempo voelen: ontspannen en gelijkmatig.', flatRace ? 'Je wedstrijd is vlak: oefen dit tempo op de loopband of op vlakke grond, anders leer je het verkeerde gevoel aan.' : flatNote(c)) };
    },
  };

  /* ---------- run-sessies (rustig) ---------- */
  function easyRun(min, c, extra) {
    const steps = [T(min * 60, 'E')];
    if (extra === 'strides') steps.push(REP(6, [T(20, 'R', 'active', 'Versnelling 20 s'), T(60, 'walk', 'recovery', 'Wandelen / dribbelen')]));
    if (extra === 'hillsprints') steps.push(...S.hillSprints(c));
    const title = extra === 'strides' ? `Rustige duurloop ${min} min + versnellingen` : extra === 'hillsprints' ? `Rustige duurloop ${min} min + heuvelsprints` : `Rustige duurloop ${min} min`;
    return { type: 'easy', title, steps, notes: notes('Echt rustig: je kunt makkelijk praten (zone 1–2).', c.saba && 'Op Saba stuurt je hartslag, niet je tempo. Wandel gerust de steilste stukken.') };
  }
  function downhillRun(min, c) {
    return { type: 'downhill', title: `Duurloop ${min} min met bergaf-techniek`,
      steps: [T(Math.max(10, min - 12) * 60, 'E'), REP(6, [T(60, 'down', 'active', 'Gecontroleerd bergaf'), T(60, 'E', 'recovery', 'Rustig')])],
      notes: ['Bergaf lopen belast je bovenbenen excentrisch: dit traint ze om spierschade te voorkomen.', 'Korte snelle pasjes, licht voorover, voeten onder je heupen. Niet remmen met je hakken.'] };
  }
  function longRun(min, c, variant, k) {
    if (variant === 'mp') {
      const mp = lerp(20, 45, k);
      const st = T(mp * 60, 'GP', 'active', 'Marathontempo'); st.pace = c.goalPace;
      return { type: 'long', title: `Lange duurloop ${min} min met ${mp} min marathontempo`, steps: [T((min - mp - 5) * 60, 'E'), st, T(5 * 60, 'E', 'cooldown', 'Uitlopen')],
        notes: notes('Pfitzinger-stijl: marathontempo op vermoeide benen. Neem onderweg sportdrank of gels.', flatNote(c)) };
    }
    if (variant === 'fast') {
      return { type: 'long', title: `Lange duurloop ${min} min, snelle finish`, steps: [T((min - 15) * 60, 'E'), T(15 * 60, 'S', 'active', 'Snelle finish')],
        notes: notes('De laatste 15 minuten op halve-marathongevoel.', flatNote(c)) };
    }
    return { type: 'long', title: `Lange duurloop ${min} min`, steps: [T(min * 60, 'E')],
      notes: notes('Rustig en ontspannen; tijd op de benen telt.', min >= 75 && 'Neem water mee; vanaf ~75 min ook koolhydraten.', c.saba && 'Op Saba: vroeg starten tegen de hitte, op hartslag lopen en wandelen op de steilste stukken is prima.') };
  }
  function runWalk(min, run, walk) {
    const reps = Math.max(1, Math.floor(min / (run + walk)));
    return { type: 'runwalk', title: `Run-walk ${run}:${walk} – ${min} min`, steps: [REP(reps, [T(run * 60, 'E', 'active', 'Hardlopen'), T(walk * 60, 'walk', 'recovery', 'Wandelen')])],
      notes: ['Galloway-methode: de wandelpauzes zijn onderdeel van de training, sla ze niet over.'] };
  }
  function strength(c, taper) {
    return { type: 'strength', title: taper ? 'Kracht licht (15 min)' : 'Kracht & stabiliteit (25 min)', steps: [],
      notes: ['3 × 10–12: (split)squats, kuitheffen langzaam laten zakken, éénbenige deadlift, bil-brug.', 'Romp: plank 3 × 40 s, zijplank 3 × 30 s per kant.',
        c.saba ? 'Saba-extra: step-downs van een traptree (3 × 10 per been) – bereidt je voor op bergaf.' : 'Extra: step-downs van een traptree (3 × 10 per been).',
        'Hardloopkracht doe je op harde dagen, zodat rustige dagen echt rustig blijven.'] };
  }
  function timeTrial(km, c) {
    return { type: 'tt', title: `Tijdrit ${u.km(km, 0)}`, steps: [WU(15), REP(4, [T(15, 'R', 'active', 'Versnelling'), T(45, 'walk', 'recovery', 'Rustig')]), D(km * 1000, 'race', 'active', 'Tijdrit – gelijkmatig, alles geven'), CD(10)],
      notes: notes('Fitheidstest: log je tijd en vink ‘wedstrijd/tijdrit’ aan; de app werkt dan je tempo’s bij.',
        c.saba && 'Op Saba: liefst op de loopband (1 %) of altijd hetzelfde parcours. Bij import van je Garmin-bestand corrigeert de app voor hellingen (GAP) en hitte.') };
  }
  function raceDay(c) {
    return { type: 'race', title: `Wedstrijd ${u.km(c.goalKm, c.goalKm % 1 ? 1 : 0)}`, steps: [WU(10), D(c.goalKm * 1000, 'GP', 'active', 'Wedstrijd'), T(5 * 60, 'walk', 'cooldown', 'Uitwandelen')].map((s) => { if (s.zone === 'GP') s.pace = c.goalPace; return s; }),
      notes: ['Start iets rustiger dan je doeltempo, de eerste kilometer is de belangrijkste om níet te snel te gaan.', 'Succes!'] };
  }

  /* ---------- planparameters ---------- */
  const PEAK_KM = { 5: [25, 40, 60], 10: [30, 48, 70], 21.1: [35, 55, 80], 42.2: [45, 65, 95] };
  const LONG_CAP = { 5: 75, 10: 95, 21.1: 120, 42.2: 180 };
  const LVL = { beginner: 0, intermediate: 1, advanced: 2 };

  function byDistance(table, km) {
    const keys = Object.keys(table).map(Number).sort((a, b) => a - b);
    if (km <= keys[0]) return table[keys[0]];
    for (let i = 1; i < keys.length; i++) {
      if (km <= keys[i]) {
        const a = table[keys[i - 1]], b = table[keys[i]], f = (km - keys[i - 1]) / (keys[i] - keys[i - 1]);
        return Array.isArray(a) ? a.map((x, j) => x + (b[j] - x) * f) : a + (b - a) * f;
      }
    }
    return table[keys[keys.length - 1]];
  }

  function taperWeeks(km) { return km <= 10 ? 1 : km <= 25 ? 2 : 3; }

  function assignPhases(N, goal) {
    const out = [];
    if (goal.type === 'race') {
      const tp = Math.min(taperWeeks(goal.distanceKm), Math.max(1, N - 2));
      const R = N - tp;
      let base = R >= 4 ? Math.max(1, Math.round(R * 0.35)) : 0;
      let peak = R >= 3 ? Math.max(1, Math.round(R * 0.2)) : R;
      let build = R - base - peak;
      if (build < 0) { peak += build; build = 0; }
      for (let i = 0; i < base; i++) out.push('base');
      for (let i = 0; i < build; i++) out.push('build');
      for (let i = 0; i < peak; i++) out.push('peak');
      for (let i = 0; i < tp; i++) out.push('taper');
    } else if (goal.type === 'speed') {
      const base = Math.max(1, Math.round(N * 0.25)), peak = Math.max(1, Math.round(N * 0.3));
      for (let i = 0; i < N - 1; i++) out.push(i < base ? 'base' : i < N - 1 - peak ? 'build' : 'peak');
      out.push('test');
    } else {
      const base = Math.max(1, Math.round(N * 0.4));
      for (let i = 0; i < N; i++) out.push(i < base ? 'base' : 'build');
    }
    return out;
  }

  /** Aantal kwaliteitstrainingen per week. */
  function qualityCount(days, level, style, phase) {
    if (style === 'runwalk') return phase === 'base' || days < 3 ? 0 : 1;
    if (style === 'norwegian') return days <= 3 ? 1 : days <= 5 ? (days === 5 && level === 'advanced' ? 3 : 2) : 3;
    if (days <= 3) return 1;
    if (level === 'beginner' && (days === 4 || phase === 'base')) return 1;
    return 2;
  }

  function qualitySessions(c, nQ, wi, k) {
    if (nQ === 0) return [];
    const { phase, style, goalKm, goalType } = c;
    if (style === 'runwalk') return [S.fartlekRW(c, k)];
    if (phase === 'taper') return [S.racePace(c, 0)].map((s) => shrink(s));
    if (style === 'norwegian') {
      const arr = [S.subT(c, k, wi), S.subT(c, k, wi + 1)];
      if (phase === 'peak' && goalType === 'race') arr[1] = S.racePace(c, k);
      if (nQ >= 3) arr.push(S.nwHills(c, k));
      return arr.slice(0, nQ);
    }
    const hillsOk = c.saba || c.fac.hills;
    let a, b;
    if (phase === 'base') {
      a = wi % 2 ? S.progression(c, k) : S.fartlek(c, k);
      b = hillsOk ? (c.saba && wi % 2 ? S.stairs(c, k) : S.hillRepeats(c, k * 0.6)) : S.fartlek(c, k);
    } else if (phase === 'build') {
      a = wi % 2 ? S.cruise(c, k) : S.tempo(c, k);
      if (goalType === 'endurance') b = S.steady(c, k);
      else if (goalKm <= 10) b = S.vo2(c, k);
      else b = wi % 2 ? S.vo2(c, k) : (goalKm >= 30 ? S.steady(c, k) : (hillsOk ? S.hillRepeats(c, k) : S.vo2(c, k)));
    } else { // peak / test
      a = goalType === 'endurance' ? S.tempo(c, 1) : goalKm >= 30 ? S.tempo(c, k) : S.racePace(c, k);
      b = goalKm <= 10 ? (wi % 2 ? S.reps(c, k) : S.vo2(c, k)) : S.cruise(c, k);
    }
    return [a, b].slice(0, nQ);
  }

  /** Taper-sessie: hoofdblok inkorten. */
  function shrink(s, note) {
    for (const st of s.steps) if (st.kind === 'repeat') st.reps = Math.max(2, Math.ceil(st.reps * 0.6));
    s.title = s.title.replace(/\d+ ×/, (m) => `${Math.max(2, Math.ceil(parseInt(m, 10) * 0.6))} ×`) + (s.title.endsWith('(kort)') ? '' : ' (kort)');
    s.notes = note ? [note].concat(s.notes || []) : ['Taper: kort en scherp. Je behoudt je snelheid en laat de vermoeidheid wegzakken.'];
    return s;
  }

  /** Kies kwaliteitsdagen: geen twee zware dagen naast elkaar, maximale spreiding rond de lange duurloop. */
  function pickQualityDays(avail, longDay, nQ, dayLoad) {
    const prev = (d) => (d === 1 ? 7 : d - 1);
    const leg = (d) => (dayLoad ? dayLoad[d].leg : 0);
    // andere sporten: geen kwaliteitsrun op of direct na een zware dag (CrossFit, lange hike)
    const crossPenalty = (d) => (leg(d) >= 3 ? 60 : 0) + (leg(prev(d)) >= 3 ? 60 : leg(prev(d)) >= 2 ? 20 : 0);
    const gap = (a, b) => { const d = Math.abs(a - b); return Math.min(d, 7 - d); };
    const cands = avail.filter((d) => d !== longDay);
    nQ = Math.min(nQ, cands.length);
    let best = [], bestScore = -Infinity;
    const dayBeforeLong = longDay === 1 ? 7 : longDay - 1;
    (function combos(start, chosen) {
      if (chosen.length === nQ) {
        let qq = 7, all = 7;
        for (let i = 0; i < chosen.length; i++) {
          all = Math.min(all, gap(chosen[i], longDay));
          for (let j = i + 1; j < chosen.length; j++) { qq = Math.min(qq, gap(chosen[i], chosen[j])); all = Math.min(all, gap(chosen[i], chosen[j])); }
        }
        const score = Math.min(qq, 3) * 100 + all * 10 - (chosen.includes(dayBeforeLong) ? 3 : 0) - chosen.reduce((s, d) => s + crossPenalty(d), 0) - (chosen.includes(dayBeforeLong) && leg(dayBeforeLong) >= 2 ? 10 : 0);
        if (score > bestScore) { bestScore = score; best = chosen.slice(); }
        return;
      }
      for (let i = start; i < cands.length; i++) combos(i + 1, chosen.concat(cands[i]));
    })(0, []);
    return best.sort((a, b) => a - b);
  }

  /** Startvolume (min/week): recente logs wegen zwaarder dan de profielinvoer. */
  function currentWeeklyMin(state, today, paces) {
    const from = u.addDays(today, -21);
    const recent = state.logs.filter((l) => l.date >= from && l.date < today && RF.sports.isRunLog(l));
    if (recent.length >= 4) return recent.reduce((s, l) => s + l.durationSec / 60, 0) / 3;
    return (state.schedule.weeklyKm || 15) * paces.E / 60;
  }

  /** Doeltempo (sec/km) voor wedstrijdtempo-sessies, begrensd tot wat realistisch is. */
  function goalPaceFor(state, today) {
    const a = RF.goal.analyze(state, today);
    return { vdot: a.planVdot, pace: a.flatGoalPace };
  }

  /* ---------- generator ---------- */
  function generate(state, today) {
    today = today || u.today();
    const g = state.goal, sch = state.schedule, lvl = state.profile.experience || 'intermediate';
    let style = state.coachStyle || 'balanced';
    const paces = RF.vdot.paces(state.fitness.vdot);
    const start = u.mondayOf(today);
    const goalKm = g.type === 'endurance' ? 21.1 : (g.distanceKm || 10);

    let N;
    if (g.type === 'race' && g.raceDate) N = Math.max(1, Math.floor(u.daysBetween(start, u.mondayOf(g.raceDate)) / 7) + 1);
    else N = Math.max(4, Math.min(30, g.planWeeks || 12));
    N = Math.min(N, 40);

    const phases = assignPhases(N, g);
    const avail = (sch.days && sch.days.length ? sch.days : [2, 4, 6, 7]).slice().sort((a, b) => a - b);
    const days = avail.length;
    const longDay = avail.includes(sch.longDay) ? sch.longDay : avail[avail.length - 1];
    const cond = state.conditions || {};
    const fac = state.facilities || {};
    const saba = cond.terrain === 'steep' || cond.terrain === 'trail';
    const gp = goalPaceFor(state, today);
    const acts = state.activities || [];
    const dayLoad = RF.sports.dayLoad(acts);
    const crossEq = RF.sports.weeklyAerobicMin(acts);
    const cfCount = RF.sports.crossfitPerWeek(acts);

    // volume
    const peakKm = byDistance(PEAK_KM, goalKm)[LVL[lvl]] * (style === 'runwalk' ? 0.7 : 1);
    let startMin = Math.max(days * (style === 'runwalk' ? 20 : 25), currentWeeklyMin(state, today, paces));
    const peakMin = Math.max(startMin, peakKm * paces.E / 60);
    const growth = style === 'runwalk' || lvl === 'beginner' ? 1.06 : 1.08;
    let longCap = byDistance(LONG_CAP, goalKm) * (lvl === 'beginner' ? 0.85 : 1) * (lvl === 'advanced' && goalKm > 30 ? 1.05 : 1);
    if (g.type === 'endurance' && g.longRunMin) longCap = Math.max(30, g.longRunMin);
    const longShare = g.type === 'endurance' ? 0.4 : days <= 3 ? 0.4 : days === 4 ? 0.33 : 0.3;
    const taperLen = phases.filter((p) => p === 'taper').length;
    const taperF = { 1: [0.6], 2: [0.75, 0.5], 3: [0.8, 0.65, 0.45] }[taperLen] || [];

    let build = startMin, peakReached = startMin;
    let longPrev = Math.max(25, (sch.longestKm || 0) * paces.E / 60 || startMin * longShare);
    const phaseIdx = {}; const phaseLen = {};
    phases.forEach((p) => { phaseLen[p] = (phaseLen[p] || 0) + 1; });

    const weeks = [];
    for (let i = 0; i < N; i++) {
      const phase = phases[i];
      phaseIdx[phase] = (phaseIdx[phase] || 0) + 1;
      const k = phaseLen[phase] > 1 ? (phaseIdx[phase] - 1) / (phaseLen[phase] - 1) : 0.5;
      let vol, cutback = false;
      if (phase === 'taper') vol = peakReached * taperF[i - (N - taperLen)];
      else {
        cutback = i > 0 && (i + 1) % 4 === 0 && N - i > taperLen + 1;
        if (!cutback && i > 0) build = Math.min(peakMin, build * growth);
        vol = cutback ? build * 0.75 : build;
        if (phase === 'test') vol = build * 0.8;
        peakReached = Math.max(peakReached, build);
      }
      let longMin;
      if (cutback || phase === 'test') longMin = longPrev * 0.75;
      else if (phase === 'taper') longMin = Math.min(longPrev, vol * longShare);
      else { longMin = Math.min(longCap, Math.max(vol * longShare, 30), longPrev + 10); longPrev = Math.max(longPrev, longMin); }
      longMin = r5(Math.max(style === 'runwalk' ? 20 : 30, longMin));

      const c = { phase, style, level: lvl, goalKm, goalType: g.type, saba, fac, goalPace: gp.pace, raceTerrain: g.raceTerrain, cutback };
      const wk = buildWeek({ c, i, N, k: cutback ? Math.max(0, k - 0.4) : k, vol, longMin, avail, longDay, days, paces, start: u.addDays(start, i * 7), today, state, phases, dayLoad, crossEq, cfCount });
      weeks.push(wk);
    }
    return { createdAt: today, start, N, style, goalPace: gp.pace, goalVdot: gp.vdot, startVdot: state.fitness.vdot, weeks };
  }

  function buildWeek(o) {
    const { c, i, N, avail, longDay, days, paces, start, today, state } = o;
    let k = o.k;
    const raceDate = state.goal.type === 'race' ? state.goal.raceDate : null;
    const isRaceWeek = raceDate && raceDate >= start && raceDate <= u.addDays(start, 6);
    let nQ = qualityCount(days, c.level, c.style, c.phase);
    if (c.cutback && nQ > 2) nQ = 2;
    if (isRaceWeek) nQ = Math.min(nQ, 1);

    const qDays = pickQualityDays(avail, longDay, nQ, o.dayLoad);
    const dateOf = (d) => u.addDays(start, d - 1);
    const rank = (w) => (w.type === 'cross' ? 2 : w.type === 'strength' ? 1 : 0);
    const prevDay = (d) => (d === 1 ? 7 : d - 1);

    /** Vaste sporten uit de routine toevoegen + waarschuwingen bij botsingen met zware runs. */
    function addCross(workouts) {
      const dl = o.dayLoad;
      if (!dl) return;
      for (let d = 1; d <= 7; d++) {
        for (const a of dl[d].acts) {
          const date = dateOf(d);
          const t = RF.sports.type(a.type);
          const leg = RF.sports.legLoad(a);
          const n = [];
          if (isRaceWeek && date < raceDate && u.daysBetween(date, raceDate) <= 3 && leg >= 2) n.push('Wedstrijdweek: sla dit liever over of doe het heel licht. Frisse benen gaan voor.');
          else if (c.phase === 'taper' && leg >= 2) n.push('Taper: houd het licht en korter dan normaal.');
          if (t.note) n.push(t.note);
          workouts.push({ type: 'cross', sport: a.type, actId: a.id, intensity: a.intensity, title: `${t.label} ${a.durationMin} min`, steps: [], notes: n, date, crossMin: a.durationMin });
        }
      }
      // botsingen die niet te vermijden waren
      for (const w of workouts) {
        if (!w.key || w.type === 'race' || w.type === 'cross') continue;
        const d = u.weekday(w.date);
        const same = dl[d].acts.find((a) => RF.sports.legLoad(a) >= 3);
        const before = dl[prevDay(d)].acts.slice().sort((x, y) => RF.sports.legLoad(y) - RF.sports.legLoad(x))[0];
        const lbl = (a) => RF.sports.type(a.type).label;
        if (same && w.type !== 'long') w.notes = [`Ook ${lbl(same)} vandaag: loop deze training vóór je ${lbl(same)}-sessie, of verplaats hem naar een rustige dag.`].concat(w.notes || []);
        else if (before && RF.sports.legLoad(before) >= (w.type === 'long' ? 2 : 3)) w.notes = [`Gisteren ${lbl(before)}: start rustig en luister naar je benen. Voelen ze zwaar, loop dan op het rustigste einde van de zone.`].concat(w.notes || []);
      }
    }
    const runwalkRatio = () => { const p = N > 1 ? i / (N - 1) : 1; return [Math.max(1, Math.round(1 + p * 7 * (c.level === 'beginner' ? 0.8 : 1))), 1]; };

    // Tijdrit inplannen (niet voor run-walk)
    let tt = null;
    if (c.style !== 'runwalk' && !isRaceWeek) {
      const ttKm = c.goalType === 'race' && c.goalKm >= 21 && c.level !== 'beginner' ? 10 : 5;
      if (c.phase === 'test') tt = timeTrial(c.goalKm <= 10 ? c.goalKm : 10, c);
      else if (i === 0 && state.fitness.source === 'easy') tt = timeTrial(5, c);
      else if (N >= 10 && i === Math.round(N * 0.45)) tt = timeTrial(ttKm, c);
    }

    let built, trim = false;
    for (let attempt = 0; attempt < 6; attempt++) {
      built = assemble();
      const share = built.high / Math.max(1, built.total);
      const limit = c.phase === 'taper' || c.phase === 'test' || tt ? 0.3 : c.style === 'norwegian' ? 0.25 : 0.2;
      if (share <= limit || nQ === 0) break;
      if (k > 0) k = Math.max(0, k - 0.34); else if (nQ > 1) nQ -= 1; else if (!trim) trim = true; else break;
    }
    return built.week;

    function assemble() {
      const qs = qualitySessions(c, Math.min(nQ, qDays.length), i, k);
      if (trim && c.phase !== 'taper') qs.forEach((q, j) => { qs[j] = shrink(q, 'Ingekort om binnen de 80/20-verdeling te blijven.'); });
      if (tt && qs.length) qs[0] = tt; else if (tt) qs.push(tt);
      const workouts = [];
      const qMinOf = () => qs.reduce((s, w) => s + stats(w, paces).sec / 60, 0);
      const longVariant = c.style !== 'runwalk' && c.phase === 'peak' && !c.cutback ? (c.goalKm >= 30 ? 'mp' : c.goalKm >= 15 ? 'fast' : null) : null;
      const minEasy = 20;
      // Te weinig volume voor rustige runs? Eerst een kwaliteitstraining laten vallen, dan pas rustige dagen.
      while (qs.length > 1 && (o.vol - o.longMin - qMinOf()) < minEasy * (avail.length - 1 - qs.length)) qs.pop();
      const qUsed = qDays.slice(0, qs.length);
      let easyDays = avail.filter((d) => d !== longDay && !qUsed.includes(d));
      let remaining = o.vol - o.longMin - qMinOf();
      while (easyDays.length && remaining / easyDays.length < minEasy) {
        // laat bij weinig volume eerst de dag vóór de lange duurloop vallen
        const dbl = longDay === 1 ? 7 : longDay - 1;
        const drop = easyDays.includes(dbl) ? dbl : easyDays[0];
        easyDays = easyDays.filter((d) => d !== drop);
      }
      const maxEasy = Math.max(minEasy, Math.min(75, o.longMin * 0.8));
      let per = easyDays.length ? Math.min(maxEasy, Math.max(minEasy, remaining / easyDays.length)) : 0;
      // andere sporten: rustig loopvolume iets omlaag (50 % van de aerobe sportminuten, max. 20 % van de week)
      const crossCut = Math.min(0.5 * (o.crossEq || 0), 0.2 * o.vol);
      if (crossCut > 0 && easyDays.length && !isRaceWeek) per = Math.max(minEasy, per - crossCut / easyDays.length);
      let mlrDay = null;
      if (c.goalKm >= 21 && c.level !== 'beginner' && easyDays.length >= 2 && (c.phase === 'build' || c.phase === 'peak') && c.style !== 'runwalk') {
        const gapL = (d) => { const x = Math.abs(d - longDay); return Math.min(x, 7 - x); };
        mlrDay = easyDays.slice().sort((a, b) => gapL(b) - gapL(a))[0];
      }
      const stridesDay = c.style !== 'runwalk' && c.phase !== 'taper' && easyDays.length ? easyDays[easyDays.length - 1] : null;
      const downhillDay = c.saba && (c.phase === 'base' || c.phase === 'build') && i % 3 === 1 && easyDays.length >= 2 ? easyDays[0] : null;

      // lange duurloop / wedstrijd
      if (isRaceWeek) {
        const rd = u.weekday(raceDate);
        workouts.push({ ...raceDay(c), date: raceDate, key: true });
        // voor de wedstrijd: kort en fris; de dag ervoor rust (behalve bij 6+ dagen: shake-out)
        for (const d of avail) {
          if (d >= rd) continue;
          if (d === rd - 1) { if (days >= 6) workouts.push({ ...easyRun(20, c, 'strides'), title: 'Shake-out 20 min + versnellingen', date: dateOf(d) }); continue; }
          if (qs.length && d === qDays[0] && rd - d >= 3) { workouts.push({ ...qs[0], date: dateOf(d), key: true }); continue; }
          workouts.push({ ...easyRun(r5(Math.min(35, per || 30)), c, d === rd - 2 ? 'strides' : null), date: dateOf(d) });
        }
      } else {
        const lr = c.style === 'runwalk' ? runWalk(o.longMin, ...runwalkRatio()) : longRun(o.longMin, c, longVariant, k);
        lr.type = 'long'; lr.title = lr.title.replace('Run-walk', 'Lange run-walk');
        workouts.push({ ...lr, date: dateOf(longDay), key: true });
        qUsed.forEach((d, j) => { if (qs[j]) workouts.push({ ...qs[j], date: dateOf(d), key: true }); });
        for (const d of easyDays) {
          let w;
          if (c.style === 'runwalk') w = runWalk(r5(per), ...runwalkRatio());
          else if (d === mlrDay) w = { ...longRun(r5(Math.min(o.longMin * 0.75, per * 1.5)), c), type: 'mlr', title: `Middellange duurloop ${r5(Math.min(o.longMin * 0.75, per * 1.5))} min` };
          else if (d === downhillDay) w = downhillRun(r5(per), c);
          else w = easyRun(r5(per), c, d === stridesDay ? (c.phase === 'base' && (c.saba || c.fac.hills) ? 'hillsprints' : 'strides') : null);
          workouts.push({ ...w, date: dateOf(d) });
        }
        const nStrength = Math.max(0, 2 - (o.cfCount || 0));
        if (state.schedule.strength && nStrength > 0) {
          const dbl = longDay === 1 ? 7 : longDay - 1;
          const sDays = qUsed.concat(easyDays.filter((d) => d !== dbl)).slice(0, nStrength);
          sDays.forEach((d) => workouts.push({ ...strength(c, c.phase === 'taper'), date: dateOf(d) }));
        }
      }

      addCross(workouts);
      let total = 0, high = 0, km = 0;
      const list = workouts.filter((w) => w.date >= today).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : rank(a) - rank(b)));
      list.forEach((w, n) => {
        if (w.type === 'cross') { w.id = `${w.date}-${n}-cross-${w.sport}`; w.estSec = w.crossMin * 60; w.estKm = 0; return; }
        const st = stats(w, paces);
        w.id = `${w.date}-${n}-${w.type}`;
        w.estSec = Math.round(st.sec); w.estKm = Math.round(st.km * 10) / 10;
        total += st.sec; high += st.high; km += st.km;
      });
      return {
        total, high,
        week: { i, start, phase: c.phase, cutback: c.cutback, targetMin: Math.round(total / 60), targetKm: Math.round(km * 10) / 10, highShare: total ? high / total : 0, workouts: list },
      };
    }
  }

  /** Herbouw vanaf vandaag: verleden + gelogde trainingen blijven bewaard. */
  function rebuild(state, today) {
    today = today || u.today();
    const fresh = generate(state, today);
    const old = state.plan ? state.plan.weeks : [];
    const loggedIds = new Set(state.logs.map((l) => l.workoutId).filter(Boolean));
    const keep = (w) => w.date < today || loggedIds.has(w.id);
    const pastWeeks = old.filter((w) => w.start < fresh.start).map((w) => ({ ...w, workouts: w.workouts.filter(keep) }));
    const cur = old.find((w) => w.start === fresh.start);
    if (cur && fresh.weeks[0]) {
      const kept = cur.workouts.filter(keep);
      const keptDates = new Set(kept.filter((w) => !NONRUN.has(w.type)).map((w) => w.date));
      fresh.weeks[0].workouts = kept.concat(fresh.weeks[0].workouts.filter((w) => !keptDates.has(w.date)))
        .sort((a, b) => (a.date < b.date ? -1 : 1));
    }
    fresh.history = pastWeeks;
    fresh.weeks = pastWeeks.concat(fresh.weeks).map((w, idx) => ({ ...w, n: idx + 1 }));
    return fresh;
  }

  /* ---------- doelen / tempo-opzoeken ---------- */
  function targetFor(step, ctx) {
    const p = ctx.paces;
    const t = RF.zones.TARGETS[step.zone] || RF.zones.TARGETS.E;
    let range = null;
    switch (step.zone) {
      case 'rec': range = [p.Eslow + 10, p.Eslow + 40]; break;
      case 'E': range = [p.Efast, p.Eslow]; break;
      case 'M': case 'S': case 'T': case 'I': case 'R': range = [p[step.zone] - 3, p[step.zone] + 3]; break;
      case 'GP': case 'race': { const x = step.pace || p.T; range = [x - 2, x + 2]; break; }
      default: range = null;
    }
    const adj = range ? range.map((x) => RF.cond.adjust(x, ctx.cond)) : null;
    const effort = ['hill', 'stairs', 'down', 'walk'].includes(step.zone) || (adj && adj[0].effortBased);
    return {
      label: t.label, rpe: t.rpe,
      hr: RF.zones.hrRange(step.zone, ctx.zs),
      flat: range,
      adjusted: adj ? [adj[0].sec, adj[1].sec] : null,
      parts: adj ? adj[0].parts : [],
      effortBased: !!effort,
    };
  }

  /* ---------- aanpassingen ---------- */
  function allWorkouts(state) { return state.plan ? state.plan.weeks.flatMap((w) => w.workouts) : []; }
  function findWorkout(state, id) { return allWorkouts(state).find((w) => w.id === id); }
  function weekOf(state, date) { return state.plan.weeks.find((w) => date >= w.start && date <= u.addDays(w.start, 6)); }

  /** Maak een training rustig en korter (factor). Origineel wordt bewaard. */
  function easify(w, factor, reason, paces) {
    if (NONRUN.has(w.type) || w.type === 'race') return;
    if (!w.original) w.original = JSON.parse(JSON.stringify({ title: w.title, steps: w.steps, notes: w.notes, type: w.type, estSec: w.estSec, estKm: w.estKm }));
    const min = r5((w.estSec / 60) * factor);
    w.steps = [T(min * 60, 'E')];
    w.title = `Rustig ${min} min (${reason})`;
    w.notes = ['Aangepast door de coach. Je kunt dit terugzetten in het trainingsdetail.'];
    if (w.type !== 'long') w.type = 'easy';
    const st = stats(w, paces);
    w.estSec = Math.round(st.sec); w.estKm = Math.round(st.km * 10) / 10;
  }

  function restore(w) {
    if (!w.original) return;
    Object.assign(w, w.original);
    delete w.original;
    for (const k of ['cond', 'sport', 'crossMin', 'intensity']) if (w[k] === null) delete w[k];
  }

  /* ---------- training wisselen ---------- */
  /** Context van de week waarin `date` valt, voor de sessiebouwers. */
  function weekCtx(state, date) {
    const g = state.goal, cond = state.conditions || {};
    const wk = state.plan ? weekOf(state, date) : null;
    return {
      phase: wk ? wk.phase : 'base', style: state.coachStyle || 'balanced', level: state.profile.experience || 'intermediate',
      goalKm: g.type === 'endurance' ? 21.1 : (g.distanceKm || 10), goalType: g.type,
      saba: cond.terrain === 'steep' || cond.terrain === 'trail', fac: state.facilities || {},
      goalPace: (state.plan && state.plan.goalPace) || goalPaceFor(state, date).pace, raceTerrain: g.raceTerrain, cutback: !!(wk && wk.cutback),
    };
  }

  const FAMILY = {
    speed: { types: ['intervals', 'reps', 'fartlek', 'hills', 'stairs'], alts: [['alt-vo2', 'VO2max-intervallen', 'Zelfde prikkel, vaste herhalingen'], ['alt-hills', 'Heuvelherhalingen', 'Zelfde zware prikkel bergop – minder impact op vlak tempo'], ['alt-fartlek', 'Fartlek', 'Speelse variant op gevoel, ideaal zonder vlak parcours']] },
    threshold: { types: ['threshold', 'subthreshold', 'steady', 'progression', 'racepace'], alts: [['alt-tempo', 'Tempoloop', 'Eén aaneengesloten blok op drempel'], ['alt-cruise', 'Cruise-intervallen', 'Drempelblokken met korte pauzes'], ['alt-subT', 'Sub-drempel', 'Net onder je drempel, lagere herstelkosten']] },
  };

  /** Mogelijke wissels voor een training. */
  function alternatives(state, w) {
    if (!w || NONRUN.has(w.type) || w.type === 'race') return [];
    const out = [];
    const c = condFor(state, w);
    if (c.terrain !== 'treadmill') out.push({ key: 'treadmill', label: 'Loopband-versie', desc: 'Zelfde training op de loopband (1 % helling). Tempo’s worden vlakke tempo’s.' });
    if (w.estSec >= 30 * 60 && w.type !== 'tt') {
      out.push({ key: 'short75', label: 'Korter (± 75 %)', desc: `Ca. ${Math.round(w.estSec * 0.75 / 60)} min – minder herhalingen of kortere duur.` });
      out.push({ key: 'short50', label: 'Veel korter (± 50 %)', desc: `Ca. ${Math.round(w.estSec * 0.5 / 60)} min – voor een drukke dag.` });
    }
    for (const f of Object.values(FAMILY)) {
      if (f.types.includes(w.type)) f.alts.forEach(([key, label, desc]) => { if (!w.title.toLowerCase().startsWith(label.toLowerCase().split(' ')[0])) out.push({ key, label, desc }); });
    }
    if (['easy', 'downhill', 'mlr', 'runwalk', 'recovery'].includes(w.type)) {
      out.push({ key: 'alt-swim', label: 'Zwemmen (rustig)', desc: 'Aerobe training zonder impact – goed als je benen zwaar zijn.' });
      out.push({ key: 'alt-bike', label: 'Fietsen (rustig)', desc: 'Aerobe training met weinig impact.' });
    }
    if (w.type === 'long') out.push({ key: 'alt-hike', label: 'Lange hike', desc: 'Tijd op de benen met minder impact (≈ 1,3 × de duur). Op Saba stevig bergop.' });
    return out;
  }
  function condFor(state, w) { return w.cond || state.conditions || {}; }

  function snapshot(w) {
    return JSON.parse(JSON.stringify({ title: w.title, steps: w.steps, notes: w.notes, type: w.type, estSec: w.estSec, estKm: w.estKm, key: !!w.key, cond: w.cond || null, sport: w.sport || null, crossMin: w.crossMin || null, intensity: w.intensity || null }));
  }

  /** Voer een wissel uit. Origineel blijft bewaard (terugzetten kan). Geeft een melding terug. */
  function applyAlternative(state, id, key) {
    const w = findWorkout(state, id);
    if (!w) return null;
    if (!w.original) w.original = snapshot(w);
    const paces = RF.vdot.paces(state.fitness.vdot);
    const c = weekCtx(state, w.date);
    // zwaarte van het alternatief volgt de fase (basis licht, specifiek zwaarder)
    const k = c.cutback ? 0 : { base: 0, build: 0.5, peak: 0.8, taper: 0, test: 0.5 }[c.phase] ?? 0.5;
    const toCross = (sport, factor, intensity, title) => {
      const min = r5(w.estSec / 60 * factor);
      Object.assign(w, { type: 'cross', sport, crossMin: min, intensity, key: false, steps: [], title: `${title} ${min} min`, notes: [`In plaats van: ${w.original.title}.`, RF.sports.type(sport).note].filter(Boolean) });
      w.estSec = min * 60; w.estKm = 0;
    };
    const build = (fn) => {
      const s = fn();
      Object.assign(w, { type: s.type, title: s.title, steps: s.steps, notes: [`Gewisseld van: ${w.original.title}.`].concat(s.notes || []) });
    };
    switch (key) {
      case 'treadmill':
        w.cond = { ...state.conditions, preset: 'custom', terrain: 'treadmill' };
        w.notes = ['Loopband: zet hem op 1 % helling. Tempo’s gelden als vlak.'].concat((w.notes || []).filter((n) => !/loopband/i.test(n)));
        break;
      case 'short75': case 'short50': {
        const f = key === 'short75' ? 0.75 : 0.5;
        const scale = (steps) => steps.forEach((s) => {
          if (s.kind === 'repeat') s.reps = Math.max(1, Math.round(s.reps * f));
          else if (s.dur.type === 'time' && s.kind === 'active') s.dur.sec = Math.max(300, Math.round(s.dur.sec * f / 60) * 60);
          else if (s.dur.type === 'time' && (s.kind === 'warmup' || s.kind === 'cooldown')) s.dur.sec = Math.max(300, Math.round(s.dur.sec * Math.max(f, 0.7) / 60) * 60);
        });
        scale(w.steps);
        w.title = `${w.original.title} (${f === 0.75 ? 'korter' : 'kort'})`;
        break;
      }
      case 'alt-vo2': build(() => S.vo2(c, k)); break;
      case 'alt-hills': build(() => S.hillRepeats(c, k)); break;
      case 'alt-fartlek': build(() => S.fartlek(c, k)); break;
      case 'alt-tempo': build(() => S.tempo(c, k)); break;
      case 'alt-cruise': build(() => S.cruise(c, k)); break;
      case 'alt-subT': build(() => S.subT(c, k, 0)); break;
      case 'alt-swim': toCross('swim', 1, 'light', 'Zwemmen'); break;
      case 'alt-bike': toCross('bike', 1.1, 'light', 'Fietsen'); break;
      case 'alt-hike': toCross('hike', 1.3, 'medium', 'Lange hike'); break;
      default: return null;
    }
    if (w.type !== 'cross') { const st = stats(w, paces); w.estSec = Math.round(st.sec); w.estKm = Math.round(st.km * 10) / 10; }
    // controle: zware dagen naast elkaar?
    const hard = key.startsWith('alt-') ? allWorkouts(state).filter((x) => x.key && !x.skipped && !NONRUN.has(x.type) && x.type !== 'long').map((x) => x.date).sort() : [];
    for (let j = 1; j < hard.length; j++) {
      if (u.daysBetween(hard[j - 1], hard[j]) === 1 && (hard[j] === w.date || hard[j - 1] === w.date)) return 'Gewisseld. Let op: er staat een zware training op de dag ervoor of erna.';
    }
    return 'Training gewisseld. Terugzetten kan via ‘Origineel terug’.';
  }

  /** Verlaag de komende n dagen: volume × factor, kwaliteit -> rustig (behalve als keepQuality). */
  function reduceUpcoming(state, today, nDays, factor, reason, keepQuality) {
    const paces = RF.vdot.paces(state.fitness.vdot);
    const end = u.addDays(today, nDays - 1);
    let n = 0;
    for (const w of allWorkouts(state)) {
      if (w.date < today || w.date > end || NONRUN.has(w.type) || w.type === 'race') continue;
      if (state.logs.some((l) => l.workoutId === w.id)) continue;
      if (w.key && keepQuality && w.type !== 'long') continue;
      easify(w, factor, reason, paces); n++;
    }
    return n;
  }

  function setNotFull(state, today, nDays, mode) {
    clearNotFull(state);
    state.notFull = { from: today, to: u.addDays(today, nDays - 1), mode };
    const end = state.notFull.to;
    const paces = RF.vdot.paces(state.fitness.vdot);
    for (const w of allWorkouts(state)) {
      if (w.date < today || w.date > end || w.type === 'race') continue;
      if (state.logs.some((l) => l.workoutId === w.id)) continue;
      if (mode === 'sick') {
        if (NONRUN.has(w.type)) { w.skipped = true; w.notFullSkip = true; continue; }
        easify(w, 0.4, 'herstellen', paces);
        w.title = `Rust of max. ${Math.round(w.estSec / 60)} min wandelen/joggen`;
      } else {
        if (NONRUN.has(w.type)) continue;
        easify(w, w.key ? 0.6 : 0.7, 'niet 100 %', paces);
      }
    }
  }

  function clearNotFull(state) {
    for (const w of allWorkouts(state)) {
      if (w.notFullSkip) { delete w.skipped; delete w.notFullSkip; }
      if (w.original && state.logs.every((l) => l.workoutId !== w.id) && w.date >= u.today()) restore(w);
    }
    state.notFull = null;
  }

  /** Verplaats een training; bij een bezette dag worden de runs gewisseld. Geeft waarschuwing terug. */
  function move(state, id, newDate) {
    const w = findWorkout(state, id);
    if (!w || w.date === newDate) return null;
    const oldDate = w.date;
    const other = allWorkouts(state).find((x) => x.date === newDate && !NONRUN.has(x.type) && x.id !== id && !NONRUN.has(w.type));
    w.date = newDate; w.moved = true;
    if (other) { other.date = oldDate; other.moved = true; }
    for (const wk of state.plan.weeks) {
      wk.workouts = wk.workouts.filter((x) => x !== w && x !== other);
    }
    [w, other].filter(Boolean).forEach((x) => {
      const wk = weekOf(state, x.date) || state.plan.weeks[state.plan.weeks.length - 1];
      wk.workouts.push(x);
      wk.workouts.sort((a, b) => (a.date < b.date ? -1 : 1));
    });
    // controle: zware dagen naast elkaar?
    const hard = allWorkouts(state).filter((x) => x.key && !x.skipped).map((x) => x.date).sort();
    for (let j = 1; j < hard.length; j++) {
      if (u.daysBetween(hard[j - 1], hard[j]) === 1 && (hard[j] === newDate || hard[j - 1] === newDate || hard[j] === oldDate || hard[j - 1] === oldDate)) {
        return 'Let op: nu staan er twee zware trainingen op opeenvolgende dagen. Overweeg er één rustiger te lopen.';
      }
    }
    return null;
  }

  /* ---------- coach-inzichten ---------- */
  function insights(state, today) {
    const out = [];
    if (!state.plan) return out;
    const zs = RF.zones.zones(state.profile);
    const runs = allWorkouts(state).filter((w) => !NONRUN.has(w.type));
    const logged = new Set(state.logs.map((l) => l.workoutId));

    // doel-haalbaarheid
    const g = state.goal;
    if (g.targetSec && g.distanceKm && g.type !== 'endurance') {
      const a = RF.goal.analyze(state, today);
      if (a.level === 'no' || a.level === 'stretch') out.push({ id: 'goal', level: 'warn', title: a.level === 'no' ? 'Doeltijd is niet realistisch in deze tijd' : 'Doeltijd is erg ambitieus', text: `Haalbaar in ${a.weeks} weken: ca. ${u.clock(a.feasibleSec)} (doel ${u.clock(g.targetSec)}). Het schema traint naar ${u.clock(a.planRaceSec)}. Bekijk wat er nodig is om je doel te halen.`, action: { label: 'Wat is er nodig?', fn: 'goalDetails' } });
    }

    // trouw aan schema (14 dagen)
    const from = u.addDays(today, -14);
    const due = runs.filter((w) => w.date >= from && w.date < today);
    if (due.length >= 4) {
      const done = due.filter((w) => logged.has(w.id)).length;
      if (done / due.length < 0.7) {
        out.push({ id: 'compliance', level: 'warn', title: `${done} van ${due.length} trainingen gedaan`, text: 'Je schema loopt voor op wat je de laatste twee weken kon doen. Liever een stap terug dan blessures: de coach verlaagt de komende week met 15 % en maakt één zware training rustig.', action: { label: 'Week verlichten', fn: 'reduceWeek' } });
      }
    }

    // rustige runs voelen zwaar
    const easyLogs = state.logs.filter((l) => l.rpe && l.date >= u.addDays(today, -14)).filter((l) => {
      const w = runs.find((x) => x.id === l.workoutId); return w && (w.type === 'easy' || w.type === 'long');
    });
    if (easyLogs.length >= 3) {
      const avg = easyLogs.reduce((s, l) => s + l.rpe, 0) / easyLogs.length;
      if (avg >= 6) out.push({ id: 'easyhard', level: 'warn', title: 'Rustige runs voelen zwaar', text: `Gemiddelde RPE op rustige runs: ${u.num(avg, 1)}. Dat wijst op vermoeidheid, hitte of te hoog tempo. Loop rustige runs op hartslag (zone 1–2), en overweeg een lichtere week.`, action: { label: 'Week verlichten', fn: 'reduceWeek' } });
    }

    // ACWR
    const a = RF.load.acwr(state.logs, today, zs);
    if (a.reliable && a.ratio) {
      if (a.ratio > 1.5) out.push({ id: 'acwr', level: 'warn', title: `Belasting stijgt snel (ACWR ${u.num(a.ratio, 2)})`, text: 'Je belasting van de afgelopen 7 dagen ligt veel hoger dan je 4-wekelijks gemiddelde. Dat verhoogt het blessurerisico.', action: { label: 'Week verlichten', fn: 'reduceWeek' } });
      else if (a.ratio < 0.8) out.push({ id: 'acwr-low', level: 'info', title: `Rustige week (ACWR ${u.num(a.ratio, 2)})`, text: 'Je traint minder dan je gewend bent. Prima als herstel; bouw daarna geleidelijk weer op.' });
    }

    // zware andere sport gisteren + zware run vandaag
    const todayKey = runs.find((w) => w.date === today && w.key && w.type !== 'race' && !logged.has(w.id));
    const yHeavy = state.logs.find((l) => l.date === u.addDays(today, -1) && !RF.sports.isRunLog(l) && ((l.rpe || 0) >= 7 || RF.sports.legLoad({ type: l.activity, intensity: l.intensity, durationMin: l.durationSec / 60 }) >= 3));
    if (todayKey && yHeavy) out.push({ id: 'crossyday', level: 'info', title: `Zware dag gisteren (${RF.sports.label(yHeavy.activity)})`, text: `Vandaag staat ${todayKey.title} gepland. Begin rustig; voelen je benen na de inloop zwaar, maak er dan een rustige run van.`, action: { label: 'Vandaag rustig', fn: 'easyToday' } });

    // 80/20 drift
    const share = RF.load.intensityShare(state.logs, u.addDays(today, -14), today);
    if (share && share.totalSec > 3 * 3600 && share.low < 0.7) {
      out.push({ id: '8020', level: 'warn', title: `Maar ${u.num(share.low * 100, 0)} % van je tijd in zone 1–2`, text: 'Het 80/20-principe: ~80 % van je training hoort rustig te zijn. Op Saba gaat dat vaak mis door de hellingen: wandel de steilste stukken op rustige dagen.' });
    }

    // nieuwe VDOT uit tijdrit/wedstrijd
    const tts = state.logs.filter((l) => l.isRace && l.vdot && l.date >= u.addDays(today, -21)).sort((x, y) => (x.date < y.date ? 1 : -1));
    if (tts.length && Math.abs(tts[0].vdot - state.fitness.vdot) >= 0.8 && tts[0].vdotApplied !== true) {
      out.push({ id: 'vdot', level: 'info', title: `Nieuwe fitheid gemeten: VDOT ${u.num(tts[0].vdot, 1)}`, text: `Op basis van je ${tts[0].vdotCorrected ? 'gecorrigeerde ' : ''}tijdrit/wedstrijd van ${u.dateShort(tts[0].date)}. Huidige VDOT: ${u.num(state.fitness.vdot, 1)}.`, action: { label: 'Tempo’s bijwerken', fn: 'applyVdot', arg: tts[0].id } });
    }

    if (state.notFull) out.push({ id: 'notfull', level: 'info', title: 'Modus ‘Niet 100 %’ actief', text: `Tot en met ${u.dateShort(state.notFull.to)} is je schema verlicht.`, action: { label: 'Stoppen', fn: 'clearNotFull' } });

    const h = RF.cond.heat(state.conditions.tempC, state.conditions.humidity);
    if (h.pct >= 0.03) out.push({ id: 'heat', level: 'info', title: `Hitte: tempo’s ${u.num(h.pct * 100, 1)} % trager`, text: `Bij ${u.temp(state.conditions.tempC)} en dauwpunt ${u.temp(h.dewC)}. Train vroeg in de ochtend, drink 400–800 ml per uur en gebruik elektrolyten bij lange runs. Na 10–14 dagen hitte-acclimatisatie voelt het beter.` });

    return out;
  }

  RF.planner = {
    generate, rebuild, stats, targetFor, flatPace, walkSteps,
    findWorkout, allWorkouts, reduceUpcoming, setNotFull, clearNotFull, restore, move, insights,
    pickQualityDays, assignPhases, PHASE_LABEL, STYLE_LABEL, NONRUN,
    weekCtx, alternatives, applyAlternative, sessions: S,
  };
})(window.RF = window.RF || {});
