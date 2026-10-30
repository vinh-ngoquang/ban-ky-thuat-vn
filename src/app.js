/* Giao diện: thanh trên, định tuyến và năm màn hình. */
(function () {
  const C = window.Core;
  const { esc, fmt, isNum, toneOf, store, fold, TREND, REGIME } = C;
  const $ = (q, el = document) => el.querySelector(q);
  const $$ = (q, el = document) => [...el.querySelectorAll(q)];
  const view = () => $('#view');

  /* ---- lưu trên trình duyệt: mất cũng không sao, trang vẫn chạy ---- */
  const save = {
    get(k, d) { try { const v = localStorage.getItem('bkt:' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem('bkt:' + k, JSON.stringify(v)); } catch { /* chế độ riêng tư */ } },
  };

  const thDefaults = () => ({ window: 30, maxRange: 20, minPass: 0, req: [], ex: '', sector: '', adv: 0, q: '' });

  const state = {
    tab: 'today', sym: null, tf: 'd', chart: null, range: 252,
    th: Object.assign(thDefaults(), save.get('th', {})), thSort: { key: 'count', dir: -1 }, thData: null,
    pot: Object.assign({ grade: '', sector: '', adv: 3, q: '' }, save.get('pot', {})), potSort: { key: 'pts', dir: -1 },
    preset: save.get('preset', 'stable'),
    filters: Object.assign({ ex: '', sector: '', adv: 3, score: 0, trend: '', q: '' }, save.get('filters', {})),
    sort: { key: 'score', dir: -1 }, sel: 0, list: [],
    wl: save.get('wl', {}),
    planIn: Object.assign({ capital: 500, riskPct: 1, k: 2, targetR: 2 }, save.get('plan', {})),
    show: Object.assign({ ma20: true, ma50: true, ma200: true, bb: false, sr: true, plan: true, markers: true, profile: false, ema: false, poc: false }, save.get('show', {})),
    panes: save.get('panes', ['volume', 'rsi']),
  };

  /* ---- mảnh giao diện dùng chung ---- */
  const ICON = {
    check: '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2 6.5 5 9.5 10 3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    x: '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M3 3l6 6M9 3l-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    warn: '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M6 1.5 11 10.5H1Z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M6 5v2.5M6 9v.1" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
    dash: '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 6h7" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  };
  const chip = (text, tone = '') => {
    const icon = tone === 'good' ? ICON.check : tone === 'bad' ? ICON.x : tone === 'warn' ? ICON.warn : ICON.dash;
    return `<span class="chip ${tone}">${icon}${esc(text)}</span>`;
  };
  const trendChip = (t) => chip(TREND[t] || '–', t === 'strong' || t === 'up' ? 'good' : t === 'down' ? 'bad' : '');
  const evChip = (b, late) => { const e = C.evidenceLabel(b, late); return chip(e.text, e.tone); };
  const signed = (x, d = 0) => (isNum(x) ? (x > 0 ? '+' : '') + fmt.n(x, d) : '–');
  const regimeTone = (r) => (r === 1 ? 'good' : r === -1 ? 'bad' : 'warn');

  function spark(values, tone = 'var(--fg-2)') {
    if (!values || values.length < 2) return '<svg class="spark" aria-hidden="true"></svg>';
    const w = 76, h = 24, n = values.length - 1;
    const lo = Math.min(...values), hi = Math.max(...values), k = hi > lo ? (h - 6) / (hi - lo) : 0;
    const p = values.map((v, i) => [i / n * (w - 4) + 1, h - 3 - (v - lo) * k]);
    const d = p.map(([x, y], i) => (i ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1)).join('');
    const [ex, ey] = p[p.length - 1];
    return `<svg class="spark" viewBox="0 0 ${w} ${h}" aria-hidden="true"><path d="${d}" fill="none" stroke="${tone}" stroke-width="1.5" stroke-linejoin="round"/><circle cx="${ex}" cy="${ey}" r="2" fill="${tone}"/></svg>`;
  }
  const sparkFor = (u) => spark(u.spark, u.r20 >= 0 ? 'var(--up)' : 'var(--down)');
  const scoreBar = (v) => (isNum(v)
    ? `<span class="scorebar"><span class="num">${fmt.n(v)}</span><i><b style="width:${Math.max(2, v)}%"></b></i></span>` : '<span class="muted">–</span>');

  function toast(msg) {
    const old = $('.toast');
    if (old) old.remove();
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = msg;
    t.setAttribute('role', 'status');
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2200);
  }

  /* ---- biểu đồ nhỏ bằng SVG, có đường dò và chú giải ---- */
  const plots = new Set();
  const plotRO = new ResizeObserver((items) => items.forEach((it) => it.target._draw && it.target._draw()));

  function linePlot(el, { dates, series, height = 180, fmtY = (v) => v.toFixed(0), bands = null, refLines = [], fmtTip = null, zero = false }) {
    el.classList.add('plot');
    el.style.minHeight = height + 'px';
    const draw = () => {
      const W = Math.max(240, el.clientWidth), H = height;
      const m = { t: 8, r: 8, b: 20, l: 8 };
      let lo = Infinity, hi = -Infinity;
      for (const s of series) for (const v of s.values) if (v != null) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
      for (const r of refLines) { lo = Math.min(lo, r.v); hi = Math.max(hi, r.v); }
      if (zero) { lo = Math.min(lo, 0); hi = Math.max(hi, 0); }
      if (!(hi > lo)) { hi = lo + 1; }
      const pad = (hi - lo) * 0.06; lo -= pad; hi += pad;
      const step = niceStep(hi - lo, Math.max(3, Math.round(H / 46)));
      const ticks = [];
      for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) ticks.push(v);
      const lw = Math.max(...ticks.map((v) => fmtY(v).length)) * 7 + 8;
      m.l = lw;
      const n = dates.length;
      const x = (i) => m.l + i / Math.max(1, n - 1) * (W - m.l - m.r);
      const y = (v) => m.t + (hi - v) / (hi - lo) * (H - m.t - m.b);
      let out = `<svg viewBox="0 0 ${W} ${H}" height="${H}" role="img" aria-label="${esc(series.map((s) => s.name).join(', '))}">`;
      if (bands) {
        for (let i = 0; i < n;) {
          let j = i;
          while (j + 1 < n && bands[j + 1] === bands[i]) j++;
          if (bands[i] !== 0) out += `<rect x="${x(i).toFixed(1)}" y="${m.t}" width="${Math.max(1, x(j) - x(i)).toFixed(1)}" height="${H - m.t - m.b}" fill="var(--${bands[i] > 0 ? 'up' : 'down'}-soft)" opacity=".7"/>`;
          i = j + 1;
        }
      }
      for (const v of ticks) {
        out += `<line x1="${m.l}" x2="${W - m.r}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" stroke="var(--grid)"/>`;
        out += `<text x="${m.l - 6}" y="${(y(v) + 4).toFixed(1)}" text-anchor="end">${esc(fmtY(v))}</text>`;
      }
      for (const r of refLines) {
        out += `<line x1="${m.l}" x2="${W - m.r}" y1="${y(r.v).toFixed(1)}" y2="${y(r.v).toFixed(1)}" stroke="var(--axis)" stroke-dasharray="3 3"/>`;
      }
      const every = Math.max(1, Math.ceil(n / Math.max(3, Math.floor((W - m.l) / 90))));
      let lastLabel = -1e9;
      for (let i = 0; i < n; i++) {
        const newMonth = i === 0 || dates[i].slice(0, 7) !== dates[i - 1].slice(0, 7);
        if (newMonth && i - lastLabel >= every && x(i) < W - 30 && (i > 0 || n < 3)) {
          out += `<text x="${x(i).toFixed(1)}" y="${H - 5}" text-anchor="middle">${esc(dates[i].slice(5, 7) + '/' + dates[i].slice(2, 4))}</text>`;
          lastLabel = i;
        }
      }
      for (const s of series) {
        let d = '', on = false;
        s.values.forEach((v, i) => {
          if (v == null) { on = false; return; }
          d += (on ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(v).toFixed(1);
          on = true;
        });
        out += `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="${s.width || 1.75}" stroke-linejoin="round" stroke-linecap="round"/>`;
      }
      out += `<line class="cross" x1="0" x2="0" y1="${m.t}" y2="${H - m.b}" stroke="var(--muted)" visibility="hidden"/></svg>`;
      el.innerHTML = out + '<div class="tip" hidden></div>';
      const svg = $('svg', el), tip = $('.tip', el), cross = $('.cross', el);
      const move = (e) => {
        const r = svg.getBoundingClientRect();
        const i = Math.max(0, Math.min(n - 1, Math.round((e.clientX - r.left - m.l) / (W - m.l - m.r) * (n - 1))));
        cross.setAttribute('x1', x(i)); cross.setAttribute('x2', x(i)); cross.setAttribute('visibility', 'visible');
        const rows = series.map((s) => `<div class="r"><i style="background:${s.color}"></i><b>${esc((fmtTip || fmtY)(s.values[i] ?? NaN))}</b><span>${esc(s.name)}</span></div>`).join('');
        tip.innerHTML = `<div class="h">${esc(fmt.day(dates[i]))}</div>${rows}`;
        tip.hidden = false;
        const tw = tip.offsetWidth;
        tip.style.left = Math.max(0, Math.min(W - tw, x(i) + 10 > W - tw ? x(i) - tw - 10 : x(i) + 10)) + 'px';
        tip.style.top = '8px';
      };
      svg.addEventListener('pointermove', move);
      svg.addEventListener('pointerleave', () => { tip.hidden = true; cross.setAttribute('visibility', 'hidden'); });
    };
    el._draw = draw;
    draw();
    plotRO.observe(el);
  }

  function niceStep(range, count) {
    const raw = range / Math.max(count, 1), mag = Math.pow(10, Math.floor(Math.log10(raw))), n = raw / mag;
    return (n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10) * mag;
  }

  const legend = (items) => `<div class="legend">${items.map(([n, c]) => `<span><i style="background:${c}"></i>${esc(n)}</span>`).join('')}</div>`;

  /* ---- màn hình Hôm nay ---- */
  function takeaway() {
    const M = store.market, n = M.dates.length - 1;
    const reg = M.regime[n];
    const a200 = M.above200[n], adv = M.adv[n], dec = M.dec[n];
    const headline = reg === -1
      ? (a200 < 35 ? 'Thị trường đang suy yếu và rất hẹp' : 'Thị trường đang suy yếu')
      : reg === 1 ? 'Sức mạnh đang lan tỏa trên diện rộng' : 'Thị trường chưa có xu hướng rõ';
    const y1 = M.comp[n] / M.comp[Math.max(0, n - 250)] - 1;
    return {
      headline, reg,
      body: `Chỉ ${fmt.n(a200)}% mã thanh khoản đang trên MA200. Phiên ${fmt.dayShort(M.dates[n])} có ${adv} mã tăng, ${dec} mã giảm. `
        + `Một năm qua, cổ phiếu thanh khoản điển hình ${fmt.pct(y1, 1)}.`,
    };
  }

  function kpi(label, val, sub, values, tone = 'var(--fg-2)') {
    return `<div class="kpi"><span class="lb">${esc(label)}</span><span class="val">${val}</span><span class="sub">${sub}</span>${values ? kpiSpark(values, tone) : ''}</div>`;
  }

  function kpiSpark(values, tone) {
    const v = values.filter((x) => x != null), w = 120, h = 22;
    if (v.length < 2) return '';
    const lo = Math.min(...v), hi = Math.max(...v), k = hi > lo ? (h - 4) / (hi - lo) : 0;
    const d = v.map((x, i) => (i ? 'L' : 'M') + (i / (v.length - 1) * w).toFixed(1) + ' ' + (h - 2 - (x - lo) * k).toFixed(1)).join('');
    return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true"><path d="${d}" fill="none" stroke="${tone}" stroke-width="1.5" vector-effect="non-scaling-stroke"/></svg>`;
  }

  function renderToday() {
    const M = store.market, R = store.report, n = M.dates.length - 1;
    const t = takeaway();
    const last = (arr, k = 60) => arr.slice(-k);
    const chg = (arr, k = 5) => arr[n] - arr[n - k];
    const avgT = M.turnover.slice(-21, -1).reduce((a, b) => a + b, 0) / 20;
    const tradable = store.universe.filter((u) => u.liquid);
    const q5 = tradable.filter((u) => C.quintileOf(u.score) === 5);
    const today = (key) => tradable.filter((u) => u.sigs.includes(key));
    const fresh = tradable.filter((u) => u.score >= 60 && u.sigs.some((k) => ['leader', 'pullback', 'golden'].includes(k)))
      .sort((a, b) => b.score - a.score).slice(0, 8);
    const traps = tradable.filter((u) => u.sigs.includes('breakout') || (u.sigs.includes('squeeze') && u.score < 40))
      .sort((a, b) => a.score - b.score).slice(0, 8);
    const broken = tradable.filter((u) => u.sigs.includes('breakdown') || u.sigs.includes('death'))
      .sort((a, b) => (b.adv || 0) - (a.adv || 0)).slice(0, 8);

    view().innerHTML = `<div class="view">
      <section class="lede" id="tom-tat">
        <h1>${esc(t.headline)}</h1>
        <p>${esc(t.body)}</p>
      </section>
      <section class="kpis" aria-label="Sức khỏe thị trường">
        ${kpi('Trạng thái thị trường', chip(REGIME[t.reg], regimeTone(t.reg)), `${fmt.n(M.nLiquid[n])} mã thanh khoản`, null)}
        ${kpi('Trên MA50', fmt.n(M.above50[n]) + '%', `${signed(chg(M.above50))} điểm % sau 5 phiên`, last(M.above50))}
        ${kpi('Trên MA200', fmt.n(M.above200[n]) + '%', `${signed(chg(M.above200))} điểm % sau 5 phiên`, last(M.above200))}
        ${kpi('Tăng / giảm', `<span class="up">${M.adv[n]}</span> / <span class="down">${M.dec[n]}</span>`, `Phiên ${fmt.dayShort(M.dates[n])}`, last(M.adv.map((a, i) => a - M.dec[i])))}
        ${kpi('Đỉnh / đáy 52 tuần', `<span class="up">${M.newHi[n]}</span> / <span class="down">${M.newLo[n]}</span>`, `Số mã lập mới trong phiên`, last(M.newHi.map((a, i) => a - M.newLo[i])))}
        ${kpi('Giá trị giao dịch', fmt.ty(M.turnover[n]), `${fmt.pct(M.turnover[n] / avgT - 1, 0)} so với TB 20 phiên`, last(M.turnover))}
      </section>
      <div class="grid-2">
        <section class="card" id="the-luc">
          <div class="card-head"><h2>Cổ phiếu điển hình đang ở đâu</h2>
            <div class="seg" id="mkt-range" role="group" aria-label="Khoảng thời gian">
              ${[[125, '6 tháng'], [250, '1 năm'], [0, '3 năm']].map(([k, l]) => `<button data-k="${k}" aria-pressed="${state.range === k || (k === 250 && state.range === 252)}">${l}</button>`).join('')}
            </div></div>
          ${legend([['Chỉ số điển hình', 'var(--fg)'], ['MA50', 'var(--s-ma50)'], ['MA200', 'var(--s-ma200)']])}
          <div id="mkt-chart"></div>
          <p class="note" style="margin:8px 0 2px">Tỷ lệ mã trên MA50 và MA200</p>
          ${legend([['Trên MA50', 'var(--s-ma50)'], ['Trên MA200', 'var(--s-ma200)']])}
          <div id="breadth-chart"></div>
          <p class="note" style="margin-top:6px">Chỉ số điển hình gia quyền theo thanh khoản, tính riêng từ giá từng mã, 100 = ${fmt.day(M.dates[0])}. Nền xanh: Lan tỏa. Nền đỏ: Suy yếu.</p>
        </section>
        <section class="card" id="bang-chung">
          <div class="card-head"><h2>Tín hiệu nào từng có ích?</h2><button class="icon-btn" data-go="method">Cách kiểm chứng</button></div>
          <p class="note" style="margin-bottom:8px">Mỗi tín hiệu được mô phỏng thành lệnh thật trong ${fmt.n(R.sessions)} phiên, đã trừ phí. Cột giữa so với mốc vào lệnh ngẫu nhiên (${fmt.r(R.setups.find((s) => s.key === 'random').all.exp)}).</p>
          <div>${evidenceRows()}</div>
          <div class="scale-note" style="margin-top:6px"><span>−0,6R</span><span>kỳ vọng mỗi lệnh, vạch mờ là khoảng tin cậy 90%</span><span>+0,6R</span></div>
          <div class="alerts">
            <div class="alert">${ICON.warn}<span><b>Điểm Bền</b> là thứ phân loại tốt nhất: nhóm cao nhất thắng ${fmt.pctAbs(R.quintiles[4].win20, 0)} ở T+20, nhóm thấp nhất ${fmt.pctAbs(R.quintiles[0].win20, 0)}.</span></div>
            <div class="alert">${ICON.warn}<span>Cắt lỗ 2 ATR vẫn bị chạm trong ${fmt.pctAbs(C.stopHitChance(2), 0)} trường hợp sau 20 phiên. Chừa khoảng thở hoặc giảm khối lượng.</span></div>
          </div>
        </section>
      </div>
      <div class="grid-3">
        ${miniCard('Bền và có tín hiệu tốt', 'Điểm từ 60, xuất hiện Dẫn dắt, Kéo về hoặc Giao cắt vàng trong 3 phiên gần nhất.', fresh, 'leaderplus')}
        ${miniCard('Dễ thành bẫy', 'Bứt phá hoặc siết biên độ ở mã kém bền. Lịch sử cho thấy nhóm này hay thất bại.', traps, 'breakout')}
        ${miniCard('Đang gãy xu hướng', 'Thủng MA50 với khối lượng lớn hoặc giao cắt tử thần trong 3 phiên gần nhất.', broken, 'broken')}
      </div>
      ${watchPulse()}
      <section class="card" id="nganh">
        <div class="card-head"><h2>Ngành nào bền nhất</h2><span class="note">Chỉ tính mã đủ thanh khoản, xếp theo Điểm Bền trung vị</span></div>
        <div class="table-wrap" style="max-height:none">${sectorTable(tradable)}</div>
      </section>
      <p class="foot">Dữ liệu đến hết phiên ${fmt.day(M.dates[n])}. Đây là công cụ phân tích chung dựa trên quy tắc, không phải tư vấn đầu tư cá nhân. Hiệu quả trong quá khứ không bảo đảm kết quả tương lai.</p>
    </div>`;
    drawMarket();
    $$('#mkt-range button').forEach((b) => b.addEventListener('click', () => {
      state.range = +b.dataset.k;
      $$('#mkt-range button').forEach((x) => x.setAttribute('aria-pressed', x === b));
      drawMarket();
    }));
  }

  function evidenceRows() {
    const R = store.report;
    const base = R.setups.find((s) => s.key === 'random').all.exp;
    const x = (v) => (Math.max(-0.6, Math.min(0.6, v)) + 0.6) / 1.2 * 100;
    const list = R.setups.filter((s) => s.key !== 'random').sort((a, b) => (b.all.exp ?? -9) - (a.all.exp ?? -9));
    return list.map((s) => {
      const count = store.universe.filter((u) => u.liquid && u.sigs.includes(s.key)).length;
      const a = s.all;
      return `<button class="ev-row" data-setup="${s.key}" title="${esc(s.rule)}">
        <span><span class="nm">${esc(s.name)}</span><small>${fmt.r(a.exp)} · ${fmt.n(a.n)} lệnh · hiện ${count} mã</small></span>
        <span class="ev-bar" aria-hidden="true">
          <span class="zero" style="left:50%"></span><span class="base" style="left:${x(base)}%;opacity:.5"></span>
          <span class="ci" style="left:${x(a.lo)}%;width:${x(a.hi) - x(a.lo)}%"></span>
          <span class="dot" style="left:${x(a.exp)}%"></span></span>
        <span>${evChip(a, s.late)}</span></button>`;
    }).join('');
  }

  function miniRow(u) {
    const e = (u.sigs || []).map((k) => C.setup(k)?.name).filter(Boolean).join(', ');
    return `<button class="mini-row" data-sym="${esc(u.s)}"><b>${esc(u.s)}</b>
      <span class="m">${esc(e || u.short)}</span>${sparkFor(u)}
      <span class="num ${toneOf(u.chg)}">${fmt.pct(u.chg)}</span></button>`;
  }

  function miniCard(title, note, rows, preset) {
    return `<section class="card"><div class="card-head"><h2>${esc(title)}</h2>${rows.length ? `<button class="icon-btn" data-preset="${preset}">Xem hết</button>` : ''}</div>
      <p class="note" style="margin-bottom:6px">${esc(note)}</p>
      <div class="mini-list">${rows.length ? rows.map(miniRow).join('') : '<p class="empty">Không có mã nào khớp trong 3 phiên gần nhất.</p>'}</div></section>`;
  }

  function watchPulse() {
    const syms = Object.keys(state.wl).filter((s) => store.bySym.has(s));
    if (!syms.length) return '';
    const items = [];
    for (const s of syms) {
      const u = store.bySym.get(s);
      if (u.trend !== u.trend5 && u.trend5) items.push([u, `Xu hướng đổi từ ${TREND[u.trend5]} sang ${TREND[u.trend]}`, u.trend === 'down' ? 'bad' : '']);
      if (isNum(u.score) && isNum(u.score5) && Math.abs(u.score - u.score5) >= 10) items.push([u, `Điểm Bền ${fmt.n(u.score5)} → ${fmt.n(u.score)} trong 5 phiên`, u.score < u.score5 ? 'warn' : '']);
      for (const k of u.sigs) items.push([u, 'Tín hiệu: ' + (C.setup(k)?.name || k), C.setup(k)?.side === 'risk' ? 'bad' : '']);
    }
    return `<section class="card"><div class="card-head"><h2>Danh sách của bạn có gì mới</h2><button class="icon-btn" data-go="watch">Mở danh sách</button></div>
      ${items.length ? `<div class="mini-list">${items.slice(0, 10).map(([u, t, tone]) => `<button class="mini-row" data-sym="${esc(u.s)}" style="grid-template-columns:54px minmax(0,1fr) auto"><b>${esc(u.s)}</b><span class="m ${tone === 'bad' ? 'down' : ''}">${esc(t)}</span><span class="num ${toneOf(u.chg)}">${fmt.pct(u.chg)}</span></button>`).join('')}</div>`
    : `<p class="empty">${syms.length} mã trong danh sách, không có thay đổi đáng chú ý trong 5 phiên.</p>`}</section>`;
  }

  function sectorTable(rows) {
    const groups = new Map();
    for (const u of rows) {
      if (!groups.has(u.sector)) groups.set(u.sector, []);
      groups.get(u.sector).push(u);
    }
    const med = (a) => { const v = a.filter(isNum).sort((p, q) => p - q); return v.length ? v[Math.floor(v.length / 2)] : null; };
    const list = [...groups.entries()].filter(([, g]) => g.length >= 3).map(([name, g]) => ({
      name, n: g.length, score: med(g.map((u) => u.score)), r20: med(g.map((u) => u.r20)), r60: med(g.map((u) => u.r60)),
      up: g.filter((u) => u.trend === 'strong' || u.trend === 'up').length / g.length,
      top: [...g].sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0],
    })).sort((a, b) => b.score - a.score);
    return `<table><thead><tr><th class="l">Ngành</th><th>Số mã</th><th>Điểm Bền</th><th>Tỷ lệ xu hướng tăng</th><th>20 phiên</th><th>60 phiên</th><th class="l">Mã bền nhất</th></tr></thead><tbody>
      ${list.map((g) => `<tr class="go" data-sector="${esc(g.name)}"><td class="l">${esc(g.name)}</td><td class="num">${g.n}</td><td>${scoreBar(g.score)}</td><td class="num">${fmt.pctAbs(g.up, 0)}</td>
        <td class="num ${toneOf(g.r20)}">${fmt.pct(g.r20)}</td><td class="num ${toneOf(g.r60)}">${fmt.pct(g.r60)}</td><td class="l"><b>${esc(g.top.s)}</b> <span class="muted num">${fmt.n(g.top.score)}</span></td></tr>`).join('')}
      </tbody></table>`;
  }

  function drawMarket() {
    const M = store.market;
    const k = state.range === 252 ? 250 : state.range;
    const from = k ? Math.max(0, M.dates.length - k) : 0;
    const cut = (a) => a.slice(from);
    const dates = cut(M.dates);
    linePlot($('#mkt-chart'), {
      dates, height: 220, bands: cut(M.regime), fmtY: (v) => (isNum(v) ? v.toFixed(0) : '–'),
      series: [{ name: 'MA200', values: cut(M.ma200), color: 'var(--s-ma200)' }, { name: 'MA50', values: cut(M.ma50), color: 'var(--s-ma50)' }, { name: 'Chỉ số điển hình', values: cut(M.comp), color: 'var(--fg)', width: 2 }],
    });
    linePlot($('#breadth-chart'), {
      dates, height: 120, fmtY: (v) => (isNum(v) ? v.toFixed(0) + '%' : '–'), refLines: [{ v: 50 }],
      series: [{ name: 'Trên MA50', values: cut(M.above50), color: 'var(--s-ma50)' }, { name: 'Trên MA200', values: cut(M.above200), color: 'var(--s-ma200)' }],
    });
  }

  /* ---- màn hình Sàng lọc ---- */
  const hasSig = (u, ...k) => k.some((x) => u.sigs.includes(x));
  const PRESETS = [
    { id: 'stable', name: 'Bền nhất', note: 'Điểm từ 80', test: (u) => u.score >= 80, sort: 'score' },
    { id: 'leaderplus', name: 'Tín hiệu ở mã bền', note: 'Dẫn dắt, Kéo về, Vàng + điểm ≥ 60', test: (u) => u.score >= 60 && hasSig(u, 'leader', 'pullback', 'golden'), sort: 'score' },
    { id: 'near', name: 'Gần đỉnh và ổn định', note: 'Cách đỉnh dưới 5%, ATR dưới 2,5%', test: (u) => u.dist > -0.05 && u.atrp < 0.025, sort: 'dist' },
    { id: 'breakout', name: 'Bứt phá và siết biên', note: 'Cảnh báo: hay thất bại', test: (u) => hasSig(u, 'breakout', 'squeeze'), sort: 'score' },
    { id: 'broken', name: 'Gãy xu hướng', note: 'Thủng MA50, giao cắt tử thần', test: (u) => hasSig(u, 'breakdown', 'death'), sort: 'adv' },
    { id: 'wild', name: 'Biến động cao', note: 'Nhóm thua thị trường nhiều nhất', test: (u) => C.quintileOf(u.score) === 1, sort: 'atrp' },
    { id: 'all', name: 'Tất cả', note: 'Chỉ dùng bộ lọc bên dưới', test: () => true, sort: 'score' },
  ];

  const COLS = [
    { k: 's', t: 'Mã', cls: 'l', str: true, html: (u) => `<span class="sym">${esc(u.s)}</span><span class="nm">${esc(u.short)}</span>` },
    { k: 'spark', t: '40 phiên', cls: 'l', nosort: true, html: sparkFor },
    { k: 'px', t: 'Giá', html: (u) => `<span class="num">${fmt.px(u.px)}</span>` },
    { k: 'chg', t: '% phiên', html: (u) => `<span class="num ${toneOf(u.chg)}">${fmt.pct(u.chg)}</span>` },
    { k: 'score', t: 'Điểm Bền', html: (u) => scoreBar(u.score) },
    { k: 'trend', t: 'Xu hướng', cls: 'l', str: true, html: (u) => trendChip(u.trend) },
    { k: 'sigs', t: 'Tín hiệu 3 phiên', cls: 'l', str: true, html: (u) => u.sigs.map((k) => { const s = C.setup(k); return s ? chip(s.name, C.evidenceLabel(s.all, s.late).tone) : ''; }).join(' ') || '<span class="muted">–</span>' },
    { k: 'atrp', t: 'ATR %', html: (u) => `<span class="num">${fmt.pctAbs(u.atrp)}</span>` },
    { k: 'dist', t: 'Cách đỉnh 52T', html: (u) => `<span class="num">${fmt.pct(u.dist, 0)}</span>` },
    { k: 'rs', t: 'RS', html: (u) => `<span class="num">${fmt.n(u.rs)}</span>` },
    { k: 'r20', t: '20 phiên', html: (u) => `<span class="num ${toneOf(u.r20)}">${fmt.pct(u.r20)}</span>` },
    { k: 'adv', t: 'GTGD TB 20p', html: (u) => `<span class="num">${fmt.ty(u.adv)}</span>` },
  ];

  function filtered() {
    const f = state.filters;
    const preset = PRESETS.find((p) => p.id === state.preset) || PRESETS[0];
    const q = fold(f.q.trim());
    const rows = store.universe.filter((u) => (u.adv || 0) >= f.adv
      && (!f.ex || u.ex === f.ex) && (!f.sector || u.sector === f.sector) && (!f.trend || u.trend === f.trend)
      && (!f.score || (u.score ?? -1) >= f.score) && (!q || u.key.includes(q)) && preset.test(u));
    const { key, dir } = state.sort;
    const col = COLS.find((c) => c.k === key);
    const val = (u) => (key === 'sigs' ? u.sigs.length : u[key]);
    rows.sort((a, b) => {
      const x = val(a), y = val(b);
      if (x == null || (typeof x === 'number' && !isNum(x))) return 1;
      if (y == null || (typeof y === 'number' && !isNum(y))) return -1;
      return (col && col.str && key !== 'sigs' ? String(x).localeCompare(String(y)) : x - y) * dir;
    });
    return rows;
  }

  function renderScreen() {
    const sectors = [...new Set(store.universe.map((u) => u.sector))].filter(Boolean).sort((a, b) => a.localeCompare(b, 'vi'));
    const f = state.filters;
    view().innerHTML = `<div class="view"><section class="lede"><h1>Sàng lọc</h1><p>Chọn một góc nhìn, thu hẹp bằng bộ lọc, rồi mở mã để lập kế hoạch. Phím <span class="num">↑ ↓</span> để chọn dòng, <span class="num">Enter</span> để mở.</p></section>
      <section class="card" id="sang-loc">
        <div class="presets" role="group" aria-label="Góc nhìn">${PRESETS.map((p) => `<button class="preset" data-p="${p.id}" aria-pressed="${state.preset === p.id}"><b>${esc(p.name)}</b><span>${esc(p.note)}</span></button>`).join('')}</div>
        <div class="filters">
          <label>Sàn <select id="f-ex"><option value="">Tất cả</option>${['HOSE', 'HNX', 'UPCOM'].map((x) => `<option ${f.ex === x ? 'selected' : ''}>${x}</option>`).join('')}</select></label>
          <label>Ngành <select id="f-sector"><option value="">Tất cả</option>${sectors.map((x) => `<option ${f.sector === x ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></label>
          <label>Xu hướng <select id="f-trend"><option value="">Tất cả</option>${Object.entries(TREND).map(([k, v]) => `<option value="${k}" ${f.trend === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
          <label>GTGD từ <input id="f-adv" type="number" min="0" step="1" value="${f.adv}"> tỷ</label>
          <label>Điểm từ <input id="f-score" type="number" min="0" max="100" step="5" value="${f.score}"></label>
          <label><input id="f-q" type="search" placeholder="Lọc theo mã, tên" value="${esc(f.q)}"></label>
          <button class="icon-btn" id="f-reset">Đặt lại</button>
          <button class="icon-btn" id="f-copy">Sao chép CSV</button>
          <span class="note" id="f-count" aria-live="polite"></span>
        </div>
        <div class="table-wrap" id="screen-table" tabindex="0"></div>
      </section></div>`;
    const set = (k, v) => { state.filters[k] = v; save.set('filters', state.filters); state.sel = 0; drawScreenTable(); };
    $('#f-ex').addEventListener('change', (e) => set('ex', e.target.value));
    $('#f-sector').addEventListener('change', (e) => set('sector', e.target.value));
    $('#f-trend').addEventListener('change', (e) => set('trend', e.target.value));
    $('#f-adv').addEventListener('input', (e) => set('adv', +e.target.value || 0));
    $('#f-score').addEventListener('input', (e) => set('score', +e.target.value || 0));
    $('#f-q').addEventListener('input', (e) => set('q', e.target.value));
    $('#f-reset').addEventListener('click', () => {
      state.filters = { ex: '', sector: '', adv: 3, score: 0, trend: '', q: '' };
      save.set('filters', state.filters);
      renderScreen();
    });
    $('#f-copy').addEventListener('click', copyCsv);
    $$('.preset').forEach((b) => b.addEventListener('click', () => {
      state.preset = b.dataset.p;
      save.set('preset', state.preset);
      const p = PRESETS.find((x) => x.id === state.preset);
      state.sort = { key: p.sort, dir: p.id === 'wild' ? -1 : -1 };
      state.sel = 0;
      $$('.preset').forEach((x) => x.setAttribute('aria-pressed', x === b));
      drawScreenTable();
    }));
    drawScreenTable();
  }

  function drawScreenTable() {
    const rows = filtered();
    state.list = rows.map((u) => u.s);
    const shown = rows.slice(0, 300);
    $('#f-count').textContent = `${fmt.n(rows.length)} mã` + (rows.length > 300 ? ', hiện 300 mã đầu' : '');
    const box = $('#screen-table');
    if (!rows.length) {
      box.innerHTML = `<p class="empty">Không có mã nào khớp. Hãy nới ngưỡng giá trị giao dịch, Điểm Bền, hoặc chọn góc nhìn khác.</p>`;
      return;
    }
    box.innerHTML = `<table><thead><tr>${COLS.map((c) => {
      const sorted = state.sort.key === c.k;
      const aria = sorted ? ` aria-sort="${state.sort.dir > 0 ? 'ascending' : 'descending'}"` : '';
      return `<th class="${c.cls || ''}"${aria}>${c.nosort ? esc(c.t) : `<button data-k="${c.k}">${esc(c.t)}</button>`}</th>`;
    }).join('')}</tr></thead><tbody>${shown.map((u, i) => `<tr class="go ${i === state.sel ? 'sel' : ''}" data-sym="${esc(u.s)}">${COLS.map((c) => `<td class="${c.cls || ''}">${c.html(u)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
    $$('th button', box).forEach((b) => b.addEventListener('click', () => {
      const k = b.dataset.k;
      state.sort = state.sort.key === k ? { key: k, dir: -state.sort.dir } : { key: k, dir: COLS.find((c) => c.k === k).str && k !== 'sigs' ? 1 : -1 };
      drawScreenTable();
    }));
  }

  function moveSel(step) {
    const rows = $$('#screen-table tbody tr');
    if (!rows.length) return;
    rows[state.sel]?.classList.remove('sel');
    state.sel = Math.max(0, Math.min(rows.length - 1, state.sel + step));
    rows[state.sel].classList.add('sel');
    rows[state.sel].scrollIntoView({ block: 'nearest' });
  }

  async function copyCsv() {
    const head = ['Ma', 'Ten', 'San', 'Nganh', 'Gia', 'PctPhien', 'DiemBen', 'XuHuong', 'ATRpct', 'CachDinh', 'RS', 'GTGD_ty'];
    const lines = filtered().map((u) => [u.s, u.short, u.ex, u.sector, u.px, u.chg, u.score, u.trend, u.atrp, u.dist, u.rs, u.adv].map((x) => `"${String(x ?? '').replace(/"/g, '""')}"`).join(','));
    const text = [head.join(','), ...lines].join('\n');
    try {
      await navigator.clipboard.writeText(text);
      toast(`Đã sao chép ${lines.length} dòng`);
    } catch {
      toast('Trình duyệt chặn sao chép. Hãy thử lại sau khi bấm vào trang.');
    }
  }

  /* ---- màn hình Phân tích mã ---- */
  async function renderSymbol() {
    const sym = state.sym;
    if (!sym) {
      const best = store.universe.filter((u) => u.liquid).sort((a, b) => (b.adv || 0) - (a.adv || 0))[0];
      return go('symbol', best.s);
    }
    view().innerHTML = '<p class="skeleton">Đang tải dữ liệu mã…</p>';
    let data;
    try {
      data = await C.loadSymbol(sym);
      if (state.show.poc) state.thData = await C.loadThong();
    } catch (e) {
      view().innerHTML = `<p class="err">${esc(e.message)}. Hãy thử mã khác.</p>`;
      return;
    }
    if (state.sym !== sym || state.tab !== 'symbol') return;
    const { u, bars } = data;
    const last = bars[bars.length - 1];
    const prev = bars[bars.length - 2] || last;
    const lim = C.priceLimits(u.px, u.ex);
    const inList = state.list.indexOf(sym);
    view().innerHTML = `<div class="view">
      <section class="sym-head" id="ma">
        <div><h1>${esc(u.s)}</h1><div class="sym-sub">${esc(u.ex)} · ${esc(u.sector)}</div></div>
        <div><span class="px num">${fmt.px(u.px)}</span> <span class="num ${toneOf(u.chg)}">${fmt.pct(u.chg, 2)}</span>
          <div class="sym-sub num">Tham chiếu ${fmt.px(u.px)} · Trần <span style="color:var(--ceil)">${fmt.px(lim.ceil)}</span> · Sàn <span style="color:var(--floor)">${fmt.px(lim.floor)}</span></div></div>
        <div class="sym-sub" style="flex:1;min-width:180px">${esc(u.name)}</div>
        <button class="star" id="star" aria-pressed="${!!state.wl[sym]}">${state.wl[sym] ? 'Đang theo dõi' : 'Theo dõi'}</button>
        ${inList >= 0 ? `<div class="seg"><button id="prev-sym" title="Mã trước, phím [">‹ Trước</button><button id="next-sym" title="Mã sau, phím ]">Sau ›</button></div>` : ''}
      </section>
      <p class="verdict" id="ket-luan">${esc(verdictLine(data))}</p>
      <div class="desk">
        <div class="desk-main">
          <section class="card" id="bieu-do">
            <div class="chart-tools">
              <div class="toggles" id="tog-layers">
                ${[['ema', 'EMA 10·20·50·150·200', 'var(--s-e50)'], ['poc', 'POC ba đoạn', 'var(--accent)'], ['ma20', 'MA20', 'var(--s-ma20)'], ['ma50', 'MA50', 'var(--s-ma50)'], ['ma200', 'MA200', 'var(--s-ma200)'], ['bb', 'Bollinger', 'var(--s-ma20)'], ['sr', 'Hỗ trợ, kháng cự', 'var(--muted)'], ['plan', 'Kế hoạch', 'var(--up)'], ['markers', 'Tín hiệu', 'var(--accent)'], ['profile', 'Khối lượng theo giá', 'var(--profile)']]
    .map(([k, l, c]) => `<button class="tog" data-k="${k}" aria-pressed="${!!state.show[k]}" style="--c:${c}"><i></i>${l}</button>`).join('')}
              </div>
              <div class="toggles">
                <div class="seg" id="tf" role="group" aria-label="Khung thời gian"><button data-t="d" aria-pressed="${state.tf === 'd'}">Ngày</button><button data-t="w" aria-pressed="${state.tf === 'w'}">Tuần</button></div>
                <div class="seg" id="panes" role="group" aria-label="Khung phụ">${[['volume', 'KL'], ['rsi', 'RSI'], ['macd', 'MACD'], ['rs', 'RS']].map(([k, l]) => `<button data-k="${k}" aria-pressed="${state.panes.includes(k)}">${l}</button>`).join('')}</div>
              </div>
            </div>
            <div class="legend" id="ema-legend" ${state.show.ema ? '' : 'hidden'}>${[['EMA10', '--s-e10'], ['EMA20', '--s-e20'], ['EMA50', '--s-e50'], ['EMA150', '--s-e150'], ['EMA200', '--s-e200']].map(([n, c]) => `<span><i style="background:var(${c})"></i>${n}</span>`).join('')}</div>
            <div class="readout num" id="readout"></div>
            <div class="chart-host" id="chart" aria-label="Biểu đồ giá ${esc(u.s)}"></div>
            <p class="note" style="margin-top:6px">Giá đã điều chỉnh, đơn vị nghìn đồng. Kéo để cuộn, lăn chuột để phóng to, nhấp đúp để về mặc định. Nến tím chạm trần, nến xanh lơ chạm sàn.</p>
          </section>
          <section class="card" id="lich-su">
            <div class="card-head"><h2>Tín hiệu đã xuất hiện trên mã này</h2><span class="note">Kết quả theo cùng quy tắc mô phỏng</span></div>
            <div class="table-wrap" style="max-height:280px">${eventTable(data)}</div>
          </section>
          <section class="card" id="cung-nganh">
            <div class="card-head"><h2>So với cùng ngành</h2><span class="note">${esc(u.sector)}, mã đủ thanh khoản</span></div>
            <div class="table-wrap" style="max-height:300px">${peerTable(u)}</div>
          </section>
          <details class="card"><summary>Bảng giá 15 phiên gần nhất</summary><div class="table-wrap" style="margin-top:8px">${priceTable(bars)}</div></details>
        </div>
        <aside class="desk-side">
          ${readPanel(data)}
          ${planPanel(u)}
          ${rangePanel(u)}
          ${levelsPanel(data)}
        </aside>
      </div>
      <p class="foot">Kế hoạch là phép tính theo quy tắc và số bạn nhập, không phải khuyến nghị mua bán. Ngày bán sớm nhất chưa trừ ngày nghỉ lễ.</p>
    </div>`;
    bindSymbol(data);
  }

  function readPanel({ u, events, scores }) {
    const R = store.report;
    const q = C.quintileOf(u.score);
    const qs = q ? R.quintiles[q - 1] : null;
    const recent = [...events].reverse().find((e) => e.gi >= store.market.dates.length - 4);
    const s = recent ? C.setup(recent.key) : null;
    const liqTone = u.adv >= 10 ? 'good' : u.adv >= 3 ? 'warn' : 'bad';
    const liqText = u.adv >= 10 ? 'Dễ giao dịch' : u.adv >= 3 ? 'Vừa phải' : 'Rất mỏng';
    const dScore = isNum(u.score) && isNum(u.score5) ? u.score - u.score5 : null;
    const extTone = u.ext > 4 ? 'bad' : u.ext > 2.5 ? 'warn' : '';
    return `<section class="card" id="doc-nhanh"><div class="card-head"><h2>Đọc nhanh</h2></div>
      ${isNum(u.score) ? `<div class="score-big"><span class="n">${fmt.n(u.score)}</span><div style="flex:1">
        <div class="note">Điểm Bền, nhóm ${q}/5${dScore != null ? ` · ${signed(dScore)} sau 5 phiên` : ''}</div>
        <div class="q-track" aria-hidden="true">${[1, 2, 3, 4, 5].map((i) => `<i class="${i === q ? 'on' : ''}"></i>`).join('')}</div>
        ${scoreTrail(scores)}</div></div>
        <p class="note" style="margin-bottom:6px">Lịch sử nhóm này: ${fmt.pctAbs(qs.win20, 0)} số lần có lãi sau 20 phiên, ${fmt.pct(qs.ex20)} so với thị trường. Ổn định ${fmt.n(u.stab)}/100, vị thế so với đỉnh ${fmt.n(u.pos52)}/100.</p>`
    : `<p class="alert warn" style="margin-bottom:8px">${ICON.warn}<span>Thanh khoản dưới ${fmt.n(R.minAdv)} tỷ/phiên nên mã này không được chấm Điểm Bền. Các chỉ báo kém tin cậy.</span></p>`}
      <div class="status-list">
        <div class="status-row"><span>Xu hướng</span><span class="v">${trendChip(u.trend)}<span class="d">${trendNote(u)}</span></span></div>
        <div class="status-row"><span>Biến động</span><span class="v num">${fmt.pctAbs(u.atrp)}/phiên<span class="d" style="font-family:var(--font-body)">ATR ${fmt.px(u.atr)} nghìn đồng, giá dao động bình thường trong khoảng này</span></span></div>
        <div class="status-row"><span>Thanh khoản</span><span class="v">${chip(liqText, liqTone)}<span class="d">${fmt.ty(u.adv)}/phiên, phiên cuối ${isNum(u.volr) ? fmt.n(u.volr, 1) + ' lần TB' : '–'}</span></span></div>
        <div class="status-row"><span>Đà giá</span><span class="v">RSI <span class="num">${fmt.n(u.rsi)}</span>${u.ext != null ? ` · <span class="${extTone === 'bad' ? 'down' : ''}">cách MA20 <span class="num">${fmt.n(u.ext, 1)}</span> ATR</span>` : ''}<span class="d">${rsiNote(u)}</span></span></div>
        <div class="status-row"><span>Tín hiệu</span><span class="v">${s ? `${esc(s.name)} ${u.score >= 60 ? evChip(s.highScore) : evChip(s.all, s.late)}<span class="d">${fmt.day(recent.date)}. ${esc(evidenceSentence(s, u))}</span>` : '<span class="muted">Không có tín hiệu trong 3 phiên</span>'}</span></div>
      </div></section>`;
  }

  function scoreTrail(scores) {
    const v = (scores || []).filter(isNum);
    if (v.length < 20) return '';
    const w = 200, h = 24, d = v.map((x, i) => (i ? 'L' : 'M') + (i / (v.length - 1) * w).toFixed(1) + ' ' + ((100 - x) / 100 * (h - 2) + 1).toFixed(1)).join('');
    return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" style="width:100%;height:24px;display:block;margin-top:5px" role="img" aria-label="Điểm Bền trong 260 phiên"><line x1="0" x2="${w}" y1="${h / 2}" y2="${h / 2}" stroke="var(--grid)"/><path d="${d}" fill="none" stroke="var(--fg-2)" stroke-width="1.5" vector-effect="non-scaling-stroke"/></svg>`;
  }

  /* Một câu kết luận viết bằng lời, ghép từ cùng những con số hiển thị bên dưới. */
  function verdictLine({ u, events, levels }) {
    const parts = [];
    if (!u.liquid) {
      return `${u.s} có thanh khoản ${fmt.ty(u.adv)}/phiên, dưới ngưỡng ${fmt.n(store.report.minAdv)} tỷ. Chỉ báo kém tin cậy và khó thoát lệnh, nên xem đây là mã tham khảo.`;
    }
    const q = C.quintileOf(u.score);
    const trendWord = { strong: 'xu hướng tăng mạnh', up: 'xu hướng tăng', side: 'đi ngang', down: 'xu hướng giảm', new: 'chưa đủ lịch sử xu hướng' }[u.trend];
    const quality = q >= 4 ? 'Mã bền' : q === 3 ? 'Mã độ bền trung bình' : 'Mã kém bền';
    parts.push(`${quality}, ${trendWord}`);
    const recent = [...events].reverse().find((e) => e.gi >= store.market.dates.length - 4);
    const sig = recent ? C.setup(recent.key) : null;
    if (sig) {
      const lb = C.evidenceLabel(u.score >= 60 ? sig.highScore : sig.all, u.score >= 60 ? null : sig.late);
      parts.push(`vừa có tín hiệu ${sig.name} (${lb.text.toLowerCase()})`);
    }
    if (u.dist != null && u.dist > -0.05) parts.push(`cách đỉnh 52 tuần ${fmt.pctAbs(-u.dist)}`);
    else if (u.dist != null && u.dist < -0.35) parts.push(`đã giảm ${fmt.pctAbs(-u.dist, 0)} từ đỉnh`);
    let s = parts.join(', ') + '.';
    const res = levels.filter((l) => l.kind === 'res').sort((a, b) => a.price - b.price)[0];
    const sup = levels.filter((l) => l.kind === 'sup').sort((a, b) => b.price - a.price)[0];
    if (sup && res) s += ` Hỗ trợ gần nhất ${fmt.px(sup.price)} (${fmt.pct(sup.price / u.px - 1)}), kháng cự ${fmt.px(res.price)} (${fmt.pct(res.price / u.px - 1)}).`;
    if (u.ext > 4) s += ' Giá đang quá xa MA20, mua đuổi có rủi ro cao.';
    return s;
  }

  function trendNote(u) {
    return { strong: 'Giá trên MA50, MA50 trên MA200, MA200 đang lên', up: 'Giá và MA50 đều trên MA200', side: 'Các đường trung bình chưa xếp thành xu hướng', down: 'Giá dưới MA50, MA50 dưới MA200', new: 'Chưa đủ 200 phiên để xác định' }[u.trend] || '';
  }
  function rsiNote(u) {
    if (!isNum(u.rsi)) return '';
    if (u.rsi >= 75) return 'Đang nóng, dễ rung lắc';
    if (u.rsi <= 30) return 'Đang quá bán';
    return u.rsi >= 50 ? 'Đà dương vừa phải' : 'Đà yếu';
  }
  function evidenceSentence(s, u) {
    const hs = u.score >= 60 ? s.highScore : s.all;
    const label = u.score >= 60 ? 'Ở mã điểm từ 60' : 'Toàn thị trường';
    return `${label}: ${fmt.n(hs.n)} lệnh, thắng ${fmt.pctAbs(hs.win, 0)}, kỳ vọng ${fmt.r(hs.exp)}.`;
  }

  function planPanel(u) {
    const p = state.planIn;
    return `<section class="card" id="ke-hoach"><div class="card-head"><h2>Kế hoạch và khối lượng</h2></div>
      <div class="form-grid">
        <label class="field">Vốn (triệu đồng)<input id="p-capital" type="number" min="1" step="50" value="${p.capital}" inputmode="decimal"></label>
        <label class="field">Rủi ro mỗi lệnh (%)<input id="p-risk" type="number" min="0.1" max="10" step="0.25" value="${p.riskPct}" inputmode="decimal"></label>
        <label class="field">Giá vào (nghìn đồng)<input id="p-entry" type="number" min="0" step="0.05" value="${u.px}" inputmode="decimal"></label>
        <label class="field">Cắt lỗ cách<select id="p-k">${[1.5, 2, 2.5, 3, 4].map((k) => `<option value="${k}" ${p.k === k ? 'selected' : ''}>${fmt.n(k, 1)} ATR</option>`).join('')}</select></label>
        <label class="field">Chốt lời ở<select id="p-tr">${[1, 1.5, 2, 3].map((k) => `<option value="${k}" ${p.targetR === k ? 'selected' : ''}>${fmt.n(k, 1)}R</option>`).join('')}</select></label>
      </div><div id="plan-out" aria-live="polite"></div></section>`;
  }

  function currentPlan(u) {
    const entry = +($('#p-entry')?.value) || u.px;
    return C.plan(u, { ...state.planIn, entry });
  }

  function drawPlan(u) {
    const box = $('#plan-out');
    if (!box) return;
    const p = currentPlan(u);
    if (!p) {
      box.innerHTML = '<p class="empty">Giá vào hoặc ATR chưa hợp lệ, hoặc mức cắt lỗ thấp hơn 0. Hãy giảm khoảng cắt lỗ.</p>';
      return;
    }
    const days = C.settleDate(store.market.dates[store.market.dates.length - 1]);
    const alerts = [];
    if (p.shares < 100) alerts.push(['bad', `Rủi ro cho phép chưa đủ mua một lô 100 cổ phiếu. Cần tăng vốn, tăng % rủi ro, hoặc thu hẹp cắt lỗ.`]);
    if (p.cappedByCash) alerts.push(['warn', 'Khối lượng bị giới hạn bởi vốn, rủi ro thực tế thấp hơn mức bạn đặt.']);
    if (p.advShare > 0.1) alerts.push(['bad', `Lệnh bằng ${fmt.pctAbs(p.advShare, 0)} giá trị giao dịch một phiên, có thể khó khớp và trượt giá.`]);
    if (u.adv < 3) alerts.push(['bad', 'Thanh khoản rất mỏng, giá cắt lỗ có thể không khớp được.']);
    if (p.hit >= 0.5) alerts.push(['warn', `Khoảng cắt lỗ này hẹp: lịch sử cho thấy ${fmt.pctAbs(p.hit, 0)} trường hợp bị chạm trong 20 phiên.`]);
    if (p.stop < p.lim.floor) alerts.push(['warn', `Mức cắt lỗ thấp hơn giá sàn phiên tới (${fmt.px(p.lim.floor)}), cần hơn một phiên mới chạm.`]);
    const up = (store.decoded.get(u.s)?.levels || []).find((l) => l.kind === 'res' && l.price > p.entry);
    if (up && up.price < p.target) alerts.push(['warn', `Kháng cự ${fmt.px(up.price)} nằm trước mục tiêu, giá có thể bị chặn ở đó.`]);
    box.innerHTML = `<div class="plan-out">
      <div><span class="lb">Cắt lỗ</span><span class="vl num down">${fmt.px(p.stop)}</span> <span class="muted num">${fmt.pct(-p.stopPct)}</span></div>
      <div><span class="lb">Mục tiêu</span><span class="vl num up">${fmt.px(p.target)}</span> <span class="muted num">${fmt.pct(p.targetPct)}</span></div>
      <div><span class="lb">Khối lượng</span><span class="vl num">${fmt.n(p.shares)}</span> <span class="muted">cp</span></div>
      <div><span class="lb">Giá trị lệnh</span><span class="vl num">${fmt.vnd(p.value)}</span> <span class="muted num">${fmt.pctAbs(p.pctCapital, 0)}</span></div>
      <div><span class="lb">Lỗ nếu chạm cắt lỗ</span><span class="vl num down">−${fmt.vnd(p.loss)}</span></div>
      <div><span class="lb">Lãi nếu đạt mục tiêu</span><span class="vl num up">+${fmt.vnd(p.gain)}</span></div>
      <div class="wide"><span class="lb">Chạm cắt lỗ trong 20 phiên, theo lịch sử toàn thị trường</span><span class="vl num">${fmt.pctAbs(p.hit, 0)}</span></div>
      <div class="wide"><span class="lb">Mua phiên ${fmt.day(days.buy)}, bán được sớm nhất</span><span class="vl num">${fmt.day(days.sell)}</span> <span class="muted">chiều T+2</span></div>
    </div>
    <div class="alerts">${alerts.map(([t, m]) => `<div class="alert ${t}">${ICON.warn}<span>${esc(m)}</span></div>`).join('')}</div>`;
    if (state.chart) {
      state.chart.layers.plan = { entry: p.entry, stop: p.stop, target: p.target };
      state.chart.draw();
    }
  }

  function rangePanel(u) {
    const cone = store.report.cone;
    if (!isNum(u.atrp)) return '';
    const rows = ['5', '10', '20'].map((h) => {
      const z = cone[h];
      const s = u.atrp * Math.sqrt(+h);
      return { h, lo: u.px * (1 + z.p10 * s), mid: u.px * (1 + z.p50 * s), hi: u.px * (1 + z.p90 * s) };
    });
    const min = rows[2].lo, max = rows[2].hi;
    const x = (v) => (v - min) / (max - min || 1) * 100;
    return `<section class="card" id="dai-gia"><div class="card-head"><h2>Dải giá có thể đi tới</h2></div>
      <p class="note" style="margin-bottom:4px">8 trên 10 lần, giá đóng cửa nằm trong dải này. Kiểm tra độc lập trên 250 phiên gần nhất: phủ ${fmt.pctAbs(cone['20'].coverage, 0)} ở 20 phiên.</p>
      ${rows.map((r) => `<div class="range-row"><span class="muted">${r.h} phiên</span><div>
        <div class="range-bar" aria-hidden="true"><span class="rail"></span><span class="fill" style="left:${x(r.lo)}%;width:${x(r.hi) - x(r.lo)}%"></span><span class="now" style="left:${x(u.px)}%"></span></div>
        <div class="range-vals num"><span>${fmt.px(r.lo)}</span><span>${fmt.px(r.hi)}</span></div></div></div>`).join('')}
    </section>`;
  }

  function levelsPanel({ u, levels }) {
    const res = levels.filter((l) => l.kind === 'res').sort((a, b) => b.price - a.price);
    const sup = levels.filter((l) => l.kind === 'sup').sort((a, b) => b.price - a.price);
    const row = (l) => `<div class="level-row"><span class="num ${l.kind === 'res' ? 'down' : 'up'}">${fmt.px(l.price)}</span><span class="dots">${l.touches} lần chạm, gần nhất ${fmt.dayShort(store.market.dates[l.last])}</span><span class="num muted">${fmt.pct(l.price / u.px - 1)}</span></div>`;
    return `<section class="card" id="muc-gia"><div class="card-head"><h2>Mức giá quan trọng</h2></div>
      ${levels.length ? `${res.map(row).join('')}<div class="level-row nowline"><span class="num">${fmt.px(u.px)}</span><span>Giá hiện tại</span><span></span></div>${sup.map(row).join('')}` : '<p class="empty">Chưa đủ dữ liệu để xác định.</p>'}
      <p class="note" style="margin-top:6px">Tính từ các đỉnh và đáy cục bộ trong 250 phiên. Càng nhiều lần chạm, mức càng đáng chú ý.</p></section>`;
  }

  function eventTable({ events }) {
    const rows = [...events].reverse().slice(0, 40);
    if (!rows.length) return '<p class="empty">Chưa có tín hiệu nào khi mã này đủ thanh khoản.</p>';
    const why = { stop: 'Chạm cắt lỗ', target: 'Đạt mục tiêu', time: 'Hết 20 phiên', open: 'Đang diễn ra' };
    return `<table><thead><tr><th class="l">Ngày</th><th class="l">Tín hiệu</th><th class="l">Kết thúc</th><th>Kết quả</th></tr></thead><tbody>
      ${rows.map((e) => `<tr><td class="l num">${fmt.day(e.date)}</td><td class="l">${esc(C.setup(e.key)?.name || e.key)}</td><td class="l">${why[e.why] || '–'}</td><td class="num ${toneOf(e.r)}">${e.r == null ? '–' : fmt.r(e.r, 1)}</td></tr>`).join('')}
      </tbody></table>`;
  }

  function peerTable(u) {
    const peers = store.universe.filter((x) => x.sector === u.sector && (x.liquid || x.s === u.s)).sort((a, b) => (b.score ?? -1) - (a.score ?? -1)).slice(0, 12);
    return `<table><thead><tr><th class="l">Mã</th><th>Giá</th><th>% phiên</th><th>Điểm Bền</th><th class="l">Xu hướng</th><th>ATR %</th><th>20 phiên</th><th>60 phiên</th></tr></thead><tbody>
      ${peers.map((p) => `<tr class="go ${p.s === u.s ? 'sel' : ''}" data-sym="${esc(p.s)}"><td class="l"><b>${esc(p.s)}</b></td><td class="num">${fmt.px(p.px)}</td><td class="num ${toneOf(p.chg)}">${fmt.pct(p.chg)}</td><td>${scoreBar(p.score)}</td><td class="l">${trendChip(p.trend)}</td><td class="num">${fmt.pctAbs(p.atrp)}</td><td class="num ${toneOf(p.r20)}">${fmt.pct(p.r20)}</td><td class="num ${toneOf(p.r60)}">${fmt.pct(p.r60)}</td></tr>`).join('')}
      </tbody></table>`;
  }

  function priceTable(bars) {
    const rows = bars.slice(-15).reverse();
    return `<table><thead><tr><th class="l">Ngày</th><th>Mở</th><th>Cao</th><th>Thấp</th><th>Đóng</th><th>Khối lượng</th></tr></thead><tbody>${rows.map((b) => `<tr><td class="l num">${fmt.day(b.t)}</td><td class="num">${fmt.px(b.o)}</td><td class="num">${fmt.px(b.h)}</td><td class="num">${fmt.px(b.l)}</td><td class="num">${fmt.px(b.c)}</td><td class="num">${fmt.n(b.v)}</td></tr>`).join('')}</tbody></table>`;
  }

  /* Ba đoạn POC vẽ đúng vị trí trên trục thời gian. Khung tuần gộp nến nên không vẽ. */
  function pocSegments(u, bars) {
    if (state.tf !== 'd' || !state.thData) return null;
    const w = state.th.window;
    const m = state.thData.rows[u.s]?.w[String(w)];
    if (!m) return null;
    const n = store.market.dates.length;
    const at = (gi) => bars.findIndex((b) => b.gi >= gi);
    return [[m[4], n - 3 * w, n - 2 * w - 1], [m[5], n - 2 * w, n - w - 1], [m[6], n - w, n - 1]]
      .filter(([p]) => isNum(p)).map(([price, g0, g1]) => ({ price, a: Math.max(0, at(g0)), b: at(g1) < 0 ? bars.length - 1 : at(g1) }));
  }

  function setChartData(data) {
    const u = data.u;
    const bars = state.tf === 'w' ? C.weekly(data.bars) : data.bars;
    const series = C.buildSeries(bars);
    state.series = series;
    state.bars = bars;
    const byGi = new Map(bars.map((b, i) => [b.gi, i]));
    let markers;
    if (state.tf === 'd') markers = data.events.map((e) => ({ i: e.t, side: C.setup(e.key)?.side === 'risk' ? 'risk' : 'long', key: e.key }));
    else {
      markers = data.events.map((e) => {
        const i = bars.findIndex((b) => b.gi >= e.gi);
        return { i, side: C.setup(e.key)?.side === 'risk' ? 'risk' : 'long', key: e.key };
      }).filter((m) => m.i >= 0);
    }
    state.chart.show = state.show;
    state.chart.panes = state.panes;
    const p = currentPlan(u);
    state.chart.setData(bars, series, {
      sr: data.levels, markers, profile: C.volumeProfile(bars, state.tf === 'w' ? 40 : 120),
      plan: p ? { entry: p.entry, stop: p.stop, target: p.target } : null, poc: pocSegments(u, bars),
    });
    state.markersAt = new Map();
    markers.forEach((m) => { state.markersAt.set(m.i, [...(state.markersAt.get(m.i) || []), m.key]); });
    state.byGi = byGi;
    updateReadout(null);
  }

  function updateReadout(i) {
    const el = $('#readout');
    const bars = state.bars;
    if (!el || !bars) return;
    const k = i == null ? bars.length - 1 : i;
    const b = bars[k], p = bars[k - 1] || b, s = state.series;
    const ch = b.c / p.c - 1;
    const pick = (a) => (a && a[k] != null ? fmt.px(a[k]) : '–');
    const sig = (state.markersAt?.get(k) || []).map((x) => C.setup(x)?.name).filter(Boolean).join(', ');
    el.innerHTML = `<span>${fmt.day(b.t)}</span><span>Mở <b>${fmt.px(b.o)}</b></span><span>Cao <b>${fmt.px(b.h)}</b></span><span>Thấp <b>${fmt.px(b.l)}</b></span><span>Đóng <b class="${toneOf(ch)}">${fmt.px(b.c)}</b></span><span class="${toneOf(ch)}">${fmt.pct(ch, 2)}</span><span>KL <b>${fmt.n(b.v)}</b></span><span>MA50 <b>${pick(s.ma50)}</b></span><span>RSI <b>${s.rsi[k] != null ? fmt.n(s.rsi[k], 1) : '–'}</b></span>${sig ? `<span class="sg" style="font-family:var(--font-body)">${esc(sig)}</span>` : ''}`;
  }

  function bindSymbol(data) {
    const u = data.u;
    if (state.chart) state.chart.destroy();
    state.chart = new window.StockChart($('#chart'), { onHover: updateReadout });
    setChartData(data);
    drawPlan(u);
    $('#star').addEventListener('click', (e) => {
      const on = !state.wl[u.s];
      if (on) state.wl[u.s] = {}; else delete state.wl[u.s];
      save.set('wl', state.wl);
      e.currentTarget.setAttribute('aria-pressed', on);
      e.currentTarget.textContent = on ? 'Đang theo dõi' : 'Theo dõi';
      toast(on ? `Đã thêm ${u.s} vào danh sách` : `Đã bỏ ${u.s} khỏi danh sách`);
    });
    $$('#tog-layers .tog').forEach((b) => b.addEventListener('click', async () => {
      const k = b.dataset.k;
      state.show[k] = !state.show[k];
      b.setAttribute('aria-pressed', state.show[k]);
      save.set('show', state.show);
      state.chart.show = state.show;
      $('#ema-legend').hidden = !state.show.ema;
      if (k === 'poc' && state.show.poc && !state.thData) {
        state.thData = await C.loadThong();
        state.chart.layers.poc = pocSegments(u, state.bars);
      }
      state.chart.draw();
    }));
    $$('#tf button').forEach((b) => b.addEventListener('click', () => {
      state.tf = b.dataset.t;
      $$('#tf button').forEach((x) => x.setAttribute('aria-pressed', x === b));
      setChartData(data);
    }));
    $$('#panes button').forEach((b) => b.addEventListener('click', () => {
      const k = b.dataset.k;
      state.panes = state.panes.includes(k) ? state.panes.filter((x) => x !== k) : [...state.panes, k].slice(-3);
      save.set('panes', state.panes);
      $$('#panes button').forEach((x) => x.setAttribute('aria-pressed', state.panes.includes(x.dataset.k)));
      state.chart.panes = state.panes;
      state.chart.draw();
    }));
    const onPlan = () => {
      state.planIn = {
        capital: Math.max(0, +$('#p-capital').value || 0), riskPct: Math.max(0, +$('#p-risk').value || 0),
        k: +$('#p-k').value, targetR: +$('#p-tr').value,
      };
      save.set('plan', state.planIn);
      drawPlan(u);
    };
    ['#p-capital', '#p-risk', '#p-entry'].forEach((q) => $(q).addEventListener('input', onPlan));
    ['#p-k', '#p-tr'].forEach((q) => $(q).addEventListener('change', onPlan));
    $('#prev-sym')?.addEventListener('click', () => stepSymbol(-1));
    $('#next-sym')?.addEventListener('click', () => stepSymbol(1));
  }

  function stepSymbol(d) {
    const i = state.list.indexOf(state.sym);
    if (i < 0) return;
    const next = state.list[Math.max(0, Math.min(state.list.length - 1, i + d))];
    if (next !== state.sym) go('symbol', next);
  }

  /* ---- màn hình Phân tích của Thông ---- */
  const TH_RULES = [
    { t: 'EMA xếp tầng', d: 'Giá > EMA10 > EMA20 > EMA50 > EMA150 > EMA200' },
    { t: 'RSI trên 50', d: 'RSI 14 phiên lớn hơn 50' },
    { t: 'EMA chưa giãn', d: 'EMA50 cách EMA150 và EMA200 dưới 20%' },
    { t: 'Nền tích lũy', d: 'Đi ngang biên hẹp, biên co lại, khối lượng cạn dần, thấp hơn khi về gần hỗ trợ' },
    { t: 'POC tăng dần', d: 'Giá có khối lượng lớn nhất tăng qua 3 đoạn liên tiếp' },
  ];

  const mark = (ok, text) => `<span class="mk ${ok ? 'yes' : 'no'}">${ok ? ICON.check : ICON.x}<span class="num">${esc(text)}</span></span>`;

  function thongRows() {
    const o = state.th;
    const q = fold(o.q.trim());
    const rows = [];
    for (const u of store.universe) {
      if ((u.adv || 0) < o.adv || (o.ex && u.ex !== o.ex) || (o.sector && u.sector !== o.sector) || (q && !u.key.includes(q))) continue;
      const r = C.evalThong(u, state.thData.rows[u.s], { window: o.window, maxRange: o.maxRange }, state.thData);
      if (r.count < o.minPass || o.req.some((i) => !r.pass[i])) continue;
      rows.push({ u, r });
    }
    const { key, dir } = state.thSort;
    const val = ({ u, r }) => ({ count: r.count, s: u.s, px: u.px, chg: u.chg, rsi: u.rsi, spread: r.s150, range: r.base?.range, score: u.score, adv: u.adv }[key]);
    rows.sort((a, b) => {
      const x = val(a), y = val(b);
      const bad = (v) => v == null || (typeof v === 'number' && !isNum(v));
      if (bad(x)) return bad(y) ? 0 : 1;
      if (bad(y)) return -1;
      const c = typeof x === 'string' ? x.localeCompare(y) : x - y;
      return (c * dir) || (b.u.adv || 0) - (a.u.adv || 0);
    });
    return rows;
  }

  async function renderThong() {
    view().innerHTML = '<p class="skeleton">Đang tính 5 tiêu chí cho toàn bộ mã…</p>';
    try {
      state.thData = await C.loadThong();
    } catch (e) {
      view().innerHTML = `<p class="err">${esc(e.message)}. Hãy tải lại trang.</p>`;
      return;
    }
    if (state.tab !== 'thong') return;
    const o = state.th, R = store.report;
    const sectors = [...new Set(store.universe.map((u) => u.sector))].filter(Boolean).sort((a, b) => a.localeCompare(b, 'vi'));
    const row5 = R.setups.find((s) => s.key === 'thong'), row4 = R.setups.find((s) => s.key === 'thong4');
    const rand = R.setups.find((s) => s.key === 'random');
    const alt = R.thongAlt;
    const evRow = (name, a, b) => `<tr><td class="l">${esc(name)}</td><td class="num">${fmt.n(a.n)}</td><td class="num">${fmt.pctAbs(a.win, 0)}</td><td class="num ${toneOf(a.exp)}">${fmt.r(a.exp)}</td><td class="num ${toneOf(a.ret)}">${fmt.pct(a.ret)}</td>
      <td class="num">${fmt.n(b.n)}</td><td class="num">${fmt.pctAbs(b.win, 0)}</td><td class="num ${toneOf(b.exp)}">${fmt.r(b.exp)}</td><td class="num ${toneOf(b.ret)}">${fmt.pct(b.ret)}</td></tr>`;
    view().innerHTML = `<div class="view">
      <section class="lede" id="thong-tom-tat"><h1 id="th-title">–</h1><p id="th-sub"></p></section>
      <section class="card" id="thong-bo-loc">
        <div class="th-rules" id="th-rules" role="group" aria-label="Bấm để bắt buộc tiêu chí">
          ${TH_RULES.map((r, i) => `<button class="th-rule" data-i="${i}" aria-pressed="${o.req.includes(i)}"><span class="t">${i + 1}. ${esc(r.t)}</span><span class="c num" id="th-c${i}">–</span><span class="d">${esc(r.d)}</span></button>`).join('')}
        </div>
        <div class="filters">
          <label>Độ dài mỗi đoạn <select id="th-window">${state.thData.windows.map((w) => `<option value="${w}" ${o.window === w ? 'selected' : ''}>${w} phiên</option>`).join('')}</select></label>
          <label>Biên nền tối đa <input id="th-range" type="number" min="5" max="40" step="1" value="${o.maxRange}"> %</label>
          <label>Đạt tối thiểu <select id="th-min">${[0, 1, 2, 3, 4, 5].map((n) => `<option value="${n}" ${o.minPass === n ? 'selected' : ''}>${n} tiêu chí</option>`).join('')}</select></label>
          <label>Sàn <select id="th-ex"><option value="">Tất cả</option>${['HOSE', 'HNX', 'UPCOM'].map((x) => `<option ${o.ex === x ? 'selected' : ''}>${x}</option>`).join('')}</select></label>
          <label>Ngành <select id="th-sector"><option value="">Tất cả</option>${sectors.map((x) => `<option ${o.sector === x ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></label>
          <label>GTGD từ <input id="th-adv" type="number" min="0" step="1" value="${o.adv}"> tỷ</label>
          <label><input id="th-q" type="search" placeholder="Lọc theo mã, tên" value="${esc(o.q)}"></label>
          <button class="icon-btn" id="th-reset">Đặt lại</button>
          <span class="note" id="th-count" aria-live="polite"></span>
        </div>
        <div class="table-wrap" id="th-table" tabindex="0"></div>
        <p class="note" style="margin-top:8px">Bấm thẻ tiêu chí để bắt buộc phải đạt. Bấm một dòng để mở biểu đồ với 5 đường EMA và 3 đoạn POC. Mỗi đoạn là một khoảng cố định liền nhau tính ngược từ phiên cuối.</p>
      </section>
      <section class="card" id="thong-bang-chung">
        <div class="card-head"><h2>Bộ lọc này từng hiệu quả ra sao</h2><span>${evChip(row5.all, row5.late)}</span></div>
        <div class="table-wrap ev-table" style="max-height:none"><table><thead>
          <tr><th class="l"></th><th colspan="4">Giữ ngắn: ${fmt.n(R.stopAtr)} ATR, ${fmt.n(R.targetR)}R, ${R.hold} phiên</th><th colspan="4">Giữ dài: ${alt.stop} ATR, ${alt.target}R, ${alt.hold} phiên</th></tr>
          <tr><th class="l">Mẫu</th><th>Lệnh</th><th>Thắng</th><th>Kỳ vọng</th><th>Lãi TB</th><th>Lệnh</th><th>Thắng</th><th>Kỳ vọng</th><th>Lãi TB</th></tr></thead><tbody>
          ${evRow('Đủ 5 tiêu chí', row5.all, alt.thong)}${evRow('4 tiêu chí đầu', row4.all, alt.thong4)}${evRow('Vào lệnh ngẫu nhiên', rand.all, alt.random)}
        </tbody></table></div>
        <p class="note" style="margin-top:8px">Mô phỏng với mã đủ thanh khoản, đoạn ${state.thData.default} phiên, biên nền ${fmt.n(state.thData.maxRange * 100)}%, đã trừ phí. Vượt ngẫu nhiên ở mức ${fmt.r(row5.all.lift)} (khoảng 90%: ${fmt.n(row5.all.liftLo, 2)} … ${fmt.n(row5.all.liftHi, 2)}), tức chưa tách được khỏi may rủi. Đây là cách diễn giải theo quy tắc của phương pháp Wyckoff, không thay được việc đọc biểu đồ bằng mắt.</p>
      </section>
    </div>`;
    const set = (k, v) => { state.th[k] = v; save.set('th', state.th); drawThong(); };
    $('#th-window').addEventListener('change', (e) => set('window', +e.target.value));
    $('#th-range').addEventListener('input', (e) => set('maxRange', +e.target.value || 0));
    $('#th-min').addEventListener('change', (e) => set('minPass', +e.target.value));
    $('#th-ex').addEventListener('change', (e) => set('ex', e.target.value));
    $('#th-sector').addEventListener('change', (e) => set('sector', e.target.value));
    $('#th-adv').addEventListener('input', (e) => set('adv', +e.target.value || 0));
    $('#th-q').addEventListener('input', (e) => set('q', e.target.value));
    $('#th-reset').addEventListener('click', () => { state.th = thDefaults(); save.set('th', state.th); renderThong(); });
    $$('.th-rule').forEach((b) => b.addEventListener('click', () => {
      const i = +b.dataset.i;
      state.th.req = state.th.req.includes(i) ? state.th.req.filter((x) => x !== i) : [...state.th.req, i];
      b.setAttribute('aria-pressed', state.th.req.includes(i));
      save.set('th', state.th);
      drawThong();
    }));
    drawThong();
  }

  function drawThong() {
    const o = state.th;
    const opt = { window: o.window, maxRange: o.maxRange };
    // đếm trên toàn thị trường, không phụ thuộc bộ lọc hiển thị
    const counts = [0, 0, 0, 0, 0];
    let five = 0, four = 0, fiveLiquid = 0;
    for (const u of store.universe) {
      const r = C.evalThong(u, state.thData.rows[u.s], opt, state.thData);
      r.pass.forEach((p, i) => { if (p) counts[i]++; });
      if (r.count === 5) { five++; if (u.liquid) fiveLiquid++; }
      if (r.count === 4) four++;
    }
    counts.forEach((c, i) => { $('#th-c' + i).textContent = fmt.n(c) + ' mã'; });
    $('#th-title').textContent = five ? `${five} mã đạt đủ 5 tiêu chí` : 'Chưa có mã nào đạt đủ 5 tiêu chí';
    $('#th-sub').textContent = `${fmt.n(four)} mã đạt 4 tiêu chí, ${fmt.n(store.universe.length)} mã được chấm. ${five ? `Trong số đạt đủ, ${fiveLiquid} mã có thanh khoản từ ${fmt.n(store.report.minAdv)} tỷ/phiên.` : ''}`;
    const rows = thongRows();
    state.list = rows.map((x) => x.u.s);
    $('#th-count').textContent = `Hiện ${fmt.n(rows.length)} mã`;
    const box = $('#th-table');
    if (!rows.length) {
      box.innerHTML = '<p class="empty">Không có mã nào khớp. Hãy bỏ bớt tiêu chí bắt buộc, giảm số tiêu chí tối thiểu, hoặc nới biên nền.</p>';
      return;
    }
    const heads = [['s', 'Mã', 'l'], ['px', 'Giá'], ['chg', '% phiên'], ['count', 'Đạt', 'l'], [null, '1. EMA', 'l'], ['rsi', '2. RSI', 'l'], ['spread', '3. Cách EMA150, 200', 'l'], ['range', '4. Biên nền, KL', 'l'], [null, '5. POC ba đoạn', 'l'], ['score', 'Điểm Bền'], ['adv', 'GTGD TB 20p']];
    const sortKey = state.thSort.key;
    box.innerHTML = `<table><thead><tr>${heads.map(([k, t, c]) => {
      const aria = k === sortKey ? ` aria-sort="${state.thSort.dir > 0 ? 'ascending' : 'descending'}"` : '';
      return `<th class="${c || ''}"${aria}>${k ? `<button data-k="${k}">${esc(t)}</button>` : esc(t)}</th>`;
    }).join('')}</tr></thead><tbody>${rows.map(({ u, r }) => {
      const b = r.base;
      const ema = !r.hasEma ? mark(false, 'Chưa đủ lịch sử')
        : mark(r.pass[0], r.pass[0] ? (r.cross != null ? `Đạt, cắt lên ${r.cross ? r.cross + 'p trước' : 'hôm nay'}` : 'Đạt') : `${r.tiers}/5 tầng`);
      const base = b && isNum(b.range) ? mark(r.pass[3], `Biên ${fmt.pctAbs(b.range, 1)}, KL ${fmt.n(b.vol, 2)} lần`) : mark(false, '–');
      const poc = b && isNum(b.p1) && isNum(b.p2) && isNum(b.p3) ? mark(r.pass[4], `${fmt.px(b.p1)} → ${fmt.px(b.p2)} → ${fmt.px(b.p3)}`) : mark(false, '–');
      const spread = r.hasEma ? mark(r.pass[2], `${fmt.pctAbs(r.s150, 0)}, ${fmt.pctAbs(r.s200, 0)}`) : mark(false, '–');
      return `<tr class="go" data-sym="${esc(u.s)}" data-thong="1"><td class="l"><span class="sym">${esc(u.s)}</span><span class="nm">${esc(u.short)}</span></td>
        <td class="num">${fmt.px(u.px)}</td><td class="num ${toneOf(u.chg)}">${fmt.pct(u.chg)}</td>
        <td class="l"><span class="pips ${r.count === 5 ? 'all' : ''}" aria-hidden="true">${[0, 1, 2, 3, 4].map((i) => `<i class="${r.pass[i] ? 'on' : ''}"></i>`).join('')}</span><span class="num">${r.count}/5</span></td>
        <td class="l">${ema}</td><td class="l">${mark(r.pass[1], fmt.n(u.rsi))}</td><td class="l">${spread}</td><td class="l">${base}</td><td class="l">${poc}</td>
        <td>${scoreBar(u.score)}</td><td class="num">${fmt.ty(u.adv)}</td></tr>`;
    }).join('')}</tbody></table>`;
    $$('th button', box).forEach((btn) => btn.addEventListener('click', () => {
      const k = btn.dataset.k;
      state.thSort = state.thSort.key === k ? { key: k, dir: -state.thSort.dir } : { key: k, dir: k === 's' || k === 'range' || k === 'spread' ? 1 : -1 };
      drawThong();
    }));
  }

  /* ---- màn hình Mã tiềm năng ---- */
  const potDefaults = () => ({ grade: '', sector: '', adv: 3, q: '' });
  const GRADE_TONE = { A: 'good', B: 'warn', C: '' };
  const GRADE_NAME = { A: 'Hạng A', B: 'Hạng B', C: 'Theo dõi' };

  function potRows() {
    const o = state.pot;
    const q = fold(o.q.trim());
    const rows = store.report.potential.rows.map((p) => ({ p, u: store.bySym.get(p.s) })).filter(({ p, u }) => u
      && (!o.grade || p.grade === o.grade) && (!o.sector || u.sector === o.sector) && (u.adv || 0) >= o.adv && (!q || u.key.includes(q)));
    const { key, dir } = state.potSort;
    const room = ({ p, u }) => (isNum(p.res) ? p.res / u.px - 1 : null);
    const val = (x) => ({ pts: x.p.pts, s: x.u.s, chg: x.u.chg, score: x.u.score, thong: x.p.checks.filter(Boolean).length, ext: x.u.ext, room: room(x), stop: x.p.stop, adv: x.u.adv }[key]);
    return rows.sort((a, b) => {
      const x = val(a), y = val(b);
      if (x == null) return y == null ? 0 : 1;
      if (y == null) return -1;
      return (typeof x === 'string' ? x.localeCompare(y) : x - y) * dir;
    });
  }

  function renderPotential() {
    const R = store.report, P = R.potential, o = state.pot;
    const A = C.setup('pot_a'), B = C.setup('pot_b'), rand = C.setup('random');
    const n = store.market.dates.length - 1;
    const reg = { 1: 'risk_on', 0: 'neutral', '-1': 'risk_off' }[store.market.regime[n]];
    const here = A.regime[reg];
    const countA = P.rows.filter((x) => x.grade === 'A').length, countB = P.rows.filter((x) => x.grade === 'B').length;
    const sectors = [...new Set(P.rows.map((x) => store.bySym.get(x.s)?.sector))].filter(Boolean).sort((a, b) => a.localeCompare(b, 'vi'));
    const row = (name, a, b) => `<tr><td class="l">${esc(name)}</td><td class="num">${fmt.n(a.n)}</td><td class="num">${fmt.pctAbs(a.win, 0)}</td><td class="num ${toneOf(a.exp)}">${fmt.r(a.exp)}</td><td class="num ${toneOf(a.ret)}">${fmt.pct(a.ret)}</td>
      <td class="num">${fmt.n(b.n)}</td><td class="num">${fmt.pctAbs(b.win, 0)}</td><td class="num ${toneOf(b.exp)}">${fmt.r(b.exp)}</td><td class="num ${toneOf(b.ret)}">${fmt.pct(b.ret)}</td></tr>`;
    const F = P.portfolio;
    view().innerHTML = `<div class="view">
      <section class="lede" id="tiem-nang-tom-tat">
        <h1>${countA ? `${countA} mã hạng A, ${countB} mã hạng B` : `Chưa có mã hạng A, ${countB} mã hạng B`}</h1>
        <p>${countA ? 'Hạng A là nhóm có kết quả lịch sử tốt nhất của công cụ.' : 'Hạng A không xuất hiện mỗi ngày. Khi chưa có, hạng B và Theo dõi là danh sách để chuẩn bị, chưa phải tín hiệu mạnh.'} ${fmt.n(P.rows.length)} mã đang qua cổng bắt buộc.</p>
      </section>
      <section class="pot-rules" aria-label="Cách chấm">
        <div class="card"><h2>1. Cổng bắt buộc</h2><p class="note">Thanh khoản từ ${fmt.n(R.minAdv)} tỷ/phiên, Điểm Bền từ ${P.minScore}, xu hướng Tăng hoặc Tăng mạnh, giá cách MA20 không quá ${P.maxExt} ATR.</p></div>
        <div class="card"><h2>2. Điểm kết hợp</h2><p class="note">50% Điểm Bền, cộng ${P.thongPts} điểm cho mỗi tiêu chí Thông đạt, cộng thưởng tín hiệu trong 3 phiên: Dẫn dắt +${P.bonus.leader}, Kéo về hoặc Giao cắt vàng +${P.bonus.pullback}.</p></div>
        <div class="card"><h2>3. Xếp hạng</h2><p class="note">Hạng A từ ${P.gradeA} điểm, hạng B từ ${P.gradeB} điểm, còn lại là Theo dõi.</p></div>
      </section>
      <section class="card" id="tiem-nang-bang">
        <div class="filters">
          <label>Hạng <select id="pot-grade"><option value="">Tất cả</option>${['A', 'B', 'C'].map((g) => `<option value="${g}" ${o.grade === g ? 'selected' : ''}>${GRADE_NAME[g]}</option>`).join('')}</select></label>
          <label>Ngành <select id="pot-sector"><option value="">Tất cả</option>${sectors.map((x) => `<option ${o.sector === x ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></label>
          <label>GTGD từ <input id="pot-adv" type="number" min="0" step="1" value="${o.adv}"> tỷ</label>
          <label><input id="pot-q" type="search" placeholder="Lọc theo mã, tên" value="${esc(o.q)}"></label>
          <button class="icon-btn" id="pot-reset">Đặt lại</button>
          <span class="note" id="pot-count" aria-live="polite"></span>
        </div>
        <div class="table-wrap" id="pot-table" tabindex="0"></div>
        <p class="note" style="margin-top:8px">Dấu kiểm ở cột Tới kháng cự nghĩa là kháng cự gần nhất xa hơn mục tiêu 2R. Bấm một dòng để mở biểu đồ với EMA và POC.</p>
      </section>
      <div class="grid-eq">
        <section class="card" id="tiem-nang-bang-chung">
          <div class="card-head"><h2>Hạng này từng hiệu quả ra sao</h2><span>${evChip(A.all, A.late)}</span></div>
          <div class="table-wrap ev-table" style="max-height:none"><table><thead>
            <tr><th class="l"></th><th colspan="4">Giữ ngắn: ${fmt.n(R.stopAtr)} ATR, ${fmt.n(R.targetR)}R, ${R.hold} phiên</th><th colspan="4">Giữ dài: 3 ATR, 3R, 60 phiên</th></tr>
            <tr><th class="l">Mẫu</th><th>Lệnh</th><th>Thắng</th><th>Kỳ vọng</th><th>Lãi TB</th><th>Lệnh</th><th>Thắng</th><th>Kỳ vọng</th><th>Lãi TB</th></tr></thead><tbody>
            ${row('Hạng A', A.all, P.long.a)}${row('Hạng A và B', B.all, P.long.b)}${row('Ngẫu nhiên', rand.all, P.long.random)}
          </tbody></table></div>
          <div class="alerts">
            <div class="alert">${ICON.warn}<span>Hạng A vượt ngẫu nhiên ${fmt.r(A.all.lift)} (khoảng 90%: ${fmt.n(A.all.liftLo, 2)} … ${fmt.n(A.all.liftHi, 2)}). Giai đoạn trước ${fmt.r(A.early.exp)}, 250 phiên cuối ${fmt.r(A.late.exp)}.</span></div>
            <div class="alert">${ICON.warn}<span>Trong trạng thái ${esc(REGIME[store.market.regime[n]])} hiện tại: ${fmt.n(here.n)} lệnh, kỳ vọng ${fmt.r(here.exp)}. Riêng thị trường Trung tính là ${fmt.r(A.regime.neutral.exp)}.</span></div>
            <div class="alert">${ICON.warn}<span>Thắng ${fmt.pctAbs(A.all.win, 0)} nghĩa là khoảng một nửa số lệnh vẫn thua. Quy tắc được ghép sau khi đã biết từng phần có ích nên kết quả có thể lạc quan.</span></div>
          </div>
        </section>
        <section class="card" id="tiem-nang-danh-muc"><div class="card-head"><h2>Thử nắm giữ 10 mã điểm cao nhất</h2><span class="note">Đổi danh mục mỗi 20 phiên</span></div>
          ${legend([['Danh mục, đã trừ phí', 'var(--fg)'], ['Mọi mã thanh khoản', 'var(--s-ma200)']])}
          <div id="pot-nav"></div>
          <p class="note" style="margin-top:6px">${fmt.pct(F.ret)} so với ${fmt.pct(F.baseRet)} của toàn thị trường, sụt giảm tối đa ${fmt.pct(F.dd, 0)} so với ${fmt.pct(F.baseDd, 0)}, qua ${F.periods} kỳ. Danh mục nhóm Điểm Bền trong tab Phương pháp đạt ${fmt.pct(R.portfolio.ret)} với sụt giảm ${fmt.pct(R.portfolio.dd, 0)}, nên ở cấp danh mục, phần kết hợp chưa cho thấy vượt trội.</p>
        </section>
      </div>
      <p class="foot">Danh sách theo quy tắc từ giá và khối lượng, chưa xét báo cáo tài chính, tin tức hay sự kiện doanh nghiệp. Đây không phải khuyến nghị mua bán.</p>
    </div>`;
    const set = (k, v) => { state.pot[k] = v; save.set('pot', state.pot); drawPotential(); };
    $('#pot-grade').addEventListener('change', (e) => set('grade', e.target.value));
    $('#pot-sector').addEventListener('change', (e) => set('sector', e.target.value));
    $('#pot-adv').addEventListener('input', (e) => set('adv', +e.target.value || 0));
    $('#pot-q').addEventListener('input', (e) => set('q', e.target.value));
    $('#pot-reset').addEventListener('click', () => { state.pot = potDefaults(); save.set('pot', state.pot); renderPotential(); });
    drawPotential();
    linePlot($('#pot-nav'), {
      dates: F.dates, height: 200, fmtY: (v) => (isNum(v) ? (v > 0 ? '+' : '') + (v * 100).toFixed(0) + '%' : '–'), refLines: [{ v: 0 }],
      series: [{ name: 'Mọi mã thanh khoản', values: F.base.map((v) => v - 1), color: 'var(--s-ma200)' }, { name: 'Danh mục 10 mã', values: F.port.map((v) => v - 1), color: 'var(--fg)', width: 2 }],
    });
  }

  function drawPotential() {
    const rows = potRows();
    state.list = rows.map((x) => x.u.s);
    $('#pot-count').textContent = `Hiện ${rows.length} mã`;
    const box = $('#pot-table');
    if (!rows.length) {
      box.innerHTML = '<p class="empty">Không có mã nào khớp. Hãy giảm ngưỡng giá trị giao dịch hoặc chọn hạng khác.</p>';
      return;
    }
    const heads = [['pts', 'Điểm', ''], [null, 'Hạng', 'l'], ['s', 'Mã', 'l'], [null, 'Giá', ''], ['chg', '% phiên', ''], ['score', 'Điểm Bền', ''], ['thong', 'Thông', 'l'], [null, 'Tín hiệu', 'l'], [null, 'Xu hướng', 'l'], ['ext', 'Cách MA20', ''], ['room', 'Tới kháng cự', 'l'], ['stop', 'Cắt lỗ 2 ATR', ''], ['adv', 'GTGD TB 20p', '']];
    box.innerHTML = `<table><thead><tr>${heads.map(([k, t, c]) => {
      const aria = k === state.potSort.key ? ` aria-sort="${state.potSort.dir > 0 ? 'ascending' : 'descending'}"` : '';
      return `<th class="${c}"${aria}>${k ? `<button data-k="${k}">${esc(t)}</button>` : esc(t)}</th>`;
    }).join('')}</tr></thead><tbody>${rows.map(({ p, u }) => {
      const passed = p.checks.filter(Boolean).length;
      const sig = p.signals.map((k) => chip(C.setup(k).name, k === 'leader' ? 'good' : '')).join(' ') || '<span class="muted">–</span>';
      const room = isNum(p.res) ? p.res / u.px - 1 : null;
      return `<tr class="go" data-sym="${esc(u.s)}" data-thong="1"><td class="num"><b>${fmt.n(p.pts)}</b></td><td class="l">${chip(GRADE_NAME[p.grade], GRADE_TONE[p.grade])}</td>
        <td class="l"><span class="sym">${esc(u.s)}</span><span class="nm">${esc(u.short)}</span></td><td class="num">${fmt.px(u.px)}</td><td class="num ${toneOf(u.chg)}">${fmt.pct(u.chg)}</td><td>${scoreBar(u.score)}</td>
        <td class="l"><span class="pips ${passed === 5 ? 'all' : ''}" aria-hidden="true">${p.checks.map((x) => `<i class="${x ? 'on' : ''}"></i>`).join('')}</span><span class="num">${passed}/5</span></td>
        <td class="l">${sig}</td><td class="l">${trendChip(u.trend)}</td><td class="num">${fmt.n(u.ext, 1)} ATR</td>
        <td class="l">${room == null ? '<span class="muted">Chưa rõ</span>' : mark(room >= 2 * p.stop, fmt.pct(room))}</td><td class="num">${fmt.pct(-p.stop)}</td><td class="num">${fmt.ty(u.adv)}</td></tr>`;
    }).join('')}</tbody></table>`;
    $$('th button', box).forEach((b) => b.addEventListener('click', () => {
      const k = b.dataset.k;
      state.potSort = state.potSort.key === k ? { key: k, dir: -state.potSort.dir } : { key: k, dir: k === 's' || k === 'ext' || k === 'stop' ? 1 : -1 };
      drawPotential();
    }));
  }

  /* ---- màn hình Danh sách ---- */
  async function renderWatch() {
    const syms = Object.keys(state.wl).filter((s) => store.bySym.has(s));
    view().innerHTML = `<div class="view"><section class="lede"><h1>Danh sách của tôi</h1><p>Nhập giá vốn và khối lượng để biết lãi lỗ, mức thoát theo xu hướng và tổng rủi ro. Dữ liệu chỉ lưu trên trình duyệt này.</p></section>
      <div id="wl-body"><p class="skeleton">Đang tải…</p></div></div>`;
    if (!syms.length) {
      $('#wl-body').innerHTML = `<section class="card"><p class="empty">Danh sách đang trống. Bấm Theo dõi ở một mã, hoặc thêm nhanh 5 mã có Điểm Bền cao nhất và thanh khoản từ 20 tỷ.</p>
        <button class="icon-btn" id="wl-seed">Thêm 5 mã bền nhất</button></section>`;
      $('#wl-seed').addEventListener('click', () => {
        store.universe.filter((u) => u.adv >= 20 && isNum(u.score)).sort((a, b) => b.score - a.score).slice(0, 5).forEach((u) => { state.wl[u.s] = {}; });
        save.set('wl', state.wl);
        renderWatch();
      });
      return;
    }
    const rows = await Promise.all(syms.map(async (s) => {
      const d = await C.loadSymbol(s);
      const series = C.atr(d.bars);
      return { u: d.u, pos: state.wl[s], ch: C.chandelier(d.bars, series) };
    }));
    if (state.tab !== 'watch') return;
    drawWatch(rows);
  }

  function drawWatch(rows) {
    let value = 0, pnl = 0, risk = 0;
    const sectors = new Map();
    const body = rows.map(({ u, pos, ch }) => {
      const cost = +pos.cost || 0, qty = +pos.qty || 0;
      const mv = u.px * qty * 1000;
      const p = cost ? (u.px / cost - 1) : null;
      const exit = ch ? ch.stop : null;
      const toExit = exit ? exit / u.px - 1 : null;
      const atRisk = exit ? Math.max(0, (u.px - exit) * qty * 1000) : 0;
      value += mv;
      if (cost) pnl += (u.px - cost) * qty * 1000;
      risk += atRisk;
      if (mv) sectors.set(u.sector, (sectors.get(u.sector) || 0) + mv);
      const broke = exit && u.px < exit;
      return `<tr data-row="${esc(u.s)}"><td class="l"><button class="icon-btn" data-sym="${esc(u.s)}" style="border:0;padding:0;background:none"><span class="sym">${esc(u.s)}</span></button></td>
        <td class="num">${fmt.px(u.px)}</td><td class="num ${toneOf(u.chg)}">${fmt.pct(u.chg)}</td><td>${scoreBar(u.score)}</td><td class="l">${trendChip(u.trend)}</td>
        <td><input class="wl-in" data-k="cost" aria-label="Giá vốn ${esc(u.s)}" type="number" step="0.05" min="0" value="${cost || ''}" style="width:78px"></td>
        <td><input class="wl-in" data-k="qty" aria-label="Khối lượng ${esc(u.s)}" type="number" step="100" min="0" value="${qty || ''}" style="width:88px"></td>
        <td class="num ${toneOf(p)}">${p == null ? '–' : fmt.pct(p)}</td>
        <td class="num">${exit ? fmt.px(exit) : '–'}</td><td class="l">${exit ? (broke ? chip('Đã thủng', 'bad') : `<span class="num muted">${fmt.pct(toExit)}</span>`) : '–'}</td>
        <td><button class="icon-btn wl-del" aria-label="Bỏ ${esc(u.s)}">Bỏ</button></td></tr>`;
    }).join('');
    const top = [...sectors.entries()].sort((a, b) => b[1] - a[1])[0];
    $('#wl-body').innerHTML = `<div class="view">
      ${value ? `<section class="kpis" style="grid-template-columns:repeat(auto-fit,minmax(170px,1fr))">
        ${kpi('Giá trị nắm giữ', fmt.vnd(value), `${rows.length} mã`, null)}
        ${kpi('Lãi lỗ tạm tính', `<span class="${toneOf(pnl)}">${fmt.vnd(pnl)}</span>`, 'Theo giá vốn bạn nhập', null)}
        ${kpi('Rủi ro nếu về mức thoát', `<span class="down">${fmt.vnd(risk)}</span>`, `${fmt.pctAbs(risk / value)} giá trị nắm giữ`, null)}
        ${kpi('Ngành chiếm nhiều nhất', top ? fmt.pctAbs(top[1] / value, 0) : '–', top ? esc(top[0]) : '', null)}
      </section>` : ''}
      <section class="card" id="danh-sach"><div class="table-wrap" style="max-height:none"><table><thead><tr><th class="l">Mã</th><th>Giá</th><th>% phiên</th><th>Điểm Bền</th><th class="l">Xu hướng</th><th>Giá vốn</th><th>Khối lượng</th><th>Lãi lỗ</th><th title="Đỉnh 22 phiên trừ 3 ATR">Mức thoát</th><th class="l">Khoảng cách</th><th></th></tr></thead><tbody>${body}</tbody></table></div>
      <p class="note" style="margin-top:8px">Mức thoát theo xu hướng bằng đỉnh 22 phiên trừ 3 ATR, được nâng dần khi giá lên. Đây là quy tắc tham chiếu.</p></section></div>`;
    $$('.wl-in').forEach((inp) => inp.addEventListener('change', () => {
      const s = inp.closest('tr').dataset.row;
      state.wl[s][inp.dataset.k] = +inp.value || 0;
      save.set('wl', state.wl);
      drawWatch(rows);
    }));
    $$('.wl-del').forEach((b) => b.addEventListener('click', () => {
      const s = b.closest('tr').dataset.row;
      delete state.wl[s];
      save.set('wl', state.wl);
      renderWatch();
    }));
  }

  /* ---- màn hình Phương pháp ---- */
  function renderMethod() {
    const R = store.report;
    const P = R.portfolio;
    const rand = R.setups.find((s) => s.key === 'random');
    const rows = R.setups.filter((s) => s.key !== 'random').sort((a, b) => (b.all.exp ?? -9) - (a.all.exp ?? -9));
    view().innerHTML = `<div class="view">
      <section class="lede"><h1>Vì sao nên tin, và nên tin đến đâu</h1>
        <p>Mọi con số trong công cụ được tính lại từ giá ngày của ${fmt.n(R.symbols)} mã, từ ${fmt.day(R.start)} đến ${fmt.day(R.asOf)}. Phần này cho biết điều gì đã được kiểm chứng và điều gì chưa.</p></section>
      <div class="grid-eq">
        <section class="card" id="diem-ben"><div class="card-head"><h2>Điểm Bền có phân loại được không</h2><span class="note">Xếp mã vào 5 nhóm, mỗi 10 phiên</span></div>
          <div id="q-chart"></div>
          <p class="note" style="margin-top:6px">Lợi suất vượt thị trường sau 20 phiên, đã tính giá mở cửa phiên kế tiếp. Nhóm 5 có điểm cao nhất.</p>
          <div class="table-wrap" style="max-height:none;margin-top:8px"><table><thead><tr><th class="l">Nhóm</th><th>Tỷ lệ có lãi T+20</th><th>Vượt TT, 20 phiên</th><th>Vượt TT, 60 phiên</th><th>Giai đoạn trước</th><th>250 phiên cuối</th></tr></thead><tbody>
          ${R.quintiles.map((q) => `<tr><td class="l">Nhóm ${q.q}</td><td class="num">${fmt.pctAbs(q.win20, 0)}</td><td class="num ${toneOf(q.ex20)}">${fmt.pct(q.ex20)}</td><td class="num ${toneOf(q.ex60)}">${fmt.pct(q.ex60)}</td><td class="num ${toneOf(q.early20)}">${fmt.pct(q.early20)}</td><td class="num ${toneOf(q.late20)}">${fmt.pct(q.late20)}</td></tr>`).join('')}
          </tbody></table></div></section>
        <section class="card" id="danh-muc"><div class="card-head"><h2>Thử nắm giữ nhóm điểm cao</h2><span class="note">20% mã điểm cao nhất, đổi danh mục mỗi 20 phiên</span></div>
          ${legend([['Danh mục Điểm Bền, đã trừ phí', 'var(--fg)'], ['Mọi mã thanh khoản, đồng tỷ trọng', 'var(--s-ma200)']])}
          <div id="nav-chart"></div>
          <div class="kpis" style="grid-template-columns:repeat(2,minmax(0,1fr));margin-top:8px">
            ${kpi('Danh mục', fmt.pct(P.ret, 1), `Sụt giảm tối đa ${fmt.pct(P.dd, 0)}`, null)}
            ${kpi('Toàn thị trường', fmt.pct(P.baseRet, 1), `Sụt giảm tối đa ${fmt.pct(P.baseDd, 0)}`, null)}
          </div>
          <p class="note" style="margin-top:6px">${P.periods} kỳ từ ${fmt.day(P.start)}, vòng quay trung bình ${fmt.pctAbs(P.turnover, 0)} mỗi kỳ. Kết quả này được chọn sau khi xem dữ liệu nên có thể lạc quan.</p></section>
      </div>
      <section class="card" id="tin-hieu"><div class="card-head"><h2>Từng tín hiệu, đo bằng lệnh mô phỏng</h2><span class="note">Mốc ngẫu nhiên: ${fmt.r(rand.all.exp)}, thắng ${fmt.pctAbs(rand.all.win, 0)}</span></div>
        <div class="table-wrap" style="max-height:none"><table><thead><tr><th class="l">Tín hiệu</th><th>Số lệnh</th><th>Thắng</th><th>Kỳ vọng</th><th>Khoảng 90%</th><th>Vượt ngẫu nhiên</th><th>Trước</th><th>250p cuối</th><th>Khi điểm ≥ 60</th><th class="l">Đánh giá</th></tr></thead><tbody>
        ${rows.map((s) => `<tr title="${esc(s.rule)}"><td class="l">${esc(s.name)}</td><td class="num">${fmt.n(s.all.n)}</td><td class="num">${fmt.pctAbs(s.all.win, 0)}</td><td class="num ${toneOf(s.all.exp)}">${fmt.r(s.all.exp)}</td><td class="num muted">${fmt.n(s.all.lo, 2)} … ${fmt.n(s.all.hi, 2)}</td><td class="num ${toneOf(s.all.lift)}">${fmt.r(s.all.lift)}</td><td class="num ${toneOf(s.early.exp)}">${fmt.r(s.early.exp)}</td><td class="num ${toneOf(s.late.exp)}">${fmt.r(s.late.exp)}</td><td class="num ${toneOf(s.highScore.exp)}">${fmt.r(s.highScore.exp)}</td><td class="l">${evChip(s.all, s.late)}</td></tr>`).join('')}
        </tbody></table></div>
        <div class="prose" style="margin-top:10px;max-width:none"><ul>${rows.map((s) => `<li><b>${esc(s.name)}.</b> ${esc(s.rule)}</li>`).join('')}</ul></div></section>
      <div class="grid-eq">
        <section class="card" id="rui-ro"><div class="card-head"><h2>Rủi ro dự báo được tốt hơn lợi nhuận</h2></div>
          <div class="table-wrap" style="max-height:none"><table><thead><tr><th class="l">Cắt lỗ cách</th><th>Bị chạm trong 20 phiên</th><th>Riêng 250 phiên cuối</th></tr></thead><tbody>${R.stops.map((s) => `<tr><td class="l num">${fmt.n(s.k, 1)} ATR</td><td class="num">${fmt.pctAbs(s.p, 0)}</td><td class="num">${fmt.pctAbs(s.late, 0)}</td></tr>`).join('')}</tbody></table></div>
          <p class="note" style="margin-top:8px">Dải giá 80% hiệu chuẩn trên giai đoạn đầu, kiểm tra trên 250 phiên sau: phủ ${fmt.pctAbs(R.cone['5'].coverage, 0)} ở 5 phiên, ${fmt.pctAbs(R.cone['10'].coverage, 0)} ở 10 phiên, ${fmt.pctAbs(R.cone['20'].coverage, 0)} ở 20 phiên.</p></section>
        <section class="card" id="trang-thai"><div class="card-head"><h2>Trạng thái thị trường mô tả hiện tại</h2></div>
          <div class="table-wrap" style="max-height:none"><table><thead><tr><th class="l">Trạng thái</th><th>Số phiên</th><th>TB 20 phiên sau</th><th>Tỷ lệ dương</th></tr></thead><tbody>${R.regimeFwd.map((r) => `<tr><td class="l">${esc(REGIME[{ risk_on: 1, neutral: 0, risk_off: -1 }[r.regime]])}</td><td class="num">${fmt.n(r.n)}</td><td class="num ${toneOf(r.h20)}">${fmt.pct(r.h20)}</td><td class="num">${fmt.pctAbs(r.pos20, 0)}</td></tr>`).join('')}</tbody></table></div>
          <p class="note" style="margin-top:8px">Lan tỏa: chỉ số trên MA50 và từ 55% mã trên MA50. Suy yếu: chỉ số dưới MA200 hoặc dưới 35% mã trên MA50. Khác biệt lợi suất sau đó không lớn, nên đừng dùng nó như tín hiệu thời điểm.</p></section>
      </div>
      <section class="card prose" id="gia-dinh" style="max-width:none"><h2>Giả định và giới hạn</h2><ul>
        <li><b>Khớp lệnh:</b> tín hiệu tại giá đóng cửa, mua ở giá mở cửa phiên sau, bỏ qua lệnh mở cửa sát trần. Bán sớm nhất sau 2 phiên theo T+2.</li>
        <li><b>Thoát lệnh:</b> cắt lỗ ${fmt.n(R.stopAtr)} ATR, chốt lời ${fmt.n(R.targetR)}R, tối đa ${R.hold} phiên, trừ ${fmt.pctAbs(R.cost)} phí và thuế khứ hồi. Thực tế còn trượt giá. Bỏ lệnh có khoảng cắt lỗ dưới 1% giá vào, vì giá đứng im làm thống kê R bị méo.</li>
        <li><b>Thanh khoản:</b> chỉ kiểm chứng tại thời điểm mã đạt từ ${fmt.n(R.minAdv)} tỷ/phiên.</li>
        <li><b>Thiên lệch sống sót:</b> dữ liệu chỉ gồm mã còn niêm yết, nên kết quả có thể đẹp hơn thực tế.</li>
        <li><b>Chọn sau khi nhìn:</b> Điểm Bền được chọn sau khi xem 13 yếu tố. ATR% vượt qua hiệu chỉnh kiểm định bội, vị thế so với đỉnh thì chưa. Với ${fmt.n(R.setups.length - 1)} tín hiệu, một vài kết quả đẹp có thể do may mắn.</li>
        <li><b>Mẫu ngắn:</b> ${fmt.n(R.sessions)} phiên, tức khoảng 3 năm, chưa đủ nhiều chu kỳ thị trường.</li>
        <li><b>Dữ liệu:</b> nguồn eod.stock.ohlcv của FinLens, tên và ngành từ meta.symbols. ${R.repairs} phiên có hệ số điều chỉnh lệch đã được sửa theo giá khớp thật.</li>
        <li><b>Không có:</b> dữ liệu trong phiên, báo cáo tài chính, tin tức, sự kiện doanh nghiệp. Ngày nghỉ lễ chưa được tính vào T+2.</li></ul></section>
    </div>`;
    drawQuintile();
    linePlot($('#nav-chart'), {
      dates: P.dates, height: 200, fmtY: (v) => (isNum(v) ? (v > 0 ? '+' : '') + (v * 100).toFixed(0) + '%' : '–'), refLines: [{ v: 0 }],
      series: [{ name: 'Mọi mã thanh khoản', values: P.base.map((v) => v - 1), color: 'var(--s-ma200)' }, { name: 'Danh mục Điểm Bền', values: P.port.map((v) => v - 1), color: 'var(--fg)', width: 2 }],
    });
  }

  function drawQuintile() {
    const el = $('#q-chart');
    const Q = store.report.quintiles;
    el.classList.add('plot');
    const draw = () => {
      const W = Math.max(240, el.clientWidth), H = 186, m = { t: 18, b: 40 };
      const hi = Math.max(0.01, ...Q.map((q) => q.ex20)), lo = Math.min(-0.01, ...Q.map((q) => q.ex20));
      const y = (v) => m.t + (hi - v) / (hi - lo) * (H - m.t - m.b);
      const bw = W / 5;
      let s = `<svg viewBox="0 0 ${W} ${H}" height="${H}" role="img" aria-label="Lợi suất vượt thị trường theo nhóm Điểm Bền"><line x1="0" x2="${W}" y1="${y(0)}" y2="${y(0)}" stroke="var(--axis)"/>`;
      Q.forEach((q, i) => {
        const x = i * bw + bw * 0.22, w = bw * 0.56, top = Math.min(y(q.ex20), y(0)), h = Math.abs(y(q.ex20) - y(0));
        s += `<rect x="${x}" y="${top}" width="${w}" height="${Math.max(1, h)}" rx="3" fill="${q.ex20 >= 0 ? 'var(--up)' : 'var(--down)'}"/>`;
        const ly = q.ex20 >= 0 ? top - 4 : top + h + 12;
        s += `<text x="${x + w / 2}" y="${ly}" text-anchor="middle">${esc(fmt.pct(q.ex20))}</text>`;
        s += `<text class="lbl" x="${x + w / 2}" y="${H - 4}" text-anchor="middle">Nhóm ${q.q}</text>`;
      });
      el.innerHTML = s + '</svg>';
    };
    el._draw = draw;
    draw();
    plotRO.observe(el);
  }

  /* ---- tìm kiếm ---- */
  function bindSearch() {
    const input = $('#search'), list = $('#search-list');
    let items = [], at = 0;
    const close = () => { list.hidden = true; input.setAttribute('aria-expanded', 'false'); };
    const paint = () => {
      list.innerHTML = items.map((u, i) => `<button class="search-item" role="option" id="opt-${i}" aria-selected="${i === at}" data-s="${esc(u.s)}"><b>${esc(u.s)}</b><span>${esc(u.short || u.name)}</span><span class="num">${fmt.px(u.px)}</span></button>`).join('')
        || '<p class="empty" style="padding:8px">Không tìm thấy mã này.</p>';
      list.hidden = false;
      input.setAttribute('aria-expanded', 'true');
    };
    const find = () => {
      const q = fold(input.value.trim());
      if (!q) { close(); return; }
      const exact = [], prefix = [], rest = [];
      for (const u of store.universe) {
        const s = u.s.toLowerCase();
        if (s === q) exact.push(u);
        else if (s.startsWith(q)) prefix.push(u);
        else if (u.key.includes(q)) rest.push(u);
      }
      const byLiq = (a, b) => (b.adv || 0) - (a.adv || 0);
      items = [...exact, ...prefix.sort(byLiq), ...rest.sort(byLiq)].slice(0, 9);
      at = 0;
      paint();
    };
    const pick = (s) => { input.value = ''; close(); input.blur(); go('symbol', s); };
    input.addEventListener('input', find);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' && items.length) { e.preventDefault(); at = (at + 1) % items.length; paint(); }
      else if (e.key === 'ArrowUp' && items.length) { e.preventDefault(); at = (at - 1 + items.length) % items.length; paint(); }
      else if (e.key === 'Enter' && items[at]) { e.preventDefault(); pick(items[at].s); }
      else if (e.key === 'Escape') { input.value = ''; close(); input.blur(); }
    });
    list.addEventListener('pointerdown', (e) => {
      const b = e.target.closest('[data-s]');
      if (b) { e.preventDefault(); pick(b.dataset.s); }
    });
    input.addEventListener('blur', () => setTimeout(close, 120));
  }

  /* ---- định tuyến ---- */
  const ROUTES = { today: 'hom-nay', screen: 'sang-loc', thong: 'phan-tich-thong', potential: 'tiem-nang', watch: 'danh-sach', method: 'phuong-phap' };

  function go(tab, sym) {
    state.tab = tab;
    if (sym) state.sym = sym;
    if (tab !== 'symbol' && state.chart) { state.chart.destroy(); state.chart = null; }
    const token = tab === 'symbol' ? 'ma-' + state.sym : ROUTES[tab];
    try { history.replaceState(null, '', '#' + token); } catch { /* khung nhúng có thể chặn */ }
    $$('.tab').forEach((b) => b.setAttribute('aria-selected', b.dataset.tab === tab));
    window.scrollTo(0, 0);
    ({ today: renderToday, screen: renderScreen, symbol: renderSymbol, thong: renderThong, potential: renderPotential, watch: renderWatch, method: renderMethod }[tab])();
  }

  function fromHash() {
    const h = decodeURIComponent(location.hash.slice(1));
    if (h.startsWith('ma-')) {
      const s = h.slice(3).toUpperCase();
      if (store.bySym.has(s)) return ['symbol', s];
    }
    const tab = Object.keys(ROUTES).find((k) => ROUTES[k] === h);
    return [tab || 'today', null];
  }

  function bindGlobal() {
    $$('.tab').forEach((b) => b.addEventListener('click', () => go(b.dataset.tab)));
    $('#theme').addEventListener('click', () => {
      const now = document.documentElement.getAttribute('data-theme')
        || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
      const next = now === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      save.set('theme', next);
      if (state.chart) state.chart.draw();
      $$('.plot').forEach((p) => p._draw && p._draw());
    });
    document.addEventListener('click', (e) => {
      const a = e.target.closest('[data-sym]');
      if (a && !e.target.closest('input,select')) {
        if (a.dataset.thong) {
          Object.assign(state.show, { ema: true, poc: true, ma20: false, ma50: false, ma200: false });
          save.set('show', state.show);
        }
        go('symbol', a.dataset.sym);
        return;
      }
      const g = e.target.closest('[data-go]');
      if (g) { go(g.dataset.go); return; }
      const p = e.target.closest('[data-preset]');
      if (p) { state.preset = p.dataset.preset; save.set('preset', state.preset); go('screen'); return; }
      const st = e.target.closest('[data-setup]');
      if (st) {
        const k = st.dataset.setup;
        if (k === 'thong' || k === 'thong4') { go('thong'); return; }
        if (k === 'pot_a' || k === 'pot_b') { go('potential'); return; }
        const map = { leader: 'leaderplus', pullback: 'leaderplus', golden: 'leaderplus', breakout: 'breakout', squeeze: 'breakout', breakdown: 'broken', death: 'broken', oversold: 'all' };
        state.preset = map[k] || 'all';
        save.set('preset', state.preset);
        go('screen');
        return;
      }
      const sec = e.target.closest('[data-sector]');
      if (sec) {
        state.filters.sector = sec.dataset.sector;
        state.preset = 'all';
        save.set('filters', state.filters);
        go('screen');
      }
    });
    document.addEventListener('keydown', (e) => {
      const typing = /INPUT|SELECT|TEXTAREA/.test(e.target.tagName);
      if (e.key === '/' && !typing) { e.preventDefault(); $('#search').focus(); return; }
      if (typing) return;
      if (state.tab === 'screen') {
        if (e.key === 'ArrowDown') { e.preventDefault(); moveSel(1); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); moveSel(-1); }
        else if (e.key === 'Enter') {
          const r = $$('#screen-table tbody tr')[state.sel];
          if (r) go('symbol', r.dataset.sym);
        }
      }
      if (state.tab === 'symbol') {
        if (e.key === '[') stepSymbol(-1);
        if (e.key === ']') stepSymbol(1);
      }
    });
  }

  async function start() {
    const theme = save.get('theme', null);
    if (theme) document.documentElement.setAttribute('data-theme', theme);
    bindGlobal();
    try {
      await C.loadAll();
    } catch (e) {
      view().innerHTML = `<p class="err">Chưa tải được dữ liệu: ${esc(e.message)}. Hãy tải lại trang.</p>`;
      return;
    }
    const scores = store.universe.filter((u) => u.liquid && isNum(u.score)).map((u) => u.score).sort((a, b) => a - b);
    const cuts = [0.2, 0.4, 0.6, 0.8].map((p) => scores[Math.floor(scores.length * p)]);
    C.quintileOf = (s) => (isNum(s) ? 1 + cuts.filter((c) => s >= c).length : null);
    const R = store.report;
    $('#asof').textContent = fmt.day(R.asOf);
    bindSearch();
    const [tab, sym] = fromHash();
    go(tab, sym);
    window.addEventListener('hashchange', () => {
      const [t, s] = fromHash();
      if (t !== state.tab || (s && s !== state.sym)) go(t, s);
    });
    window.__bkt = { state, go, store };
  }

  start();
})();
