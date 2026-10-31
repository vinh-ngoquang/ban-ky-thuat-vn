"""Chỉ báo, tín hiệu và kiểm chứng lịch sử cho toàn thị trường.

Mọi cột tại ngày t chỉ dùng dữ liệu đến hết ngày t. Lệnh kiểm chứng luôn vào ở giá
mở cửa của phiên t+1, nên không có chuyện nhìn trước tương lai.
"""
import pathlib

import numpy as np
import pandas as pd

ROOT = pathlib.Path(__file__).parent
CACHE = ROOT / "cache"

MIN_ADV = 3.0          # tỷ đồng/phiên: ngưỡng thanh khoản để một mã được tính vào thị trường
COST = 0.004           # phí mua + phí bán + thuế bán, khứ hồi
MIN_RISK = 0.01        # bỏ lệnh có khoảng cắt lỗ dưới 1% giá vào
STOP_ATR = 2.0         # cắt lỗ cách giá vào 2 ATR
TARGET_R = 2.0         # chốt lời ở +2R
MAX_HOLD = 20          # giữ tối đa 20 phiên
SETTLE = 2             # bán sớm nhất sau 2 phiên kể từ phiên mua (T+2 chiều)
COOLDOWN = 10          # cùng tín hiệu trên cùng mã phải cách nhau tối thiểu 10 phiên
OOS_SESSIONS = 250     # 250 phiên gần nhất tách riêng để so với phần còn lại
LIMITS = {"HOSE": 0.07, "HNX": 0.10, "UPCOM": 0.15}

SETUPS = {
    "breakout": {"name": "Bứt phá nền", "side": "long",
                 "rule": "Đóng cửa vượt đỉnh 20 phiên, khối lượng từ 1,5 lần trung bình, trên MA50, ngay sau giai đoạn biên độ co hẹp."},
    "pullback": {"name": "Kéo về xu hướng", "side": "long",
                 "rule": "Xu hướng tăng mạnh, giá chạm MA20 hoặc MA50 rồi đóng cửa tăng, RSI 38–58, sức mạnh tương đối từ 50."},
    "leader": {"name": "Dẫn dắt gần đỉnh", "side": "long",
               "rule": "Sức mạnh tương đối từ 90, cách đỉnh 52 tuần không quá 5%, xu hướng tăng mạnh."},
    "squeeze": {"name": "Siết biên độ", "side": "long",
                "rule": "Độ rộng Bollinger trong nhóm 10% hẹp nhất 120 phiên, giá trên MA50, xu hướng không giảm."},
    "golden": {"name": "Giao cắt vàng", "side": "long",
               "rule": "MA50 cắt lên MA200."},
    "oversold": {"name": "Bật từ quá bán", "side": "long",
                 "rule": "RSI vượt lại 30 từ dưới lên, phiên đóng cửa tăng."},
    "breakdown": {"name": "Gãy xu hướng", "side": "risk",
                  "rule": "Đóng cửa thủng MA50 với khối lượng từ 1,3 lần trung bình, phiên trước còn trên MA50."},
    "death": {"name": "Giao cắt tử thần", "side": "risk",
              "rule": "MA50 cắt xuống MA200."},
    "thong": {"name": "Mẫu Thông, đủ 5 tiêu chí", "side": "long",
              "rule": "EMA xếp tầng, RSI trên 50, EMA50 cách EMA150 và EMA200 dưới 20%, nền tích lũy, POC tăng dần qua 3 đoạn."},
    "thong4": {"name": "Mẫu Thông, 4 tiêu chí đầu", "side": "long",
               "rule": "Như Mẫu Thông nhưng chưa yêu cầu POC tăng dần."},
    "pot_a": {"name": "Mã tiềm năng hạng A", "side": "long",
              "rule": "Qua cổng bắt buộc và Điểm kết hợp từ 75."},
    "pot_b": {"name": "Mã tiềm năng hạng A và B", "side": "long",
              "rule": "Qua cổng bắt buộc và Điểm kết hợp từ 60."},
}

