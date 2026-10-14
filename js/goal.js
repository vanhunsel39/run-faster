/*
 * Doelanalyse: is een doeltijd haalbaar, wat is haalbaar in de beschikbare weken,
 * en wat helpt (meer weken, meer loopdagen, kracht, volume)? Houdt rekening met
 * wedstrijdomstandigheden: hitte, hoogte en hoogtemeters van het parcours.
 */
(function (RF) {
  'use strict';
  const u = RF.u;

  /** Basis: realistische VDOT-winst per week bij consistente training. */
  const GAIN = { beginner: 0.33, intermediate: 0.25, advanced: 0.15 };
  /** Meer loopdagen = meer trainingsprikkel (afnemende meeropbrengst). */
  const DAYS = { 1: 0.55, 2: 0.7, 3: 0.8, 4: 0.9, 5: 1, 6: 1.06, 7: 1.1 };
  /** Aanbevolen basisvolume (km/week) per afstand en niveau. */
  const REC_KM = { 5: [20, 32, 48], 10: [25, 38, 56], 21.1: [30, 45, 64], 42.2: [40, 55, 75] };
  const LVL = { beginner: 0, intermediate: 1, advanced: 2 };

  function recKm(distKm, level) {
    const keys = [5, 10, 21.1, 42.2];
    const k = keys.find((x) => distKm <= x) || 42.2;
    return REC_KM[k][LVL[level] ?? 1];
  }

  /** VDOT-winst per week voor deze opzet. Overrides: { days, strength, weeklyKm }. */
  function rate(s, o = {}) {
    const level = s.profile.experience || 'intermediate';
    const days = o.days ?? (s.schedule.days || []).length;
    const acts = s.activities || [];
    const strength = o.strength ?? (s.schedule.strength || RF.sports.crossfitPerWeek(acts) > 0);
    const km = o.weeklyKm ?? s.schedule.weeklyKm ?? 0;
    const dist = s.goal.type === 'endurance' ? 21.1 : (s.goal.distanceKm || 10);
    const volRatio = km / recKm(dist, level);
    let r = GAIN[level] * (DAYS[Math.max(1, Math.min(7, days))] || 0.8);
    if (strength) r *= 1.05;
    if (volRatio < 0.5) r *= 0.88; else if (volRatio < 0.75) r *= 0.95;
    // aerobe overdracht van andere sporten: klein voordeel, max. +5 %
    r *= 1 + Math.min(0.05, RF.sports.weeklyAerobicMin(acts) / 600 * 0.05);
    return r;
  }

  /** Omstandigheden van de wedstrijd (vallen terug op koel, zeeniveau, vlak). */
  function raceCond(goal) {
    return {
      tempC: goal.raceTempC ?? 15,
      humidity: goal.raceHumidity ?? 60,
      altitudeM: goal.raceAltitudeM ?? 0,
      gain: goal.raceElevGain || 0,
      terrain: goal.raceTerrain === 'trail' ? 'trail' : 'road',
    };
  }

  /**
   * Hoeveel trager is de wedstrijd dan vlak/koel? Hellingen via Minetti:
   * 1 m stijgen ≈ 6,6 m extra vlak; dalen levert minder terug (≈ 2 m per m, praktisch).
   */
  /** Inspanning van een eerdere poging -> geschatte maximale tijd (tijd × factor). */
  const EFFORT = { max: 1, hard: 0.96, easy: 0.88 };
  const EFFORT_LABEL = { max: 'alles gegeven', hard: 'stevig, niet maximaal', easy: 'rustig verkend' };

  /** Fitheid (VDOT) rond een datum: uit je historie (±45 dagen), of je huidige als de poging recent is. */
  function vdotAt(s, date, today) {
    const h = (s.fitness.history || []).filter((x) => Math.abs(u.daysBetween(x.date, date)) <= 45)
      .sort((a, b) => Math.abs(u.daysBetween(a.date, date)) - Math.abs(u.daysBetween(b.date, date)))[0];
    if (h) return { vdot: h.vdot, src: 'historie' };
    if (u.daysBetween(date, today || u.today()) <= 56) return { vdot: s.fitness.vdot, src: 'huidig' };
    return null;
  }

  /**
   * Parcoursfactor uit eerdere pogingen: hoeveel trager was je op dit parcours dan je vlakke,
   * koele tijd bij je fitheid van toen? (hitte en inspanning eruit gerekend)
   */
  function courseCalibration(s, today) {
    const g = s.goal || {};
    const altPct = RF.cond.altitude(g.raceAltitudeM || 0);
    const attempts = (g.courseAttempts || []).filter((a) => a.timeSec > 0 && a.distanceKm > 0).map((a) => {
      const heat = RF.cond.heat(a.tempC ?? 15, a.humidity ?? 60).pct;
      const maxTime = a.timeSec * (EFFORT[a.effort] || 1);
      const neutral = maxTime / (1 + heat + altPct);
      const v = a.ref5kSec ? { vdot: RF.vdot.fromRace(5000, a.ref5kSec), src: '5 km-tijd van toen' } : vdotAt(s, a.date, today);
      const raw = v ? neutral / RF.vdot.predict(v.vdot, a.distanceKm * 1000) : null;
      return { ...a, heat, maxTime, neutral, vdotThen: v ? v.vdot : null, vdotSrc: v ? v.src : null, factor: raw ? Math.max(0.92, Math.min(1.8, raw)) : null };
    }).sort((a, b) => (a.date < b.date ? 1 : -1));
    const usable = attempts.filter((a) => a.factor);
    const basis = usable.find((a) => a.effort === 'max') || usable[0] || null;
    return { attempts, basis, factor: basis ? basis.factor : null };
  }

  function courseFactors(goal, s, today) {
    if (!goal || goal.type !== 'race') return { heat: 0, alt: 0, extraFrac: 0, total: 0, parts: [], cond: null };
    const c = raceCond(goal);
    const h = RF.cond.heat(c.tempC, c.humidity);
    const alt = RF.cond.altitude(c.altitudeM);
    const distM = (goal.distanceKm || 10) * 1000;
    const extraM = Math.max(0, c.gain * 6.6 - c.gain * 2);
    const extraFrac = extraM / distM;
    const trail = goal.raceTerrain === 'trail' ? 0.07 : 0;
    const parts = [];
    if (h.pct > 0) parts.push(`hitte +${u.num(h.pct * 100, 1)} %`);
    if (alt > 0) parts.push(`hoogte ${u.meters(c.altitudeM)} +${u.num(alt * 100, 1)} %`);
    if (extraFrac > 0) parts.push(`${u.meters(c.gain)} hoogtemeters +${u.num(extraFrac * 100, 1)} %`);
    if (trail) parts.push('trail +7 %');
    let mult = (1 + h.pct + alt + trail) * (1 + extraFrac);
    const cal = s ? courseCalibration(s, today) : null;
    if (cal && cal.factor) {
      // gemeten parcoursfactor vervangt de schatting uit hoogtemeters en terrein
      mult = (1 + h.pct + alt) * cal.factor;
      for (let i = parts.length - 1; i >= 0; i--) if (/hoogtemeters|trail/.test(parts[i])) parts.splice(i, 1);
      parts.push(`parcours gemeten uit je poging van ${u.dateShort(cal.basis.date)} ${cal.factor >= 1 ? '+' : ''}${u.num((cal.factor - 1) * 100, 1)} %`);
    }
    return { heat: h.pct, alt, trail, extraFrac, total: mult - 1, mult, parts, cond: c, heatInfo: h, calibration: cal };
  }

  const toRace = (flatSec, cf) => flatSec * (cf.mult || 1);
  const toFlat = (raceSec, cf) => raceSec / (cf.mult || 1);

  function weeksLeft(s, today) {
    const g = s.goal;
    if (g.type === 'race' && g.raceDate) return Math.max(1, Math.round(u.daysBetween(today || u.today(), g.raceDate) / 7));
    return g.planWeeks || 12;
  }

  /** Volledige analyse. s = state (of concept-instellingen uit het formulier). */
  function analyze(s, today) {
    const g = s.goal;
    const dist = g.type === 'endurance' ? 21.1 : (g.distanceKm || 10);
    const distM = dist * 1000;
    const cur = s.fitness.vdot;
    const weeks = weeksLeft(s, today);
    const cf = courseFactors(g, s, today);
    const r = rate(s);
    const gain = r * weeks;
    const timeAt = (vd) => toRace(RF.vdot.predict(vd, distM), cf);

    const res = {
      dist, weeks, rate: r, gain, cf,
      currentVdot: cur,
      nowSec: timeAt(cur),
      feasibleVdot: cur + gain,
      feasibleSec: timeAt(cur + gain),
      stretchSec: timeAt(cur + gain * 1.25),
      hasTarget: !!(g.targetSec && g.type !== 'endurance'),
      course: cf.calibration || null,
      crossMin: (s.activities || []).reduce((t, x) => t + (x.durationMin || 0) * (x.days || []).length, 0),
    };

    if (res.hasTarget) {
      const flatTarget = toFlat(g.targetSec, cf);
      res.neededVdot = RF.vdot.fromRace(distM, flatTarget);
      res.needed = res.neededVdot - cur;
      res.weeksNeeded = res.needed > 0 ? Math.ceil(res.needed / r) : 0;
      if (res.needed <= 0) res.verdict = 'al binnen bereik';
      else if (res.needed <= gain) res.verdict = 'uitdagend maar realistisch';
      else if (res.needed <= gain * 1.25) res.verdict = 'erg ambitieus – alles moet meezitten';
      else res.verdict = 'niet realistisch in deze tijd';
      res.level = res.needed <= gain ? 'ok' : res.needed <= gain * 1.25 ? 'stretch' : 'no';

      // Wat helpt? Elke optie: haalbare tijd met dezelfde weken.
      const opts = [];
      const days = (s.schedule.days || []).length;
      const add = (label, o, how) => {
        const r2 = rate(s, o);
        const t = timeAt(cur + r2 * weeks);
        opts.push({ label, how, sec: t, reaches: cur + r2 * weeks * 1.0 >= res.neededVdot, gainDiff: (r2 - r) * weeks });
      };
      if (days < 5) add(`${Math.min(5, days + 1)} loopdagen per week (nu ${days})`, { days: Math.min(5, days + 1) }, 'Extra rustige duurloop: meer aerobe prikkel zonder extra risico.');
      if (days < 6 && s.profile.experience !== 'beginner') add(`${Math.min(6, days + 2)} loopdagen per week`, { days: Math.min(6, days + 2) }, 'Alleen als je lichaam dit gewend is; bouw het geleidelijk op.');
      if (!s.schedule.strength && !RF.sports.crossfitPerWeek(s.activities)) add('Krachttraining 2× per week', { strength: true }, 'Betere loopeconomie (2–4 %) en minder blessures, vooral belangrijk bij heuvels en bergaf.');
      const rk = recKm(dist, s.profile.experience);
      if ((s.schedule.weeklyKm || 0) < rk * 0.75) add(`Basisvolume naar ~${Math.round(rk)} km/week`, { weeklyKm: rk }, 'Meer aerobe basis maakt de rest van het schema effectiever. Bouw max. ~8 % per week op.');
      if (res.weeksNeeded > weeks) {
        opts.push(res.weeksNeeded > 52
          ? { label: 'Meer dan een jaar consequent trainen', how: 'Dit doel vraagt een meerjarige opbouw. Kies eerst een tussendoel (de haalbare tijd) en stel daarna een nieuw doel.', weeksOption: true }
          : { label: `${res.weeksNeeded} weken trainen i.p.v. ${weeks}`, how: `Een wedstrijd rond ${u.dateLong(u.addDays(today || u.today(), res.weeksNeeded * 7))} of later.`, sec: g.targetSec, reaches: true, weeksOption: true });
      }
      res.options = opts;
    }

    // Doel waarop het schema traint (vlak equivalent, begrensd tot haalbaar)
    const planVdot = res.hasTarget
      ? Math.max(cur, Math.min(res.neededVdot, cur + gain * 1.25))
      : cur + gain * 0.6;
    res.planVdot = planVdot;
    res.planRaceSec = timeAt(planVdot);
    res.flatGoalPace = RF.vdot.predict(planVdot, distM) / dist;
    return res;
  }

  RF.goal = { analyze, rate, raceCond, courseFactors, courseCalibration, vdotAt, EFFORT, EFFORT_LABEL, toRace, toFlat, recKm, weeksLeft, GAIN };
})(window.RF = window.RF || {});
