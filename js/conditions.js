/* Omstandigheden: hitte (dauwpunt), hoogte, terrein en hellingen (Minetti). Alles metrisch in de UI. */
(function (RF) {
  'use strict';

  /** Dauwpunt (°C) via de Magnus-formule. */
  function dewPoint(tC, rh) {
    const a = 17.62, b = 243.12;
    const g = Math.log(Math.max(1, Math.min(100, rh)) / 100) + (a * tC) / (b + tC);
    return (b * g) / (a - g);
  }

  const cToF = (c) => c * 9 / 5 + 32;

  // Bewezen vuistregel (temperatuur °F + dauwpunt °F -> % trager). Alleen intern in °F.
  const HEAT_TABLE = [[100, 0], [110, 0.5], [120, 1], [130, 2], [140, 3], [150, 4.5], [160, 6], [170, 8], [180, 10]];

  function heat(tC, rh) {
    if (tC == null || rh == null) return { pct: 0, dewC: null, level: 'geen', hardOk: true };
    const dewC = dewPoint(tC, rh);
    const sum = cToF(tC) + cToF(dewC);
    let pct = 0;
    if (sum > 100) {
      pct = 10;
      for (let i = 1; i < HEAT_TABLE.length; i++) {
        const [x0, y0] = HEAT_TABLE[i - 1], [x1, y1] = HEAT_TABLE[i];
        if (sum <= x1) { pct = y0 + (y1 - y0) * (sum - x0) / (x1 - x0); break; }
      }
    }
    let level = 'geen';
    if (pct > 0) level = 'licht';
    if (pct >= 2) level = 'merkbaar';
    if (pct >= 4.5) level = 'zwaar';
    if (sum > 180) level = 'extreem';
    return { pct: pct / 100, dewC, index: sum, level, hardOk: sum <= 180 };
  }

  /**
   * Hoogte: tot 500 m geen meetbaar effect; 500–1500 m ca. 1,5 % per 1000 m; daarboven ca. 4 % per 1000 m.
   * (Kalibratiekeuze op basis van VO2max-afname met hoogte; op Saba (max. ~870 m) dus < 1 %.)
   */
  function altitude(m) {
    if (!m || m <= 500) return 0;
    if (m <= 1500) return (m - 500) / 1000 * 0.015;
    return 0.015 + (m - 1500) / 1000 * 0.04;
  }

  const TERRAIN = {
    road: { label: 'Weg (vlak)', pct: 0, effort: false },
    track: { label: 'Atletiekbaan', pct: 0, effort: false },
    treadmill: { label: 'Loopband (1 % helling)', pct: 0, effort: false },
    hilly: { label: 'Glooiend', pct: 0.04, effort: false },
    trail: { label: 'Trail / onverhard', pct: 0.07, effort: true },
    steep: { label: 'Steil (Saba)', pct: 0, effort: true },
  };

  const PRESETS = {
    saba: { label: 'Saba', tempC: 28, humidity: 75, altitudeM: 400, terrain: 'steep' },
    sabaTreadmill: { label: 'Saba – loopband binnen', tempC: 26, humidity: 65, altitudeM: 400, terrain: 'treadmill' },
    nl: { label: 'Nederland', tempC: 12, humidity: 80, altitudeM: 0, terrain: 'road' },
    sea: { label: 'Vlak op zeeniveau, koel', tempC: 15, humidity: 60, altitudeM: 0, terrain: 'road' },
  };

  /** Minetti et al. (2002): energiekosten (J/kg/m) als functie van helling i (fractie). */
  function minetti(i) {
    i = Math.max(-0.45, Math.min(0.45, i));
    return 155.4 * i ** 5 - 30.4 * i ** 4 - 43.3 * i ** 3 + 46.3 * i ** 2 + 19.5 * i + 3.6;
  }
  /** Factor t.o.v. vlak: 1,0 = vlak; +10 % ≈ 1,66; −10 % ≈ 0,6. */
  function gradeFactor(i) { return minetti(i) / 3.6; }

  /**
   * Pas een vlak tempo aan voor omstandigheden.
   * Geeft { sec, pct, effortBased, parts[] } terug; parts verklaart de correctie in tekst.
   */
  function adjust(secPerKm, cond) {
    if (!cond) return { sec: secPerKm, pct: 0, effortBased: false, parts: [] };
    const h = heat(cond.tempC, cond.humidity);
    const alt = altitude(cond.altitudeM);
    const ter = TERRAIN[cond.terrain] || TERRAIN.road;
    const pct = h.pct + alt + ter.pct;
    const parts = [];
    if (h.pct > 0) parts.push(`hitte +${RF.u.num(h.pct * 100, 1)} %`);
    if (alt > 0) parts.push(`hoogte +${RF.u.num(alt * 100, 1)} %`);
    if (ter.pct > 0) parts.push(`${ter.label.toLowerCase()} +${RF.u.num(ter.pct * 100, 0)} %`);
    return {
      sec: secPerKm * (1 + pct),
      pct,
      effortBased: ter.effort || !h.hardOk,
      heat: h,
      parts,
    };
  }

  RF.cond = { dewPoint, heat, altitude, TERRAIN, PRESETS, minetti, gradeFactor, adjust };
})(window.RF = window.RF || {});
