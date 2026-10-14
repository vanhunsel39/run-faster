/* Import van Garmin-bestanden (FIT, GPX, TCX, ZIP) zonder externe bibliotheken, plus analyse. */
(function (RF) {
  'use strict';

  const FIT_EPOCH = 631065600; // 1989-12-31T00:00:00Z in unix-seconden

  /* ---------- FIT ---------- */
  const BASE = { // nummer -> [grootte, lezer, ongeldige waarde]
    0: [1, 'u8', 0xFF], 1: [1, 's8', 0x7F], 2: [1, 'u8', 0xFF], 3: [2, 's16', 0x7FFF], 4: [2, 'u16', 0xFFFF],
    5: [4, 's32', 0x7FFFFFFF], 6: [4, 'u32', 0xFFFFFFFF], 7: [1, 'str', null], 8: [4, 'f32', null], 9: [8, 'f64', null],
    10: [1, 'u8', 0], 11: [2, 'u16', 0], 12: [4, 'u32', 0], 13: [1, 'u8', 0xFF],
    14: [8, 'skip', null], 15: [8, 'skip', null], 16: [8, 'skip', null],
  };

  /** Generieke FIT-lezer: geeft { messages: { globalNum: [ {fieldNum: value} ] }, crcOk } */
  function parseFitRaw(buf) {
    const dv = new DataView(buf);
    const headerSize = dv.getUint8(0);
    const dataSize = dv.getUint32(4, true);
    const sig = String.fromCharCode(dv.getUint8(8), dv.getUint8(9), dv.getUint8(10), dv.getUint8(11));
    if (sig !== '.FIT') throw new Error('Geen geldig FIT-bestand');
    const end = Math.min(headerSize + dataSize, buf.byteLength);
    const crcOk = buf.byteLength >= end + 2 ? crc16(new Uint8Array(buf, 0, end)) === dv.getUint16(end, true) : null;
    const defs = {};
    const messages = {};
    let pos = headerSize;
    let lastTs = 0;

    while (pos < end) {
      const h = dv.getUint8(pos++);
      if (h & 0x80) { // compressed timestamp header
        const local = (h >> 5) & 0x03;
        const off = h & 0x1F;
        lastTs = (off >= (lastTs & 0x1F)) ? (lastTs & ~0x1F) + off : (lastTs & ~0x1F) + off + 0x20;
        pos = readData(local, lastTs);
      } else if (h & 0x40) { // definition
        const local = h & 0x0F;
        const hasDev = h & 0x20;
        pos++; // reserved
        const little = dv.getUint8(pos++) === 0;
        const global = dv.getUint16(pos, little); pos += 2;
        const n = dv.getUint8(pos++);
        const fields = [];
        for (let i = 0; i < n; i++) {
          fields.push({ num: dv.getUint8(pos), size: dv.getUint8(pos + 1), type: dv.getUint8(pos + 2) & 0x1F });
          pos += 3;
        }
        let devSize = 0;
        if (hasDev) {
          const nd = dv.getUint8(pos++);
          for (let i = 0; i < nd; i++) { devSize += dv.getUint8(pos + 1); pos += 3; }
        }
        defs[local] = { global, little, fields, devSize };
      } else {
        pos = readData(h & 0x0F, null);
      }
    }
    return { messages, crcOk };

    function readData(local, ts) {
      const def = defs[local];
      if (!def) throw new Error('FIT: onbekend berichttype');
      const msg = {};
      for (const f of def.fields) {
        msg[f.num] = readField(pos, f, def.little);
        pos += f.size;
      }
      pos += def.devSize;
      if (msg[253] != null) lastTs = msg[253];
      else if (ts != null) msg[253] = ts;
      (messages[def.global] = messages[def.global] || []).push(msg);
      return pos;
    }

    function readField(p, f, little) {
      const b = BASE[f.type] || [1, 'u8', null];
      if (b[1] === 'str') {
        let s = '';
        for (let i = 0; i < f.size; i++) { const c = dv.getUint8(p + i); if (!c) break; s += String.fromCharCode(c); }
        return s;
      }
      if (f.size < b[0] || b[1] === 'skip') return null;
      let v;
      switch (b[1]) {
        case 'u8': v = dv.getUint8(p); break;
        case 's8': v = dv.getInt8(p); break;
        case 'u16': v = dv.getUint16(p, little); break;
        case 's16': v = dv.getInt16(p, little); break;
        case 'u32': v = dv.getUint32(p, little); break;
        case 's32': v = dv.getInt32(p, little); break;
        case 'f32': v = dv.getFloat32(p, little); break;
        case 'f64': v = dv.getFloat64(p, little); break;
        default: v = null;
      }
      return v === b[2] ? null : v;
    }
  }

  const CRC_TABLE = [0x0000, 0xCC01, 0xD801, 0x1400, 0xF001, 0x3C00, 0x2800, 0xE401, 0xA001, 0x6C00, 0x7800, 0xB401, 0x5000, 0x9C01, 0x8801, 0x4400];
  function crc16(bytes, crc = 0) {
    for (const byte of bytes) {
      let tmp = CRC_TABLE[crc & 0xF];
      crc = (crc >> 4) & 0x0FFF;
      crc = crc ^ tmp ^ CRC_TABLE[byte & 0xF];
      tmp = CRC_TABLE[crc & 0xF];
      crc = (crc >> 4) & 0x0FFF;
      crc = crc ^ tmp ^ CRC_TABLE[(byte >> 4) & 0xF];
    }
    return crc;
  }

  function semiToDeg(s) { return s == null ? null : s * (180 / 2147483648); }

  function parseFit(buf) {
    const { messages } = parseFitRaw(buf);
    const recs = (messages[20] || []).map((m) => ({
      ts: m[253],
      dist: m[5] != null ? m[5] / 100 : null,
      alt: m[78] != null ? m[78] / 5 - 500 : (m[2] != null ? m[2] / 5 - 500 : null),
      hr: m[3],
      lat: semiToDeg(m[0]), lon: semiToDeg(m[1]),
    })).filter((r) => r.ts != null);
    const s = (messages[18] || [])[0] || {};
    const laps = (messages[19] || []).map((m) => ({
      distM: m[9] != null ? m[9] / 100 : null, sec: m[8] != null ? m[8] / 1000 : (m[7] != null ? m[7] / 1000 : null),
      avgHr: m[15], ascent: m[21],
    }));
    const startTs = s[2] || (recs[0] && recs[0].ts);
    const t0 = recs.length ? recs[0].ts : startTs;
    return normalize({
      source: 'fit',
      start: startTs ? new Date((startTs + FIT_EPOCH) * 1000) : null,
      sport: s[5],
      totalDistM: s[9] != null ? s[9] / 100 : null,
      timerSec: s[8] != null ? s[8] / 1000 : null,
      elapsedSec: s[7] != null ? s[7] / 1000 : null,
      avgHr: s[16], maxHr: s[17], ascent: s[22], descent: s[23],
      records: recs.map((r) => ({ t: r.ts - t0, dist: r.dist, alt: r.alt, hr: r.hr, lat: r.lat, lon: r.lon })),
      laps,
    });
  }

  /* ---------- GPX / TCX ---------- */
  function haversine(a, b) {
    const R = 6371000, toR = Math.PI / 180;
    const dLat = (b.lat - a.lat) * toR, dLon = (b.lon - a.lon) * toR;
    const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * toR) * Math.cos(b.lat * toR) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(x));
  }

  const firstLocal = (el, name) => {
    const all = el.getElementsByTagName('*');
    for (const n of all) if (n.localName === name) return n;
    return null;
  };
  const byLocal = (doc, name) => Array.from(doc.getElementsByTagNameNS('*', name));

  function parseXml(text) {
    const doc = new DOMParser().parseFromString(text, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) throw new Error('Kon XML niet lezen');
    return doc;
  }

  function parseGpx(text) {
    const doc = parseXml(text);
    const pts = byLocal(doc, 'trkpt');
    if (!pts.length) throw new Error('GPX bevat geen trackpunten');
    let dist = 0, prev = null, t0 = null;
    const records = pts.map((p) => {
      const lat = parseFloat(p.getAttribute('lat')), lon = parseFloat(p.getAttribute('lon'));
      const ele = firstLocal(p, 'ele'), time = firstLocal(p, 'time'), hr = firstLocal(p, 'hr');
      const ts = time ? Date.parse(time.textContent) / 1000 : null;
      if (t0 == null && ts != null) t0 = ts;
      const cur = { lat, lon };
      if (prev) dist += haversine(prev, cur);
      prev = cur;
      return { t: ts != null ? ts - t0 : null, dist, alt: ele ? parseFloat(ele.textContent) : null, hr: hr ? parseInt(hr.textContent, 10) : null, lat, lon };
    }).filter((r) => r.t != null);
    const typeEl = byLocal(doc, 'type')[0];
    return normalize({ source: 'gpx', sport: typeEl ? typeEl.textContent : null, start: t0 ? new Date(t0 * 1000) : null, records, laps: [] });
  }

  function parseTcx(text) {
    const doc = parseXml(text);
    const tps = byLocal(doc, 'Trackpoint');
    if (!tps.length) throw new Error('TCX bevat geen trackpunten');
    let t0 = null, prev = null, dist = 0;
    const records = tps.map((p) => {
      const time = firstLocal(p, 'Time'), d = firstLocal(p, 'DistanceMeters'), alt = firstLocal(p, 'AltitudeMeters');
      const hrEl = firstLocal(p, 'HeartRateBpm'), lat = firstLocal(p, 'LatitudeDegrees'), lon = firstLocal(p, 'LongitudeDegrees');
      const ts = time ? Date.parse(time.textContent) / 1000 : null;
      if (t0 == null && ts != null) t0 = ts;
      let dm = d ? parseFloat(d.textContent) : null;
      if (dm == null && lat && lon) {
        const cur = { lat: parseFloat(lat.textContent), lon: parseFloat(lon.textContent) };
        if (prev) dist += haversine(prev, cur);
        prev = cur; dm = dist;
      }
      const hrv = hrEl ? firstLocal(hrEl, 'Value') : null;
      return { t: ts != null ? ts - t0 : null, dist: dm, alt: alt ? parseFloat(alt.textContent) : null, hr: hrv ? parseInt(hrv.textContent, 10) : null };
    }).filter((r) => r.t != null);
    const laps = byLocal(doc, 'Lap').map((l) => {
      const tt = firstLocal(l, 'TotalTimeSeconds'), dd = l.getElementsByTagNameNS('*', 'DistanceMeters');
      const direct = Array.from(dd).find((n) => n.parentNode === l);
      const ah = firstLocal(l, 'AverageHeartRateBpm');
      return { sec: tt ? parseFloat(tt.textContent) : null, distM: direct ? parseFloat(direct.textContent) : null, avgHr: ah ? parseInt(firstLocal(ah, 'Value').textContent, 10) : null };
    });
    const actEl = byLocal(doc, 'Activity')[0];
    return normalize({ source: 'tcx', sport: actEl ? actEl.getAttribute('Sport') : null, start: t0 ? new Date(t0 * 1000) : null, records, laps });
  }

  /* ---------- ZIP (Garmin 'Export Original') ---------- */
  async function unzipFirst(buf) {
    const dv = new DataView(buf);
    let eocd = -1;
    for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 65557); i--) {
      if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('Ongeldig ZIP-bestand');
    const count = dv.getUint16(eocd + 10, true);
    let p = dv.getUint32(eocd + 16, true);
    for (let n = 0; n < count; n++) {
      if (dv.getUint32(p, true) !== 0x02014b50) break;
      const method = dv.getUint16(p + 10, true);
      const csize = dv.getUint32(p + 20, true);
      const nameLen = dv.getUint16(p + 28, true), extraLen = dv.getUint16(p + 30, true), commentLen = dv.getUint16(p + 32, true);
      const localOff = dv.getUint32(p + 42, true);
      const name = new TextDecoder().decode(new Uint8Array(buf, p + 46, nameLen));
      p += 46 + nameLen + extraLen + commentLen;
      if (!/\.(fit|gpx|tcx)$/i.test(name)) continue;
      const lNameLen = dv.getUint16(localOff + 26, true), lExtraLen = dv.getUint16(localOff + 28, true);
      const start = localOff + 30 + lNameLen + lExtraLen;
      const data = buf.slice(start, start + csize);
      let out;
      if (method === 0) out = data;
      else if (method === 8) {
        if (typeof DecompressionStream === 'undefined') throw new Error('Deze browser kan geen ZIP uitpakken. Pak het bestand eerst uit.');
        out = await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer();
      } else throw new Error('Niet-ondersteunde ZIP-compressie');
      return { name, buf: out };
    }
    throw new Error('Geen .fit/.gpx/.tcx gevonden in het ZIP-bestand');
  }

  async function parseFile(file) {
    let name = file.name;
    let buf = await file.arrayBuffer();
    if (/\.zip$/i.test(name) || new DataView(buf).getUint32(0, true) === 0x04034b50) {
      const z = await unzipFirst(buf);
      name = z.name; buf = z.buf;
    }
    if (/\.fit$/i.test(name)) return parseFit(buf);
    const text = new TextDecoder().decode(buf);
    if (/\.gpx$/i.test(name) || text.includes('<gpx')) return parseGpx(text);
    if (/\.tcx$/i.test(name) || text.includes('TrainingCenterDatabase')) return parseTcx(text);
    try { return parseFit(buf); } catch (e) { throw new Error('Bestandstype niet herkend. Gebruik .fit, .gpx, .tcx of .zip.'); }
  }

  /* ---------- normaliseren & analyseren ---------- */
  function normalize(a) {
    const recs = a.records || [];
    const last = recs[recs.length - 1];
    if (a.totalDistM == null && last) a.totalDistM = last.dist;
    if (a.elapsedSec == null && last) a.elapsedSec = last.t;
    if (a.timerSec == null) a.timerSec = movingTime(recs) || a.elapsedSec;
    const hrs = recs.map((r) => r.hr).filter(Boolean);
    if (a.avgHr == null && hrs.length) a.avgHr = Math.round(hrs.reduce((s, x) => s + x, 0) / hrs.length);
    if (a.maxHr == null && hrs.length) a.maxHr = Math.max(...hrs);
    return a;
  }

  /** Bewegende tijd: pauzes (> 10 s met < 1 m/s) tellen niet mee. */
  function movingTime(recs) {
    if (recs.length < 2) return null;
    let t = 0;
    for (let i = 1; i < recs.length; i++) {
      const dt = recs[i].t - recs[i - 1].t;
      const dd = (recs[i].dist || 0) - (recs[i - 1].dist || 0);
      if (dt > 0 && !(dt > 10 && dd / dt < 1)) t += dt;
    }
    return t;
  }

  function smoothAlt(recs, win = 5) {
    // gecentreerd venster dat aan de randen symmetrisch krimpt, zodat begin- en eindhoogte behouden blijven
    return recs.map((r, i) => {
      const w = Math.min(win, i, recs.length - 1 - i);
      let s = 0, n = 0;
      for (let j = i - w; j <= i + w; j++) if (recs[j].alt != null) { s += recs[j].alt; n++; }
      return n ? s / n : null;
    });
  }

  /**
   * Analyse: hoogtemeters (met 2 m hysterese), GAP (Minetti), tijd per hartslagzone en km-splits.
   */
  function analyze(a, zs) {
    const recs = (a.records || []).filter((r) => r.dist != null);
    const alt = smoothAlt(recs);
    let gain = 0, loss = 0, ref = null;
    alt.forEach((x) => {
      if (x == null) return;
      if (ref == null) { ref = x; return; }
      if (x - ref >= 2) { gain += x - ref; ref = x; } else if (ref - x >= 2) { loss += ref - x; ref = x; }
    });

    // GAP in segmenten van ~50 m
    let eqDist = 0, segTime = 0, segStart = 0;
    const hasAlt = alt.some((x) => x != null);
    const splits = [];
    let kmStartIdx = 0, kmEq = 0, kmGain = 0;
    const zoneSec = [0, 0, 0, 0, 0];

    for (let i = 1; i < recs.length; i++) {
      const dt = recs[i].t - recs[i - 1].t;
      const moving = dt > 0 && !(dt > 10 && (recs[i].dist - recs[i - 1].dist) / dt < 1);
      if (moving && recs[i].hr && zs) zoneSec[RF.zones.zoneOf(recs[i].hr, zs) - 1] += dt;
      if (recs[i].dist - recs[segStart].dist >= 50 || i === recs.length - 1) {
        const dd = recs[i].dist - recs[segStart].dist;
        const da = hasAlt && alt[i] != null && alt[segStart] != null ? alt[i] - alt[segStart] : 0;
        const f = dd > 0 ? RF.cond.gradeFactor(da / dd) : 1;
        eqDist += dd * f; kmEq += dd * f;
        if (da > 0) kmGain += da;
        segStart = i;
      }
      if (moving) segTime += dt;
      const kmDone = Math.floor(recs[i].dist / 1000);
      if (kmDone > splits.length || i === recs.length - 1) {
        const dd = recs[i].dist - recs[kmStartIdx].dist;
        if (dd >= 200) {
          const sec = recs[i].t - recs[kmStartIdx].t;
          splits.push({ km: splits.length + 1, distM: dd, sec, pace: sec / (dd / 1000), gap: kmEq > 0 ? sec / (kmEq / 1000) : null, gain: Math.round(kmGain) });
        }
        kmStartIdx = i; kmEq = 0; kmGain = 0;
      }
    }

    const alts = alt.filter((x) => x != null);
    const avgAlt = alts.length ? Math.round(alts.reduce((s2, x) => s2 + x, 0) / alts.length) : null;
    const maxAlt = alts.length ? Math.round(Math.max(...alts)) : null;
    const distKm = (a.totalDistM || 0) / 1000;
    const sec = a.timerSec || a.elapsedSec || 0;
    return {
      date: a.start ? RF.u.iso(a.start) : RF.u.today(),
      distanceKm: Math.round(distKm * 100) / 100,
      durationSec: Math.round(sec),
      avgHr: a.avgHr || null, maxHr: a.maxHr || null,
      elevGain: Math.round(a.ascent != null ? a.ascent : gain),
      elevLoss: Math.round(a.descent != null ? a.descent : loss),
      avgAlt, maxAlt,
      gapSecPerKm: hasAlt && eqDist > 0 ? sec / (eqDist / 1000) : null,
      eqDistKm: hasAlt && eqDist > 0 ? eqDist / 1000 : null,
      zoneSec: zoneSec.some((x) => x > 0) ? zoneSec.map(Math.round) : null,
      splits,
      laps: (a.laps || []).filter((l) => l.sec).map((l) => ({ distM: l.distM, sec: l.sec, avgHr: l.avgHr })),
      activity: RF.sports ? RF.sports.fromSport(a.sport) : 'run',
      source: a.source,
    };
  }

  RF.importers = { parseFile, parseFit, parseFitRaw, parseGpx, parseTcx, unzipFirst, analyze, crc16, FIT_EPOCH, haversine };
})(window.RF = window.RF || {});
