/*
 * Andere sporten: profiel per sport (beenbelasting, RPE, aerobe overdracht) en daglast voor de planner.
 * Beenbelasting 0–4: 0 = geen, 2 = gemiddeld, 3+ = zwaar (geen kwaliteitsrun op die dag of de dag erna).
 */
(function (RF) {
  'use strict';

  const TYPES = {
    crossfit: { label: 'CrossFit', leg: 3, rpe: 7, credit: 0.3, strength: true, note: 'Telt als je krachttraining. Zware benen? Dan is de run van morgen rustig.' },
    swim: { label: 'Zwemmen', leg: 0, rpe: 5, credit: 0.25, note: 'Ontlast je benen: ideaal op of na een zware loopdag.' },
    pickleball: { label: 'Pickleball', leg: 2, rpe: 6, credit: 0.3, note: 'Zijwaartse sprintjes belasten kuiten en achillespees. Goed inspelen.' },
    hike: { label: 'Hiken / wandelen', leg: 2, rpe: 4, credit: 0.5, note: 'Tijd op de benen; bergaf belast je bovenbenen (op Saba flink).' },
    bike: { label: 'Fietsen', leg: 1, rpe: 5, credit: 0.4, note: 'Goede aerobe aanvulling met weinig impact.' },
    other: { label: 'Andere sport', leg: 1, rpe: 5, credit: 0.3, note: '' },
  };
  const INTENSITY = {
    light: { label: 'Licht', leg: -1, rpe: -1.5, f: 0.7 },
    medium: { label: 'Gemiddeld', leg: 0, rpe: 0, f: 1 },
    heavy: { label: 'Zwaar', leg: 1, rpe: 1.5, f: 1.2 },
  };

  const type = (t) => TYPES[t] || TYPES.other;
  const inten = (i) => INTENSITY[i] || INTENSITY.medium;

  function legLoad(act) {
    let l = type(act.type).leg + inten(act.intensity).leg;
    if (act.type === 'hike' && (act.durationMin || 0) > 120) l += 1;
    return Math.max(0, Math.min(4, l));
  }
  function rpe(act) { return Math.max(1, Math.min(10, Math.round(type(act.type).rpe + inten(act.intensity).rpe))); }
  /** Minuten die als hardloop-achtige aerobe training tellen. */
  function aerobicMin(act) { return (act.durationMin || 0) * type(act.type).credit * inten(act.intensity).f; }

  /** Daglast uit de vaste routine: index 1..7 -> { leg, acts[] }. */
  function dayLoad(activities) {
    const out = Array.from({ length: 8 }, () => ({ leg: 0, acts: [] }));
    for (const a of activities || []) {
      for (const d of a.days || []) {
        out[d].leg = Math.max(out[d].leg, legLoad(a));
        out[d].acts.push(a);
      }
    }
    return out;
  }

  function weeklyAerobicMin(activities) {
    return (activities || []).reduce((s, a) => s + aerobicMin(a) * (a.days || []).length, 0);
  }
  function crossfitPerWeek(activities) {
    return (activities || []).filter((a) => type(a.type).strength).reduce((s, a) => s + (a.days || []).length, 0);
  }

  /** Garmin FIT sport-nummer / GPX-TCX sporttekst -> activiteit. */
  function fromSport(sport) {
    if (sport == null || sport === '') return 'run';
    if (typeof sport === 'number') return { 1: 'run', 2: 'bike', 5: 'swim', 17: 'hike', 11: 'hike', 10: 'crossfit', 4: 'other', 0: 'other' }[sport] || 'other';
    const s = String(sport).toLowerCase();
    if (/run|hardlo/.test(s)) return 'run';
    if (/bik|cycl|fiets/.test(s)) return 'bike';
    if (/swim|zwem/.test(s)) return 'swim';
    if (/hik|walk|wandel/.test(s)) return 'hike';
    if (/train|strength|crossfit/.test(s)) return 'crossfit';
    return 'other';
  }

  const isRunLog = (l) => !l.activity || l.activity === 'run';
  const label = (t) => (t === 'run' ? 'Hardlopen' : type(t).label);

  RF.sports = { TYPES, INTENSITY, type, legLoad, rpe, aerobicMin, dayLoad, weeklyAerobicMin, crossfitPerWeek, fromSport, isRunLog, label };
})(window.RF = window.RF || {});