# Mã tiềm năng: quy tắc được đặt trước khi xem kết quả, không chỉnh theo số kiểm chứng
POT_MIN_SCORE = 60             # cổng: Điểm Bền tối thiểu
POT_MAX_EXT = 4                # cổng: cách MA20 tối đa, tính theo ATR
POT_A, POT_B = 75, 60          # ngưỡng hạng của Điểm kết hợp
POT_THONG_PTS = 6              # điểm cho mỗi tiêu chí Thông
POT_BONUS = {"leader": 20, "pullback": 10, "golden": 10}
POT_SIGNAL_WINDOW = 3          # tín hiệu còn hiệu lực trong 3 phiên

# Chọn mã: 6 trụ dùng để xếp hạng và giải thích, không dùng để xếp hạng mức.
# Hạng mức lấy theo Mã tiềm năng, vì ngưỡng theo điểm 6 trụ không chọn lọc được (xem research4.py).
PICK_STYLES = {
    "balanced": {"name": "Cân bằng", "note": "Trọng số chính, được kiểm chứng đầu tiên",
                 "w": {"ben": 35, "trend": 20, "thong": 15, "signal": 15, "buy": 10, "liq": 5}},
    "defensive": {"name": "Phòng thủ", "note": "Ưu tiên mã ổn định, thanh khoản tốt",
                  "w": {"ben": 55, "trend": 15, "thong": 5, "signal": 5, "buy": 10, "liq": 10}},
    "momentum": {"name": "Theo xu hướng", "note": "Ưu tiên xu hướng và tín hiệu",
                 "w": {"ben": 15, "trend": 35, "thong": 5, "signal": 30, "buy": 5, "liq": 10}},
    "accumulate": {"name": "Tích lũy", "note": "Ưu tiên tiêu chí của Thông",
                   "w": {"ben": 20, "trend": 15, "thong": 45, "signal": 5, "buy": 10, "liq": 5}},
}
PICK_WEIGHTS = PICK_STYLES["balanced"]["w"]
PICK_DUMP = -0.03              # cờ: giảm từ 3% với khối lượng từ 1,5 lần trung bình

# Bộ lọc "Phân tích của Thông"
THONG_WINDOW = 40              # số phiên của mỗi đoạn nền, khoảng 2 tháng; POC so sánh qua 3 đoạn liên tiếp
THONG_MAX_SPREAD = 0.20        # EMA50 cách EMA150, EMA200 tối đa
THONG_MAX_RANGE = 0.20         # biên độ cao nhất so với thấp nhất của nền tối đa
THONG_TIGHT = 0.6              # biên 10 phiên cuối không quá 60% biên cả nền
POC_BINS = 24

# Tài chính chỉ để hiển thị, không tính vào điểm hay hạng
FIN_LAG_DAYS = 60              # API không có ngày công bố: chỉ dùng số liệu sau 60 ngày kể từ cuối quý
FIN_STALE = 140                # bỏ số liệu cũ hơn số dòng này, tránh giữ mãi báo cáo của mã ngừng công bố
SPLIT_MIN = 1.08               # hệ số điều chỉnh giá từ mức này mới coi là chia cổ phiếu, thấp hơn thường là cổ tức tiền


def poc_price(h, l, v, bins=POC_BINS):
    """Giá có khối lượng lớn nhất trong một khoảng cố định, chia đều khối lượng trên dải cao–thấp của từng nến."""
    ok = v > 0
    if ok.sum() < 3:
        return np.nan
    lo, hi = l[ok].min(), h[ok].max()
    if not hi > lo:
        return np.nan
    step = (hi - lo) / bins
    hist = np.zeros(bins)
    for a, b, q in zip(l[ok], h[ok], v[ok]):
        i, k = int((a - lo) / step), min(bins - 1, int((b - lo) / step))
        i = min(i, bins - 1)
        hist[i:k + 1] += q / (k - i + 1)
    return lo + (hist.argmax() + 0.5) * step


