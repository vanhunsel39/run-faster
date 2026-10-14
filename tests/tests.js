/* Zelftests – openen in de browser of headless: chrome --headless --dump-dom tests/tests.html */
(async function () {
  'use strict';
  const RF = window.RF, u = RF.u;
  const results = [];
  const ok = (name, cond, info = '') => results.push({ name, pass: !!cond, info });
  const near = (a, b, tol) => Math.abs(a - b) <= tol;

  try {
    /* ---------- VDOT ---------- */
    const v = RF.vdot.fromRace(5000, 20 * 60);
    ok('VDOT 5K 20:00 ≈ 49,8', near(v, 49.8, 0.3), u.num(v, 2));
    const t10 = RF.vdot.predict(v, 10000);
    ok('Voorspelling 10K ≈ 41:30', near(t10, 41.5 * 60, 25), u.clock(t10));
    const p = RF.vdot.paces(50);
    ok('VDOT 50: drempel ≈ 4:15/km', near(p.T, 255, 4), u.pace(p.T));
    ok('VDOT 50: interval ≈ 3:55/km', near(p.I, 235, 4), u.pace(p.I));
    ok('VDOT 50: rustig 5:05–5:40/km', p.Efast > 300 && p.Eslow < 345, `${u.pace(p.Efast)}–${u.pace(p.Eslow)}`);
    ok('Volgorde R < I < T < S < M < E', p.R < p.I && p.I < p.T && p.T < p.S && p.S < p.M && p.M < p.E);
    const ve = RF.vdot.fromEasyRun(8, 8 * p.E);
    ok('VDOT uit duurloop terugrekenen', near(ve, 50, 0.2), u.num(ve, 2));

    /* ---------- omstandigheden ---------- */
    ok('Minetti +10 % ≈ 1,66× vlak', near(RF.cond.gradeFactor(0.10), 1.66, 0.03), u.num(RF.cond.gradeFactor(0.10), 3));
    ok('Minetti −10 % ≈ 0,6× vlak', near(RF.cond.gradeFactor(-0.10), 0.6, 0.03), u.num(RF.cond.gradeFactor(-0.10), 3));
    ok('Dauwpunt 28 °C / 75 % ≈ 23,2 °C', near(RF.cond.dewPoint(28, 75), 23.2, 0.2));
    const saba = RF.cond.heat(28, 75);
    ok('Hitte Saba ≈ 5,4 % trager', near(saba.pct * 100, 5.4, 0.3), u.num(saba.pct * 100, 2));
    ok('Koel (10 °C) geen correctie', RF.cond.heat(10, 60).pct === 0);
    ok('Extreem (35 °C / 80 %) → hard afgeraden', RF.cond.heat(35, 80).hardOk === false);
    ok('Hoogte 400 m = 0 %', RF.cond.altitude(400) === 0);
    ok('Hoogte 870 m < 1 %', RF.cond.altitude(870) < 0.01 && RF.cond.altitude(870) > 0);

    /* ---------- zones & belasting ---------- */
    const zs = RF.zones.zones({ lthr: 170 });
    ok('LTHR-zones: Z4 start op 95 %', zs.list[3].lo === Math.round(170 * 0.95));
    ok('zoneOf 175 bpm → Z5', RF.zones.zoneOf(175, zs) === 5);
    const today = '2026-10-11';
    const logs = [];
    for (let i = 0; i < 28; i++) logs.push({ date: u.addDays(today, -i), durationSec: 1800, rpe: 4 });
    const a = RF.load.acwr(logs, today, zs);
    ok('ACWR constant belasting = 1,0', near(a.ratio, 1, 0.01), u.num(a.ratio, 3));
    logs.push({ date: today, durationSec: 7200, rpe: 8 });
    ok('ACWR stijgt bij piek', RF.load.acwr(logs, today, zs).ratio > 1.3);

    /* ---------- schema's ---------- */
    const base = () => {
      const s = {
        profile: { age: 40, experience: 'intermediate' }, fitness: { vdot: 45, source: 'race' },
        goal: { type: 'race', distanceKm: 10, raceDate: '2027-01-24', raceTerrain: 'flat', planWeeks: 12, longRunMin: 120 },
        schedule: { days: [2, 4, 6, 7], longDay: 7, strength: true, weeklyKm: 25, longestKm: 12 },
        facilities: { treadmill: true, track: false, flatRoute: false, hills: true },
        conditions: { ...RF.cond.PRESETS.saba }, coachStyle: 'balanced', logs: [], plan: null,
      };
      return s;
    };
    const PEAK = { 5: 60, 10: 70, 21.1: 80, 42.2: 95 };
    let combos = 0, failures = [];
    const goals = [
      { type: 'race', distanceKm: 5, raceDate: '2027-01-10' }, { type: 'race', distanceKm: 10, raceDate: '2027-02-14' },
      { type: 'race', distanceKm: 21.1, raceDate: '2027-03-14' }, { type: 'race', distanceKm: 42.2, raceDate: '2027-04-18' },
      { type: 'speed', distanceKm: 5, planWeeks: 10 }, { type: 'endurance', planWeeks: 12, longRunMin: 120 },
    ];
    const daySets = [[2, 4, 7], [1, 3, 5, 7], [2, 3, 4, 6, 7], [1, 2, 3, 4, 5, 6], [1, 2, 3, 4, 5, 6, 7]];
    for (const g of goals) for (const style of ['balanced', 'norwegian', 'runwalk']) for (const lvl of ['beginner', 'intermediate', 'advanced']) for (const days of daySets) {
      const s = base();
      Object.assign(s.goal, g); s.coachStyle = style; s.profile.experience = lvl; s.schedule.days = days; s.schedule.longDay = days[days.length - 1];
      const plan = RF.planner.generate(s, '2026-10-12');
      combos++;
      const tag = `${g.type}-${g.distanceKm || ''} ${style} ${lvl} ${days.length}d`;
      const cap = Math.max(PEAK[g.distanceKm] || 70, s.schedule.weeklyKm) * 1.3;
      const maxKm = Math.max(...plan.weeks.map((w) => w.targetKm));
      if (maxKm > cap) failures.push(`${tag}: volume ${maxKm} km > ${cap}`);
      if (plan.N >= 8 && !plan.weeks.some((w) => w.cutback)) failures.push(`${tag}: geen herstelweek`);
      const q = plan.weeks.flatMap((w) => w.workouts).filter((w) => w.key && w.type !== 'long' && w.type !== 'race').map((w) => w.date).sort();
      if (days.length >= 4) for (let i = 1; i < q.length; i++) if (u.daysBetween(q[i - 1], q[i]) === 1) { failures.push(`${tag}: zware dagen naast elkaar ${q[i - 1]} ${q[i]}`); break; }
      const limit = style === 'norwegian' ? 0.26 : 0.22;
      const bad = plan.weeks.find((w) => w.highShare > (w.phase === 'taper' || w.phase === 'test' || w.workouts.some((x) => x.type === 'tt') ? 0.31 : limit) && w.workouts.length > 2 && !w.workouts.some((x) => x.type === 'race'));
      if (bad) failures.push(`${tag}: week ${bad.i + 1} (${bad.phase}) intensief ${u.num(bad.highShare * 100, 0)} %`);
      let prevMax = 0;
      plan.weeks.forEach((w) => {
        if (w.phase !== 'taper' && !w.cutback && prevMax && w.targetMin > prevMax * 1.25 + 15) failures.push(`${tag}: sprong week ${w.i + 1} (${w.targetMin} vs ${Math.round(prevMax)})`);
        prevMax = Math.max(prevMax, w.targetMin);
      });
      if (g.type === 'race' && !plan.weeks.flatMap((w) => w.workouts).some((w) => w.type === 'race' && w.date === g.raceDate)) failures.push(`${tag}: geen wedstrijd op de racedatum`);
      if (plan.weeks.flatMap((w) => w.workouts).some((w) => !isFinite(w.estSec) || w.estSec <= 0 && w.type !== 'strength')) failures.push(`${tag}: ongeldige duur`);
    }
    ok(`Schema's: ${combos} combinaties (doel × stijl × niveau × dagen)`, failures.length === 0, failures.slice(0, 25).join(' | ') + (failures.length > 25 ? ` … (+${failures.length - 25})` : ''));

    // herbouw behoudt verleden
    const s1 = base(); s1.plan = RF.planner.rebuild(s1, '2026-10-12');
    const firstId = s1.plan.weeks[0].workouts[0].id;
    s1.logs.push({ id: 'l1', date: s1.plan.weeks[0].workouts[0].date, workoutId: firstId, durationSec: 1800, distanceKm: 5 });
    s1.goal.distanceKm = 21.1; s1.goal.raceDate = '2027-03-14';
    s1.plan = RF.planner.rebuild(s1, '2026-10-20');
    ok('Herbouw: gelogde training blijft bewaard', !!RF.planner.findWorkout(s1, firstId));
    ok('Herbouw: nieuwe wedstrijd ingepland', RF.planner.allWorkouts(s1).some((w) => w.type === 'race' && w.date === '2027-03-14'));

    // niet 100 %
    const s2 = base(); s2.plan = RF.planner.rebuild(s2, '2026-10-12');
    const before = RF.planner.allWorkouts(s2).filter((w) => w.date <= '2026-10-18').reduce((x, w) => x + w.estSec, 0);
    RF.planner.setNotFull(s2, '2026-10-12', 7, 'light');
    const after = RF.planner.allWorkouts(s2).filter((w) => w.date <= '2026-10-18').reduce((x, w) => x + w.estSec, 0);
    ok('Niet 100 %: volume omlaag, geen zware trainingen', after < before * 0.8 && !RF.planner.allWorkouts(s2).some((w) => w.date <= '2026-10-18' && w.original && w.type !== 'easy' && w.type !== 'long'), `${Math.round(before / 60)} → ${Math.round(after / 60)} min`);

    // verplaatsen
    const wk = s2.plan.weeks[1];
    const mv = wk.workouts.find((w) => w.type !== 'strength');
    RF.planner.move(s2, mv.id, u.addDays(mv.date, 1));
    ok('Verplaatsen werkt', RF.planner.findWorkout(s2, mv.id).date === u.addDays(wk.workouts.length ? mv.date : mv.date, 0));

    /* ---------- doelanalyse ---------- */
    const ga1 = base(); ga1.fitness.vdot = 45; Object.assign(ga1.goal, { type: 'race', distanceKm: 10, raceDate: u.addDays(u.today(), 84), targetSec: 30 * 60 });
    const an1 = RF.goal.analyze(ga1);
    ok('Doel: 10 km 30:00 vanaf VDOT 45 → niet realistisch', an1.level === 'no' && an1.weeksNeeded > an1.weeks, `${an1.verdict}, ${an1.weeksNeeded} wk nodig`);
    ok('Doel: haalbare tijd sneller dan nu, trager dan doel', an1.feasibleSec < an1.nowSec && an1.feasibleSec > 30 * 60, `${u.clock(an1.nowSec)} → ${u.clock(an1.feasibleSec)}`);
    ok('Doel: opties met meer dagen/kracht verbeteren de tijd', an1.options.filter((o) => !o.weeksOption).every((o) => o.sec < an1.feasibleSec) && an1.options.length >= 2, an1.options.map((o) => o.label).join(' | '));
    ga1.goal.targetSec = Math.round(an1.feasibleSec + 30);
    ok('Doel: haalbare tijd → realistisch', RF.goal.analyze(ga1).level === 'ok');
    const hot = base(); Object.assign(hot.goal, { type: 'race', distanceKm: 21.1, raceDate: u.addDays(u.today(), 84), raceTempC: 30, raceHumidity: 75, raceAltitudeM: 1500, raceElevGain: 300 });
    const anHot = RF.goal.analyze(hot), cool = base(); Object.assign(cool.goal, { type: 'race', distanceKm: 21.1, raceDate: u.addDays(u.today(), 84) });
    ok('Wedstrijd warm + hoogte + 300 hm is trager', anHot.feasibleSec > RF.goal.analyze(cool).feasibleSec * 1.08, `+${u.num(anHot.cf.total * 100, 1)} %`);

    /* ---------- evaluatie & wedstrijdplan ---------- */
    const ev = base(); ev.plan = RF.planner.rebuild(ev, '2026-10-12');
    const easyW = RF.planner.allWorkouts(ev).find((w) => w.type === 'easy');
    const r1 = RF.coach.evaluate(ev, { id: 'e1', date: easyW.date, workoutId: easyW.id, durationSec: easyW.estSec, distanceKm: 6, rpe: 3, avgHr: 125, conditions: { tempC: 15, humidity: 60, altitudeM: 0, terrain: 'road' } });
    ok('Evaluatie: rustige run goed uitgevoerd → op koers', r1.verdict === 'good', r1.headline);
    const r2 = RF.coach.evaluate(ev, { id: 'e2', date: easyW.date, workoutId: easyW.id, durationSec: easyW.estSec * 0.5, distanceKm: 4, rpe: 8, avgHr: 175, conditions: { tempC: 15, humidity: 60, altitudeM: 0, terrain: 'road' } });
    ok('Evaluatie: te kort en te hard → bijsturen', r2.verdict === 'adjust', r2.points.map((p) => p.level).join(','));
    const qW = RF.planner.allWorkouts(ev).find((w) => w.type === 'intervals' || w.type === 'threshold') || RF.planner.allWorkouts(ev).find((w) => w.key && w.type !== 'long');
    const r3 = RF.coach.evaluate(ev, { id: 'e3', date: qW.date, workoutId: qW.id, durationSec: qW.estSec, distanceKm: 8, rpe: 7, conditions: { tempC: 15, humidity: 60, altitudeM: 0, terrain: 'road' }, laps: [{ distM: 1000, sec: 150 }, { distM: 1000, sec: 152 }, { distM: 1000, sec: 151 }] });
    ok('Evaluatie: herhalingen veel te snel gesignaleerd', r3.points.some((p) => p.text.includes('sneller dan het doel')), qW.title);
    ok('Op koers-oordeel werkt', !!RF.coach.onTrack(ev, '2026-10-20').headline);
    const rp = base(); Object.assign(rp.goal, { type: 'race', distanceKm: 42.2, raceDate: u.addDays(u.today(), 112), raceTempC: 26, raceHumidity: 70, raceElevGain: 200 }); rp.profile.weightKg = 70;
    const plan42 = RF.coach.racePlan(rp);
    ok('Wedstrijdplan marathon: A < B < C', plan42.A < plan42.B && plan42.B < plan42.C);
    ok('Wedstrijdplan: splits eindigen op doeltijd B', Math.abs(plan42.splits[plan42.splits.length - 1].at - plan42.B) < 2);
    ok('Wedstrijdplan: 60–90 g/u en gels ingepland', plan42.carbs >= 60 && plan42.gels.length >= 5, `${plan42.gels.length} gels`);
    ok('Wedstrijdplan: stapelen in gram (70 kg)', plan42.pre[0].includes('560'));
    const rp5 = base(); Object.assign(rp5.goal, { type: 'race', distanceKm: 5, raceDate: u.addDays(u.today(), 56) });
    const plan5 = RF.coach.racePlan(rp5);
    ok('Wedstrijdplan 5 km: splits per km, geen gels', plan5.splits.length === 5 && plan5.gels.length === 0 && Math.abs(plan5.splits[4].at - plan5.B) < 2);

    /* ---------- andere sporten ---------- */
    const keyDays = (pl) => pl.weeks.flatMap((w) => w.workouts).filter((w) => w.key && w.type !== 'long' && w.type !== 'race').map((w) => u.weekday(w.date));
    const cf = base(); cf.schedule.days = [1, 2, 3, 4, 5, 6, 7]; cf.schedule.longDay = 7;
    cf.activities = [{ id: 'cf', type: 'crossfit', days: [1, 4], durationMin: 60, intensity: 'medium' }];
    const cfPlan = RF.planner.generate(cf, '2026-10-12');
    const bad1 = keyDays(cfPlan).filter((d) => [1, 2, 4, 5].includes(d));
    ok('CrossFit ma+do: geen zware run op ma/di/do/vr', bad1.length === 0, `kwaliteitsdagen: ${[...new Set(keyDays(cfPlan))].map((d) => u.DAY_SHORT[d]).join(',')}`);
    ok('CrossFit 2×/week vervangt de krachttraining', !cfPlan.weeks.flatMap((w) => w.workouts).some((w) => w.type === 'strength'));
    ok('CrossFit staat in het schema', cfPlan.weeks[1].workouts.filter((w) => w.type === 'cross' && w.sport === 'crossfit').length === 2);
    const cf1 = base(); cf1.activities = [{ id: 'c1', type: 'crossfit', days: [3], durationMin: 60, intensity: 'medium' }];
    ok('CrossFit 1×/week → nog 1 krachttraining', RF.planner.generate(cf1, '2026-10-12').weeks[1].workouts.filter((w) => w.type === 'strength').length === 1);
    const sat = base(); sat.schedule.days = [2, 4, 7]; sat.schedule.longDay = 7; sat.activities = [{ id: 's', type: 'crossfit', days: [6], durationMin: 60, intensity: 'heavy' }];
    const satLong = RF.planner.generate(sat, '2026-10-12').weeks[1].workouts.find((w) => w.type === 'long');
    ok('Lange duurloop na CrossFit krijgt waarschuwing', satLong.notes[0].includes('Gisteren CrossFit'), satLong.notes[0]);
    const noX = base(), sw = base(); sw.activities = [{ id: 'w', type: 'swim', days: [1, 5], durationMin: 60, intensity: 'medium' }];
    const pA = RF.planner.generate(noX, '2026-10-12').weeks[2], pB = RF.planner.generate(sw, '2026-10-12').weeks[2];
    const sumT = (wk, f) => wk.workouts.filter(f).reduce((s, w) => s + w.estSec, 0);
    const easyA = sumT(pA, (w) => !w.key && w.type !== 'strength' && w.type !== 'cross'), easyB = sumT(pB, (w) => !w.key && w.type !== 'strength' && w.type !== 'cross');
    const keyA = sumT(pA, (w) => w.key), keyB = sumT(pB, (w) => w.key);
    ok('Zwemmen: rustig loopvolume iets lager (≤ 20 %)', easyB < easyA && (easyA - easyB) <= pA.targetMin * 60 * 0.2 + 1, `${Math.round(easyA / 60)} → ${Math.round(easyB / 60)} min`);
    ok('Zwemmen: kwaliteit + lange duurloop onveranderd', keyA === keyB);
    const xl = [{ date: today, durationSec: 3600, rpe: 8, activity: 'crossfit' }];
    ok('ACWR telt andere sporten mee', RF.load.acwr(xl, today, zs).acute === 480);
    ok('Sporttype uit Garmin: 5 → zwemmen, 17 → hiken, Running → hardlopen', RF.sports.fromSport(5) === 'swim' && RF.sports.fromSport(17) === 'hike' && RF.sports.fromSport('Running') === 'run');
    const swimFit = buildActivityFit(5);
    ok('FIT met sport 5 wordt een zwem-log', RF.importers.analyze(RF.importers.parseFit(swimFit.buffer), zs).activity === 'swim');
    const xs = base(); xs.plan = RF.planner.rebuild(xs, '2026-10-12');
    const rv = RF.coach.evaluate(xs, { id: 'x1', date: '2026-10-13', activity: 'crossfit', durationSec: 3600, rpe: 8, conditions: xs.conditions });
    ok('Evaluatie andere sport werkt', rv.points.length >= 1 && /CrossFit/.test(rv.headline), rv.headline);

    /* ---------- eerdere pogingen op het parcours ---------- */
    const crs = base(); crs.fitness.vdot = 45; crs.fitness.history = [{ date: '2026-09-01', vdot: 44, source: 'test' }];
    Object.assign(crs.goal, { type: 'race', distanceKm: 21.1, raceDate: u.addDays(u.today(), 84), raceTempC: 15, raceHumidity: 60, raceElevGain: 0 });
    const flatNoCourse = RF.goal.analyze(crs);
    const v44half = RF.vdot.predict(44, 21100);
    crs.goal.courseAttempts = [{ id: 'c1', date: '2026-09-05', distanceKm: 21.1, timeSec: Math.round(v44half * 1.10), effort: 'max', tempC: 15, humidity: 60 }];
    const withCourse = RF.goal.analyze(crs);
    ok('Parcours: gemeten factor ≈ +10 %', withCourse.course && Math.abs(withCourse.course.factor - 1.10) < 0.01, u.num(withCourse.course.factor, 3));
    ok('Parcours: zwaar parcours → langzamere verwachte tijd', withCourse.feasibleSec > flatNoCourse.feasibleSec * 1.09, `${u.clock(flatNoCourse.feasibleSec)} → ${u.clock(withCourse.feasibleSec)}`);
    crs.goal.courseAttempts[0].tempC = 30; crs.goal.courseAttempts[0].humidity = 75;
    ok('Parcours: hitte van toen wordt eruit gerekend', RF.goal.analyze(crs).course.factor < 1.06);
    crs.goal.courseAttempts = [{ id: 'c2', date: '2026-09-05', distanceKm: 10, timeSec: Math.round(RF.vdot.predict(44, 10000) * 1.05), effort: 'max', tempC: 15, humidity: 60 }];
    ok('Parcours: deel van het parcours (10 km) werkt', Math.abs(RF.goal.analyze(crs).course.factor - 1.05) < 0.01);
    crs.goal.courseAttempts = [{ id: 'c3', date: '2025-05-01', distanceKm: 21.1, timeSec: 7200, effort: 'max', tempC: 15, humidity: 60 }];
    ok('Parcours: oude poging zonder fitheid → niet gebruikt', RF.goal.analyze(crs).course.factor === null);
    crs.goal.courseAttempts[0].ref5kSec = 24 * 60;
    ok('Parcours: oude poging + 5 km-tijd van toen → wel gebruikt', RF.goal.analyze(crs).course.factor > 1);
    crs.goal.courseAttempts = [{ id: 'c4', date: '2026-09-05', distanceKm: 21.1, timeSec: Math.round(v44half * 1.06), effort: 'hard', tempC: 15, humidity: 60 }];
    ok('Parcours: niet-maximale poging telt als ~4 % sneller', Math.abs(RF.goal.analyze(crs).course.factor - 1.06 * 0.96) < 0.01);

    /* ---------- importers ---------- */
    // GPX: 10 × 100 m, 30 s per punt, 50 m stijging
    const step = 100 / 111195;
    let gpx = '<?xml version="1.0"?><gpx xmlns="http://www.topografix.com/GPX/1/1" xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1"><trk><trkseg>';
    for (let i = 0; i <= 10; i++) gpx += `<trkpt lat="${17.63 + i * step}" lon="-63.23"><ele>${i * 5}</ele><time>${new Date(Date.UTC(2026, 9, 10, 6, 0, i * 30)).toISOString()}</time><extensions><gpxtpx:TrackPointExtension><gpxtpx:hr>${140 + i}</gpxtpx:hr></gpxtpx:TrackPointExtension></extensions></trkpt>`;
    gpx += '</trkseg></trk></gpx>';
    const ga = RF.importers.analyze(RF.importers.parseGpx(gpx), zs);
    ok('GPX: afstand 1,00 km', near(ga.distanceKm, 1, 0.01), ga.distanceKm);
    ok('GPX: tijd 5:00', ga.durationSec === 300, ga.durationSec);
    ok('GPX: stijging ~50 m', near(ga.elevGain, 50, 8), ga.elevGain);
    ok('GPX: GAP sneller dan echt tempo bergop', ga.gapSecPerKm < 300, u.pace(ga.gapSecPerKm));
    ok('GPX: hartslag gelezen', ga.avgHr === 145, ga.avgHr);

    let tcx = '<?xml version="1.0"?><TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2"><Activities><Activity Sport="Running"><Lap StartTime="2026-10-10T06:00:00Z"><TotalTimeSeconds>600</TotalTimeSeconds><DistanceMeters>2000</DistanceMeters><Track>';
    for (let i = 0; i <= 20; i++) tcx += `<Trackpoint><Time>${new Date(Date.UTC(2026, 9, 10, 6, 0, i * 30)).toISOString()}</Time><DistanceMeters>${i * 100}</DistanceMeters><AltitudeMeters>${100 - i * 2}</AltitudeMeters><HeartRateBpm><Value>150</Value></HeartRateBpm></Trackpoint>`;
    tcx += '</Track></Lap></Activity></Activities></TrainingCenterDatabase>';
    const ta = RF.importers.analyze(RF.importers.parseTcx(tcx), zs);
    ok('TCX: 2,0 km in 10:00', near(ta.distanceKm, 2, 0.01) && ta.durationSec === 600, `${ta.distanceKm} km ${u.clock(ta.durationSec)}`);
    ok('TCX: daling ~40 m', near(ta.elevLoss, 40, 8), ta.elevLoss);

    // FIT-activiteit zelf opbouwen
    const fitAct = buildActivityFit();
    const fa = RF.importers.analyze(RF.importers.parseFit(fitAct.buffer), zs);
    ok('FIT: afstand 3,00 km', near(fa.distanceKm, 3, 0.01), fa.distanceKm);
    ok('FIT: tijd 15:00', fa.durationSec === 900, fa.durationSec);
    ok('FIT: stijging ~30 m', near(fa.elevGain, 30, 6), fa.elevGain);
    ok('FIT: 3 km-splits', fa.splits.length === 3, fa.splits.length);
    ok('FIT: tijd in zones', fa.zoneSec && fa.zoneSec.reduce((x, y) => x + y, 0) > 800);

    // ZIP met deflate
    const zipBuf = await buildZip('activity.gpx', new TextEncoder().encode(gpx));
    const z = await RF.importers.unzipFirst(zipBuf);
    ok('ZIP (deflate) uitpakken', new TextDecoder().decode(z.buf) === gpx && z.name === 'activity.gpx');

    // FIT-workout export -> terug inlezen
    const s3 = base(); s3.plan = RF.planner.rebuild(s3, '2026-10-12');
    const q = RF.planner.allWorkouts(s3).find((w) => w.steps.some((x) => x.kind === 'repeat'));
    const ctx = { paces: RF.vdot.paces(45), cond: s3.conditions, zs };
    const fit = RF.fitexport.build(q, ctx);
    const raw = RF.importers.parseFitRaw(fit.buffer);
    ok('FIT-workout: CRC geldig', raw.crcOk === true);
    ok('FIT-workout: bestandstype 5', raw.messages[0][0][0] === 5);
    const flat = RF.fitexport.flatten(q, ctx);
    ok('FIT-workout: alle stappen + herhaling', raw.messages[27].length === flat.length && raw.messages[27].some((m) => m[1] === 6), `${raw.messages[27].length} stappen – ${q.title}`);
    ok('FIT-workout: Saba → hartslagdoelen', raw.messages[27].filter((m) => m[1] !== 6 && m[3] === 1).length > 0);
  } catch (e) {
    ok('Onverwachte fout', false, e.stack || String(e));
  }

  /* ---------- hulpfuncties ---------- */
  function buildActivityFit(sport) {
    const b = [];
    const u8 = (x) => b.push(x & 255), u16 = (x) => { u8(x); u8(x >> 8); }, u32 = (x) => { u16(x & 65535); u16(x >>> 16); };
    const ts0 = 1160000000;
    // definitie record (local 0): 253 u32, 5 u32, 78 u32, 3 u8
    u8(0x40); u8(0); u8(0); u16(20); u8(4); [[253, 4, 0x86], [5, 4, 0x86], [78, 4, 0x86], [3, 1, 2]].forEach(([n, s, t]) => { u8(n); u8(s); u8(t); });
    for (let i = 0; i <= 900; i += 5) {
      const dist = i / 900 * 3000;
      const alt = dist < 1000 ? dist * 0.03 : 30;
      u8(0); u32(ts0 + i); u32(Math.round(dist * 100)); u32(Math.round((alt + 500) * 5)); u8(150);
    }
    // sessie (local 1): 253, 2, 7, 8, 9, 16
    u8(0x41); u8(0); u8(0); u16(18); u8(7); [[253, 4, 0x86], [2, 4, 0x86], [7, 4, 0x86], [8, 4, 0x86], [9, 4, 0x86], [16, 1, 2], [5, 1, 0]].forEach(([n, s, t]) => { u8(n); u8(s); u8(t); });
    u8(1); u32(ts0 + 900); u32(ts0); u32(900000); u32(900000); u32(300000); u8(150); u8(sport || 1);
    const hdr = [14, 0x10, 0x54, 0x08];
    const len = b.length;
    hdr.push(len & 255, (len >> 8) & 255, (len >> 16) & 255, len >>> 24, 46, 70, 73, 84);
    const hc = RF.importers.crc16(hdr); hdr.push(hc & 255, hc >> 8);
    const all = hdr.concat(b); const c = RF.importers.crc16(all); all.push(c & 255, c >> 8);
    return new Uint8Array(all);
  }

  async function buildZip(name, data) {
    const comp = new Uint8Array(await new Response(new Blob([data]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer());
    const nameB = new TextEncoder().encode(name);
    const out = [];
    const u16 = (x) => out.push(x & 255, (x >> 8) & 255), u32 = (x) => { u16(x & 65535); u16(x >>> 16); };
    u32(0x04034b50); u16(20); u16(0); u16(8); u16(0); u16(0); u32(0); u32(comp.length); u32(data.length); u16(nameB.length); u16(0);
    out.push(...nameB, ...comp);
    const cd = out.length;
    u32(0x02014b50); u16(20); u16(20); u16(0); u16(8); u16(0); u16(0); u32(0); u32(comp.length); u32(data.length); u16(nameB.length); u16(0); u16(0); u16(0); u16(0); u32(0); u32(0);
    out.push(...nameB);
    const cdLen = out.length - cd;
    u32(0x06054b50); u16(0); u16(0); u16(1); u16(1); u32(cdLen); u32(cd); u16(0);
    return new Uint8Array(out).buffer;
  }

  const ul = document.getElementById('results');
  for (const r of results) {
    const li = document.createElement('li');
    li.className = r.pass ? 'pass' : 'fail';
    li.textContent = `${r.pass ? 'GESLAAGD' : 'MISLUKT'} – ${r.name}${r.info !== '' ? ` (${r.info})` : ''}`;
    ul.appendChild(li);
  }
  const failed = results.filter((r) => !r.pass).length;
  document.getElementById('summary').textContent = `${results.length - failed} van ${results.length} tests geslaagd${failed ? ` – ${failed} mislukt` : ''}.`;
  document.title = failed ? `MISLUKT (${failed})` : 'ALLES GESLAAGD';
})();
