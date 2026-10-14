/* Kleine SVG-grafieken: gegroepeerde staven, lijn en horizontale staven. Altijd met tooltip en tabelweergave. */
(function (RF) {
  'use strict';
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /** Staaf met afgeronde (4px) bovenkant, verankerd op de basislijn. */
  function barPath(x, y, w, h) {
    if (h <= 0) return '';
    const r = Math.min(4, w / 2, h);
    return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
  }

  function niceMax(v) {
    if (v <= 0) return 1;
    const p = Math.pow(10, Math.floor(Math.log10(v)));
    for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p;
    return 10 * p;
  }

  function table(caption, head, rows) {
    return `<details class="chart-table"><summary>Toon als tabel</summary><div class="table-wrap"><table><caption class="sr-only">${esc(caption)}</caption><thead><tr>${head.map((h) => `<th scope="col">${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c, i) => (i === 0 ? `<th scope="row">${esc(c)}</th>` : `<td>${esc(c)}</td>`)).join('')}</tr>`).join('')}</tbody></table></div></details>`;
  }

  /**
   * Gegroepeerde staven. series: [{ name, cls, values[] }], categories: labels.
   * fmt: waarde -> tekst.
   */
  function bars({ title, categories, series, fmt, highlight, stacked }) {
    const W = Math.max(280, Math.round(RF.charts.width || 640)), H = 220, L = 40, R = 8, T = 12, B = 28;
    const max = niceMax(Math.max(1, ...(stacked ? categories.map((_, i) => series.reduce((t, s) => t + (s.values[i] || 0), 0)) : series.flatMap((s) => s.values.filter((v) => v != null)))));
    const cw = (W - L - R) / categories.length;
    const gap = 2;
    const bw = Math.max(3, Math.min(18, (cw * 0.7 - gap * (series.length - 1)) / series.length));
    const y = (v) => T + (H - T - B) * (1 - v / max);
    let svg = '';
    for (let t = 0; t <= 4; t++) {
      const v = max * t / 4, yy = y(v);
      svg += `<line class="grid" x1="${L}" x2="${W - R}" y1="${yy}" y2="${yy}"/><text class="tick" x="${L - 6}" y="${yy + 4}" text-anchor="end">${esc(fmt(v, true))}</text>`;
    }
    const every = Math.ceil(categories.length / Math.max(3, Math.floor(W / 60)));
    categories.forEach((c, i) => {
      const gx = L + cw * i + (cw - (bw * series.length + gap * (series.length - 1))) / 2;
      const tip = `${c}: ` + series.map((s) => `${s.name} ${s.values[i] == null ? '–' : fmt(s.values[i])}`).join(' · ');
      svg += `<g class="hit${highlight === i ? ' now' : ''}" tabindex="0" role="img" aria-label="${esc(tip)}" data-tip="${esc(tip)}">`;
      svg += `<rect class="hitbox" x="${L + cw * i}" y="${T}" width="${cw}" height="${H - T - B}"/>`;
      if (stacked) {
        // gestapeld: segmenten met 2px tussenruimte, alleen het bovenste segment afgerond
        const sw = Math.max(4, Math.min(24, cw * 0.6)), sx = L + cw * i + (cw - sw) / 2;
        const vals = series.map((s) => s.values[i] || 0);
        const top = vals.reduce((t, v, j) => (v > 0 ? j : t), -1);
        let acc = 0;
        series.forEach((s, j) => {
          const v = vals[j];
          if (v <= 0) return;
          const yTop = y(acc + v), h = y(acc) - yTop - (acc > 0 ? 2 : 0);
          svg += j === top ? `<path class="${s.cls}" d="${barPath(sx, yTop, sw, Math.max(1, h))}"/>` : `<rect class="${s.cls}" x="${sx}" y="${yTop}" width="${sw}" height="${Math.max(1, h)}"/>`;
          acc += v;
        });
      } else
      series.forEach((s, j) => {
        const v = s.values[i];
        if (v == null || v <= 0) return;
        const x = gx + j * (bw + gap);
        svg += `<path class="${s.cls}" d="${barPath(x, y(v), bw, y(0) - y(v))}"/>`;
      });
      svg += '</g>';
      if (i % every === 0) svg += `<text class="tick" x="${L + cw * i + cw / 2}" y="${H - 8}" text-anchor="middle">${esc(c)}</text>`;
    });
    svg += `<line class="axis" x1="${L}" x2="${W - R}" y1="${y(0)}" y2="${y(0)}"/>`;
    const legend = series.length > 1 ? `<ul class="legend">${series.map((s) => `<li><span class="swatch ${s.cls}" aria-hidden="true"></span>${esc(s.name)}</li>`).join('')}</ul>` : '';
    return `<figure class="chart"><figcaption>${esc(title)}</figcaption>${legend}<div class="chart-box"><svg viewBox="0 0 ${W} ${H}" class="chart-svg">${svg}</svg><div class="tooltip" hidden></div></div>${table(title, ['Week', ...series.map((s) => s.name)], categories.map((c, i) => [c, ...series.map((s) => (s.values[i] == null ? '–' : fmt(s.values[i])))]))}</figure>`;
  }

  /** Lijn (één reeks) met punten; optionele referentieband (bv. ACWR 0,8–1,3). */
  function line({ title, labels, values, fmt, band, min: forceMin }) {
    const W = Math.max(280, Math.round(RF.charts.width || 640)), H = 200, L = 40, R = 12, T = 12, B = 28;
    const vals = values.filter((v) => v != null);
    if (!vals.length) return `<figure class="chart"><figcaption>${esc(title)}</figcaption><p class="muted">Nog geen gegevens.</p></figure>`;
    let lo = Math.min(...vals, band ? band[0] : Infinity), hi = Math.max(...vals, band ? band[1] : -Infinity);
    if (forceMin != null) lo = Math.min(lo, forceMin);
    const pad = (hi - lo) * 0.15 || 1; lo -= pad; hi += pad;
    const x = (i) => L + (labels.length === 1 ? (W - L - R) / 2 : (W - L - R) * i / (labels.length - 1));
    const y = (v) => T + (H - T - B) * (1 - (v - lo) / (hi - lo));
    let svg = '';
    for (let t = 0; t <= 4; t++) {
      const v = lo + (hi - lo) * t / 4;
      svg += `<line class="grid" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text class="tick" x="${L - 6}" y="${y(v) + 4}" text-anchor="end">${esc(fmt(v, true))}</text>`;
    }
    if (band) svg += `<rect class="band" x="${L}" width="${W - L - R}" y="${y(band[1])}" height="${y(band[0]) - y(band[1])}"/>`;
    const pts = values.map((v, i) => (v == null ? null : [x(i), y(v)]));
    let d = '', pen = false;
    pts.forEach((p) => { if (!p) { pen = false; return; } d += `${pen ? 'L' : 'M'}${p[0]},${p[1]}`; pen = true; });
    svg += `<path class="line s1" d="${d}"/>`;
    const every = Math.ceil(labels.length / Math.max(3, Math.floor(W / 70)));
    pts.forEach((p, i) => {
      if (i % every === 0) svg += `<text class="tick" x="${x(i)}" y="${H - 8}" text-anchor="middle">${esc(labels[i])}</text>`;
      if (!p) return;
      const tip = `${labels[i]}: ${fmt(values[i])}`;
      const hw = (W - L - R) / Math.max(1, labels.length - 1) / 2;
      svg += `<g class="hit" tabindex="0" role="img" aria-label="${esc(tip)}" data-tip="${esc(tip)}"><rect class="hitbox" x="${p[0] - Math.max(hw, 6)}" y="${T}" width="${Math.max(hw, 6) * 2}" height="${H - T - B}"/><line class="crosshair" x1="${p[0]}" x2="${p[0]}" y1="${T}" y2="${H - B}"/><circle class="dot s1" cx="${p[0]}" cy="${p[1]}" r="4"/></g>`;
    });
    return `<figure class="chart"><figcaption>${esc(title)}</figcaption><div class="chart-box"><svg viewBox="0 0 ${W} ${H}" class="chart-svg">${svg}</svg><div class="tooltip" hidden></div></div>${table(title, ['Datum', 'Waarde'], labels.map((l, i) => [l, values[i] == null ? '–' : fmt(values[i])]))}</figure>`;
  }

  /** Horizontale staven met label en waarde in tekst (één reeks). */
  function hbars({ title, rows }) {
    const max = Math.max(1, ...rows.map((r) => r.value));
    return `<figure class="chart"><figcaption>${esc(title)}</figcaption><ul class="hbars">${rows.map((r) => `<li><span class="hb-label">${esc(r.label)}</span><span class="hb-track"><span class="hb-bar s1" style="width:${(r.value / max * 100).toFixed(1)}%"></span></span><span class="hb-val">${esc(r.text)}</span></li>`).join('')}</ul></figure>`;
  }

  /** Tooltips koppelen (muis, aanraking, toetsenbord). */
  function bind(root) {
    root.querySelectorAll('.chart-box').forEach((box) => {
      const tip = box.querySelector('.tooltip');
      const show = (g, ev) => {
        tip.textContent = g.dataset.tip;
        tip.hidden = false;
        const br = box.getBoundingClientRect();
        let px, py;
        if (ev && ev.clientX != null) { px = ev.clientX - br.left; py = ev.clientY - br.top; }
        else { const r = g.getBoundingClientRect(); px = r.left - br.left + r.width / 2; py = 10; }
        const tw = tip.offsetWidth;
        tip.style.left = `${Math.max(0, Math.min(br.width - tw, px - tw / 2))}px`;
        tip.style.top = `${Math.max(0, py - tip.offsetHeight - 12)}px`;
        box.querySelectorAll('.hit.active').forEach((x) => x.classList.remove('active'));
        g.classList.add('active');
      };
      const hide = () => { tip.hidden = true; box.querySelectorAll('.hit.active').forEach((x) => x.classList.remove('active')); };
      box.querySelectorAll('.hit').forEach((g) => {
        g.addEventListener('pointermove', (e) => show(g, e));
        g.addEventListener('pointerdown', (e) => show(g, e));
        g.addEventListener('focus', () => show(g));
        g.addEventListener('blur', hide);
      });
      box.addEventListener('pointerleave', hide);
    });
  }

  RF.charts = { width: 640, bars, line, hbars, bind, esc };
})(window.RF = window.RF || {});