def thong_cell(d, t, j, w):
    """Các số đo nền và POC của một mã tại phiên t, chỉ dùng dữ liệu đến hết phiên t."""
    H, L, C, V = d["_H"], d["_L"], d["_C"], d["_V"]
    if t - 3 * w + 1 < 0 or not np.isfinite(C[t - w + 1:t + 1, j]).all():
        return None
    a = t - w + 1
    hh, ll = H[a:t + 1, j].max(), L[a:t + 1, j].min()
    hh10, ll10 = H[t - 9:t + 1, j].max(), L[t - 9:t + 1, j].min()
    vol = V[a:t + 1, j]
    closes = C[a:t + 1, j]
    span = hh - ll
    low = closes <= ll + span / 3
    high = closes >= hh - span / 3
    vol_w = vol.mean()
    sup = vol[low].mean() / vol[high].mean() if low.sum() >= 3 and high.sum() >= 3 and vol[high].mean() > 0 else np.nan
    pocs = [poc_price(H[s:s + w, j], L[s:s + w, j], V[s:s + w, j]) for s in (t - 3 * w + 1, t - 2 * w + 1, t - w + 1)]
    return {"range": hh / ll - 1 if ll > 0 else np.nan, "tight": hh10 / ll10 - 1 if ll10 > 0 else np.nan,
            "vol": V[t - 9:t + 1, j].mean() / vol_w if vol_w > 0 else np.nan, "sup": sup, "p1": pocs[0], "p2": pocs[1], "p3": pocs[2]}


def base_ok(m):
    """Tiêu chí 4: đi ngang biên hẹp, biên co dần, khối lượng cạn dần và thấp hơn khi về gần hỗ trợ."""
    return (m["range"] <= THONG_MAX_RANGE and m["tight"] <= THONG_TIGHT * m["range"] and m["vol"] < 1
            and (not np.isfinite(m["sup"]) or m["sup"] < 1))


def poc_rising(m):
    return m["p1"] < m["p2"] < m["p3"]


def thong(d):
    """Thêm các đường EMA và hai tín hiệu kiểm chứng của bộ lọc Thông."""
    c = d["c"]
    for n in (10, 20, 50, 150, 200):
        d[f"ema{n}"] = c.ewm(span=n, adjust=False, min_periods=n).mean()
    e10, e20, e50, e150, e200 = (d[f"ema{n}"] for n in (10, 20, 50, 150, 200))
    d["t1"] = (c > e10) & (e10 > e20) & (e20 > e50) & (e50 > e150) & (e150 > e200)
    d["t2"] = d["rsi"] > 50
    d["t3"] = ((e50 / e150 - 1).abs() < THONG_MAX_SPREAD) & ((e50 / e200 - 1).abs() < THONG_MAX_SPREAD)
    d["_H"], d["_L"], d["_C"], d["_V"] = (d[k].to_numpy() for k in ("h", "l", "c", "v"))
    cand = (d["t1"] & d["t2"] & d["t3"] & d["liquid"] & d["traded"]).to_numpy()
    four = np.zeros_like(cand)
    five = np.zeros_like(cand)
    w = THONG_WINDOW
    for t, j in zip(*np.nonzero(cand)):
        m = thong_cell(d, t, j, w)
        if m and base_ok(m):
            four[t, j] = True
            five[t, j] = poc_rising(m)
    idx, cols = c.index, c.columns
    return pd.DataFrame(four, index=idx, columns=cols), pd.DataFrame(five, index=idx, columns=cols)


def load():
    adj = pd.read_pickle(CACHE / "adjusted.pkl")
    raw = pd.read_pickle(CACHE / "raw.pkl")
    meta = pd.read_pickle(CACHE / "meta.pkl").set_index("symbol")
    adj["symbol"] = adj["symbol"].astype(str)
    raw["symbol"] = raw["symbol"].astype(str)
    pivot = lambda frame, col: frame.pivot_table(index="date", columns="symbol", values=col, aggfunc="last")
    d = {k: pivot(adj, k).astype(float) for k in ("open", "high", "low", "close", "volume")}
    d["raw_close"] = pivot(raw, "close").astype(float).reindex_like(d["close"])
    d["meta"] = meta
    # bỏ phiên chỉ có vài mã: dữ liệu lỗi, không phải phiên giao dịch thật
    keep = d["close"].notna().sum(axis=1) >= 100
    for k in ("open", "high", "low", "close", "volume", "raw_close"):
        d[k] = d[k].loc[keep]
    d["repairs"] = repair_adjustment(d)
    return d


