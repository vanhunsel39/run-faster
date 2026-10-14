/* Opslag op het eigen apparaat (localStorage), versiebeheer en back-up. */
(function (RF) {
  'use strict';
  const KEY = 'runfaster.state';
  const VERSION = 1;

  function defaults() {
    return {
      version: VERSION,
      onboarded: false,
      profile: { age: 40, experience: 'intermediate', hrMax: null, hrRest: null, lthr: null, weightKg: null },
      fitness: { vdot: 40, source: 'race', history: [] },
      goal: { type: 'race', distanceKm: 10, raceDate: RF.u.addDays(RF.u.today(), 84), targetSec: null, raceTerrain: 'flat', raceAltitudeM: 0, raceElevGain: 0, raceTempC: 15, raceHumidity: 60, planWeeks: 12, longRunMin: 120 },
      schedule: { days: [2, 4, 6, 7], longDay: 7, strength: true, weeklyKm: 20, longestKm: 10 },
      facilities: { treadmill: false, track: false, flatRoute: false, hills: true },
      conditions: { preset: 'saba', ...RF.cond.PRESETS.saba },
      coachStyle: 'balanced',
      activities: [],
      plan: null,
      logs: [],
      notFull: null,
      todayCond: null,
    };
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return defaults();
      return migrate(JSON.parse(raw));
    } catch (e) {
      return defaults();
    }
  }

  function migrate(s) {
    const d = defaults();
    const out = { ...d, ...s };
    for (const k of ['profile', 'fitness', 'goal', 'schedule', 'facilities', 'conditions']) out[k] = { ...d[k], ...(s[k] || {}) };
    out.logs = Array.isArray(s.logs) ? s.logs : [];
    out.activities = Array.isArray(s.activities) ? s.activities : [];
    out.version = VERSION;
    return out;
  }

  let warned = false;
  function save(state) {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
      return true;
    } catch (e) {
      if (!warned) { warned = true; RF.app && RF.app.toast('Opslaan lukt niet in deze browser (privémodus?). Maak een back-up.'); }
      return false;
    }
  }

  function exportJSON(state) {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    download(blob, `runfaster-backup-${RF.u.today()}.json`);
  }

  async function importJSON(file) {
    const s = JSON.parse(await file.text());
    if (!s || typeof s !== 'object' || !s.goal || !s.fitness) throw new Error('Dit is geen Run Faster-back-up.');
    return migrate(s);
  }

  function reset() { try { localStorage.removeItem(KEY); } catch (e) { /* niets */ } }

  function download(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  RF.store = { load, save, defaults, exportJSON, importJSON, reset, download, migrate };
})(window.RF = window.RF || {});
