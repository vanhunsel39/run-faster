/* Jack Daniels / Jimmy Gilbert VDOT-model: fitheid, wedstrijdvoorspelling en trainingstempo's. */
(function (RF) {
  'use strict';

  /** Zuurstofkosten (ml/kg/min) bij snelheid v (m/min). */
  function vo2(v) { return -4.60 + 0.182258 * v + 0.000104 * v * v; }

  /** Fractie van VO2max die je t minuten kunt volhouden. */
  function pctMax(tMin) {
    return 0.8 + 0.1894393 * Math.exp(-0.012778 * tMin) + 0.2989558 * Math.exp(-0.1932605 * tMin);
  }

  /** VDOT uit een (maximale) prestatie: afstand in meters, tijd in seconden. */
  function fromRace(distM, sec) {
    const t = sec / 60;
    return vo2(distM / t) / pctMax(t);
  }

  /** Snelheid (m/min) die bij een gegeven zuurstofverbruik hoort. */
  function velocity(vo2Target) {
    const a = 0.000104, b = 0.182258, c = -4.60 - vo2Target;
    return (-b + Math.sqrt(b * b - 4 * a * c)) / (2 * a);
  }

  /** Voorspelde wedstrijdtijd (sec) voor afstand distM bij deze VDOT. */
  function predict(vdot, distM) {
    let lo = distM / 700 * 60, hi = distM / 40 * 60; // seconden
    for (let i = 0; i < 80; i++) {
      const mid = (lo + hi) / 2;
      if (fromRace(distM, mid) > vdot) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
  }

  const secPerKm = (vMetersPerMin) => 60000 / vMetersPerMin;

  /**
   * Trainingstempo's in sec/km op vlak terrein, koele omstandigheden.
   * E = rustig (62–70 %), M = marathontempo, S = sub-drempel (halve-marathontempo),
   * T = drempel (88 %), I = interval (97,5 %), R = herhaling (miletempo).
   */
  function paces(vdot) {
    const Eslow = secPerKm(velocity(vdot * 0.62));
    const Efast = secPerKm(velocity(vdot * 0.70));
    return {
      rec: Eslow + 20,
      Eslow,
      Efast,
      E: (Eslow + Efast) / 2,
      M: predict(vdot, 42195) / 42.195,
      S: predict(vdot, 21097.5) / 21.0975,
      T: secPerKm(velocity(vdot * 0.88)),
      I: secPerKm(velocity(vdot * 0.975)),
      R: predict(vdot, 1609.34) / 1.60934,
    };
  }

  /** Schat VDOT uit een comfortabele duurloop (aanname: midden van de E-zone). */
  function fromEasyRun(distKm, sec) {
    const target = sec / distKm;
    let lo = 20, hi = 85;
    for (let i = 0; i < 60; i++) {
      const mid = (lo + hi) / 2;
      if (paces(mid).E > target) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
  }

  /** Realistische VDOT-winst per week, naar ervaring. */
  const GAIN_PER_WEEK = { beginner: 0.33, intermediate: 0.25, advanced: 0.15 };

  function feasibility(currentVdot, targetVdot, weeks, level) {
    const gain = (GAIN_PER_WEEK[level] || 0.25) * weeks;
    const needed = targetVdot - currentVdot;
    let verdict;
    if (needed <= 0) verdict = 'haalbaar';
    else if (needed <= gain) verdict = 'uitdagend maar realistisch';
    else if (needed <= gain * 1.5) verdict = 'erg ambitieus';
    else verdict = 'niet realistisch in deze tijd';
    return { needed, realisticGain: gain, verdict, ok: needed <= gain * 1.5 };
  }

  RF.vdot = { vo2, pctMax, fromRace, velocity, predict, paces, fromEasyRun, feasibility };
})(window.RF = window.RF || {});