def repair_adjustment(d):
    """Sửa phiên mà giá điều chỉnh nhảy quá biên độ trong khi giá khớp thật không nhảy.

    Đó là hệ số điều chỉnh của nguồn bị lệch, không phải biến động thật: nhân phần lịch sử
    trước phiên đó với một hệ số để lợi suất điều chỉnh khớp lợi suất thật.
    """
    close, raw = d["close"], d["raw_close"]
    exch = d["meta"]["exchange"].astype(str).reindex(close.columns)
    limit = exch.map(LIMITS).fillna(0.07)
    adj_ret = close.pct_change(fill_method=None)
    raw_ret = raw.pct_change(fill_method=None)
    bad = (adj_ret.abs().gt(limit + 0.02, axis=1)) & (raw_ret.abs().le(limit + 0.02, axis=1)) & raw_ret.notna()
    found = []
    for sym in bad.columns[bad.any()]:
        for when in bad.index[bad[sym]]:
            factor = (1 + raw_ret.at[when, sym]) / (1 + adj_ret.at[when, sym])
            before = close.index < when
            for k in ("open", "high", "low", "close"):
                d[k].loc[before, sym] = d[k].loc[before, sym] / factor
            found.append((str(when.date()), sym))
    return found


def wilder(x, n):
    return x.ewm(alpha=1 / n, adjust=False, min_periods=n).mean()


def indicators(d):
    o, h, l, c0, v = d["open"], d["high"], d["low"], d["close"], d["volume"].fillna(0)
    c = c0.ffill()
    # phiên không khớp lệnh hoặc dữ liệu 0: đưa OHLC về giá đóng cửa gần nhất
    for frame_name, frame in (("o", o), ("h", h), ("l", l)):
        d[frame_name] = frame.where(frame > 0).fillna(c)
    o, h, l = d["o"], d["h"], d["l"]
    d["c"], d["v"] = c, v
    d["traded"] = v > 0
    d["ret"] = c.pct_change(fill_method=None)

    d["ma20"] = c.rolling(20, min_periods=20).mean()
    d["ma50"] = c.rolling(50, min_periods=50).mean()
    d["ma200"] = c.rolling(200, min_periods=200).mean()

    delta = c.diff()
    gain = wilder(delta.clip(lower=0), 14)
    loss = wilder((-delta).clip(lower=0), 14)
    d["rsi"] = 100 - 100 / (1 + gain / loss.replace(0, np.nan))
    d["rsi"] = d["rsi"].where(loss != 0, 100.0).where(gain.notna())

    ema12 = c.ewm(span=12, adjust=False, min_periods=12).mean()
    ema26 = c.ewm(span=26, adjust=False, min_periods=26).mean()
    d["macd"] = ema12 - ema26
    d["macd_signal"] = d["macd"].ewm(span=9, adjust=False, min_periods=9).mean()
    d["macd_hist"] = d["macd"] - d["macd_signal"]

    pc = c.shift(1)
    tr = pd.concat([(h - l), (h - pc).abs(), (l - pc).abs()]).groupby(level=0).max()
    tr = tr.reindex(c.index)[c.columns]
    d["atr"] = wilder(tr, 14)

    std20 = c.rolling(20, min_periods=20).std(ddof=0)
    d["bb_up"], d["bb_lo"] = d["ma20"] + 2 * std20, d["ma20"] - 2 * std20
    d["bbw"] = 4 * std20 / d["ma20"]
    d["bbw_rank"] = d["bbw"].rolling(120, min_periods=60).rank(pct=True)

    d["value"] = (d["raw_close"].ffill() * v / 1e6).fillna(0)      # tỷ đồng: nghìn đồng × cổ phiếu / 1e6
    d["adv20"] = d["value"].rolling(20, min_periods=10).mean()
    d["vol_avg20"] = v.rolling(20, min_periods=10).mean().shift(1)
    d["vol_ratio"] = v / d["vol_avg20"].replace(0, np.nan)
    d["hh20"] = h.rolling(20, min_periods=20).max().shift(1)
    d["ll20"] = l.rolling(20, min_periods=20).min().shift(1)
    d["hh252"] = h.rolling(252, min_periods=120).max()
    d["ll252"] = l.rolling(252, min_periods=120).min()

    up_vol = v.where(delta > 0, 0).rolling(50, min_periods=20).sum()
    dn_vol = v.where(delta < 0, 0).rolling(50, min_periods=20).sum()
    d["ud_ratio"] = up_vol / dn_vol.replace(0, np.nan)

    d["liquid"] = d["adv20"] >= MIN_ADV
    return d


