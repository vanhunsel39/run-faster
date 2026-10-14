/* Hartslagzones en de koppeling tussen tempozones, hartslag en RPE. */
(function (RF) {
  'use strict';

  /** Tanaka (2001): HRmax ≈ 208 − 0,7 × leeftijd. */
  function estimateMax(age) { return Math.round(208 - 0.7 * (age || 40)); }

  /**
   * 5 zones. Voorkeur: LTHR (Friel), anders Karvonen (hartslagreserve), anders % HRmax.
   * Elke zone: { z, lo, hi, name }.
   */
  function zones(profile) {
    const p = profile || {};
    const names = ['Herstel', 'Duur', 'Tempo', 'Drempel', 'VO2max'];
    let bounds, method;
    if (p.lthr) {
      const l = p.lthr;
      const max = p.hrMax || Math.round(l * 1.08);
      bounds = [[Math.round(l * 0.70), Math.round(l * 0.85) - 1], [Math.round(l * 0.85), Math.round(l * 0.89)],
        [Math.round(l * 0.90), Math.round(l * 0.94)], [Math.round(l * 0.95), Math.round(l * 0.99)], [Math.round(l * 1.00), max]];
      method = 'LTHR (Friel)';
    } else {
      const max = p.hrMax || estimateMax(p.age);
      const rest = p.hrRest || 60;
      const r = max - rest;
      const at = (f) => Math.round(rest + r * f);
      bounds = [[at(0.50), at(0.60) - 1], [at(0.60), at(0.70) - 1], [at(0.70), at(0.80) - 1], [at(0.80), at(0.90) - 1], [at(0.90), max]];
      method = p.hrMax ? 'Karvonen (hartslagreserve)' : 'Karvonen met geschatte max. hartslag';
    }
    return { method, list: bounds.map(([lo, hi], i) => ({ z: i + 1, lo, hi, name: names[i] })) };
  }

  function zoneOf(hr, zs) {
    if (!hr) return null;
    const list = zs.list;
    if (hr < list[0].lo) return 1;
    for (const z of list) if (hr <= z.hi) return z.z;
    return 5;
  }

  /** Doelen per tempozone: zones [van, tot], RPE en label. */
  const TARGETS = {
    walk: { label: 'Wandelen', hr: [1, 1], rpe: '1–2', low: true },
    rec: { label: 'Herstel', hr: [1, 1], rpe: '2', low: true },
    E: { label: 'Rustig', hr: [1, 2], rpe: '3–4', low: true },
    M: { label: 'Marathontempo', hr: [3, 3], rpe: '5–6', low: false },
    S: { label: 'Sub-drempel', hr: [3, 4], rpe: '6', low: false },
    T: { label: 'Drempel', hr: [4, 4], rpe: '7', low: false },
    I: { label: 'Interval', hr: [5, 5], rpe: '8–9', low: false },
    R: { label: 'Snel (kort)', hr: null, rpe: '9', low: false },
    hill: { label: 'Heuvel – hard', hr: [4, 5], rpe: '8', low: false },
    stairs: { label: 'Trap – stevig', hr: [3, 4], rpe: '6–7', low: false },
    down: { label: 'Bergaf – gecontroleerd', hr: [1, 2], rpe: '3–4', low: true },
    race: { label: 'Wedstrijdtempo', hr: [4, 5], rpe: '9–10', low: false },
    GP: { label: 'Doeltempo', hr: [3, 5], rpe: '6–8', low: false },
  };

  function hrRange(zoneKey, zs) {
    const t = TARGETS[zoneKey];
    if (!t || !t.hr) return null;
    return [zs.list[t.hr[0] - 1].lo, zs.list[t.hr[1] - 1].hi];
  }

  /** RPE-schatting uit hartslagzone (als er geen RPE is ingevuld). */
  const RPE_FROM_ZONE = [0, 2, 3.5, 5, 7, 8.5];

  RF.zones = { estimateMax, zones, zoneOf, TARGETS, hrRange, RPE_FROM_ZONE };
})(window.RF = window.RF || {});
