/* Bước 1 Tìm mã và bước 3 Giỏ của tôi, cùng phần đánh giá dùng chung cho trang Xem mã.
   Các hàm giao diện do app.js đưa vào qua Picks.init. */
(function () {
  const C = window.Core;
  const { esc, fmt, isNum, toneOf, store, fold, REGIME } = C;
  const $ = (q, el = document) => el.querySelector(q);
  const $$ = (q, el = document) => [...el.querySelectorAll(q)];

  const TIERS = { first: 0, second: 1, watch: 2, avoid: 3, out: 4 };
  const LENSES = [
    { id: 'best', name: 'Đáng xem nhất', note: 'Qua mọi bộ lọc, xếp hạng cao', test: (r) => r.tier === 'first' || r.tier === 'second' },
    { id: 'pass', name: 'Đạt chất lượng', note: 'Bền, xu hướng tăng, chưa tăng quá xa', test: (r) => !r.fails.length },
    { id: 'thong', name: 'Đang tích lũy', note: 'Đạt từ 4 trên 5 tiêu chí của Thông', test: (r) => r.checks.filter(Boolean).length >= 4 },
    { id: 'stable', name: 'Ít biến động', note: 'Điểm Bền từ 80', test: (r) => r.u.score >= 80 },
    { id: 'all', name: 'Tất cả', note: 'Mọi mã đủ thanh khoản', test: () => true },
  ];
  const THONG_LABELS = ['EMA xếp tầng', 'RSI trên 50', 'EMA chưa giãn', 'Nền tích lũy', 'POC tăng dần'];
  const SIGNAL_LEVELS = { 100: ['good', 'Dẫn dắt'], 60: ['warn', 'Kéo về hoặc Giao cắt vàng'], 30: ['', 'Không có'] };   // theo điểm trụ Tín hiệu
  const BASKET_MIN = 8, BASKET_MAX = 12, BASKET_TARGET = 10, CORR_SESSIONS = 250;

  let kit, state;

  const scoreOf = (r) => {
    const w = store.report.picks.styles[state.pick.style]?.w || store.report.picks.styles.defensive.w;
    const total = Object.values(w).reduce((a, b) => a + b, 0);
    return Object.entries(w).reduce((sum, [k, v]) => sum + (r.pillars[k] ?? 0) * v, 0) / total;
  };
  const roomOf = (r, u) => (isNum(r.res) ? r.res / u.px - 1 : null);
  const rowOf = (sym) => store.report.picks.rows.find((r) => r.s === sym);

  /* ---- đánh giá một mã bằng lời, dùng ở cả danh sách và trang Xem mã ---- */
  function entryOf(r, u) {
    const room = roomOf(r, u);
    if (isNum(u.ext) && u.ext > 4) return { tone: 'bad', text: 'Đã tăng quá xa', note: `Giá cách MA20 ${fmt.n(u.ext, 1)} ATR, mua lúc này là đuổi giá` };
    if (room == null) return { tone: '', text: 'Chưa rõ', note: 'Không xác định được kháng cự phía trên, thường do giá gần đỉnh' };
    if (room < r.stop) return { tone: 'bad', text: 'Chưa đẹp', note: `Tới kháng cự ${fmt.pct(room)}, ít hơn mức có thể lỗ ${fmt.pct(-r.stop)}` };
    if (room < 2 * r.stop) return { tone: 'warn', text: 'Tạm được', note: `Tới kháng cự ${fmt.pct(room)}, chưa đủ gấp đôi mức có thể lỗ ${fmt.pct(-r.stop)}` };
    return { tone: 'good', text: 'Đẹp', note: `Tới kháng cự ${fmt.pct(room)}, gấp từ 2 lần mức có thể lỗ ${fmt.pct(-r.stop)}` };
  }

  function assess(u) {
    const r = rowOf(u.s);
    if (!r) {
      return {
        row: null, tone: 'bad', title: 'Thanh khoản quá thấp', short: 'Không chấm',
        note: `Mã này giao dịch ${fmt.ty(u.adv)}/phiên, dưới ngưỡng ${fmt.n(store.report.minAdv)} tỷ. Khó mua bán và các chỉ số kém tin cậy, nên công cụ không chấm.`,
        checks: [],
      };
    }
    const q = C.quintileOf(u.score);
    const entry = entryOf(r, u);
    const quality = { label: 'Chất lượng', tone: q >= 4 ? 'good' : q === 3 ? 'warn' : 'bad', text: q >= 4 ? 'Bền' : q === 3 ? 'Trung bình' : 'Kém bền', note: `Điểm Bền ${fmt.n(u.score)}, nhóm ${q} trên 5` };
    const trend = { label: 'Xu hướng', tone: u.trend === 'strong' || u.trend === 'up' ? 'good' : u.trend === 'down' ? 'bad' : 'warn', text: C.TREND[u.trend] || '–', note: { strong: 'Giá trên MA50, MA50 trên MA200', up: 'Giá và MA50 trên MA200', side: 'Chưa có hướng rõ', down: 'Giá dưới MA50, MA50 dưới MA200', new: 'Chưa đủ 200 phiên' }[u.trend] || '' };
    const liq = { label: 'Thanh khoản', tone: u.adv >= 10 ? 'good' : 'warn', text: u.adv >= 10 ? 'Dễ mua bán' : 'Hơi mỏng', note: `${fmt.ty(u.adv)} mỗi phiên` };
    const checks = [quality, trend, { label: 'Điểm vào', ...entry }, liq];
    const map = {
      first: entry.tone === 'good'
        ? ['good', 'Đáng cân nhắc mua', 'Đạt chuẩn cao nhất của công cụ và còn khoảng trống tới kháng cự.', 'Đáng cân nhắc']
        : ['warn', 'Mã tốt, chờ điểm vào đẹp hơn', 'Đạt chuẩn cao nhất, nhưng tỷ lệ lời lỗ ở giá hiện tại chưa tốt.', 'Chờ điểm vào'],
      second: ['warn', 'Khá, nên theo dõi thêm', 'Chất lượng ổn nhưng lịch sử cho thấy mua ngay nhóm này gần như không có lợi thế.', 'Theo dõi thêm'],
      watch: ['', 'Chỉ theo dõi', 'Đạt chất lượng nhưng chưa có lý do để hành động.', 'Theo dõi'],
      avoid: ['bad', 'Tạm tránh', r.flags.includes('broke') ? 'Vừa gãy xu hướng trong 3 phiên gần nhất.' : 'Phiên gần nhất giảm mạnh với khối lượng lớn.', 'Tạm tránh'],
      out: ['', 'Chưa đạt tiêu chuẩn', 'Lý do: ' + r.fails.map((f) => ({ score: 'Điểm Bền dưới 60', trend: 'xu hướng chưa tăng', ext: 'giá đã tăng quá xa' }[f])).join(', ') + '.', 'Chưa đạt'],
    }[r.tier];
    return { row: r, tone: map[0], title: map[1], short: map[3], note: map[2], checks, entry };
  }

  /* ---- bước 1: Tìm mã ---- */
  function lensRows(lens) {
    const out = [];
    for (const r of store.report.picks.rows) {
      const u = store.bySym.get(r.s);
      if (!u) continue;
      const row = { ...r, u };
      if (lens.test(row)) out.push(row);
    }
    return out;
  }

  function visible() {
    const o = state.pick;
    const lens = LENSES.find((l) => l.id === o.lens) || LENSES[0];
    const q = fold(o.q.trim());
    return lensRows(lens)
      .filter((r) => (!o.sector || r.u.sector === o.sector) && (!o.easy || r.u.adv >= 10) && (!q || r.u.key.includes(q)))
      .map((r) => ({ ...r, pts: scoreOf(r) }))
      .sort((a, b) => TIERS[a.tier] - TIERS[b.tier] || b.pts - a.pts);
  }

  function renderFind() {
    const R = store.report, P = R.picks, M = store.market, n = M.dates.length - 1, o = state.pick;
    const F = Object.fromEntries(P.funnel.map((x) => [x.key, x.n]));
    const top = P.rows.filter((r) => r.tier === 'first').map((r) => r.s);
    const sectors = [...new Set(P.rows.map((r) => store.bySym.get(r.s)?.sector))].filter(Boolean).sort((a, b) => a.localeCompare(b, 'vi'));
    $('#view').innerHTML = `<div class="view">
      <section class="lede" id="tim-ma">
        <h1>${top.length ? `Hôm nay có ${top.length} mã đạt chuẩn cao nhất: ${esc(top.join(', '))}` : 'Hôm nay chưa có mã đạt chuẩn cao nhất'}</h1>
        <p>Từ ${fmt.n(F.all)} mã, ${fmt.n(F.liquid)} mã đủ thanh khoản, ${fmt.n(F.ext)} mã đạt chất lượng, ${fmt.n(F.second)} mã đáng xem. Thị trường đang ${esc(REGIME[M.regime[n]].toLowerCase())}, chỉ ${fmt.n(M.above200[n])}% mã trên MA200, nên hãy chọn lọc kỹ.</p>
      </section>
      <section class="card" id="danh-sach-ma">
        <div class="lenses" role="group" aria-label="Nhóm mã">
          ${LENSES.map((l) => `<button class="lens" data-l="${l.id}" aria-pressed="${(o.lens || 'best') === l.id}"><b>${esc(l.name)}</b><span>${esc(l.note)}</span></button>`).join('')}
        </div>
        <div class="find-tools">
          <label>Ngành <select id="pk-sector"><option value="">Tất cả</option>${sectors.map((x) => `<option ${o.sector === x ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></label>
          <label>Xếp theo <select id="pk-style">${Object.entries(P.styles).map(([k, s]) => `<option value="${k}" ${o.style === k ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></label>
          <label class="check"><input id="pk-easy" type="checkbox" ${o.easy ? 'checked' : ''}> Chỉ mã từ 10 tỷ mỗi phiên</label>
          <input id="pk-q" type="search" aria-label="Lọc danh sách" placeholder="Lọc theo mã, tên" value="${esc(o.q)}">
          <span class="note" id="pk-count" aria-live="polite"></span>
        </div>
        <div class="table-wrap" id="pk-table" tabindex="0"></div>
        <p class="note find-hint">Bấm một dòng để xem chi tiết mã. Bấm dấu + để đưa vào giỏ. Phím ↑ ↓ để chọn dòng, Enter để mở.</p>
      </section>
      <p class="foot">Danh sách theo quy tắc từ giá và khối lượng, chưa xét báo cáo tài chính hay tin tức. Đây là công cụ phân tích chung, không phải tư vấn đầu tư. <a href="${kit.DOC}" target="_blank" rel="noopener">Xem công thức và giới hạn</a>.</p>
    </div>`;
    const keep = () => kit.save.set('pick', o);
    $$('.lens').forEach((b) => b.addEventListener('click', () => {
      o.lens = b.dataset.l;
      keep();
      $$('.lens').forEach((x) => x.setAttribute('aria-pressed', x === b));
      state.sel = 0;
      drawTable();
    }));
    $('#pk-sector').addEventListener('change', (e) => { o.sector = e.target.value; keep(); drawTable(); });
    $('#pk-style').addEventListener('change', (e) => { o.style = e.target.value; keep(); drawTable(); });
    $('#pk-easy').addEventListener('change', (e) => { o.easy = e.target.checked; keep(); drawTable(); });
    $('#pk-q').addEventListener('input', (e) => { o.q = e.target.value; keep(); drawTable(); });
    drawTable();
  }

  function drawTable() {
    const rows = visible();
    state.list = rows.map((r) => r.s);
    state.sel = Math.min(state.sel, Math.max(0, rows.length - 1));
    $('#pk-count').textContent = `${rows.length} mã`;
    const box = $('#pk-table');
    if (!rows.length) {
      box.innerHTML = '<p class="empty">Không có mã nào khớp. Hãy chọn nhóm khác hoặc bỏ bớt bộ lọc.</p>';
      return;
    }
    box.innerHTML = `<table class="find-table"><thead><tr><th class="l">Mã</th><th class="l">Kết luận</th><th title="Điểm tổng hợp, chỉ so giữa các mã cùng kết luận">Điểm</th><th class="l">4 điều kiện</th><th class="l" title="EMA xếp tầng, RSI trên 50, EMA chưa giãn, Nền tích lũy, POC tăng dần">Tiêu chí Thông</th><th class="l" title="Tín hiệu còn hiệu lực trong 3 phiên gần nhất">Tín hiệu</th><th title="Giá giảm bao nhiêu thì chạm mức cắt lỗ">Có thể lỗ</th><th title="Khoảng cách tới mức giá thường gặp lực bán">Tới kháng cự</th><th title="Giá trị giao dịch trung bình 20 phiên">Thanh khoản</th><th></th></tr></thead><tbody>${rows.map((r, i) => {
      const a = assess(r.u);
      const room = roomOf(r, r.u);
      const inBasket = state.basket.syms.includes(r.s);
      const [sigTone, sigText] = SIGNAL_LEVELS[r.pillars.signal];
      return `<tr class="go ${i === state.sel ? 'sel' : ''}" data-open="${esc(r.s)}">
        <td class="l"><span class="sym">${esc(r.s)}</span><span class="nm">${esc(r.u.short)}</span></td>
        <td class="l">${kit.chip(a.short, a.tone)}</td><td class="num"><b>${fmt.n(r.pts)}</b></td>
        <td class="l"><span class="dots4">${a.checks.map((c) => `<i class="${c.tone}" title="${esc(c.label)}: ${esc(c.text)}"></i>`).join('')}</span></td>
        <td class="l"><span class="dots4" role="img" aria-label="Đạt ${r.checks.filter(Boolean).length} trên 5 tiêu chí Thông">${r.checks.map((ok, k) => `<i class="${ok ? 'good' : 'bad'}" title="${esc(THONG_LABELS[k])}: ${ok ? 'Đạt' : 'Chưa đạt'}"></i>`).join('')}</span></td>
        <td class="l"><span class="dots4" role="img" aria-label="Tín hiệu: ${esc(sigText)}"><i class="${sigTone}" title="Tín hiệu: ${esc(sigText)}"></i></span></td>
        <td class="num">${fmt.pct(-r.stop)}</td><td class="num ${room != null && room < r.stop ? 'down' : ''}">${room == null ? '–' : fmt.pct(room)}</td>
        <td class="num">${fmt.ty(r.u.adv)}</td>
        <td><button class="pk-add" data-add="${esc(r.s)}" aria-pressed="${inBasket}" aria-label="${inBasket ? 'Bỏ' : 'Thêm'} ${esc(r.s)} ${inBasket ? 'khỏi' : 'vào'} giỏ">${inBasket ? '✓' : '+'}</button></td></tr>`;
    }).join('')}</tbody></table>
    <p class="note dots-key"><span class="dots4"><i class="good"></i></span> Đạt <span class="dots4"><i class="warn"></i></span> Tạm <span class="dots4"><i class="bad"></i></span> Chưa đạt. Bốn điều kiện theo thứ tự: Chất lượng, Xu hướng, Điểm vào, Thanh khoản. Tiêu chí Thông theo thứ tự: EMA xếp tầng, RSI trên 50, EMA chưa giãn, Nền tích lũy, POC tăng dần. Tín hiệu trong 3 phiên: xanh là Dẫn dắt, vàng là Kéo về hoặc Giao cắt vàng, xám là không có. Điểm vào so khoảng trống tới kháng cự với mức có thể lỗ, khác trụ Điểm mua trong cột Điểm, vốn đo khoảng cách tới MA20.</p>`;
    $$('tbody tr', box).forEach((tr) => tr.addEventListener('click', (e) => {
      const add = e.target.closest('[data-add]');
      if (add) { toggle(add.dataset.add); drawTable(); return; }
      kit.go('symbol', tr.dataset.open);
    }));
  }

  function moveSel(step) {
    const rows = $$('#pk-table tbody tr');
    if (!rows.length) return;
    rows[state.sel]?.classList.remove('sel');
    state.sel = Math.max(0, Math.min(rows.length - 1, state.sel + step));
    rows[state.sel].classList.add('sel');
    rows[state.sel].scrollIntoView({ block: 'nearest' });
  }

  /* ---- bước 3: Giỏ của tôi ---- */
  function toggle(sym) {
    const b = state.basket;
    if (b.syms.includes(sym)) b.syms = b.syms.filter((x) => x !== sym);
    else if (b.syms.length >= BASKET_MAX) { kit.toast(`Giỏ tối đa ${BASKET_MAX} mã`); return false; } else b.syms = [...b.syms, sym];
    kit.save.set('basket', b);
    kit.badge();
    return true;
  }

  function suggest() {
    const rows = lensRows(LENSES[1]).filter((r) => !r.flags.length).map((r) => ({ ...r, pts: scoreOf(r) })).sort((a, b) => TIERS[a.tier] - TIERS[b.tier] || b.pts - a.pts);
    const bySector = {}, pick = [];
    for (const r of rows) {
      if ((bySector[r.u.sector] || 0) >= 3) continue;
      pick.push(r.s);
      bySector[r.u.sector] = (bySector[r.u.sector] || 0) + 1;
      if (pick.length === BASKET_TARGET) break;
    }
    state.basket.syms = pick;
    kit.save.set('basket', state.basket);
    kit.badge();
    drawBasket();
  }

  /* Khối lượng theo rủi ro, nhưng không vượt phần vốn chia đều cho từng mã trong giỏ. */
  function sized(u, count) {
    const b = state.basket;
    const plan = C.plan(u, { capital: b.capital, riskPct: b.risk, k: 2, targetR: 2, entry: u.px });
    if (!plan) return null;
    const cap = Math.floor(b.capital * 1e6 / count / (u.px * 1000) / 100) * 100;
    if (plan.shares <= cap) return { ...plan, capped: false };
    const shares = Math.max(0, cap), value = shares * u.px * 1000, cost = value * store.report.cost;
    const advVnd = (u.adv || 0) * 1e9;
    return { ...plan, shares, value, loss: shares * plan.riskPs * 1000 + cost, advShare: advVnd ? value / advVnd : Infinity, capped: true };
  }

  function correlation(a, b) {
    const n = a.length;
    if (n < 30) return null;
    const ma = a.reduce((s, x) => s + x, 0) / n, mb = b.reduce((s, x) => s + x, 0) / n;
    let ab = 0, aa = 0, bb = 0;
    for (let i = 0; i < n; i++) { ab += (a[i] - ma) * (b[i] - mb); aa += (a[i] - ma) ** 2; bb += (b[i] - mb) ** 2; }
    return aa && bb ? ab / Math.sqrt(aa * bb) : null;
  }

  function returnsByDay(bars) {
    const part = bars.slice(-(CORR_SESSIONS + 1)), map = new Map();
    for (let i = 1; i < part.length; i++) map.set(part[i].gi, part[i].c / part[i - 1].c - 1);
    return map;
  }

  /* Chạy lại đúng giỏ trên lịch sử, đổi tỷ trọng về ban đầu mỗi phiên. */
  function basketHistory(datas, w) {
    const maps = datas.map((d) => {
      const map = new Map();
      for (let i = 1; i < d.bars.length; i++) map.set(d.bars[i].gi, d.bars[i].c / d.bars[i - 1].c - 1);
      return map;
    });
    const dates = store.market.dates, daily = [];
    let startGi = null;
    for (let g = 1; g < dates.length; g++) {
      let sum = 0, weight = 0;
      maps.forEach((m, i) => { if (m.has(g)) { sum += m.get(g) * w[i]; weight += w[i]; } });
      if (weight < 0.6) continue;
      if (startGi == null) startGi = g;
      daily.push(sum / weight);
    }
    if (daily.length < 60) return null;
    let nav = 1, peak = 1, dd = 0;
    const path = daily.map((r) => { nav *= 1 + r; peak = Math.max(peak, nav); dd = Math.min(dd, nav / peak - 1); return nav; });
    let worst = 0;
    for (let i = 20; i < path.length; i++) worst = Math.min(worst, path[i] / path[i - 20] - 1);
    const P = store.report.picks;
    return { worst, total: nav - 1, dd, days: daily.length, index: P.vnAt ? P.vnLast / P.vnAt[startGi] - 1 : null };
  }

  function renderBasket() {
    $('#view').innerHTML = `<div class="view">
      <section class="lede" id="gio"><h1>Giỏ của tôi</h1>
        <p>Gom các mã bạn quan tâm để xem cần bao nhiêu vốn, rủi ro cả giỏ ra sao và các mã có đi cùng nhau không. Giỏ chỉ lưu trên trình duyệt này.</p></section>
      <section class="card" id="pk-basket"></section>
      <details class="card acc" id="do-tin-cay"><summary>Công cụ này đáng tin đến đâu?</summary>
        <div class="grid-eq acc-body">
          <div id="pk-vn-body"></div><div id="pk-real-body"></div>
        </div></details>
      <p class="foot">Đây là công cụ phân tích chung, không phải tư vấn đầu tư hay khuyến nghị mua bán. VNINDEX chỉ dùng làm mốc so sánh. <a href="${kit.DOC}" target="_blank" rel="noopener">Xem công thức và giới hạn</a>.</p>
    </div>`;
    drawBasket();
    $('#do-tin-cay').addEventListener('toggle', (e) => { if (e.target.open && !$('#pk-vn-chart')) drawEvidence(); });
  }

  async function drawBasket() {
    const box = $('#pk-basket'), b = state.basket;
    if (!box) return;
    const head = `<div class="filters"><label>Vốn <input id="pk-capital" type="number" min="1" step="50" value="${b.capital}"> triệu</label>
      <label>Rủi ro mỗi mã <input id="pk-risk" type="number" min="0.1" max="5" step="0.1" value="${b.risk}"> % vốn</label>
      <button class="icon-btn" id="pk-suggest">Gợi ý giỏ đa dạng</button><button class="icon-btn" id="pk-clear" ${b.syms.length ? '' : 'disabled'}>Xóa giỏ</button></div>`;
    const syms = b.syms.filter((s) => store.bySym.has(s));
    if (!syms.length) {
      box.innerHTML = head + `<div class="empty-box"><p><b>Giỏ đang trống.</b></p><p class="note">Ở bước 1, bấm dấu + bên cạnh mã bạn quan tâm. Hoặc bấm Gợi ý giỏ đa dạng để có 10 mã tốt nhất, tối đa 3 mã mỗi ngành, rồi tự chỉnh lại.</p></div>`;
      bindBasket();
      return;
    }
    box.innerHTML = head + '<p class="skeleton">Đang tính…</p>';
    bindBasket();
    const datas = await Promise.all(syms.map((s) => C.loadSymbol(s)));
    if (state.tab !== 'basket' || !$('#pk-basket')) return;
    const lines = syms.map((s, i) => {
      const u = store.bySym.get(s);
      return { s, u, a: assess(u), plan: sized(u, Math.max(syms.length, BASKET_TARGET)), returns: returnsByDay(datas[i].bars) };
    });
    const capital = b.capital * 1e6;
    const value = lines.reduce((a, l) => a + (l.plan?.value || 0), 0);
    const risk = lines.reduce((a, l) => a + (l.plan?.loss || 0), 0);
    const sectors = new Map();
    lines.forEach((l) => sectors.set(l.u.sector, (sectors.get(l.u.sector) || 0) + (l.plan?.value || 0)));
    const topSector = [...sectors.entries()].sort((x, y) => y[1] - x[1])[0];
    const days = [...lines[0].returns.keys()].filter((d) => lines.every((l) => l.returns.has(d)));
    const series = lines.map((l) => days.map((d) => l.returns.get(d)));
    const corr = series.map((a, i) => series.map((c, j) => (i === j ? 1 : correlation(a, c))));
    const pairs = [];
    for (let i = 0; i < lines.length; i++) for (let j = i + 1; j < lines.length; j++) if (corr[i][j] != null) pairs.push([corr[i][j], lines[i].s, lines[j].s]);
    pairs.sort((x, y) => y[0] - x[0]);
    const avgCorr = pairs.length ? pairs.reduce((a, p) => a + p[0], 0) / pairs.length : null;
    const w = lines.map((l) => (value ? (l.plan?.value || 0) / value : 0));
    const hist = value ? basketHistory(datas, w) : null;

    const warn = [], P = store.report.picks;
    if (lines.length < BASKET_MIN) warn.push(['warn', `Giỏ có ${lines.length} mã, nên có từ ${BASKET_MIN} mã. Theo lịch sử, cùng cách chọn nhưng giữ 5 mã đạt ${fmt.pct(P.top5.ret)} và sụt ${fmt.pct(P.top5.dd, 0)}, còn 10 mã đạt ${fmt.pct(P.top10.ret)}.`]);
    if (value > capital) warn.push(['bad', `Tổng giá trị vượt vốn. Hãy bớt mã hoặc giảm rủi ro.`]);
    if (topSector && value && topSector[1] / value > 0.4) warn.push(['warn', `Ngành ${topSector[0]} chiếm ${fmt.pctAbs(topSector[1] / value, 0)} giá trị giỏ, khá tập trung.`]);
    if (pairs[0] && pairs[0][0] > 0.7) warn.push(['warn', `${pairs[0][1]} và ${pairs[0][2]} thường đi cùng nhau, gần như một khoản đầu tư.`]);
    const weak = lines.filter((l) => l.a.tone === 'bad' || (l.a.row && (l.a.row.tier === 'out' || l.a.row.tier === 'avoid'))).map((l) => l.s);
    if (weak.length) warn.push(['bad', `${weak.join(', ')} đang không đạt tiêu chuẩn hoặc có dấu hiệu xấu.`]);
    const tight = lines.filter((l) => l.plan && l.plan.stopPct < 0.015).map((l) => l.s);
    if (tight.length) warn.push(['warn', `${tight.join(', ')} có mức cắt lỗ cách giá dưới 1,5%, dễ bị chạm bởi dao động bình thường.`]);
    lines.filter((l) => l.plan && l.plan.advShare > 0.1).forEach((l) => warn.push(['bad', `Lệnh ${l.s} bằng ${fmt.pctAbs(l.plan.advShare, 0)} giá trị giao dịch một phiên, khó khớp.`]));

    box.innerHTML = head + `<section class="kpis pk-kpis">
        <div class="kpi"><span class="lb">Cần vốn</span><span class="val">${fmt.vnd(value)}</span><span class="sub">${fmt.pctAbs(value / capital, 0)} vốn, ${lines.length} mã, ${sectors.size} ngành</span></div>
        <div class="kpi"><span class="lb">Lỗ nếu mọi mã chạm cắt lỗ</span><span class="val down">${fmt.vnd(risk)}</span><span class="sub">${fmt.pctAbs(risk / capital)} vốn</span></div>
        <div class="kpi"><span class="lb">20 phiên tệ nhất từng có</span><span class="val down">${hist ? fmt.pct(hist.worst) : '–'}</span><span class="sub">${hist ? 'Nếu giữ đúng giỏ này' : 'Chưa đủ lịch sử'}</span></div>
        <div class="kpi"><span class="lb">Các mã đi cùng nhau</span><span class="val">${avgCorr == null ? '–' : avgCorr < 0.3 ? 'Ít' : avgCorr < 0.5 ? 'Vừa' : 'Nhiều'}</span><span class="sub">${avgCorr == null ? '' : `Tương quan ${fmt.n(avgCorr, 2)}, càng thấp càng đa dạng`}</span></div>
      </section>
      ${warn.length ? `<div class="alerts">${warn.map(([t, m]) => `<div class="alert ${t}">${kit.ICON.warn}<span>${esc(m)}</span></div>`).join('')}</div>` : ''}
      <div class="table-wrap basket-table" style="max-height:none"><table><thead><tr><th class="l">Mã</th><th class="l">Kết luận</th><th>Giá</th><th>Khối lượng</th><th>Giá trị</th><th>Cắt lỗ</th><th>Lỗ tối đa</th><th class="l">Ngành</th><th></th></tr></thead><tbody>
        ${lines.map((l) => `<tr class="go" data-sym="${esc(l.s)}"><td class="l"><b>${esc(l.s)}</b></td><td class="l">${kit.chip(l.a.short, l.a.tone)}</td><td class="num">${fmt.px(l.u.px)}</td><td class="num">${l.plan ? fmt.n(l.plan.shares) : '–'}</td><td class="num">${l.plan ? fmt.vnd(l.plan.value) : '–'}</td><td class="num">${l.plan ? fmt.px(l.plan.stop) : '–'}</td><td class="num down">${l.plan ? fmt.vnd(l.plan.loss) : '–'}</td><td class="l muted">${esc(l.u.sector)}</td><td><button class="pk-add" data-drop="${esc(l.s)}" aria-label="Bỏ ${esc(l.s)}">×</button></td></tr>`).join('')}
      </tbody></table></div>
      ${lines.length >= 2 ? `<details class="acc-inner"><summary>Xem chi tiết tương quan và lịch sử của giỏ</summary><div class="acc-body">
        ${hist && hist.index != null ? `<p class="note">Nếu giữ nguyên giỏ này trong ${fmt.n(hist.days)} phiên qua: ${fmt.pct(hist.total)}, sụt giảm tối đa ${fmt.pct(hist.dd, 0)}, cùng kỳ VNINDEX ${fmt.pct(hist.index)}. Giỏ được chọn bằng dữ liệu hôm nay nên con số này chỉ cho biết mức rung lắc, không phải lợi nhuận kỳ vọng.</p>` : ''}
        <div class="table-wrap" style="max-height:none;border:0"><table class="pk-heat"><thead><tr><th></th>${lines.map((l) => `<th>${esc(l.s)}</th>`).join('')}</tr></thead><tbody>
        ${lines.map((l, i) => `<tr><th>${esc(l.s)}</th>${lines.map((_, j) => { const v = corr[i][j]; return `<td class="num" style="background:color-mix(in srgb, var(--s-e200) ${v == null ? 0 : Math.round(Math.max(0, v) * 60)}%, transparent)">${i === j ? '' : v == null ? '–' : fmt.n(v, 2)}</td>`; }).join('')}</tr>`).join('')}
        </tbody></table></div><p class="note">Càng đỏ, hai mã càng hay đi cùng nhau.</p></div></details>` : ''}`;
    bindBasket();
    $$('[data-drop]', box).forEach((x) => x.addEventListener('click', (e) => { e.stopPropagation(); toggle(x.dataset.drop); drawBasket(); }));
  }

  function bindBasket() {
    const b = state.basket;
    const change = (id, key, min) => {
      const el = $(id);
      if (el) el.addEventListener('change', () => { b[key] = Math.max(min, +el.value || min); kit.save.set('basket', b); drawBasket(); });
    };
    change('#pk-capital', 'capital', 1);
    change('#pk-risk', 'risk', 0.1);
    $('#pk-suggest')?.addEventListener('click', suggest);
    $('#pk-clear')?.addEventListener('click', () => { b.syms = []; kit.save.set('basket', b); kit.badge(); drawBasket(); });
  }

  /* ---- độ tin cậy ---- */
  function drawEvidence() {
    const P = store.report.picks, T = P.top10, S = P.stress;
    const pct = (v) => (isNum(v) ? (v > 0 ? '+' : '') + (v * 100).toFixed(0) + '%' : '–');
    const count = Object.keys(P.styles).length, beat = Object.values(P.styles).filter((s) => s.ret > T.vnRet).length;
    $('#pk-vn-body').innerHTML = `<h3 class="ev-h">Có thắng nắm giữ VNINDEX không?</h3>
      ${kit.legend([['Cân bằng', 'var(--fg)'], ['VNINDEX', 'var(--s-e50)'], ['Mọi mã thanh khoản', 'var(--s-ma200)']])}
      <div id="pk-vn-chart"></div>
      <div class="table-wrap" style="max-height:none;margin-top:8px"><table><thead><tr><th class="l">Giữ 10 mã xếp theo</th><th>Lợi suất</th><th>Sụt giảm</th></tr></thead><tbody>
      ${Object.values(P.styles).map((s) => `<tr><td class="l">${esc(s.name)}</td><td class="num ${toneOf(s.ret)}">${fmt.pct(s.ret)}</td><td class="num">${fmt.pct(s.dd, 0)}</td></tr>`).join('')}
      <tr><td class="l"><b>Nắm giữ VNINDEX</b></td><td class="num"><b>${fmt.pct(T.vnRet)}</b></td><td class="num">${fmt.pct(T.vnDd, 0)}</td></tr></tbody></table></div>
      <p class="note" style="margin-top:6px">${T.periods} kỳ từ ${fmt.day(T.start)}, đã trừ phí. ${beat ? `${beat} trên ${count} cách xếp nhỉnh hơn VNINDEX, có thể một phần do may rủi.` : `Cả ${count} cách xếp đều chưa thắng VNINDEX.`}</p>`;
    kit.linePlot($('#pk-vn-chart'), {
      dates: T.dates, height: 180, fmtY: pct, refLines: [{ v: 0 }],
      series: [{ name: 'Mọi mã thanh khoản', values: T.base.map((v) => v - 1), color: 'var(--s-ma200)' }, { name: 'VNINDEX', values: T.vn.map((v) => v - 1), color: 'var(--s-e50)' }, { name: 'Cân bằng', values: T.port.map((v) => v - 1), color: 'var(--fg)', width: 2 }],
    });
    const hi = Math.max(...P.quarters.map((q) => Math.abs(q.exp)), 0.5);
    const line = (name, a) => `<tr><td class="l">${esc(name)}</td><td class="num">${fmt.n(a.n)}</td><td class="num ${toneOf(a.s0)}">${fmt.r(a.s0)}</td><td class="num ${toneOf(a.s2)}">${fmt.r(a.s2)}</td><td class="num ${toneOf(a.s5)}">${fmt.r(a.s5)}</td></tr>`;
    $('#pk-real-body').innerHTML = `<h3 class="ev-h">Mã đạt chuẩn cao nhất trong thực tế</h3>
      <div class="table-wrap" style="max-height:none"><table><thead><tr><th class="l">Kỳ vọng mỗi lệnh</th><th>Lệnh</th><th>Mô phỏng</th><th>Trượt giá 0,2%</th><th>Trượt giá 0,5%</th></tr></thead><tbody>
      ${line('Chuẩn cao nhất', S.first)}${line('Vào lệnh ngẫu nhiên', S.random)}</tbody></table></div>
      <p class="note" style="margin:8px 0 2px">Kỳ vọng theo quý</p>
      <div class="pk-quarters">${P.quarters.map((q) => `<div title="${esc(q.q)}: ${fmt.r(q.exp)}, ${q.n} lệnh"><i class="${q.exp >= 0 ? 'pos' : 'neg'}" style="height:${Math.abs(q.exp) / hi * 50}%"></i><span class="num">${esc(q.q.slice(2).replace(' ', ''))}</span></div>`).join('')}</div>
      <div class="alerts"><div class="alert">${kit.ICON.warn}<span>1R là số tiền bạn chấp nhận mất cho một lệnh. Lãi trung bình ${fmt.pct(S.first.ret)} mỗi lệnh, gần hết nếu trượt giá 0,5%. 10 lệnh tốt nhất chiếm ${fmt.pctAbs(P.topShare, 0)} tổng kết quả, phần lớn trong năm 2025.</span></div></div>`;
  }

  window.Picks = {
    init(k) { kit = k; state = k.state; },
    renderFind, renderBasket, assess, toggle, rowOf,
    fillList() { if (!state.list.length) state.list = visible().map((r) => r.s); },
    first() {
      if (state.list.length) return state.list[0];
      return lensRows(LENSES[0]).map((r) => ({ ...r, pts: scoreOf(r) })).sort((a, b) => TIERS[a.tier] - TIERS[b.tier] || b.pts - a.pts)[0]?.s || store.report.picks.rows[0].s;
    },
    onKey(e) {
      if (e.key === 'ArrowDown') { e.preventDefault(); moveSel(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); moveSel(-1); }
      else if (e.key === 'Enter' && !e.target.closest?.('button, a')) {
        const r = $$('#pk-table tbody tr')[state.sel];
        if (r) kit.go('symbol', r.dataset.open);
      }
    },
  };
})();
