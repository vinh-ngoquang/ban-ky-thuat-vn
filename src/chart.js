/* Biểu đồ nến trên canvas: nhiều khung xếp dọc, mỗi khung một trục (không có trục đôi).
   Kéo để cuộn, lăn chuột hoặc chụm hai ngón để phóng to, phím mũi tên để đi từng nến. */
(function () {
  const AXIS_W = 62, TIME_H = 22, GAP = 8, RIGHT_BARS = 9;
  const MONTHS = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8', 'T9', 'T10', 'T11', 'T12'];

  const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  function niceStep(range, count) {
    const raw = range / Math.max(count, 1);
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const n = raw / mag;
    return (n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10) * mag;
  }

  function fmtPrice(v) {
    return v >= 1000 ? v.toFixed(0) : v >= 100 ? v.toFixed(1) : v.toFixed(2);
  }

  function fmtShort(v) {
    const a = Math.abs(v);
    if (a >= 1e9) return (v / 1e9).toFixed(1) + ' tỷ';
    if (a >= 1e6) return (v / 1e6).toFixed(1) + ' tr';
    if (a >= 1e3) return (v / 1e3).toFixed(0) + ' N';
    return v.toFixed(0);
  }

  class StockChart {
    constructor(host, opts = {}) {
      this.host = host;
      this.onHover = opts.onHover || (() => {});
      this.canvas = document.createElement('canvas');
      this.canvas.tabIndex = 0;
      this.canvas.className = 'chart-canvas';
      this.canvas.setAttribute('role', 'img');
      host.appendChild(this.canvas);
      this.ctx = this.canvas.getContext('2d');
      this.bars = [];
      this.series = {};
      this.layers = { sr: [], plan: null, markers: [], profile: null, poc: null };
      this.show = { ma20: true, ma50: true, ma200: true, bb: false, sr: true, plan: true, markers: true, profile: true };
      this.panes = ['volume', 'rsi'];
      this.log = false;
      this.spacing = 8;
      this.right = 0;              // chỉ số nến ở mép phải khung nhìn
      this.hover = null;
      this.dirty = false;
      this.bind();
      this.ro = new ResizeObserver(() => this.resize());
      this.ro.observe(host);
      this.resize();
    }

    destroy() { this.ro.disconnect(); this.canvas.remove(); }

    setData(bars, series, layers) {
      this.bars = bars;
      this.series = series || {};
      this.layers = Object.assign({ sr: [], plan: null, markers: [], profile: null, poc: null }, layers || {});
      this.resetView();
    }

    resetView() {
      const avail = this.plotW();
      const want = Math.min(this.bars.length, Math.max(60, Math.min(170, Math.floor(avail / 7))));
      this.spacing = clamp(avail / (want + RIGHT_BARS), 2, 26);
      this.right = this.bars.length - 1 + RIGHT_BARS;
      this.draw();
    }

    plotW() { return Math.max(40, this.w - AXIS_W); }

    resize() {
      const r = this.host.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      this.w = Math.max(120, Math.floor(r.width));
      this.h = Math.max(160, Math.floor(r.height));
      this.canvas.width = this.w * dpr;
      this.canvas.height = this.h * dpr;
      this.canvas.style.width = this.w + 'px';
      this.canvas.style.height = this.h + 'px';
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.draw();
    }

    /* ---- tọa độ ---- */
    x(i) { return this.plotW() - (this.right - i + 0.5) * this.spacing; }
    indexAt(px) { return Math.round(this.right + 0.5 - (this.plotW() - px) / this.spacing); }
    visibleRange() {
      const left = Math.max(0, Math.floor(this.right - this.plotW() / this.spacing));
      return [left, Math.min(this.bars.length - 1, Math.ceil(this.right))];
    }

    layout() {
      const extra = this.panes.length;
      const total = this.h - TIME_H;
      const small = extra ? Math.min(92, Math.max(56, total * 0.17)) : 0;
      const priceH = total - extra * (small + GAP);
      const out = { price: { top: 0, h: priceH } };
      let y = priceH + GAP;
      for (const p of this.panes) { out[p] = { top: y, h: small }; y += small + GAP; }
      return out;
    }

    /* ---- tương tác ---- */
    bind() {
      const c = this.canvas;
      let drag = null;
      const pos = (e) => { const r = c.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
      c.addEventListener('pointerdown', (e) => {
        if (e.pointerType === 'touch' && this.touches && this.touches.size >= 1) return;
        const p = pos(e);
        drag = { x: p.x, right: this.right };
        c.setPointerCapture(e.pointerId);
        c.classList.add('grabbing');
      });
      c.addEventListener('pointermove', (e) => {
        const p = pos(e);
        if (drag) {
          this.right = this.clampRight(drag.right - (p.x - drag.x) / this.spacing);
        }
        this.setHover(p);
      });
      const end = () => { drag = null; c.classList.remove('grabbing'); };
      c.addEventListener('pointerup', end);
      c.addEventListener('pointercancel', end);
      c.addEventListener('pointerleave', () => { if (!drag) this.setHover(null); });
      c.addEventListener('dblclick', () => this.resetView());
      c.addEventListener('wheel', (e) => {
        if (!e.ctrlKey && Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
          e.preventDefault();
          this.right = this.clampRight(this.right + e.deltaX / this.spacing);
          this.draw();
          return;
        }
        e.preventDefault();
        const p = pos(e);
        this.zoomAt(p.x, Math.exp(-e.deltaY * 0.0016));
      }, { passive: false });
      c.addEventListener('keydown', (e) => {
        const n = this.bars.length;
        if (!n) return;
        const i = this.hover ? this.hover.i : n - 1;
        const go = (t) => { e.preventDefault(); this.focusBar(clamp(t, 0, n - 1)); };
        if (e.key === 'ArrowLeft') go(i - 1);
        else if (e.key === 'ArrowRight') go(i + 1);
        else if (e.key === 'Home') go(0);
        else if (e.key === 'End') go(n - 1);
        else if (e.key === '+' || e.key === '=') { e.preventDefault(); this.zoomAt(this.plotW() * 0.8, 1.2); }
        else if (e.key === '-') { e.preventDefault(); this.zoomAt(this.plotW() * 0.8, 1 / 1.2); }
        else if (e.key === 'Escape') { this.setHover(null); }
      });
      // chụm hai ngón trên màn hình cảm ứng
      this.touches = new Map();
      let pinch = null;
      c.addEventListener('touchstart', (e) => {
        if (e.touches.length === 2) {
          drag = null;
          pinch = { d: Math.abs(e.touches[0].clientX - e.touches[1].clientX), s: this.spacing };
        }
      }, { passive: true });
      c.addEventListener('touchmove', (e) => {
        if (e.touches.length === 2 && pinch) {
          e.preventDefault();
          const d = Math.abs(e.touches[0].clientX - e.touches[1].clientX);
          const r = c.getBoundingClientRect();
          const mid = (e.touches[0].clientX + e.touches[1].clientX) / 2 - r.left;
          this.zoomAt(mid, (pinch.s * d / Math.max(pinch.d, 10)) / this.spacing);
        }
      }, { passive: false });
      c.addEventListener('touchend', () => { pinch = null; });
    }

    clampRight(r) {
      const n = this.bars.length;
      const barsInView = this.plotW() / this.spacing;
      return clamp(r, Math.min(barsInView * 0.3, n - 1), n - 1 + RIGHT_BARS * 3);
    }

    zoomAt(px, factor) {
      const before = this.right - (this.plotW() - px) / this.spacing;
      const min = Math.max(1.2, this.plotW() / Math.max(this.bars.length + RIGHT_BARS, 20));
      this.spacing = clamp(this.spacing * factor, min, 36);
      this.right = this.clampRight(before + (this.plotW() - px) / this.spacing);
      this.draw();
    }

    focusBar(i) {
      const [a, b] = this.visibleRange();
      if (i <= a) this.right = this.clampRight(this.right - (a - i + 3));
      if (i >= b) this.right = this.clampRight(this.right + (i - b + 3));
      this.hover = { i, x: this.x(i), y: null };
      this.onHover(i);
      this.draw();
    }

    setHover(p) {
      if (!p) {
        if (this.hover) { this.hover = null; this.onHover(null); this.draw(); }
        return;
      }
      const n = this.bars.length;
      if (!n) return;
      const i = clamp(this.indexAt(p.x), 0, n - 1);
      this.hover = { i, x: p.x, y: p.y };
      this.onHover(i);
      this.draw();
    }

    /* ---- vẽ ---- */
    draw() {
      if (this.dirty || !this.w) return;
      this.dirty = true;
      requestAnimationFrame(() => { this.dirty = false; this.paint(); });
    }

    paint() {
      const ctx = this.ctx;
      ctx.clearRect(0, 0, this.w, this.h);
      if (!this.bars.length) return;
      const colors = this.colors = {
        up: css('--up'), down: css('--down'), ref: css('--ref'), ceil: css('--ceil'), floor: css('--floor'),
        grid: css('--grid'), axis: css('--axis'), fg: css('--fg'), muted: css('--muted'), panel: css('--panel'),
        ma20: css('--s-ma20'), ma50: css('--s-ma50'), ma200: css('--s-ma200'), band: css('--s-band'),
        accent: css('--accent'), profile: css('--profile'),
      };
      ctx.font = '11px ' + css('--font-num');
      ctx.textBaseline = 'middle';
      const L = this.layout();
      const [a, b] = this.visibleRange();
      this.paintPrice(L.price, a, b, colors);
      for (const p of this.panes) {
        if (!L[p]) continue;
        if (p === 'volume') this.paintVolume(L[p], a, b, colors);
        else if (p === 'rsi') this.paintRsi(L[p], a, b, colors);
        else if (p === 'macd') this.paintMacd(L[p], a, b, colors);
        else if (p === 'rs') this.paintRs(L[p], a, b, colors);
      }
      this.paintTime(a, b, colors);
      this.paintCrosshair(L, colors);
    }

    scaleFor(pane, lo, hi, pad = 0.06, log = false) {
      if (lo === hi) { lo -= 1; hi += 1; }
      if (log && lo > 0) {
        const llo = Math.log(lo), lhi = Math.log(hi), m = (lhi - llo) * pad;
        const top = lhi + m, bot = llo - m;
        const f = (v) => pane.top + (top - Math.log(v)) / (top - bot) * pane.h;
        f.inv = (y) => Math.exp(top - (y - pane.top) / pane.h * (top - bot));
        f.lo = Math.exp(bot); f.hi = Math.exp(top);
        return f;
      }
      const m = (hi - lo) * pad;
      const top = hi + m, bot = lo - m;
      const f = (v) => pane.top + (top - v) / (top - bot) * pane.h;
      f.inv = (y) => top - (y - pane.top) / pane.h * (top - bot);
      f.lo = bot; f.hi = top;
      return f;
    }

    yAxis(pane, y, colors, count, fmt) {
      const ctx = this.ctx;
      const step = niceStep(y.hi - y.lo, count);
      const first = Math.ceil(y.lo / step) * step;
      ctx.strokeStyle = colors.grid;
      ctx.lineWidth = 1;
      ctx.fillStyle = colors.muted;
      ctx.textAlign = 'left';
      for (let v = first; v <= y.hi; v += step) {
        const py = Math.round(y(v)) + 0.5;
        if (py < pane.top + 6 || py > pane.top + pane.h - 6) continue;
        ctx.beginPath(); ctx.moveTo(0, py); ctx.lineTo(this.plotW(), py); ctx.stroke();
        ctx.fillText(fmt(v), this.plotW() + 7, py);
      }
    }

    line(values, a, b, y, color, width = 1.5) {
      const ctx = this.ctx;
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.beginPath();
      let started = false;
      for (let i = a; i <= b; i++) {
        const v = values[i];
        if (v == null || Number.isNaN(v)) { started = false; continue; }
        const px = this.x(i), py = y(v);
        if (started) ctx.lineTo(px, py); else { ctx.moveTo(px, py); started = true; }
      }
      ctx.stroke();
    }

    paintPrice(pane, a, b, colors) {
      const ctx = this.ctx;
      const { bars, series: s, layers, show } = this;
      let lo = Infinity, hi = -Infinity;
      for (let i = a; i <= b; i++) { lo = Math.min(lo, bars[i].l); hi = Math.max(hi, bars[i].h); }
      if (show.plan && layers.plan) {
        const p = layers.plan;
        if (p.stop > lo * 0.8) lo = Math.min(lo, p.stop);
        if (p.target < hi * 1.35) hi = Math.max(hi, p.target);
      }
      if (show.bb && s.bbUp) for (let i = a; i <= b; i++) {
        if (s.bbUp[i] != null) { hi = Math.max(hi, s.bbUp[i]); lo = Math.min(lo, s.bbLo[i]); }
      }
      const y = this.scaleFor(pane, lo, hi, 0.07, this.log);
      this.priceScale = y;
      this.yAxis(pane, y, colors, Math.max(3, Math.round(pane.h / 62)), fmtPrice);

      ctx.save();
      ctx.beginPath();
      ctx.rect(0, pane.top, this.plotW(), pane.h);
      ctx.clip();

      if (show.profile && layers.profile) this.paintProfile(pane, y, colors, a, b);

      if (show.bb && s.bbUp) {
        ctx.beginPath();
        let began = false;
        for (let i = a; i <= b; i++) {
          if (s.bbUp[i] == null) continue;
          const px = this.x(i), py = y(s.bbUp[i]);
          if (began) ctx.lineTo(px, py); else { ctx.moveTo(px, py); began = true; }
        }
        for (let i = b; i >= a; i--) {
          if (s.bbLo[i] == null) continue;
          ctx.lineTo(this.x(i), y(s.bbLo[i]));
        }
        ctx.closePath();
        ctx.fillStyle = colors.band;
        ctx.fill();
      }

      if (show.sr) for (const lv of layers.sr) {
        if (lv.price < y.lo || lv.price > y.hi) continue;
        const py = Math.round(y(lv.price)) + 0.5;
        ctx.strokeStyle = lv.kind === 'res' ? colors.down : colors.up;
        ctx.globalAlpha = 0.25 + 0.11 * Math.min(lv.touches, 5);
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(0, py); ctx.lineTo(this.plotW(), py); ctx.stroke();
        ctx.globalAlpha = 1;
      }

      if (show.ema && s.e200) {
        for (const [k, tok] of [['e200', '--s-e200'], ['e150', '--s-e150'], ['e50', '--s-e50'], ['e20', '--s-e20'], ['e10', '--s-e10']]) {
          this.line(s[k], a, b, y, css(tok), k === 'e10' ? 1.25 : 1.5);
        }
      }
      if (show.poc && layers.poc) {
        for (const seg of layers.poc) {
          if (seg.b < a || seg.a > b || seg.price < y.lo || seg.price > y.hi) continue;
          const py = Math.round(y(seg.price));
          ctx.fillStyle = colors.accent;
          ctx.fillRect(this.x(seg.a), py - 1, Math.max(4, this.x(seg.b) - this.x(seg.a)), 3);
        }
      }

      if (show.ma200 && s.ma200) this.line(s.ma200, a, b, y, colors.ma200, 1.5);
      if (show.ma50 && s.ma50) this.line(s.ma50, a, b, y, colors.ma50, 1.5);
      if (show.ma20 && s.ma20) this.line(s.ma20, a, b, y, colors.ma20, 1.25);

      const body = Math.max(1, Math.min(this.spacing * 0.68, 15));
      for (let i = a; i <= b; i++) {
        const t = bars[i];
        const col = t.limit === 'ceil' ? colors.ceil : t.limit === 'floor' ? colors.floor
          : t.c > t.o ? colors.up : t.c < t.o ? colors.down : colors.ref;
        const px = Math.round(this.x(i));
        ctx.strokeStyle = col;
        ctx.fillStyle = col;
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(px + 0.5, y(t.h)); ctx.lineTo(px + 0.5, y(t.l)); ctx.stroke();
        const top = y(Math.max(t.o, t.c)), bot = y(Math.min(t.o, t.c));
        ctx.fillRect(px + 0.5 - body / 2, top, body, Math.max(1, bot - top));
      }

      if (show.markers) for (const mk of layers.markers) {
        if (mk.i < a || mk.i > b) continue;
        const t = bars[mk.i];
        const px = this.x(mk.i);
        const py = mk.side === 'risk' ? y(t.h) - 9 : y(t.l) + 9;
        const dir = mk.side === 'risk' ? 1 : -1;
        ctx.fillStyle = mk.side === 'risk' ? colors.down : colors.accent;
        ctx.strokeStyle = colors.panel;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(px, py + dir * 5);
        ctx.lineTo(px - 5, py - dir * 4);
        ctx.lineTo(px + 5, py - dir * 4);
        ctx.closePath();
        ctx.stroke();
        ctx.fill();
      }

      if (show.plan && layers.plan) this.paintPlan(layers.plan, y, colors);

      ctx.restore();

      // nhãn các mức trên trục giá
      const last = bars[bars.length - 1];
      const labels = [];
      if (show.plan && layers.plan) {
        labels.push({ v: layers.plan.target, col: colors.up, text: fmtPrice(layers.plan.target) });
        labels.push({ v: layers.plan.stop, col: colors.down, text: fmtPrice(layers.plan.stop) });
      }
      labels.push({ v: last.c, col: last.c >= last.o ? colors.up : colors.down, text: fmtPrice(last.c), strong: true });
      labels.sort((p, q) => q.v - p.v);
      let prevY = -99;
      for (const lb of labels) {
        let py = y(lb.v);
        if (py < pane.top + 8 || py > pane.top + pane.h - 8) continue;
        py = Math.max(py, prevY + 17);
        prevY = py;
        ctx.fillStyle = lb.col;
        ctx.fillRect(this.plotW() + 1, py - 8, AXIS_W - 2, 16);
        ctx.fillStyle = css('--on-mark');
        ctx.textAlign = 'left';
        ctx.fillText(lb.text, this.plotW() + 6, py + 0.5);
      }
    }

    paintPlan(p, y, colors) {
      const ctx = this.ctx;
      const n = this.bars.length;
      const x0 = this.x(n - 1) + this.spacing;
      const x1 = this.plotW();
      if (x1 - x0 < 8) return;
      const yE = y(p.entry), yS = y(p.stop), yT = y(p.target);
      ctx.globalAlpha = 0.16;
      ctx.fillStyle = colors.up;
      ctx.fillRect(x0, yT, x1 - x0, yE - yT);
      ctx.fillStyle = colors.down;
      ctx.fillRect(x0, yE, x1 - x0, yS - yE);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = colors.fg;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x0, Math.round(yE) + 0.5); ctx.lineTo(x1, Math.round(yE) + 0.5); ctx.stroke();
    }

    paintProfile(pane, y, colors, a, b) {
      const ctx = this.ctx;
      const { bins, lo, step, poc } = this.layers.profile;
      const peak = Math.max(...bins);
      if (!peak) return;
      const maxW = Math.min(this.plotW() * 0.2, 150);
      ctx.fillStyle = colors.profile;
      bins.forEach((v, i) => {
        const y0 = y(lo + (i + 1) * step), y1 = y(lo + i * step);
        const h = Math.max(1, y1 - y0 - 1);
        const w = v / peak * maxW;
        ctx.globalAlpha = i === poc ? 0.55 : 0.28;
        ctx.fillRect(0, y0, w, h);
      });
      ctx.globalAlpha = 1;
    }

    paintVolume(pane, a, b, colors) {
      const ctx = this.ctx;
      const { bars, series: s } = this;
      let hi = 0;
      for (let i = a; i <= b; i++) hi = Math.max(hi, bars[i].v);
      const y = (v) => pane.top + pane.h - v / (hi || 1) * pane.h;
      ctx.fillStyle = colors.muted;
      ctx.textAlign = 'left';
      ctx.fillText(fmtShort(hi), this.plotW() + 7, pane.top + 6);
      const w = Math.max(1, Math.min(this.spacing * 0.68, 15));
      for (let i = a; i <= b; i++) {
        const t = bars[i];
        ctx.fillStyle = t.c >= t.o ? colors.up : colors.down;
        ctx.globalAlpha = 0.5;
        const px = Math.round(this.x(i));
        ctx.fillRect(px + 0.5 - w / 2, y(t.v), w, pane.top + pane.h - y(t.v));
      }
      ctx.globalAlpha = 1;
      if (s.volAvg) this.line(s.volAvg, a, b, y, colors.fg, 1);
      this.paneLabel(pane, 'Khối lượng · TB20', colors);
      this.baseline(pane, colors);
    }

    paintRsi(pane, a, b, colors) {
      const ctx = this.ctx;
      const y = (v) => pane.top + (100 - v) / 100 * pane.h;
      ctx.fillStyle = colors.band;
      ctx.fillRect(0, y(70), this.plotW(), y(30) - y(70));
      ctx.strokeStyle = colors.grid;
      ctx.lineWidth = 1;
      ctx.fillStyle = colors.muted;
      ctx.textAlign = 'left';
      for (const v of [30, 70]) {
        ctx.beginPath(); ctx.moveTo(0, Math.round(y(v)) + 0.5); ctx.lineTo(this.plotW(), Math.round(y(v)) + 0.5); ctx.stroke();
        ctx.fillText(String(v), this.plotW() + 7, y(v));
      }
      if (this.series.rsi) this.line(this.series.rsi, a, b, y, colors.accent, 1.5);
      this.paneLabel(pane, 'RSI 14', colors);
    }

    paintMacd(pane, a, b, colors) {
      const s = this.series;
      if (!s.macd) return;
      const ctx = this.ctx;
      let m = 0;
      for (let i = a; i <= b; i++) for (const arr of [s.macd, s.macdSignal, s.macdHist]) {
        if (arr[i] != null) m = Math.max(m, Math.abs(arr[i]));
      }
      m = m || 1;
      const y = (v) => pane.top + pane.h / 2 - v / m * (pane.h / 2 - 3);
      ctx.fillStyle = colors.muted;
      ctx.textAlign = 'left';
      ctx.fillText('0', this.plotW() + 7, y(0));
      ctx.strokeStyle = colors.grid;
      ctx.beginPath(); ctx.moveTo(0, Math.round(y(0)) + 0.5); ctx.lineTo(this.plotW(), Math.round(y(0)) + 0.5); ctx.stroke();
      const w = Math.max(1, Math.min(this.spacing * 0.6, 12));
      for (let i = a; i <= b; i++) {
        const v = s.macdHist[i];
        if (v == null) continue;
        ctx.fillStyle = v >= 0 ? colors.up : colors.down;
        ctx.globalAlpha = 0.55;
        ctx.fillRect(this.x(i) - w / 2, Math.min(y(v), y(0)), w, Math.abs(y(v) - y(0)));
      }
      ctx.globalAlpha = 1;
      this.line(s.macd, a, b, y, colors.fg, 1.25);
      this.line(s.macdSignal, a, b, y, colors.ma50, 1.25);
      this.paneLabel(pane, 'MACD 12·26·9', colors);
    }

    paintRs(pane, a, b, colors) {
      const s = this.series;
      if (!s.rsLine) return;
      let lo = Infinity, hi = -Infinity;
      for (let i = a; i <= b; i++) {
        const v = s.rsLine[i];
        if (v == null) continue;
        lo = Math.min(lo, v); hi = Math.max(hi, v);
      }
      if (lo === Infinity) return;
      const y = this.scaleFor(pane, lo, hi, 0.1);
      this.yAxis(pane, y, colors, 2, (v) => v.toFixed(0));
      this.line(s.rsLine, a, b, y, colors.accent, 1.5);
      this.paneLabel(pane, 'Sức mạnh so với thị trường · 100 = đầu chuỗi', colors);
    }

    paneLabel(pane, text, colors) {
      const ctx = this.ctx;
      ctx.font = '11px ' + css('--font-body');
      ctx.fillStyle = colors.muted;
      ctx.textAlign = 'left';
      ctx.fillText(text, 8, pane.top + 8);
      ctx.font = '11px ' + css('--font-num');
    }

    baseline(pane, colors) {
      const ctx = this.ctx;
      ctx.strokeStyle = colors.axis;
      ctx.lineWidth = 1;
      const py = Math.round(pane.top + pane.h) + 0.5;
      ctx.beginPath(); ctx.moveTo(0, py); ctx.lineTo(this.plotW(), py); ctx.stroke();
    }

    paintTime(a, b, colors) {
      const ctx = this.ctx;
      const { bars } = this;
      const y0 = this.h - TIME_H + 13;
      ctx.fillStyle = colors.muted;
      ctx.textAlign = 'center';
      const perLabel = Math.ceil(74 / this.spacing);
      let lastX = -999;
      for (let i = a; i <= b; i++) {
        const d = bars[i].t, prev = bars[i - 1] && bars[i - 1].t;
        const newMonth = !prev || prev.slice(0, 7) !== d.slice(0, 7);
        if (!newMonth) continue;
        const px = this.x(i);
        if (px - lastX < Math.max(54, perLabel) || px < 14 || px > this.plotW() - 14) continue;
        const newYear = !prev || prev.slice(0, 4) !== d.slice(0, 4);
        const m = +d.slice(5, 7) - 1;
        ctx.fillText(newYear ? d.slice(0, 4) : MONTHS[m], px, y0);
        lastX = px;
      }
    }

    paintCrosshair(L, colors) {
      if (!this.hover) return;
      const ctx = this.ctx;
      const { i, y: py } = this.hover;
      const px = this.x(i);
      ctx.strokeStyle = colors.muted;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(Math.round(px) + 0.5, 0);
      ctx.lineTo(Math.round(px) + 0.5, this.h - TIME_H);
      ctx.stroke();
      const label = this.bars[i].t.split('-').reverse().join('/');
      ctx.font = '11px ' + css('--font-num');
      const w = ctx.measureText(label).width + 12;
      const bx = clamp(px - w / 2, 0, this.plotW() - w);
      ctx.fillStyle = colors.fg;
      ctx.fillRect(bx, this.h - TIME_H + 3, w, 17);
      ctx.fillStyle = colors.panel;
      ctx.textAlign = 'center';
      ctx.fillText(label, bx + w / 2, this.h - TIME_H + 12);
      const pane = L.price;
      if (py != null && py > pane.top && py < pane.top + pane.h && this.priceScale) {
        const yy = Math.round(py) + 0.5;
        ctx.strokeStyle = colors.muted;
        ctx.beginPath(); ctx.moveTo(0, yy); ctx.lineTo(this.plotW(), yy); ctx.stroke();
        ctx.fillStyle = colors.fg;
        ctx.fillRect(this.plotW() + 1, yy - 8, AXIS_W - 2, 16);
        ctx.fillStyle = colors.panel;
        ctx.textAlign = 'left';
        ctx.fillText(fmtPrice(this.priceScale.inv(py)), this.plotW() + 6, yy + 0.5);
      }
    }
  }

  window.StockChart = StockChart;
})();