def market(d):
    """Chỉ số tổng hợp và độ rộng thị trường, tính thuần từ eod.stock.ohlcv."""
    c, liquid = d["c"], d["liquid"]
    prev_liquid = liquid.shift(1, fill_value=False)
    weights = d["adv20"].shift(1).where(prev_liquid)
    ret = d["ret"].clip(-0.15, 0.15).fillna(0)
    comp_ret = (ret * weights).sum(axis=1) / weights.sum(axis=1).replace(0, np.nan)
    comp = (1 + comp_ret.fillna(0)).cumprod() * 100

    m = pd.DataFrame({"comp": comp, "comp_ret": comp_ret})
    m["ma50"] = comp.rolling(50, min_periods=50).mean()
    m["ma200"] = comp.rolling(200, min_periods=200).mean()

    has50 = d["ma50"].notna() & liquid
    has200 = d["ma200"].notna() & liquid
    m["above50"] = ((c > d["ma50"]) & has50).sum(axis=1) / has50.sum(axis=1).replace(0, np.nan)
    m["above200"] = ((c > d["ma200"]) & has200).sum(axis=1) / has200.sum(axis=1).replace(0, np.nan)
    m["adv"] = ((d["ret"] > 0) & liquid).sum(axis=1)
    m["dec"] = ((d["ret"] < 0) & liquid).sum(axis=1)
    m["new_hi"] = ((d["h"] >= d["hh252"]) & liquid).sum(axis=1)
    m["new_lo"] = ((d["l"] <= d["ll252"]) & liquid).sum(axis=1)
    m["n_liquid"] = liquid.sum(axis=1)
    m["turnover"] = d["value"].sum(axis=1)

    regime = pd.Series("neutral", index=m.index)
    regime[(comp > m["ma50"]) & (m["above50"] >= 0.55)] = "risk_on"
    regime[(comp < m["ma200"]) | (m["above50"] < 0.35)] = "risk_off"
    regime[m["ma200"].isna()] = "neutral"
    m["regime"] = regime

    r = d["c"] / d["c"].shift(1)
    ranks = {}
    for n in (63, 126, 252):
        ranks[n] = d["c"] / d["c"].shift(n) - 1
    perf = 0.4 * ranks[63] + 0.3 * ranks[126].fillna(ranks[63]) + 0.3 * ranks[252].fillna(ranks[126]).fillna(ranks[63])
    # sức mạnh tương đối: xếp hạng phần trăm trong nhóm đủ thanh khoản
    d["rs"] = perf.where(liquid).rank(axis=1, pct=True) * 99
    d["rs_ratio"] = (d["c"] / d["c"].shift(63)).div(comp / comp.shift(63), axis=0) - 1
    del r
    return m


