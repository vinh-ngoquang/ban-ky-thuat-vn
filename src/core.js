/* Dữ liệu, định dạng, chỉ báo và các phép tính kế hoạch. Không chạm vào giao diện. */
(function () {
  const COL = ['s', 'short', 'name', 'ex', 'sector', 'industry', 'px', 'chg', 'score', 'stab', 'pos52', 'trend', 'rs', 'atrp',
    'dist', 'adv', 'volr', 'rsi', 'r5', 'r20', 'r60', 'r250', 'ext', 'atr', 'liquid', 'sigs', 'spark', 'shard', 'type', 'score5', 'trend5'];

  const LIMIT = { HOSE: 0.07, HNX: 0.10, UPCOM: 0.15 };
  const TREND = { strong: 'Tăng mạnh', up: 'Tăng', side: 'Đi ngang', down: 'Giảm', new: 'Chưa đủ lịch sử' };
  const REGIME = { 1: 'Lan tỏa', 0: 'Trung tính', '-1': 'Suy yếu' };

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fold = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
  const isNum = (x) => typeof x === 'number' && Number.isFinite(x);

  const vi = (x, d) => x.toLocaleString('vi-VN', { minimumFractionDigits: d, maximumFractionDigits: d });
  const fmt = {
    px: (x) => (isNum(x) ? vi(x, 2) : '–'),
    pct: (x, d = 1) => (isNum(x) ? (x > 0 ? '+' : '') + vi(x * 100, d) + '%' : '–'),
    pctAbs: (x, d = 1) => (isNum(x) ? vi(x * 100, d) + '%' : '–'),
    n: (x, d = 0) => (isNum(x) ? vi(x, d) : '–'),
    r: (x, d = 2) => (isNum(x) ? (x > 0 ? '+' : '') + vi(x, d) + 'R' : '–'),
    ty: (x) => (!isNum(x) ? '–' : x >= 1000 ? vi(x / 1000, 1) + ' nghìn tỷ' : x >= 10 ? vi(x, 0) + ' tỷ' : vi(x, 1) + ' tỷ'),
    vnd: (x) => {
      if (!isNum(x)) return '–';
      const a = Math.abs(x);
      if (a >= 1e9) return vi(x / 1e9, 2) + ' tỷ';
      if (a >= 1e6) return vi(x / 1e6, 1) + ' triệu';
      return vi(x, 0) + ' đ';
    },
    day: (s) => (s ? s.split('-').reverse().join('/') : '–'),
    dayShort: (s) => (s ? s.slice(8) + '/' + s.slice(5, 7) : '–'),
  };
  const toneOf = (x) => (!isNum(x) || x === 0 ? 'ref' : x > 0 ? 'up' : 'down');

  /* ---- nạp dữ liệu ---- */
  const store = { report: null, market: null, universe: [], bySym: new Map(), shards: new Map(), decoded: new Map() };

  async function getJson(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error('Không đọc được ' + url + ' (mã ' + res.status + ')');
    return res.json();
  }

  async function loadAll() {
    const [report, market, rows] = await Promise.all([
      getJson('data/report.json'), getJson('data/market.json'), getJson('data/universe.json'),
    ]);
    store.report = report;
    store.market = market;
    store.universe = rows.map((r) => {
      const o = {};
      COL.forEach((k, i) => { o[k] = r[i]; });
      if (!isNum(o.atrp) && isNum(o.atr) && o.px) o.atrp = o.atr / o.px;
      o.key = fold(o.s + ' ' + o.short + ' ' + o.name);
      store.bySym.set(o.s, o);
      return o;
    });
  }

  async function loadSymbol(sym) {
    if (store.decoded.has(sym)) return store.decoded.get(sym);
    const u = store.bySym.get(sym);
    if (!u) throw new Error('Không có mã ' + sym);
    if (!store.shards.has(u.shard)) store.shards.set(u.shard, getJson('data/s/' + u.shard + '.json'));
    const shard = await store.shards.get(u.shard);
    const out = decode(shard[sym], u);
    store.decoded.set(sym, out);
    return out;
  }

  async function loadThong() {
    if (!store.thong) store.thong = getJson('data/thong.json');
    return store.thong;
  }

  /* Áp 5 tiêu chí lên số đo thô của một mã. Trả về đạt/không từng tiêu chí và số để hiển thị. */
  function evalThong(u, row, opt, T) {
    const empty = { pass: [false, false, false, false, false], count: 0, missing: true };
    if (!row) return empty;
    const [e10, e20, e50, e150, e200] = row.e;
    const has = [e10, e20, e50, e150, e200].every(isNum);
    const tiers = has ? [row.c > e10, e10 > e20, e20 > e50, e50 > e150, e150 > e200] : [];
    const t1 = has && tiers.every(Boolean);
    const t2 = isNum(u.rsi) && u.rsi > 50;
    const s150 = has ? Math.abs(e50 / e150 - 1) : null;
    const s200 = has ? Math.abs(e50 / e200 - 1) : null;
    const t3 = has && s150 < T.maxSpread && s200 < T.maxSpread;
    const w = row.w[String(opt.window)];
    let t4 = false, t5 = false, base = null;
    if (w) {
      const [range, tight, vol, sup, p1, p2, p3] = w;
      base = { range, tight, vol, sup, p1, p2, p3 };
      const maxRange = opt.maxRange / 100;
      t4 = isNum(range) && isNum(tight) && isNum(vol) && range <= maxRange && tight <= T.tight * range && vol < 1 && (!isNum(sup) || sup < 1);
      t5 = isNum(p1) && isNum(p2) && isNum(p3) && p1 < p2 && p2 < p3;
    }
    const pass = [t1, t2, t3, t4, t5];
    return { pass, count: pass.filter(Boolean).length, tiers: tiers.filter(Boolean).length, hasEma: has, s150, s200, base, cross: row.x };
  }

  function decode(item, u) {
    const dates = store.market.dates;
    const idx = [];
    for (let i = 0; i < item.r.length; i += 2) for (let k = 0; k < item.r[i + 1]; k++) idx.push(item.r[i] + k);
    const up = new Set(item.up), dn = new Set(item.dn);
    let run = 0;
    const bars = idx.map((t, i) => {
      run += item.c[i];
      return {
        t: dates[t], gi: t, c: run / 100, o: (run + item.o[i]) / 100, h: (run + item.h[i]) / 100, l: (run + item.l[i]) / 100,
        v: item.v[i] * 100, limit: up.has(i) ? 'ceil' : dn.has(i) ? 'floor' : null,
      };
    });
    const pos = new Map(idx.map((t, i) => [t, i]));
    const events = item.ev.map(([t, key, r, why]) => ({ t: pos.get(t) ?? null, gi: t, key, r, why, date: dates[t] })).filter((e) => e.t != null);
    return { u, bars, events, levels: item.sr, scores: item.sc };
  }

  /* ---- chỉ báo: cùng công thức với engine.py ---- */
  const nulls = (n) => new Array(n).fill(null);

  function sma(v, n) {
    const out = nulls(v.length);
    let sum = 0;
    for (let i = 0; i < v.length; i++) {
      sum += v[i];
      if (i >= n) sum -= v[i - n];
      if (i >= n - 1) out[i] = sum / n;
    }
    return out;
  }

  function ewm(v, alpha, minPeriods) {
    const out = nulls(v.length);
    let y = null, count = 0;
    for (let i = 0; i < v.length; i++) {
      if (v[i] == null) continue;
      y = y == null ? v[i] : y + alpha * (v[i] - y);
      count++;
      if (count >= minPeriods) out[i] = y;
    }
    return out;
  }

  function rsi(c, n = 14) {
    const gains = nulls(c.length), losses = nulls(c.length);
    for (let i = 1; i < c.length; i++) {
      const d = c[i] - c[i - 1];
      gains[i] = Math.max(d, 0);
      losses[i] = Math.max(-d, 0);
    }
    const g = ewm(gains, 1 / n, n), l = ewm(losses, 1 / n, n);
    return g.map((x, i) => (x == null ? null : l[i] === 0 ? 100 : 100 - 100 / (1 + x / l[i])));
  }

  function macd(c) {
    const e12 = ewm(c, 2 / 13, 12), e26 = ewm(c, 2 / 27, 26);
    const line = c.map((_, i) => (e12[i] == null || e26[i] == null ? null : e12[i] - e26[i]));
    const signal = ewm(line, 0.2, 9);
    return { line, signal, hist: line.map((x, i) => (x == null || signal[i] == null ? null : x - signal[i])) };
  }

  function atr(bars, n = 14) {
    const tr = bars.map((b, i) => {
      if (!i) return b.h - b.l;
      const pc = bars[i - 1].c;
      return Math.max(b.h - b.l, Math.abs(b.h - pc), Math.abs(b.l - pc));
    });
    return ewm(tr, 1 / n, n);
  }

  function bollinger(c, n = 20, k = 2) {
    const mid = sma(c, n);
    const up = nulls(c.length), lo = nulls(c.length);
    for (let i = n - 1; i < c.length; i++) {
      let s = 0;
      for (let j = i - n + 1; j <= i; j++) s += (c[j] - mid[i]) ** 2;
      const sd = Math.sqrt(s / n);
      up[i] = mid[i] + k * sd;
      lo[i] = mid[i] - k * sd;
    }
    return { up, lo };
  }

  function weekly(bars) {
    const out = [];
    let cur = null, key = null;
    for (const b of bars) {
      const d = new Date(b.t + 'T00:00:00Z');
      const monday = new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * 864e5).toISOString().slice(0, 10);
      if (monday !== key) {
        key = monday;
        cur = { t: b.t, gi: b.gi, o: b.o, h: b.h, l: b.l, c: b.c, v: b.v, limit: null };
        out.push(cur);
      } else {
        cur.t = b.t; cur.gi = b.gi; cur.c = b.c; cur.v += b.v;
        cur.h = Math.max(cur.h, b.h); cur.l = Math.min(cur.l, b.l);
      }
    }
    return out;
  }

  function buildSeries(bars) {
    const c = bars.map((b) => b.c);
    const v = bars.map((b) => b.v);
    const bb = bollinger(c);
    const m = macd(c);
    const market = store.market;
    const comp = bars.map((b) => market.comp[b.gi]);
    const first = comp.findIndex((x) => x != null);
    const base = first >= 0 ? c[first] / comp[first] : 1;
    return {
      ma20: sma(c, 20), ma50: sma(c, 50), ma200: sma(c, 200), bbUp: bb.up, bbLo: bb.lo,
      e10: ewm(c, 2 / 11, 10), e20: ewm(c, 2 / 21, 20), e50: ewm(c, 2 / 51, 50), e150: ewm(c, 2 / 151, 150), e200: ewm(c, 2 / 201, 200),
      rsi: rsi(c), macd: m.line, macdSignal: m.signal, macdHist: m.hist,
      volAvg: sma(v, 20), atr: atr(bars), rsLine: c.map((x, i) => (comp[i] ? x / comp[i] / base * 100 : null)),
    };
  }

  /* Phân bố khối lượng theo giá trong n nến gần nhất, chia đều khối lượng trên dải cao–thấp của từng nến. */
  function volumeProfile(bars, n = 120, count = 26) {
    const part = bars.slice(-n);
    if (part.length < 20) return null;
    const lo = Math.min(...part.map((b) => b.l)), hi = Math.max(...part.map((b) => b.h));
    if (!(hi > lo)) return null;
    const step = (hi - lo) / count;
    const bins = new Array(count).fill(0);
    for (const b of part) {
      const a = Math.max(0, Math.floor((b.l - lo) / step)), z = Math.min(count - 1, Math.floor((b.h - lo) / step));
      const each = b.v / (z - a + 1);
      for (let i = a; i <= z; i++) bins[i] += each;
    }
    const poc = bins.indexOf(Math.max(...bins));
    return { bins, lo, step, poc, pocPrice: lo + (poc + 0.5) * step, sessions: part.length };
  }

  /* ---- quy tắc thị trường Việt Nam ---- */
  function tick(price, ex) {
    if (ex !== 'HOSE') return 0.1;
    return price < 10 ? 0.01 : price < 50 ? 0.05 : 0.1;
  }
  const down = (p, t) => Math.floor(p / t + 1e-9) * t;
  const up = (p, t) => Math.ceil(p / t - 1e-9) * t;
  const round2 = (x) => Math.round(x * 100) / 100;

  function priceLimits(close, ex) {
    const lim = LIMIT[ex] ?? 0.07;
    const ceil = round2(down(close * (1 + lim), tick(close * (1 + lim), ex)));
    const floor = round2(up(close * (1 - lim), tick(close * (1 - lim), ex)));
    return { ceil, floor, lim };
  }

  /* Ngày có thể bán sớm nhất: phiên mua + 2 ngày làm việc, chưa trừ ngày nghỉ lễ. */
  function settleDate(asOf) {
    let d = new Date(asOf + 'T00:00:00Z');
    let buyDay = null, left = 3;
    while (left > 0) {
      d = new Date(d.getTime() + 864e5);
      if (d.getUTCDay() % 6 === 0) continue;
      left--;
      if (!buyDay) buyDay = d;
    }
    const iso = (x) => x.toISOString().slice(0, 10);
    return { buy: iso(buyDay), sell: iso(d) };
  }

  function stopHitChance(k) {
    const t = store.report.stops;
    if (k <= t[0].k) return t[0].p;
    for (let i = 1; i < t.length; i++) {
      if (k <= t[i].k) {
        const a = t[i - 1], b = t[i];
        return a.p + (b.p - a.p) * (k - a.k) / (b.k - a.k);
      }
    }
    return t[t.length - 1].p;
  }

  function plan(u, input) {
    const entry = input.entry;
    const ex = u.ex;
    const atrV = u.atr;
    if (!(entry > 0) || !(atrV > 0)) return null;
    const stop = round2(down(entry - input.k * atrV, tick(entry, ex)));
    if (!(stop > 0)) return null;
    const riskPs = entry - stop;
    const target = round2(up(entry + input.targetR * riskPs, tick(entry, ex)));
    const capital = input.capital * 1e6;
    const riskVnd = capital * input.riskPct / 100;
    // tính cả phí vào rủi ro mỗi cổ phiếu, để lỗ khi chạm cắt lỗ không vượt mức người dùng đặt
    const byRisk = Math.floor(riskVnd / ((riskPs + entry * store.report.cost) * 1000) / 100) * 100;
    const byCash = Math.floor(capital / (entry * 1000) / 100) * 100;
    const shares = Math.max(0, Math.min(byRisk, byCash));
    const value = shares * entry * 1000;
    const costVnd = value * store.report.cost;
    const loss = shares * riskPs * 1000 + costVnd;
    const gain = shares * (target - entry) * 1000 - costVnd;
    const advVnd = (u.adv || 0) * 1e9;
    const exitDays = advVnd ? value / (advVnd * 0.2) : Infinity;
    const lim = priceLimits(entry, ex);
    return {
      entry, stop, target, riskPs, shares, value, loss, gain, costVnd, cappedByCash: byCash < byRisk, exitDays,
      pctCapital: value / capital, stopPct: riskPs / entry, targetPct: (target - entry) / entry, hit: stopHitChance(input.k),
      lim, advShare: advVnd ? value / advVnd : Infinity, riskVnd,
    };
  }

  function chandelier(bars, atrSeries) {
    const last = bars.length - 1;
    const a = atrSeries[last];
    if (a == null) return null;
    const high = Math.max(...bars.slice(-22).map((b) => b.h));
    return { stop: high - 3 * a, high };
  }

  /* ---- đọc bằng chứng ---- */
  /* "Có bằng chứng" đòi hỏi cả ba: vượt ngẫu nhiên, kỳ vọng dương rõ, và không sụp ở giai đoạn gần đây. */
  function evidenceLabel(b, late) {
    if (!b || !b.n || b.n < 30 || b.verdict === 'thin') return { tone: '', text: 'Chưa đủ mẫu' };
    const holdsUp = !late || !late.n || late.exp >= -0.1;
    if (b.verdict === 'better' && b.exp >= 0.05 && holdsUp) return { tone: 'good', text: 'Có bằng chứng' };
    if (b.verdict === 'better') return { tone: 'warn', text: 'Đỡ hơn ngẫu nhiên' };
    if (b.verdict === 'worse') return { tone: 'bad', text: 'Kém ngẫu nhiên' };
    if (b.hi < 0) return { tone: 'bad', text: 'Thua lỗ rõ' };
    return { tone: '', text: 'Không hơn ngẫu nhiên' };
  }

  const setup = (key) => store.report.setups.find((s) => s.key === key);
  const quintileOf = (score) => (score == null ? null : Math.min(5, Math.floor(score / 100 * 5) + 1));

  window.Core = {
    COL, LIMIT, TREND, REGIME, esc, fold, isNum, fmt, toneOf, store, loadAll, loadSymbol, sma, ewm, rsi, macd, atr, bollinger, weekly,
    buildSeries, volumeProfile, loadThong, evalThong, tick, priceLimits, settleDate, stopHitChance, plan, chandelier, evidenceLabel, setup, quintileOf,
  };
})();
