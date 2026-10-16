/* Statistieken voor kalender, maand- en jaaroverzicht. Pure functies (testbaar). */
(function (RF) {
  'use strict';
  const u = RF.u;
  const isRun = (l) => RF.sports.isRunLog(l);
  const pad = (n) => String(n).padStart(2, '0');

  /** Per dag: hardloopminuten, km, andere sport (min), aantal runs/sessies, hoogtemeters. */
  function dayTotals(logs) {
    const out = {};
    for (const l of logs) {
      const d = out[l.date] || (out[l.date] = { runMin: 0, km: 0, crossMin: 0, runs: 0, cross: 0, elev: 0, hard: false, long: false });
      if (isRun(l)) {
        d.runMin += (l.durationSec || 0) / 60; d.km += l.distanceKm || 0; d.runs++; d.elev += l.elevGain || 0;
        if (l.isRace || (l.rpe || 0) >= 7) d.hard = true;
        if ((l.durationSec || 0) >= 75 * 60) d.long = true;
      } else { d.crossMin += (l.durationSec || 0) / 60; d.cross++; }
    }
    return out;
  }

  function sumUp(list) {
    const runs = list.filter(isRun), other = list.filter((l) => !isRun(l));
    return {
      runs: runs.length,
      km: runs.reduce((s, l) => s + (l.distanceKm || 0), 0),
      runMin: runs.reduce((s, l) => s + (l.durationSec || 0) / 60, 0),
      elev: runs.reduce((s, l) => s + (l.elevGain || 0), 0),
      cross: other.length,
      crossMin: other.reduce((s, l) => s + (l.durationSec || 0) / 60, 0),
    };
  }

  /** Maandtotalen. month = 0..11 */
  function monthSummary(logs, year, month) {
    const pre = `${year}-${pad(month + 1)}`;
    return sumUp(logs.filter((l) => l.date.startsWith(pre)));
  }

  /** Langste reeks opeenvolgende weken met minstens `min` runs, binnen [from, to]. */
  function weekStreak(logs, from, to, min = 3) {
    const perWeek = {};
    logs.filter((l) => isRun(l) && l.date >= from && l.date <= to).forEach((l) => { const m = u.mondayOf(l.date); perWeek[m] = (perWeek[m] || 0) + 1; });
    let best = 0, cur = 0;
    for (let m = u.mondayOf(from); m <= to; m = u.addDays(m, 7)) {
      if ((perWeek[m] || 0) >= min) { cur++; best = Math.max(best, cur); } else cur = 0;
    }
    return best;
  }

  function yearSummary(logs, year) {
    const from = `${year}-01-01`, to = `${year}-12-31`;
    const list = logs.filter((l) => l.date >= from && l.date <= to);
    const s = sumUp(list);
    const runs = list.filter(isRun);
    const months = Array.from({ length: 12 }, (_, m) => monthSummary(list, year, m));
    const mostActive = months.reduce((b, x, i) => (x.runMin > months[b].runMin ? i : b), 0);
    const longest = runs.reduce((m, l) => ((l.distanceKm || 0) > (m ? m.distanceKm || 0 : 0) ? l : m), null);
    const vdots = list.filter((l) => l.vdot).map((l) => l.vdot);
    const total = s.runMin + s.crossMin;
    return {
      year, ...s, months, mostActive: s.runMin > 0 ? mostActive : null, longest,
      bestVdot: vdots.length ? Math.max(...vdots) : null,
      streak: weekStreak(logs, from, to, 3),
      crossShare: total > 0 ? s.crossMin / total : 0,
      activeDays: new Set(list.map((l) => l.date)).size,
    };
  }

  /** Intensiteitsniveau 0–4 voor kalender/heatmap op basis van hardloopminuten. */
  function level(runMin) {
    if (!runMin) return 0;
    if (runMin < 30) return 1;
    if (runMin < 60) return 2;
    if (runMin < 90) return 3;
    return 4;
  }

  RF.stats = { dayTotals, monthSummary, yearSummary, weekStreak, level };
})(window.RF = window.RF || {});
