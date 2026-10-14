/*
 * Coach: evaluatie na elke training, 'op koers?'-oordeel en het wedstrijdplan (pacing + voeding).
 * Voedingsrichtlijnen: ACSM/IOC-consensus (Thomas et al. 2016; Jeukendrup 2014; Burke 2019).
 */
(function (RF) {
  'use strict';
  const u = RF.u, P = RF.planner;
  const pct = (x) => `${u.num(x * 100, 0)} %`;

  function rpeOf(zone) {
    const t = RF.zones.TARGETS[zone];
    if (!t) return 4;
    const n = String(t.rpe).split(/[–-]/).map(Number);
    return n.length > 1 ? (n[0] + n[1]) / 2 : n[0];
  }

  /** Belangrijkste intensieve zone van een training (meeste tijd), of null bij een rustige run. */
  function mainStep(w, paces) {
    const tot = {};
    let first = {};
    P.walkSteps(w.steps || [], (s, m) => {
      const tz = RF.zones.TARGETS[s.zone];
      if (s.kind !== 'active' || !tz || tz.low) return;
      const sec = (s.dur.type === 'time' ? s.dur.sec : s.dur.m / 1000 * P.flatPace(s.zone, paces, s.pace)) * m;
      tot[s.zone] = (tot[s.zone] || 0) + sec;
      if (!first[s.zone]) first[s.zone] = s;
    });
    const z = Object.keys(tot).sort((a, b) => tot[b] - tot[a])[0];
    return z ? first[z] : null;
  }

  /* ---------- evaluatie van één training ---------- */
  function evaluate(state, log) {
    const w = log.workoutId ? P.findWorkout(state, log.workoutId) : null;
    const zs = RF.zones.zones(state.profile);
    const paces = RF.vdot.paces(state.fitness.vdot);
    const cond = log.conditions || state.conditions;
    const pts = [];
    let score = 0;
    const add = (level, text) => { pts.push({ level, text }); if (level === 'warn') score += 1; if (level === 'bad') score += 2; };
    let tooHard = false, tooShort = false, tooFast = false;

    // Andere sport: belasting + gevolgen voor de volgende hardlooptraining
    if (!RF.sports.isRunLog(log)) {
      const lbl = RF.sports.label(log.activity);
      const leg = RF.sports.legLoad({ type: log.activity, intensity: log.intensity, durationMin: log.durationSec / 60 });
      const load = RF.load.sessionLoad(log, zs);
      add('good', `${lbl} gelogd: ${u.dur(log.durationSec)}${log.rpe ? `, RPE ${log.rpe}` : ''}. Belasting ${u.num(load, 0)} – telt mee in je weekbelasting.`);
      const nextKey = P.allWorkouts(state).find((x) => x.date === u.addDays(log.date, 1) && x.key && !P.NONRUN.has(x.type) && x.type !== 'race');
      if (nextKey && ((log.rpe || 0) >= 7 || leg >= 3)) add('warn', `Morgen staat ${nextKey.title} gepland na een zware ${lbl}-sessie. Start rustig; voelen je benen zwaar, maak er dan een rustige run van.`);
      if (w && w.estSec && log.durationSec > w.estSec * 1.4) add('info', `Langer dan je gebruikelijke ${u.dur(w.estSec)}. Dat is extra belasting – houd de komende run rustig.`);
      const a = RF.load.acwr(state.logs.concat(state.logs.includes(log) ? [] : [log]), log.date, zs);
      if (a.reliable && a.ratio > 1.5) add('warn', `Je totale belasting (hardlopen + andere sporten) stijgt snel: ACWR ${u.num(a.ratio, 2)}.`);
      const verdict = score === 0 ? 'good' : score <= 2 ? 'ok' : 'adjust';
      return {
        verdict,
        headline: verdict === 'good' ? `${lbl}: goed voor je fitheid, geen gevolgen voor je schema` : `${lbl}: let op je volgende run`,
        points: pts,
        suggestion: score ? 'Neem de volgende run rustig of verplaats je zware run een dag.' : 'Ga zo door.',
        action: score >= 2 ? { label: 'Vandaag/morgen rustig', fn: 'reduceWeek' } : null,
      };
    }

    if (!w || w.type === 'strength') {
      add('info', 'Losse run, niet gekoppeld aan een geplande training. Telt wel mee voor je weekvolume en belasting.');
    } else {
      // 1. duur
      if (w.estSec && w.type !== 'race' && w.type !== 'tt') {
        const r = log.durationSec / w.estSec;
        if (r < 0.75) { add('warn', `Korter dan gepland: ${u.dur(log.durationSec)} van ≈ ${u.dur(w.estSec)} (${pct(r)}).`); tooShort = true; }
        else if (r > 1.3) add('warn', `Flink langer dan gepland (${pct(r)}). Extra volume bouwt vermoeidheid op; houd je liever aan het schema.`);
        else add('good', `Duur volgens plan: ${u.dur(log.durationSec)} van ≈ ${u.dur(w.estSec)}.`);
      }
      const ms = mainStep(w, paces);

      if (!ms) {
        // rustige run: hartslag en RPE
        if (log.zoneSec) {
          const tot = log.zoneSec.reduce((a, b) => a + b, 0) || 1;
          const low = (log.zoneSec[0] + log.zoneSec[1]) / tot;
          if (low < 0.7) { add('warn', `Maar ${pct(low)} van de tijd in zone 1–2. Een rustige run hoort voor ≥ 80 % rustig te zijn${cond.terrain === 'steep' ? ' – wandel de steilste stukken' : ''}.`); tooHard = true; }
          else add('good', `${pct(low)} van de tijd in zone 1–2: echt rustig, precies goed.`);
        } else if (log.avgHr) {
          const hi = zs.list[1].hi;
          if (log.avgHr > hi + 3) { add('warn', `Gem. hartslag ${log.avgHr} ligt boven zone 2 (tot ${hi}). Loop rustiger.`); tooHard = true; }
          else add('good', `Gem. hartslag ${log.avgHr}: binnen de rustige zone.`);
        }
        if (log.rpe >= 6) { add('warn', `RPE ${log.rpe} is hoog voor een rustige run. Oorzaak: vermoeidheid, hitte, slaap of te snel gestart?`); tooHard = true; }
        else if (log.rpe) add('good', `RPE ${log.rpe}: goed rustig.`);
      } else if (w.type !== 'race' && w.type !== 'tt') {
        // kwaliteitstraining: herhalingen (rondes) vs doel
        const t = P.targetFor(ms, { paces, cond, zs });
        const easyFast = RF.cond.adjust(paces.Efast, cond).sec;
        const work = (log.laps || []).filter((l) => l.distM >= 150 && l.sec > 0 && l.sec / (l.distM / 1000) < easyFast * 0.97);
        if (work.length >= 2 && !t.effortBased && t.adjusted) {
          const sec = work.reduce((a, l) => a + l.sec, 0), km = work.reduce((a, l) => a + l.distM / 1000, 0);
          const p = sec / km;
          const [fast, slow] = t.adjusted;
          if (p < fast * 0.97) { add('warn', `Je harde stukken waren sneller dan het doel (${u.pace(p)} vs ${u.paceRange(fast, slow)}). Sneller is niet beter: je traint dan een ander energiesysteem en herstelt trager.`); tooFast = true; }
          else if (p > slow * 1.04) add('warn', `Je harde stukken waren trager dan het doel (${u.pace(p)} vs ${u.paceRange(fast, slow)}).`);
          else add('good', `Harde stukken precies op doeltempo (${u.pace(p)}).`);
          const fp = work[0].sec / (work[0].distM / 1000), lp = work[work.length - 1].sec / (work[work.length - 1].distM / 1000);
          if (lp > fp * 1.05) add('warn', `Je zakte in: de laatste herhaling was ${u.num((lp / fp - 1) * 100, 0)} % trager dan de eerste. Begin volgende keer iets rustiger.`);
          else if (work.length >= 3) add('good', 'Gelijkmatig gelopen: laatste herhaling even snel als de eerste.');
        } else if (work.length >= 2 && t.hr) {
          const hrs = work.filter((l) => l.avgHr);
          if (hrs.length) {
            const hr = Math.round(hrs.reduce((a, l) => a + l.avgHr * l.sec, 0) / hrs.reduce((a, l) => a + l.sec, 0));
            if (hr > t.hr[1] + 4) { add('warn', `Hartslag in de harde stukken (${hr}) boven de doelzone ${t.hr[0]}–${t.hr[1]}.`); tooFast = true; }
            else if (hr < t.hr[0] - 6) add('info', `Hartslag in de harde stukken (${hr}) onder de doelzone ${t.hr[0]}–${t.hr[1]}. Bij korte herhalingen is dat normaal.`);
            else add('good', `Hartslag in de harde stukken (${hr}) in de doelzone.`);
          }
        } else if (!log.laps || !log.laps.length) {
          add('info', 'Tip: gebruik de rondeknop van je Garmin per herhaling (of de ‘Naar Garmin’-workout); dan kan de coach je tempo per herhaling beoordelen.');
        }
        const exp = rpeOf(ms.zone);
        if (log.rpe) {
          if (log.rpe > exp + 1.5) { add('warn', `Zwaarder dan bedoeld: RPE ${log.rpe}, verwacht ~${u.num(exp, 0)}.`); tooHard = true; }
          else if (log.rpe < exp - 2) add('info', `Voelde licht (RPE ${log.rpe}). Blijft dat zo, dan kan je fitheid hoger zijn: een tijdrit zet je tempo’s scherper.`);
          else add('good', `RPE ${log.rpe}: precies de bedoelde inspanning.`);
        }
      }
      if (log.isRace && log.vdot) {
        const d = log.vdot - state.fitness.vdot;
        if (d >= 0.5) add('good', `Sterke prestatie: VDOT ${u.num(log.vdot, 1)} (+${u.num(d, 1)}). Werk je tempo’s bij via Coach op Vandaag.`);
        else if (d <= -1.5) add('warn', `VDOT ${u.num(log.vdot, 1)} is lager dan je huidige ${u.num(state.fitness.vdot, 1)}. Eén mindere dag zegt weinig; let op slaap, hitte en vermoeidheid.`);
        else add('good', `VDOT ${u.num(log.vdot, 1)}: in lijn met je huidige fitheid.`);
      }
    }

    const h = RF.cond.heat(cond.tempC, cond.humidity);
    if (h.pct >= 0.03) add('info', `Bij ${u.temp(cond.tempC)} en dauwpunt ${u.temp(h.dewC)} is ~${u.num(h.pct * 100, 1)} % trager normaal. Daar heeft de coach rekening mee gehouden.`);
    if ((cond.altitudeM || 0) > 1000) add('info', `Op ${u.meters(cond.altitudeM)} hoogte is ~${u.num(RF.cond.altitude(cond.altitudeM) * 100, 1)} % trager normaal.`);

    // Oorzaak: andere sport de dag ervoor?
    let cause = null;
    if (tooHard) {
      const y = u.addDays(log.date, -1);
      const yl = state.logs.find((l) => l.date === y && !RF.sports.isRunLog(l));
      const yw = P.allWorkouts(state).find((x) => x.date === y && x.type === 'cross');
      cause = yl ? yl.activity : yw ? yw.sport : null;
      if (cause) add('info', `Gisteren ${RF.sports.label(cause)}: dat verklaart waarschijnlijk de zware benen.`);
    }

    // trend: meerdere zware evaluaties?
    const recent = state.logs.filter((l) => l.review && l.id !== log.id && l.date >= u.addDays(log.date, -14));
    const sameCause = cause ? state.logs.filter((l) => l.review && l.review.cause === cause && l.id !== log.id && l.date >= u.addDays(log.date, -28)).length : 0;
    const recentBad = recent.filter((l) => l.review.verdict === 'adjust').length;

    let verdict = score === 0 ? 'good' : score <= 2 ? 'ok' : 'adjust';
    if (tooHard && recentBad >= 1) verdict = 'adjust';
    let suggestion = 'Ga zo door. Volgende training zoals gepland.';
    let action = null;
    if (tooHard && recentBad >= 1) { suggestion = 'Dit is al de tweede zware evaluatie binnen twee weken. Neem een lichtere week, dan herstelt je lichaam en word je daarna weer sterker.'; action = { label: 'Komende week verlichten', fn: 'reduceWeek' }; }
    else if (tooHard) suggestion = 'Maak de volgende rustige run écht rustig (zone 1–2, praattempo). Slaap, drink genoeg en let op de hitte.';
    else if (tooFast) suggestion = 'Houd je bij de volgende kwaliteitstraining strak aan het doeltempo. Voelt dat structureel te makkelijk, plan dan een tijdrit.';
    else if (tooShort) suggestion = 'Korter is geen ramp. Niet inhalen: pak het schema gewoon weer op.';
    if (cause && sameCause >= 1) suggestion = `Al vaker zware benen na ${RF.sports.label(cause)}. Verplaats ${RF.sports.label(cause)} naar de dag na je lange duurloop of vóór een rustdag, of doe het lichter (Doelen → Andere sporten).`;
    const headline = { good: 'Goed uitgevoerd – je ligt op koers', ok: 'Prima, met een aandachtspunt', adjust: 'Bijsturen aanbevolen' }[verdict];
    return { verdict, headline, points: pts, suggestion, action, cause };
  }

  /* ---------- op koers? ---------- */
  function onTrack(state, today) {
    if (!state.plan) return null;
    today = today || u.today();
    const g = state.goal;
    const items = [];
    let issues = 0;
    const add = (level, text) => { items.push({ level, text }); if (level === 'warn') issues += 1; if (level === 'bad') issues += 2; };

    const runs = P.allWorkouts(state).filter((w) => !P.NONRUN.has(w.type));
    const logged = new Set(state.logs.map((l) => l.workoutId));
    const due = runs.filter((w) => w.date >= u.addDays(today, -14) && w.date < today && !w.skipped);
    if (due.length >= 3) {
      const done = due.filter((w) => logged.has(w.id)).length / due.length;
      const keyDue = due.filter((w) => w.key);
      const keyDone = keyDue.filter((w) => logged.has(w.id)).length;
      if (done >= 0.8) add('good', `${pct(done)} van je trainingen gedaan in de laatste 2 weken${keyDue.length ? `, ${keyDone}/${keyDue.length} belangrijke` : ''}.`);
      else if (done >= 0.6) add('warn', `${pct(done)} van je trainingen gedaan in de laatste 2 weken. Probeer vooral de lange duurloop en kwaliteitstrainingen te doen.`);
      else add('bad', `Maar ${pct(done)} van je trainingen gedaan in de laatste 2 weken. Het schema loopt voor op wat haalbaar is.`);
    } else add('info', 'Nog te weinig trainingen voor een betrouwbaar oordeel over je trouw aan het schema.');

    const reviews = state.logs.filter((l) => l.review && l.date >= u.addDays(today, -14));
    const bad = reviews.filter((l) => l.review.verdict === 'adjust').length;
    if (reviews.length >= 2) {
      if (bad >= 2) add('warn', `${bad} trainingen kregen de laatste 2 weken het advies ‘bijsturen’ – vaak te zwaar.`);
      else add('good', `Trainingen goed uitgevoerd (${reviews.length - bad}/${reviews.length} zonder bijsturing).`);
    }

    const zs = RF.zones.zones(state.profile);
    const a = RF.load.acwr(state.logs, today, zs);
    if (a.reliable && a.ratio > 1.5) add('warn', `Totale belasting (hardlopen + andere sporten) stijgt te snel (ACWR ${u.num(a.ratio, 2)}).`);
    const l14 = state.logs.filter((l) => l.date >= u.addDays(today, -14) && l.date <= today);
    const crossL = l14.filter((l) => !RF.sports.isRunLog(l)).reduce((s, l) => s + RF.load.sessionLoad(l, zs), 0);
    const runL = l14.filter(RF.sports.isRunLog).reduce((s, l) => s + RF.load.sessionLoad(l, zs), 0);
    if (crossL > 0) add(crossL > runL * 1.2 ? 'info' : 'good', crossL > runL * 1.2 ? `Andere sporten vormen ${pct(crossL / (crossL + runL))} van je belasting. Goed voor je fitheid, maar voor sneller hardlopen telt vooral het lopen zelf.` : `Andere sporten: ${pct(crossL / (crossL + runL))} van je belasting – een goede aanvulling.`);

    // fitheidstraject
    let projectedSec = null, goalSec = g.targetSec || null, analysis = null;
    if (g.type !== 'endurance') {
      analysis = RF.goal.analyze(state, today);
      projectedSec = analysis.feasibleSec;
      const start = state.plan.startVdot ?? state.fitness.vdot;
      const end = g.type === 'race' && g.raceDate ? g.raceDate : u.addDays(state.plan.start, state.plan.weeks.length * 7);
      const total = Math.max(1, u.daysBetween(state.plan.createdAt, end));
      const p = Math.max(0, Math.min(1, u.daysBetween(state.plan.createdAt, today) / total));
      const expected = start + (state.plan.goalVdot - start) * p;
      const lastTT = state.logs.filter((l) => l.isRace && l.vdot).sort((x, y) => (x.date < y.date ? 1 : -1))[0];
      const since = lastTT ? u.daysBetween(lastTT.date, today) : null;
      if (lastTT && since <= 42) {
        if (state.fitness.vdot >= expected - 0.5) add('good', `Fitheid VDOT ${u.num(state.fitness.vdot, 1)} ligt op of voor het geplande traject (${u.num(expected, 1)}).`);
        else add('warn', `Fitheid VDOT ${u.num(state.fitness.vdot, 1)} ligt achter op het traject (${u.num(expected, 1)} verwacht nu).`);
      } else if (p > 0.25) add('info', 'Geen recente tijdrit: de coach kan je fitheid niet meten. Een 5 km-tijdrit (of parkrun) geeft duidelijkheid.');
      if (goalSec && analysis.level === 'no') add('warn', `Je doeltijd ${u.clock(goalSec)} is met je huidige fitheid en resterende ${analysis.weeks} weken niet realistisch. Verwacht: ~${u.clock(projectedSec)}.`);
      else if (goalSec && analysis.level === 'stretch') add('info', `Je doeltijd ${u.clock(goalSec)} is ambitieus maar mogelijk. Verwacht: ~${u.clock(projectedSec)}.`);
      else if (goalSec) add('good', `Je doeltijd ${u.clock(goalSec)} is haalbaar. Verwacht: ~${u.clock(projectedSec)}.`);
    }

    const status = issues === 0 ? 'good' : issues <= 2 ? 'ok' : 'adjust';
    const headline = { good: 'Je ligt op koers', ok: 'Bijna op koers – let op', adjust: 'Bijsturen nodig' }[status];
    const suggestions = [];
    if (items.some((i) => i.text.includes('te zwaar') || i.text.includes('ACWR'))) suggestions.push({ text: 'Neem een lichtere week.', action: { label: 'Week verlichten', fn: 'reduceWeek' } });
    if (goalSec && analysis && analysis.level === 'no') suggestions.push({ text: 'Bekijk wat er nodig is voor je doel, of kies de haalbare tijd.', action: { label: 'Wat is er nodig?', fn: 'goalDetails' } });
    return { status, headline, items, suggestions, projectedSec, goalSec };
  }

  /* ---------- wedstrijdplan ---------- */
  function racePlan(state, today) {
    const g = state.goal;
    if (g.type !== 'race' || !g.distanceKm) return null;
    const a = RF.goal.analyze(state, today);
    const dist = g.distanceKm;
    const cf = a.cf;
    const cond = cf.cond;
    const realistic = a.feasibleSec, ambitious = a.stretchSec, goal = g.targetSec || null;
    const A = goal && goal >= ambitious ? goal : ambitious;
    const B = goal && goal >= realistic ? goal : realistic;
    const C = B * 1.03;
    const pace = B / dist;

    // splits
    const splits = [];
    if (dist <= 10.5) {
      const first = pace * 1.02;
      const rest = (B - first) / (dist - 1);
      let t = 0;
      for (let k = 1; k <= Math.floor(dist); k++) { t += k === 1 ? first : rest; splits.push({ label: `${k} km`, pace: k === 1 ? first : rest, at: t }); }
      if (dist % 1) splits.push({ label: `${u.num(dist, 1)} km (finish)`, pace: rest, at: B });
    } else {
      const half = dist / 2;
      const p1 = pace * 1.008, p2 = (B - p1 * half) / half;
      const marks = [];
      for (let k = 5; k < dist; k += 5) marks.push(k);
      marks.push(half);
      marks.push(dist);
      [...new Set(marks.map((m) => Math.round(m * 10) / 10))].sort((x, y) => x - y).forEach((m) => {
        const at = m <= half ? m * p1 : half * p1 + (m - half) * p2;
        splits.push({ label: m === dist ? `${u.num(m, 1)} km (finish)` : Math.abs(m - half) < 0.05 ? `${u.num(m, 1)} km (halverwege)` : `${m} km`, pace: m <= half ? p1 : p2, at });
      });
    }

    // hellingen: gelijke inspanning
    const hills = cond && cond.gain > 0 ? [-6, -3, 3, 6, 10].map((gp) => ({ grade: gp, pace: pace * (gp < 0 ? Math.max(RF.cond.gradeFactor(gp / 100), 1 + gp * 0.02) : RF.cond.gradeFactor(gp / 100)) })) : [];

    // voeding
    const T = B / 60;
    const kg = state.profile.weightKg || null;
    let carbs, carbText;
    if (T < 60) { carbs = 0; carbText = 'Geen koolhydraten nodig tijdens de race. Een slokje sportdrank of mondspoelen kan wel helpen.'; }
    else if (T < 90) { carbs = 30; carbText = '~30 g koolhydraten per uur (bijv. 1 gel halverwege of sportdrank).'; }
    else if (T < 150) { carbs = 50; carbText = '30–60 g koolhydraten per uur.'; }
    else { carbs = 70; carbText = '60–90 g koolhydraten per uur (gels met glucose + fructose). Train dit in je lange duurlopen: je darmen moeten eraan wennen.'; }
    const gels = [];
    if (carbs > 0 && T >= 70) {
      const every = 25 / carbs * 60;
      for (let t = T >= 150 ? 30 : 40; t < T - 10; t += every) gels.push({ min: Math.round(t), km: Math.round((t * 60 / pace) * 10) / 10 });
    }
    const hot = cf.heat >= 0.02;
    const fluids = hot ? '600–900 ml per uur, in kleine slokken bij elke post' : cf.heat > 0 ? '500–700 ml per uur' : '400–600 ml per uur, op dorst';
    const sodium = hot ? '500–1000 mg natrium per uur (elektrolytentabletten of sportdrank)' : '300–600 mg natrium per uur bij races > 2 uur';
    const pre = [];
    if (T >= 90) pre.push(`Koolhydraatstapelen 36–48 uur vooraf: 8–10 g per kg per dag${kg ? ` (≈ ${Math.round(kg * 8)}–${Math.round(kg * 10)} g per dag)` : ''}. Minder vezels en vet.`);
    else pre.push('Dag ervoor: normaal, koolhydraatrijk eten. Geen stapelen nodig.');
    pre.push(`Ontbijt 3 uur voor de start: ${kg ? `${Math.round(kg * 1)}–${Math.round(kg * 2)} g koolhydraten` : '1–2 g koolhydraten per kg'} (bijv. witbrood met honing, banaan, havermout) en 400–600 ml vocht.`);
    if (T >= 60) pre.push('15 minuten voor de start: eventueel een gel met wat water.');
    pre.push(`Cafeïne (optioneel, alleen als je het gewend bent): ${kg ? `≈ ${Math.round(kg * 3)} mg` : '3 mg per kg'} 45–60 minuten voor de start.`);

    const warmup = dist <= 5.5 ? '15 min inlopen, 4–6 versnellingen van 20 s en 2 × 1 min op wedstrijdtempo. Eindig 5–10 min voor de start.'
      : dist <= 12 ? '12–15 min inlopen en 4 versnellingen. Eindig ~10 min voor de start.'
        : dist <= 25 ? '8–10 min rustig inlopen en 2–3 korte versnellingen. Spaar je energie.'
          : '5 min wandelen/joggen en wat mobiliteit is genoeg. Gebruik de eerste kilometers als warming-up.';

    const tips = [];
    tips.push(dist <= 10.5 ? 'Start de eerste kilometer ~2 % rustiger dan je doeltempo; de adrenaline maakt je anders te snel.' : 'Loop de eerste helft net iets rustiger (negatieve split). Na 30 km (marathon) / 15 km (halve) begint de echte wedstrijd.');
    if (cond && cond.gain > 0) tips.push(`Parcours met ${u.meters(cond.gain)} hoogtemeters: loop op gelijke inspanning, niet op gelijk tempo. Bergop kortere passen, bergaf ontspannen laten lopen.`);
    if (hot) tips.push(`Warm (${u.temp(cond.tempC)}, dauwpunt ${u.temp(cf.heatInfo.dewC)}): je doeltijd is al ${u.num(cf.heat * 100, 1)} % gecorrigeerd. Koel vooraf (ijshanddoek, koude drank), giet water over hoofd en nek, start voorzichtig.`);
    if (cond && cond.altitudeM > 1000) {
      const trainAlt = state.conditions.altitudeM || 0;
      tips.push(`Wedstrijd op ${u.meters(cond.altitudeM)}: ~${u.num(cf.alt * 100, 1)} % trager meegerekend. ${cond.altitudeM - trainAlt > 800 ? 'Kom óf binnen 24 uur voor de start aan, óf 10–14 dagen eerder om te acclimatiseren. Drink extra.' : ''}`);
    }
    tips.push('Niets nieuws op wedstrijddag: schoenen, kleding, ontbijt en gels heb je getest in training.');

    return { dist, A, B, C, pace, splits, hills, carbs, carbText, gels, fluids, sodium, pre, warmup, tips, cf, cond, realistic, ambitious, goal, analysis: a };
  }

  RF.coach = { evaluate, onTrack, racePlan };
})(window.RF = window.RF || {});