def trend_state(d):
    c, ma50, ma200 = d["c"], d["ma50"], d["ma200"]
    rising = ma200 > ma200.shift(20)
    state = pd.DataFrame("side", index=c.index, columns=c.columns)
    state[(c > ma200) & (ma50 > ma200)] = "up"
    state[(c > ma50) & (ma50 > ma200) & rising] = "strong"
    state[(c < ma50) & (ma50 < ma200)] = "down"
    state[ma200.isna()] = "new"
    d["trend"] = state
    return state


def score(d):
    """Điểm Bền 0–100: 60% độ ổn định (ATR% thấp) + 40% vị thế so với đỉnh 52 tuần.

    Hai yếu tố này được chọn sau khi kiểm 13 yếu tố trên cùng dữ liệu. Chỉ xếp hạng trong
    nhóm đủ thanh khoản, nên mã thanh khoản thấp không có điểm.
    """
    atrp = (d["atr"] / d["c"]).where(d["liquid"])
    dist = (d["c"] / d["hh252"] - 1).where(d["liquid"])
    d["atrp"], d["dist_high"] = atrp, dist
    d["stab"] = (1 - atrp.rank(axis=1, pct=True)) * 100
    d["pos52"] = dist.rank(axis=1, pct=True) * 100
    d["score"] = d["stab"] * 0.6 + d["pos52"] * 0.4
    d["ext"] = (d["c"] - d["ma20"]) / d["atr"].replace(0, np.nan)
    return d["score"]


def _first_in(sig, n):
    """Giữ tín hiệu đầu tiên của mỗi cụm: mã phải im lặng đủ n phiên mới được phát lại."""
    arr = sig.to_numpy()
    out = np.zeros_like(arr)
    for j in range(arr.shape[1]):
        idx = np.flatnonzero(arr[:, j])
        last = -10**9
        for i in idx:
            if i - last > n:
                out[i, j] = True
                last = i
    return pd.DataFrame(out, index=sig.index, columns=sig.columns)


def signals(d):
    c, o, h, l = d["c"], d["o"], d["h"], d["l"]
    ma20, ma50, ma200, rsi, vr, rs = d["ma20"], d["ma50"], d["ma200"], d["rsi"], d["vol_ratio"], d["rs"]
    trend = d["trend"]
    rng = (h - l).replace(0, np.nan)
    close_pos = (c - l) / rng

    s = {}
    s["breakout"] = (c > d["hh20"]) & (vr >= 1.5) & (c > ma50) & (d["bbw_rank"].shift(1) <= 0.4) & (close_pos >= 0.6)
    s["pullback"] = ((trend == "strong") & ((l <= ma20 * 1.01) | (l <= ma50 * 1.01)) & (c > ma50) & (c > o)
                     & (rsi >= 38) & (rsi <= 58) & (rs >= 50))
    s["leader"] = (rs >= 90) & (c >= 0.95 * d["hh252"]) & (trend == "strong")
    s["squeeze"] = (d["bbw_rank"] <= 0.10) & (c > ma50) & (trend != "down") & (trend != "new")
    s["golden"] = (ma50 > ma200) & (ma50.shift(1) <= ma200.shift(1))
    s["oversold"] = (rsi >= 30) & (rsi.shift(1) < 30) & (c > o)
    s["breakdown"] = (c < ma50) & (c.shift(1) >= ma50.shift(1)) & (vr >= 1.3)
    s["death"] = (ma50 < ma200) & (ma50.shift(1) >= ma200.shift(1))
    s["thong4"], s["thong"] = thong(d)
    out = {}
    for name, sig in s.items():
        sig = sig.fillna(False) & d["liquid"] & d["traded"]
        out[name] = _first_in(sig, COOLDOWN)
    d["signals"] = out
    points = potential(d)
    for name, level in (("pot_a", POT_A), ("pot_b", POT_B)):
        out[name] = _first_in((points >= level) & d["traded"], COOLDOWN)
    picks(d)
    return out


