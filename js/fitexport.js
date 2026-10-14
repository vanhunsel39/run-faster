/* Export van een geplande training als Garmin FIT-workout (file_id type 5, workout, workout_step). */
(function (RF) {
  'use strict';

  class Writer {
    constructor() { this.bytes = []; }
    u8(v) { this.bytes.push(v & 0xFF); }
    u16(v) { this.u8(v); this.u8(v >> 8); }
    u32(v) { this.u16(v & 0xFFFF); this.u16((v >>> 16) & 0xFFFF); }
    str(s, size) { for (let i = 0; i < size; i++) this.u8(i < s.length ? s.charCodeAt(i) & 0x7F : 0); }
  }

  // [veldnummer, grootte, basistype]
  const DEF = {
    fileId: { local: 0, global: 0, fields: [[0, 1, 0x00], [1, 2, 0x84], [2, 2, 0x84], [3, 4, 0x8C], [4, 4, 0x86]] },
    workout: { local: 1, global: 26, fields: [[4, 1, 0x00], [6, 2, 0x84], [8, 24, 0x07]] },
    step: { local: 2, global: 27, fields: [[254, 2, 0x84], [0, 16, 0x07], [1, 1, 0x00], [2, 4, 0x86], [3, 1, 0x00], [4, 4, 0x86], [5, 4, 0x86], [6, 4, 0x86], [7, 1, 0x00]] },
  };

  function writeDef(w, d) {
    w.u8(0x40 | d.local); w.u8(0); w.u8(0); w.u16(d.global); w.u8(d.fields.length);
    for (const [num, size, type] of d.fields) { w.u8(num); w.u8(size); w.u8(type); }
  }

  const INTENSITY = { active: 0, recovery: 1, warmup: 2, cooldown: 3 };
  const ascii = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\x20-\x7E]/g, '');

  /**
   * Zet de stappen van een training om naar FIT-stappen.
   * Doel: hartslag (bij effort-gebaseerd/heuvel) of tempo-bereik (snelheid in mm/s), anders 'open'.
   */
  function flatten(workout, ctx) {
    const out = [];
    const add = (s) => {
      const t = RF.planner.targetFor(s, ctx);
      const st = { name: ascii(s.label || t.label).slice(0, 15), intensity: INTENSITY[s.kind] ?? 0, targetType: 2, low: 0, high: 0, durType: 5, durValue: 0 };
      if (s.dur.type === 'time') { st.durType = 0; st.durValue = s.dur.sec * 1000; }
      else if (s.dur.type === 'dist') { st.durType = 1; st.durValue = s.dur.m * 100; }
      if ((t.effortBased || !t.adjusted) && t.hr) { st.targetType = 1; st.low = t.hr[0] + 100; st.high = t.hr[1] + 100; }
      else if (t.adjusted) {
        const [fast, slow] = t.adjusted;
        st.targetType = 0; st.low = Math.round(1000000 / slow); st.high = Math.round(1000000 / fast); // mm/s
      }
      out.push(st);
    };
    for (const s of workout.steps) {
      if (s.kind === 'repeat') {
        const first = out.length;
        s.steps.forEach(add);
        out.push({ name: '', intensity: 0, durType: 6, durValue: first, targetType: 2, low: 0, high: 0, repeat: s.reps });
      } else add(s);
    }
    return out;
  }

  function build(workout, ctx) {
    const steps = flatten(workout, ctx);
    const w = new Writer();
    writeDef(w, DEF.fileId);
    w.u8(0); w.u8(5); w.u16(255); w.u16(0); w.u32(Math.floor(Math.random() * 0xFFFFFFF) + 1);
    w.u32(Math.floor(Date.now() / 1000) - RF.importers.FIT_EPOCH);
    writeDef(w, DEF.workout);
    w.u8(1); w.u8(1); w.u16(steps.length); w.str(ascii(`RF ${workout.title}`).slice(0, 23), 24);
    writeDef(w, DEF.step);
    steps.forEach((s, i) => {
      w.u8(2);
      w.u16(i); w.str(s.name, 16); w.u8(s.durType); w.u32(s.durValue); w.u8(s.targetType);
      w.u32(s.repeat || 0); w.u32(s.low); w.u32(s.high); w.u8(s.intensity);
    });
    const data = w.bytes;
    const header = new Writer();
    header.u8(14); header.u8(0x10); header.u16(2132); header.u32(data.length); header.str('.FIT', 4);
    header.u16(RF.importers.crc16(header.bytes));
    const all = header.bytes.concat(data);
    const crc = RF.importers.crc16(all);
    all.push(crc & 0xFF, crc >> 8);
    return new Uint8Array(all);
  }

  RF.fitexport = { build, flatten };
})(window.RF = window.RF || {});
