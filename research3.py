"""Nghiên cứu 3: điểm bằng chứng mới, danh mục kiểm chứng, hiệu chuẩn dải dao động và điểm cắt lỗ."""
import numpy as np
import pandas as pd

import engine as E

pd.set_option("display.width", 220, "display.max_columns", 40, "display.max_rows", 300)
d = E.indicators(E.load())
m = E.market(d)
E.trend_state(d)
E.score(d)
E.signals(d)
c, liquid = d["c"], d["liquid"]
dates = c.index
cut = dates[-E.OOS_SESSIONS]
sample = dates[210::10]

atrp = (d["atr"] / c).where(liquid)
dist = (c / d["hh252"] - 1).where(liquid)
rv = atrp.rank(axis=1, pct=True)
rd = dist.rank(axis=1, pct=True)
ev_score = ((1 - rv) * 0.6 + rd * 0.4) * 100
d["ev"] = ev_score


def table(f, h):
    fwd = c.shift(-(h + 1)) / d["o"].shift(-1) - 1
    mkt = m["comp"].shift(-(h + 1)) / m["comp"].shift(-1) - 1
    ex = fwd.sub(mkt, axis=0)
    st = pd.DataFrame({"f": f.loc[sample].stack(), "ex": ex.loc[sample].stack(), "raw": fwd.loc[sample].stack()}).dropna().reset_index()
    st["q"] = st.groupby("date")["f"].transform(lambda x: pd.qcut(x.rank(method="first"), 5, labels=False)) + 1
    st["kỳ"] = np.where(st["date"] < cut, "trước", "cuối")
    all_ = st.groupby("q").agg(n=("ex", "size"), ex=("ex", "mean"), med=("ex", "median"), raw=("raw", "mean"), win=("raw", lambda x: (x > 0).mean()))
    split = st.pivot_table(index="q", columns="kỳ", values="ex", aggfunc="mean")
    return all_.join(split).round(4)


print("ATR% (1 = biến động thấp nhất), 20p\n", table(atrp, 20))
print("ATR%, 60p\n", table(atrp, 60))
print("Cách đỉnh 52 tuần (5 = gần đỉnh nhất), 20p\n", table(dist, 20))
print("Điểm bằng chứng, 20p\n", table(ev_score, 20))
print("Điểm bằng chứng, 60p\n", table(ev_score, 60))

# danh mục: top 20% điểm, tái cân bằng mỗi 20 phiên, phí 0,4% trên phần thay đổi
hold, nav, navm, turnover = None, [1.0], [1.0], []
rebals = list(range(210, len(dates) - 20, 20))
for t in rebals:
    s = ev_score.iloc[t].dropna()
    top = set(s[s >= s.quantile(0.8)].index)
    churn = 1.0 if hold is None else 1 - len(top & hold) / max(len(top), 1)
    hold = top
    turnover.append(churn)
    syms = list(top)
    r = (c[syms].iloc[t + 21 if t + 21 < len(dates) else -1] / d["o"][syms].iloc[t + 1] - 1).mean()
    rm = m["comp"].iloc[t + 21 if t + 21 < len(dates) else -1] / m["comp"].iloc[t + 1] - 1
    allm = liquid.iloc[t]
    u = list(allm[allm].index)
    ru = (c[u].iloc[t + 21 if t + 21 < len(dates) else -1] / d["o"][u].iloc[t + 1] - 1).mean()
    nav.append(nav[-1] * (1 + r - churn * 0.004))
    navm.append(navm[-1] * (1 + ru))
print("danh mục điểm cao:", round(nav[-1] - 1, 3), "| toàn bộ mã thanh khoản đồng tỷ trọng:", round(navm[-1] - 1, 3), "| số kỳ", len(rebals), "| vòng quay TB", round(np.mean(turnover), 2))
dd = lambda x: (pd.Series(x) / pd.Series(x).cummax() - 1).min()
print("sụt giảm tối đa", round(dd(nav), 3), round(dd(navm), 3))

# tín hiệu chia theo điểm bằng chứng tại ngày tín hiệu
ev, _ = E.simulate(d, m)
ev["ev"] = [ev_score.iat[t, j] for t, j in zip(ev["t"], ev["j"])]
ev["nhóm"] = np.where(ev["ev"] >= 60, "cao", np.where(ev["ev"] < 40, "thấp", "giữa"))
rows = []
for s in E.SETUPS:
    for g in ("cao", "giữa", "thấp"):
        x = E.summarize(ev[(ev.setup == s) & (ev["nhóm"] == g)])
        rows.append({"setup": s, "nhóm": g, "n": x.get("n"), "win": x.get("win"), "exp_r": x.get("exp_r"), "ret": x.get("avg_ret"), "lo": x.get("exp_lo"), "hi": x.get("exp_hi")})
print(pd.DataFrame(rows).round(3).to_string(index=False))

# hiệu chuẩn dải dao động: lợi suất 20 phiên / (ATR% × căn 20)
h = 20
fret = (c.shift(-h) / c - 1)
z = (fret / (atrp * np.sqrt(h)))
z = z.loc[sample]
q = [0.05, 0.1, 0.25, 0.5, 0.75, 0.9, 0.95]
stacked = z.stack().dropna()
early = stacked[stacked.index.get_level_values(0) < cut]
late = stacked[stacked.index.get_level_values(0) >= cut]
print("phân vị z:", dict(zip(q, stacked.quantile(q).round(2))))
print("trước:", dict(zip(q, early.quantile(q).round(2))))
print("cuối:", dict(zip(q, late.quantile(q).round(2))))
lo, hi = early.quantile(0.1), early.quantile(0.9)
print("độ phủ thực tế của dải 10–90 hiệu chuẩn từ giai đoạn đầu, đo trên 250p cuối:", round(((late >= lo) & (late <= hi)).mean(), 3))
g = pd.DataFrame({"z": z.stack(), "a": atrp.loc[sample].stack()}).dropna()
g["bin"] = g.groupby(level=0)["a"].transform(lambda x: pd.qcut(x.rank(method="first"), 5, labels=False))
print(g.groupby("bin")["z"].quantile([0.1, 0.5, 0.9]).unstack().round(2))

# xác suất chạm cắt lỗ trong 20 phiên, cho từng khoảng cách ATR
L = d["l"].to_numpy()
C = c.to_numpy()
A = d["atr"].to_numpy()
LQ = liquid.to_numpy()
idx = list(range(210, len(dates) - 21, 10))
for k in (1, 1.5, 2, 2.5, 3, 4):
    hit, tot, hit_e, tot_e = 0, 0, 0, 0
    for t in idx:
        mask = LQ[t] & np.isfinite(A[t])
        stop = C[t] - k * A[t]
        lowest = np.nanmin(L[t + 1:t + 21], axis=0)
        h_ = (lowest <= stop) & mask
        hit += h_.sum(); tot += mask.sum()
        if dates[t] < cut:
            hit_e += h_.sum(); tot_e += mask.sum()
    print(f"cắt lỗ {k} ATR: chạm trong 20 phiên {hit / tot:.3f} (trước {hit_e / tot_e:.3f}, cuối {(hit - hit_e) / (tot - tot_e):.3f})")

last = pd.DataFrame({"ev": ev_score.iloc[-1], "atr%": atrp.iloc[-1] * 100, "cách đỉnh": dist.iloc[-1] * 100, "adv": d["adv20"].iloc[-1]}).dropna().sort_values("ev", ascending=False)
print(last.head(12).round(2))
print(last.tail(5).round(2))