def potential(d):
    """Điểm kết hợp cho mã qua cổng bắt buộc. Trả về bảng điểm, ngoài cổng là NaN."""
    gate = (d["liquid"] & (d["score"] >= POT_MIN_SCORE) & d["trend"].isin(["strong", "up"]) & (d["ext"] <= POT_MAX_EXT))
    # thưởng tín hiệu: lấy mức cao nhất đang còn hiệu lực
    bonus = pd.DataFrame(0.0, index=gate.index, columns=gate.columns)
    for key, pts in POT_BONUS.items():
        alive = d["signals"][key].astype(float).rolling(POT_SIGNAL_WINDOW, min_periods=1).max() > 0
        bonus = bonus.where(~alive | (bonus >= pts), float(pts))
    t123 = d["t1"].astype(int) + d["t2"].astype(int) + d["t3"].astype(int)
    points = (d["score"] * 0.5 + t123 * POT_THONG_PTS + bonus).where(gate)
    extra = np.zeros(points.shape)
    for t, j in zip(*np.nonzero(gate.to_numpy())):
        m = thong_cell(d, t, j, THONG_WINDOW)
        if m:
            extra[t, j] = (int(base_ok(m)) + int(poc_rising(m))) * POT_THONG_PTS   # int: cộng hai bool numpy cho ra 1, không phải 2
    d["pot_bonus"] = bonus
    d["pot"] = points + extra
    d["pot_gate"] = gate
    d["thong_n"] = (t123 + extra / POT_THONG_PTS).where(gate)
    return d["pot"]


def picks(d):
    """6 trụ của Chọn mã và các cờ cảnh báo. Điểm chỉ tính trên mã qua cổng bắt buộc."""
    gate = d["pot_gate"]
    alive = lambda key: d["signals"][key].astype(float).rolling(POT_SIGNAL_WINDOW, min_periods=1).max() > 0
    idx, cols = gate.index, gate.columns
    pillar = {}
    pillar["ben"] = d["score"]
    pillar["trend"] = d["trend"].replace({"strong": 100.0, "up": 70.0, "side": 40.0, "new": 40.0, "down": 0.0}).astype(float)
    pillar["thong"] = d["thong_n"] * 20
    sig = pd.DataFrame(30.0, index=idx, columns=cols)
    sig = sig.where(~(alive("pullback") | alive("golden")), 60.0).where(~alive("leader"), 100.0)
    pillar["signal"] = sig
    ext = d["ext"]
    buy = pd.DataFrame(100.0, index=idx, columns=cols)
    buy = buy.where(ext <= 1.5, 70.0).where(ext <= 2.5, 30.0).where(ext >= -1, 60.0)
    pillar["buy"] = buy
    pillar["liq"] = ((np.log10(d["adv20"] / MIN_ADV) / np.log10(100 / MIN_ADV)).clip(0, 1) * 100)
    d["pick_pillars"] = pillar
    d["pick_pts"] = pick_score(d, PICK_WEIGHTS)
    d["veto_broke"] = alive("breakdown") | alive("death")
    d["veto_dump"] = (d["ret"] <= PICK_DUMP) & (d["vol_ratio"] >= 1.5)


def pick_score(d, weights):
    return (sum(d["pick_pillars"][k] * w for k, w in weights.items()) / 100).where(d["pot_gate"])


