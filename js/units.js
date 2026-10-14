/* Metrische eenheden, Nederlandse notatie en datum-hulpjes. */
(function (RF) {
  'use strict';

  const nf = (dec) => new Intl.NumberFormat('nl-NL', { minimumFractionDigits: dec, maximumFractionDigits: dec });

  function num(x, dec = 0) {
    if (x == null || !isFinite(x)) return '–';
    return nf(dec).format(x);
  }

  function pad(n) { return String(n).padStart(2, '0'); }

  /** sec/km -> "5:07 /km" */
  function pace(secPerKm, withUnit = true) {
    if (!secPerKm || !isFinite(secPerKm)) return '–';
    let s = Math.round(secPerKm);
    const m = Math.floor(s / 60);
    s -= m * 60;
    return `${m}:${pad(s)}${withUnit ? ' /km' : ''}`;
  }

  function paceRange(lo, hi) {
    if (!lo) return '–';
    if (!hi || Math.abs(hi - lo) < 2) return pace(lo);
    // lo = sneller (minder sec), hi = langzamer
    return `${pace(Math.min(lo, hi), false)}–${pace(Math.max(lo, hi))}`;
  }

  /** sec/km -> "11,7 km/u" */
  function speed(secPerKm) {
    if (!secPerKm) return '–';
    return `${num(3600 / secPerKm, 1)} km/u`;
  }

  /** seconden -> "1:05:30" of "45:12" */
  function clock(sec) {
    if (sec == null || !isFinite(sec)) return '–';
    sec = Math.round(sec);
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
  }

  /** seconden -> "1 u 05 min" / "45 min" */
  function dur(sec) {
    if (sec == null || !isFinite(sec)) return '–';
    const totalMin = Math.round(sec / 60);
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    if (h === 0) return `${m} min`;
    return m === 0 ? `${h} u` : `${h} u ${pad(m)} min`;
  }

  function km(x, dec = 1) { return `${num(x, dec)} km`; }
  function meters(x) { return `${num(x, 0)} m`; }
  function temp(c) { return `${num(c, 0)} °C`; }

  /** Parse "45:30", "1:45:30", "45" (minuten) of "45,5" -> seconden */
  function parseClock(str) {
    if (str == null) return null;
    str = String(str).trim().replace(',', '.');
    if (!str) return null;
    const parts = str.split(':').map(Number);
    if (parts.some((p) => !isFinite(p) || p < 0)) return null;
    if (parts.length === 1) return Math.round(parts[0] * 60);
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    return null;
  }

  function parseNum(str) {
    if (str == null || str === '') return null;
    const v = Number(String(str).trim().replace(',', '.'));
    return isFinite(v) ? v : null;
  }

  /* ---------- datums (lokaal, 'YYYY-MM-DD') ---------- */
  function iso(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
  function parseISO(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
  function addDays(s, n) { const d = parseISO(s); d.setDate(d.getDate() + n); return iso(d); }
  function today() { return iso(new Date()); }
  /** ISO-weekdag: 1 = maandag ... 7 = zondag */
  function weekday(s) { return ((parseISO(s).getDay() + 6) % 7) + 1; }
  function mondayOf(s) { return addDays(s, 1 - weekday(s)); }
  function daysBetween(a, b) { return Math.round((parseISO(b) - parseISO(a)) / 86400000); }

  const DAY_SHORT = ['', 'ma', 'di', 'wo', 'do', 'vr', 'za', 'zo'];
  const DAY_LONG = ['', 'maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag', 'zondag'];
  const MONTHS = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];

  function dateShort(s) {
    const d = parseISO(s);
    return `${DAY_SHORT[weekday(s)]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
  }
  function dateLong(s) {
    const d = parseISO(s);
    return `${DAY_LONG[weekday(s)]} ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  }

  RF.u = {
    num, pace, paceRange, speed, clock, dur, km, meters, temp, parseClock, parseNum,
    iso, parseISO, addDays, today, weekday, mondayOf, daysBetween, dateShort, dateLong,
    DAY_SHORT, DAY_LONG, MONTHS,
  };
})(window.RF = window.RF || {});
