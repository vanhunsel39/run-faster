/* Trainingsbelasting: sRPE (RPE × minuten), ACWR (7 d acuut / 28 d chronisch) en 80/20-verdeling. */
(function (RF) {
  'use strict';
  const u = RF.u;

  function sessionRpe(log, zs) {
    if (log.rpe) return log.rpe;
    if (log.avgHr && zs) return RF.zones.RPE_FROM_ZONE[RF.zones.zoneOf(log.avgHr, zs)];
    return 4;
  }

  function sessionLoad(log, zs) {
    return sessionRpe(log, zs) * (log.durationSec || 0) / 60;
  }

  function sumLoad(logs, from, to, zs) {
    return logs.filter((l) => l.date >= from && l.date <= to).reduce((s, l) => s + sessionLoad(l, zs), 0);
  }

  /** ACWR op 'today' (inclusief vandaag). Betrouwbaar vanaf ~3 weken historie. */
  function acwr(logs, today, zs) {
    const acute = sumLoad(logs, u.addDays(today, -6), today, zs);
    const chronic = sumLoad(logs, u.addDays(today, -27), today, zs) / 4;
    const first = logs.reduce((m, l) => (!m || l.date < m ? l.date : m), null);
    const history = first ? u.daysBetween(first, today) : 0;
    return { acute, chronic, ratio: chronic > 0 ? acute / chronic : null, reliable: history >= 21 };
  }

  /** Belasting per week (maandag-gebaseerd) voor de laatste n weken. */
  function weekly(logs, today, n, zs) {
    const out = [];
    const mon = u.mondayOf(today);
    for (let i = n - 1; i >= 0; i--) {
      const start = u.addDays(mon, -7 * i);
      const end = u.addDays(start, 6);
      const wl = logs.filter((l) => l.date >= start && l.date <= end);
      out.push({
        start,
        load: wl.reduce((s, l) => s + sessionLoad(l, zs), 0),
        km: wl.filter(RF.sports.isRunLog).reduce((s, l) => s + (l.distanceKm || 0), 0),
        min: wl.filter(RF.sports.isRunLog).reduce((s, l) => s + (l.durationSec || 0) / 60, 0),
        runLoad: wl.filter(RF.sports.isRunLog).reduce((s, l) => s + sessionLoad(l, zs), 0),
        crossLoad: wl.filter((l) => !RF.sports.isRunLog(l)).reduce((s, l) => s + sessionLoad(l, zs), 0),
        crossMin: wl.filter((l) => !RF.sports.isRunLog(l)).reduce((s, l) => s + (l.durationSec || 0) / 60, 0),
      });
    }
    return out;
  }

  /** Aandeel tijd in zone 1–2 vs 3–5 uit geïmporteerde hartslagdata. */
  function intensityShare(logs, from, to) {
    let low = 0, high = 0;
    for (const l of logs) {
      if (l.date < from || l.date > to || !l.zoneSec || !RF.sports.isRunLog(l)) continue;
      low += l.zoneSec[0] + l.zoneSec[1];
      high += l.zoneSec[2] + l.zoneSec[3] + l.zoneSec[4];
    }
    const total = low + high;
    return total > 0 ? { low: low / total, high: high / total, totalSec: total } : null;
  }

  RF.load = { sessionRpe, sessionLoad, acwr, weekly, intensityShare };
})(window.RF = window.RF || {});