def simulate(d, m):
    """Mô phỏng từng tín hiệu thành một lệnh theo đúng luật thị trường Việt Nam."""
    O, H, L, C = (d[k].to_numpy() for k in ("o", "h", "l", "c"))
    ATR = d["atr"].to_numpy()
    dates = d["c"].index
    syms = d["c"].columns
    comp = m["comp"].to_numpy()
    regime = m["regime"].to_numpy()
    exch = d["meta"]["exchange"].reindex(syms).astype(str).to_numpy()
    limit = np.array([LIMITS.get(e, 0.07) for e in exch])
    T = len(dates)
    rows = []
    paths = []
    for name, sig in d["signals"].items():
        ii, jj = np.nonzero(sig.to_numpy())
        for t, j in zip(ii, jj):
            if t + 1 >= T or not np.isfinite(ATR[t, j]) or ATR[t, j] <= 0:
                continue
            entry = O[t + 1, j]
            if not entry > 0:
                continue
            gap = entry / C[t, j] - 1
            if gap >= limit[j] - 0.005:            # mở cửa kịch trần: coi như không mua được
                continue
            risk = STOP_ATR * ATR[t, j]
            if risk / entry < MIN_RISK:            # giá đứng im, R gần 0 làm méo mọi thống kê
                continue
            stop, target = entry - risk, entry + TARGET_R * risk
            first_sell = t + 1 + SETTLE
            last = min(t + 1 + MAX_HOLD, T - 1)
            exit_px, exit_t, why = None, None, "open"
            if last >= first_sell:
                for k in range(first_sell, last + 1):
                    if O[k, j] <= stop:
                        exit_px, exit_t, why = O[k, j], k, "stop"
                        break
                    if L[k, j] <= stop:
                        exit_px, exit_t, why = stop, k, "stop"
                        break
                    if O[k, j] >= target:
                        exit_px, exit_t, why = O[k, j], k, "target"
                        break
                    if H[k, j] >= target:
                        exit_px, exit_t, why = target, k, "target"
                        break
                if exit_px is None and t + 1 + MAX_HOLD <= T - 1:
                    exit_px, exit_t, why = C[last, j], last, "time"
            complete = exit_px is not None
            ret = (exit_px / entry - 1 - COST) if complete else np.nan
            def fwd(n):
                k = t + 1 + n
                return C[k, j] / entry - 1 if k < T else np.nan
            def fwd_x(n):
                k = t + 1 + n
                return (C[k, j] / entry) / (comp[k] / comp[t + 1]) - 1 if k < T else np.nan
            rows.append({
                "setup": name, "t": t, "j": j, "date": dates[t], "symbol": syms[j],
                "regime": regime[t], "entry": entry, "risk_pct": risk / entry, "complete": complete,
                "ret": ret, "r": ret / (risk / entry) if complete else np.nan, "why": why,
                "bars": (exit_t - (t + 1)) if complete else np.nan,
                "f5": fwd(5), "f10": fwd(10), "f20": fwd(20),
                "x5": fwd_x(5), "x10": fwd_x(10), "x20": fwd_x(20),
            })
            if t + 1 + 20 < T:
                base = entry
                paths.append((name, regime[t], C[t + 1:t + 22, j] / base - 1, comp[t + 1:t + 22] / comp[t + 1] - 1))
    return pd.DataFrame(rows), paths


def bootstrap_ci(values, clusters, n=800, seed=7):
    """Khoảng tin cậy 90% của trung bình, lấy mẫu lại theo tháng vì tín hiệu cùng tháng tương quan nhau."""
    v = pd.Series(values).reset_index(drop=True)
    g = pd.Series(clusters).reset_index(drop=True)
    groups = [x.to_numpy() for _, x in v.groupby(g)]
    if len(groups) < 3:
        return float("nan"), float("nan")
    rng = np.random.default_rng(seed)
    idx = np.arange(len(groups))
    means = []
    for _ in range(n):
        pick = rng.choice(idx, size=len(idx), replace=True)
        means.append(np.concatenate([groups[i] for i in pick]).mean())
    return float(np.percentile(means, 5)), float(np.percentile(means, 95))


def summarize(ev):
    ev = ev[ev["complete"]]
    if len(ev) == 0:
        return {"n": 0}
    month = ev["date"].dt.to_period("M").astype(str)
    lo, hi = bootstrap_ci(ev["r"], month)
    return {
        "n": int(len(ev)), "months": int(month.nunique()),
        "win": float((ev["r"] > 0).mean()), "exp_r": float(ev["r"].mean()),
        "exp_lo": lo, "exp_hi": hi, "avg_ret": float(ev["ret"].mean()),
        "med_ret": float(ev["ret"].median()), "avg_bars": float(ev["bars"].mean()),
        "x20": float(ev["x20"].mean()) if ev["x20"].notna().any() else None,
        "hit_stop": float((ev["why"] == "stop").mean()), "hit_target": float((ev["why"] == "target").mean()),
    }
