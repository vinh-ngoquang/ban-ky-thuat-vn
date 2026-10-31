/* Giao diện: thanh trên, định tuyến và trang Xem mã. Bước 1 và bước 3 nằm ở picks.js. */
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

  const DOC = 'https://github.com/vinh-ngoquang/ban-ky-thuat-vn/blob/main/TAI-LIEU-DASHBOARD.md';

  const state = {
    tab: 'find', sym: null, tf: 'd', chart: null, thData: null, sel: 0, list: [],
    pick: Object.assign({ lens: 'best', style: 'defensive', sector: '', q: '', easy: false }, save.get('pick', {})),
    basket: Object.assign({ syms: [], capital: 1000, risk: 1 }, save.get('basket', {})),
    show: Object.assign({ ma20: true, ma50: true, ma200: true, bb: false, sr: true, plan: true, markers: false, profile: false, ema: false, poc: false }, save.get('show', {})),
    panes: save.get('panes', ['volume']),
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

  /* ---- bước 2: Xem mã ---- */
  const INTERNAL = /^(pot_|thong)/;   // quy tắc tổng hợp, không phải tín hiệu riêng trên biểu đồ
  const CHART_PLAN = { capital: 500, riskPct: 1, k: 2, targetR: 2 };    // cùng quy tắc kiểm chứng, chỉ dùng để vẽ cắt lỗ và mục tiêu
  const mark = (ok, text) => `<span class="mk ${ok ? 'yes' : 'no'}">${ok ? ICON.check : ICON.x}<span>${esc(text)}</span></span>`;

  const acc = (id, title, body) => `<details class="card acc" id="${id}"><summary>${title}</summary><div class="acc-body">${body}</div></details>`;

  function thongPanel(u) {
    const T = state.thData, row = T?.rows[u.s];
    if (!row) return '<p class="empty">Chưa đủ dữ liệu.</p>';
    const r = C.evalThong(u, row, { maxRange: T.maxRange * 100 }, T), b = r.base;
    const items = [
      ['EMA xếp tầng', r.pass[0], r.hasEma ? (r.pass[0] ? 'Giá trên EMA10, các đường xếp đúng thứ tự' : `Mới đạt ${r.tiers} trên 5 tầng`) : 'Chưa đủ lịch sử'],
      ['RSI trên 50', r.pass[1], `RSI hiện tại ${fmt.n(u.rsi)}`],
      ['Các đường EMA chưa giãn', r.pass[2], r.hasEma ? `EMA50 cách EMA150 ${fmt.pctAbs(r.s150, 0)}, cách EMA200 ${fmt.pctAbs(r.s200, 0)}` : '–'],
      ['Nền tích lũy', r.pass[3], b ? `Biên ${fmt.pctAbs(b.range, 0)} trong ${T.window} phiên, khối lượng ${fmt.n(b.vol, 2)} lần trung bình` : '–'],
      ['POC tăng dần', r.pass[4], b ? `${fmt.px(b.p1)} → ${fmt.px(b.p2)} → ${fmt.px(b.p3)}` : '–'],
    ];
    return `<div class="thong-list">${items.map(([t, ok, d]) => `<div>${mark(ok, t)}<span class="muted">${esc(d)}</span></div>`).join('')}</div>
      <p class="note" style="margin-top:6px">POC là mức giá có khối lượng giao dịch lớn nhất trong một đoạn. Công cụ so sánh 3 đoạn ${T.window} phiên liền nhau.</p>`;
  }

  /* Thanh chuyển mã. Mã ngoài danh sách: nút Sau đưa về mã đầu danh sách. */
  function navBar(sym) {
    const i = state.list.indexOf(sym), n = state.list.length;
    return `<nav class="sv-nav"><button class="link-btn" id="back">‹ Danh sách mã</button>
      <span class="note">${i >= 0 ? `Mã ${i + 1} trong ${n}` : 'Ngoài danh sách'}</span>
      <div class="seg"><button id="prev-sym" title="Phím [" ${i <= 0 ? 'disabled' : ''}>‹ Trước</button><button id="next-sym" title="Phím ]" ${i === n - 1 ? 'disabled' : ''}>Sau ›</button></div></nav>`;
  }

  function bindNav() {
    $('#back').addEventListener('click', () => go('find'));
    $('#prev-sym').addEventListener('click', () => stepSymbol(-1));
    $('#next-sym').addEventListener('click', () => stepSymbol(1));
  }

  async function renderSymbol() {
    if (!state.sym) return go('symbol', window.Picks.first());
    const sym = state.sym;
    window.Picks.fillList();    // mở thẳng link một mã thì danh sách chưa có
    view().innerHTML = `<div class="view">${navBar(sym)}<p class="skeleton">Đang tải dữ liệu mã…</p></div>`;
    bindNav();
    let data;
    try {
      [data, state.thData] = await Promise.all([C.loadSymbol(sym), C.loadThong()]);
    } catch (e) {
      if (state.sym !== sym || state.tab !== 'symbol') return;
      view().innerHTML = `<div class="view">${navBar(sym)}<p class="err">Không tải được dữ liệu ${esc(sym)}. Nếu bạn mở trên máy, hãy chạy lại mo-dashboard.bat rồi thử lại.</p></div>`;
      bindNav();
      return;
    }
    if (state.sym !== sym || state.tab !== 'symbol') return;
    const { u, bars } = data;
    const a = window.Picks.assess(u);
    const lim = C.priceLimits(u.px, u.ex);
    const inBasket = state.basket.syms.includes(sym);
    const passed = a.row ? a.row.checks.filter(Boolean).length : null;
    view().innerHTML = `<div class="view">
      ${navBar(sym)}
      <section class="card sv-card tone-${a.tone || 'none'}" id="ket-luan">
        <div class="sv-id">
          <div><h1>${esc(u.s)}</h1><div class="sym-sub">${esc(u.short || u.name)} · ${esc(u.ex)} · ${esc(u.sector)}</div></div>
          <div class="sv-price"><span class="px num">${fmt.px(u.px)}</span> <span class="num ${toneOf(u.chg)}">${fmt.pct(u.chg, 2)}</span>
            <div class="sym-sub num">Trần <span style="color:var(--ceil)">${fmt.px(lim.ceil)}</span> · Sàn <span style="color:var(--floor)">${fmt.px(lim.floor)}</span></div></div>
          <button class="btn-main" id="add-basket" aria-pressed="${inBasket}">${inBasket ? 'Đã có trong giỏ' : 'Thêm vào giỏ'}</button>
        </div>
        <div class="sv-verdict"><h2>${esc(a.title)}</h2><p>${esc(a.note)}</p><p class="muted">${esc(verdictLine(data))}</p></div>
        ${a.checks.length ? `<div class="sv-checks">${a.checks.map((c) => `<div class="sv-check ${c.tone}"><span class="lb">${esc(c.label)}</span><b>${esc(c.text)}</b><span class="d">${esc(c.note)}</span></div>`).join('')}</div>` : ''}
      </section>
      <section class="card" id="bieu-do">
        <div class="chart-tools">
          <div class="seg" id="tf" role="group" aria-label="Khung thời gian"><button data-t="d" aria-pressed="${state.tf === 'd'}">Ngày</button><button data-t="w" aria-pressed="${state.tf === 'w'}">Tuần</button></div>
          <details class="chart-more"><summary>Thêm chỉ báo</summary><div class="chart-more-body">
            <div class="toggles" id="tog-layers">
              ${[['ma20', 'MA20', 'var(--s-ma20)'], ['ma50', 'MA50', 'var(--s-ma50)'], ['ma200', 'MA200', 'var(--s-ma200)'], ['ema', 'EMA của Thông', 'var(--s-e50)'], ['poc', 'POC', 'var(--accent)'], ['sr', 'Hỗ trợ, kháng cự', 'var(--muted)'], ['plan', 'Kế hoạch', 'var(--up)'], ['markers', 'Tín hiệu', 'var(--accent)'], ['bb', 'Bollinger', 'var(--s-ma20)'], ['profile', 'Khối lượng theo giá', 'var(--profile)']]
.map(([k, l, c]) => `<button class="tog" data-k="${k}" aria-pressed="${!!state.show[k]}" style="--c:${c}"><i></i>${l}</button>`).join('')}
            </div>
            <div class="toggles" id="panes" role="group" aria-label="Khung phụ"><span class="note">Khung dưới:</span>${[['volume', 'Khối lượng'], ['rsi', 'RSI'], ['macd', 'MACD'], ['rs', 'So với thị trường']].map(([k, l]) => `<button class="tog" data-k="${k}" aria-pressed="${state.panes.includes(k)}"><i></i>${l}</button>`).join('')}</div>
          </div></details>
        </div>
        <div class="legend" id="ema-legend" ${state.show.ema ? '' : 'hidden'}>${[['EMA10', '--s-e10'], ['EMA20', '--s-e20'], ['EMA50', '--s-e50'], ['EMA150', '--s-e150'], ['EMA200', '--s-e200']].map(([n, c]) => `<span><i style="background:var(${c})"></i>${n}</span>`).join('')}</div>
        <div class="readout num" id="readout"></div>
        <div class="chart-host" id="chart" aria-label="Biểu đồ giá ${esc(u.s)}"></div>
        <p class="note" style="margin-top:6px">Kéo để cuộn, lăn chuột để phóng to, nhấp đúp để về mặc định. Vùng xanh là mục tiêu, vùng đỏ là mức có thể lỗ, tính từ giá hiện tại với cắt lỗ 2 ATR và mục tiêu gấp 2 lần mức lỗ.</p>
      </section>
      <div class="acc-list">
        ${acc('tieu-chi-thong', `Tiêu chí của Thông${passed != null ? `: đạt ${passed}/5` : ''}`, thongPanel(u))}
        ${acc('tai-chinh-acc', 'Tài chính', finPanel(u))}
        ${acc('muc-gia-acc', 'Hỗ trợ và kháng cự', levelsPanel(data))}
        ${acc('dai-gia-acc', 'Giá có thể đi tới đâu', rangePanel(u) || '<p class="empty">Chưa đủ dữ liệu.</p>')}
        ${acc('diem-acc', 'Vì sao có điểm này', readPanel(data))}
        ${acc('tin-hieu-acc', 'Tín hiệu đã xuất hiện', `<div class="table-wrap" style="max-height:280px">${eventTable(data)}</div>`)}
        ${acc('nganh-acc', `So với cùng ngành: ${esc(u.sector)}`, `<div class="table-wrap" style="max-height:320px">${peerTable(u)}</div>`)}
        ${acc('gia-acc', 'Bảng giá 15 phiên', `<div class="table-wrap">${priceTable(bars)}</div>`)}
      </div>
      <p class="foot">Kết luận và các mức trên biểu đồ là phép tính theo quy tắc, không phải tư vấn đầu tư hay khuyến nghị mua bán. Hãy kiểm tra báo cáo tài chính và tin tức trước khi quyết định.</p>
    </div>`;
    bindSymbol(data);
  }

  function readPanel({ u, events, scores }) {
    const R = store.report;
    const q = C.quintileOf(u.score);
    const qs = q ? R.quintiles[q - 1] : null;
    const recent = [...events].reverse().find((e) => e.gi >= store.market.dates.length - 4 && !INTERNAL.test(e.key));
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
    const recent = [...events].reverse().find((e) => e.gi >= store.market.dates.length - 4 && !INTERNAL.test(e.key));
    const sig = recent ? C.setup(recent.key) : null;
    if (sig) parts.push(`vừa có tín hiệu ${sig.name}`);
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

  function finPanel(u) {
    const all = store.report.picks.fin;
    const hist = all?.rows[u.s]?.hist;
    if (!hist?.length) return '<p class="empty">Chưa có số liệu tài chính của mã này.</p>';
    const bank = hist.some((h) => isNum(h.npl));
    const off = (h) => isNum(h.eps) && isNum(h.epsCalc) && h.epsCalc !== 0 && Math.abs(h.eps / h.epsCalc - 1) > 0.1;
    const now = all.rows[u.s].now;
    const peLine = now ? `<p class="note" style="margin-bottom:6px"><b>P/E hiện tại ${now.eps > 0 ? fmt.n(now.price / now.eps, 1) : 'không tính được vì lỗ'}</b> = giá ${fmt.n(now.price)} đồng ÷ EPS ${fmt.n(now.eps)} đồng. EPS = LN 4 quý đến ${esc(now.q)} ${fmt.n(now.ttm, 1)} tỷ ÷ ${fmt.n(now.shares, 1)} triệu cổ phiếu${now.split > 1 ? `, đã nhân ${fmt.n(now.split, 2)} lần vì chia cổ phiếu sau cuối quý` : ''}.</p>` : '';
    return `${peLine}<div class="table-wrap"><table><thead><tr><th class="l">Quý</th><th title="Doanh thu thuần. Ngân hàng là tổng thu nhập hoạt động">Doanh thu (tỷ)</th><th title="Lợi nhuận sau thuế của cổ đông công ty mẹ trong quý">LN công ty mẹ (tỷ)</th><th title="Cộng lợi nhuận công ty mẹ 4 quý gần nhất">LN 4 quý (tỷ)</th><th>Vốn chủ (tỷ)</th><th title="Số lớn hơn giữa vốn điều lệ chia 10.000 đồng và vốn chủ chia giá trị sổ sách mỗi cổ phiếu">Cổ phiếu (triệu)</th><th>ROE</th><th>LN tăng</th><th>DT tăng</th><th title="LN 4 quý chia số cổ phiếu">EPS tính lại</th><th title="Số do nguồn cung cấp, chỉ để đối chiếu">EPS nguồn</th>${bank ? '<th>Nợ xấu</th>' : ''}</tr></thead><tbody>
      ${[...hist].reverse().map((h) => `<tr><td class="l num">${esc(h.q)}</td><td class="num">${fmt.n(h.sales, 1)}</td><td class="num ${toneOf(h.profit)}">${fmt.n(h.profit, 1)}</td><td class="num">${fmt.n(h.ttm, 1)}</td><td class="num">${fmt.n(h.equity, 1)}</td><td class="num">${fmt.n(h.shares, 1)}</td><td class="num">${fmt.pctAbs(h.roe, 2)}</td><td class="num ${toneOf(h.npat)}">${fmt.pct(h.npat)}</td><td class="num ${toneOf(h.rev)}">${fmt.pct(h.rev)}</td><td class="num">${fmt.n(h.epsCalc)}</td><td class="num ${off(h) ? 'down' : ''}">${fmt.n(h.eps)}</td>${bank ? `<td class="num">${fmt.pctAbs(h.npl, 2)}</td>` : ''}</tr>`).join('')}
      </tbody></table></div>
      <p class="note" style="margin-top:6px">Cách tự kiểm: LN tăng và DT tăng so với cùng quý năm trước. ROE doanh nghiệp thường bằng lợi nhuận trong quý chia vốn chủ cuối kỳ. Ngân hàng, chứng khoán, bảo hiểm dùng cách khác, gần với LN 4 quý chia vốn chủ bình quân, nên không tính lại khớp hoàn toàn và không so ROE giữa các nhóm. EPS tính lại bằng LN công ty mẹ 4 quý chia số cổ phiếu. EPS nguồn chỉ để đối chiếu, số đỏ là lệch trên 10% so với EPS tính lại: với doanh nghiệp thường, nguồn thường chậm một quý và gồm cả cổ đông thiểu số. Số cổ phiếu là ước lượng từ vốn điều lệ, giá trị sổ sách và lần chia cổ phiếu sau kỳ, chưa trừ hết cổ phiếu quỹ.</p>
      <p class="note">Bảng hiện báo cáo mới nhất. P/E hiện tại chỉ dùng báo cáo đã qua ${fmt.n(all.lag)} ngày kể từ cuối quý, vì nguồn không có ngày công bố. Số tài chính chưa tính vào Điểm và Kết luận.</p>`;
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
    const rows = [...events].reverse().filter((e) => !INTERNAL.test(e.key)).slice(0, 40);
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
    const w = state.thData.window;
    const m = state.thData.rows[u.s]?.w;
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
    const shown = data.events.filter((e) => !INTERNAL.test(e.key));
    if (state.tf === 'd') markers = shown.map((e) => ({ i: e.t, side: C.setup(e.key)?.side === 'risk' ? 'risk' : 'long', key: e.key }));
    else {
      markers = shown.map((e) => {
        const i = bars.findIndex((b) => b.gi >= e.gi);
        return { i, side: C.setup(e.key)?.side === 'risk' ? 'risk' : 'long', key: e.key };
      }).filter((m) => m.i >= 0);
    }
    state.chart.show = state.show;
    state.chart.panes = state.panes;
    const p = C.plan(u, { ...CHART_PLAN, entry: u.px });
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
    bindNav();
    $('#add-basket').addEventListener('click', (e) => {
      if (!window.Picks.toggle(u.s)) return;
      const on = state.basket.syms.includes(u.s);
      e.currentTarget.setAttribute('aria-pressed', on);
      e.currentTarget.textContent = on ? 'Đã có trong giỏ' : 'Thêm vào giỏ';
      toast(on ? `Đã thêm ${u.s} vào giỏ` : `Đã bỏ ${u.s} khỏi giỏ`);
    });
  }

  function stepSymbol(d) {
    const i = state.list.indexOf(state.sym);
    if (i < 0 && d < 0) return;
    const next = state.list[Math.max(0, Math.min(state.list.length - 1, i + d))];
    if (next && next !== state.sym) go('symbol', next);
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
  const ROUTES = { find: 'tim-ma', basket: 'gio' };

  function go(tab, sym) {
    state.tab = tab;
    if (sym) state.sym = sym;
    if (tab !== 'symbol' && state.chart) { state.chart.destroy(); state.chart = null; }
    const token = tab === 'symbol' ? 'ma-' + state.sym : ROUTES[tab];
    try { history.replaceState(null, '', '#' + token); } catch { /* khung nhúng có thể chặn */ }
    $$('.tab').forEach((b) => b.setAttribute('aria-selected', b.dataset.tab === tab));
    window.scrollTo(0, 0);
    ({ find: window.Picks.renderFind, symbol: renderSymbol, basket: window.Picks.renderBasket }[tab])();
  }

  function fromHash() {
    const h = decodeURIComponent(location.hash.slice(1));
    if (h.startsWith('ma-')) {
      const s = h.slice(3).toUpperCase();
      if (store.bySym.has(s)) return ['symbol', s];
    }
    const tab = Object.keys(ROUTES).find((k) => ROUTES[k] === h);
    return [tab || 'find', null];
  }

  function badge() {
    const n = state.basket.syms.length;
    $$('#basket-count').forEach((el) => { el.textContent = n; el.hidden = !n; });
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
      if (a && !e.target.closest('input,select')) go('symbol', a.dataset.sym);
    });
    document.addEventListener('keydown', (e) => {
      const typing = /INPUT|SELECT|TEXTAREA/.test(e.target.tagName);
      if (e.key === '/' && !typing) { e.preventDefault(); $('#search').focus(); return; }
      if (typing) return;
      if (state.tab === 'find') window.Picks.onKey(e);
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
    window.Picks.init({ state, save, go, chip, toast, legend, linePlot, ICON, DOC, badge });
    badge();
    const help = $('#help');
    const setHelp = (open) => { help.hidden = !open; $('#help-btn').setAttribute('aria-expanded', open); };
    setHelp(!save.get('seenHelp', false));
    $('#help-btn').addEventListener('click', () => setHelp(help.hidden));
    $('#help-close').addEventListener('click', () => { save.set('seenHelp', true); setHelp(false); });
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
