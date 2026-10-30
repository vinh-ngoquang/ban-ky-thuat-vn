"""Nghiên cứu 2: so với vào lệnh ngẫu nhiên, thử quy tắc thoát khác, kiểm từng yếu tố."""
import numpy as np
import pandas as pd

import engine as E

pd.set_option("display.width", 220, "display.max_columns", 40, "display.max_rows", 300)
d = E.indicators(E.load())
m = E.market(d)
E.trend_state(d)
E.score(d)
E.signals(d)
cut = d["c"].index[-E.OOS_SESSIONS]
dates = d["c"].index


def rank_ic(a, b):
    ok = np.isfinite(a) & np.isfinite(b)
    if ok.sum() < 20:
        return np.nan
    return np.corrcoef(pd.Series(a[ok]).rank(), pd.Series(b[ok]).rank())[0, 1]


# mốc so sánh: mỗi 10 phiên "tín hiệu" trên mọi mã đủ thanh khoản
base = pd.DataFrame(False, index=d["c"].index, columns=d["c"].columns)
base.iloc[205::10] = True
base = base & d["liquid"] & d["traded"]
d["signals"]["random"] = base
E.SETUPS["random"] = {"name": "Ngẫu nhiên", "side": "long", "rule": ""}

variants = [("2ATR·2R·20p", 2, 2, 20), ("3ATR·2R·40p", 3, 2, 40), ("3ATR·3R·60p", 3, 3, 60), ("4ATR·3R·60p", 4, 3, 60)]
rows = []
for label, stop, tgt, hold in variants:
    E.STOP_ATR, E.TARGET_R, E.MAX_HOLD = stop, tgt, hold
    ev, _ = E.simulate(d, m)
    for name in E.SETUPS:
        e = ev[ev.setup == name]
        s = E.summarize(e)
        p1, p2 = E.summarize(e[e.date < cut]), E.summarize(e[e.date >= cut])
        rows.append({"exit": label, "setup": name, "n": s.get("n"), "win": s.get("win"), "avg_ret": s.get("avg_ret"),
                     "exp_r": s.get("exp_r"), "lo": s.get("exp_lo"), "hi": s.get("exp_hi"),
                     "ret_early": p1.get("avg_ret"), "ret_oos": p2.get("avg_ret")})
print(pd.DataFrame(rows).round(3).to_string(index=False))

E.STOP_ATR, E.TARGET_R, E.MAX_HOLD = 2.0, 2.0, 20
ev, _ = E.simulate(d, m)
rows = []
for name in E.SETUPS:
    for reg in ("risk_on", "neutral", "risk_off"):
        e = ev[(ev.setup == name) & (ev.regime == reg)]
        s = E.summarize(e)
        rows.append({"setup": name, "regime": reg, "n": s.get("n"), "win": s.get("win"), "avg_ret": s.get("avg_ret"), "exp_r": s.get("exp_r")})
print(pd.DataFrame(rows).pivot(index="setup", columns="regime", values=["n", "avg_ret", "exp_r"]).round(3))

# từng yếu tố: tương quan thứ hạng với lợi suất vượt thị trường
factors = {
    "rs": d["rs"], "score": d["score"], "dist_high": d["c"] / d["hh252"] - 1,
    "above_ma200": d["c"] / d["ma200"] - 1, "above_ma50": d["c"] / d["ma50"] - 1,
    "rsi": d["rsi"], "ud_ratio": d["ud_ratio"], "bbw_rank": d["bbw_rank"], "atr_pct": d["atr"] / d["c"],
    "ret5": d["c"] / d["c"].shift(5) - 1, "ret20": d["c"] / d["c"].shift(20) - 1,
    "adv20": np.log(d["adv20"]), "vol_ratio": d["vol_ratio"],
}
sample = dates[210::10]
rows = []
for horizon in (20, 60):
    fwd = d["c"].shift(-(horizon + 1)) / d["o"].shift(-1) - 1
    mkt = m["comp"].shift(-(horizon + 1)) / m["comp"].shift(-1) - 1
    ex = fwd.sub(mkt, axis=0)
    for name, f in factors.items():
        ics = {}
        for t in sample:
            mask = d["liquid"].loc[t].to_numpy()
            ics[t] = rank_ic(f.loc[t].to_numpy()[mask], ex.loc[t].to_numpy()[mask])
        ic = pd.Series(ics).dropna()
        rows.append({"h": horizon, "factor": name, "ic": ic.mean(), "t": ic.mean() / ic.std() * np.sqrt(len(ic) / (horizon / 10)),
                     "pos": (ic > 0).mean(), "early": ic[ic.index < cut].mean(), "oos": ic[ic.index >= cut].mean(), "n": len(ic)})
print(pd.DataFrame(rows).round(3).to_string(index=False))

# nhóm RS và điểm: trung bình lợi suất vượt thị trường
fwd = d["c"].shift(-21) / d["o"].shift(-1) - 1
mkt = m["comp"].shift(-21) / m["comp"].shift(-1) - 1
ex = fwd.sub(mkt, axis=0)
for name in ("rs",):
    f = d[name].where(d["liquid"]).loc[sample]
    st = pd.DataFrame({"f": f.stack(), "ex": ex.loc[sample].stack()}).dropna()
    st["b"] = pd.cut(st["f"], [0, 20, 40, 60, 80, 90, 100])
    print(name, st.groupby("b", observed=True)["ex"].agg(["count", "mean", "median"]).round(4))

reg_rows = []
for reg in ("risk_on", "neutral", "risk_off"):
    for h in (5, 20, 60):
        r = (m["comp"].shift(-h) / m["comp"] - 1)[m["regime"] == reg].dropna()
        reg_rows.append({"regime": reg, "h": h, "n": len(r), "mean": r.mean(), "median": r.median(), "pos": (r > 0).mean()})
print(pd.DataFrame(reg_rows).round(4).to_string(index=False))

# đối chiếu với VNINDEX (chỉ để kiểm tra phép tính, dashboard không dùng)
import finlens
c = finlens.client()
ix = pd.DataFrame(c.eod.index.ohlcv("VNINDEX", start="2023-11-01", end="2026-10-30")).set_index("date")["close"]
j = pd.DataFrame({"comp": m["comp"], "vn": ix}).dropna()
print("tương quan lợi suất ngày", round(j.pct_change().corr().iloc[0, 1], 3),
      "| tổng lợi suất comp", round(j.comp.iloc[-1] / j.comp.iloc[0] - 1, 3), "VNINDEX", round(j.vn.iloc[-1] / j.vn.iloc[0] - 1, 3))
print(j.iloc[[0, 100, 250, 400, 500, 600, 680, -5, -1]].round(1))
print("beta 1 năm: VNINDEX 250p", round(j.vn.iloc[-1] / j.vn.iloc[-250] - 1, 3), "comp", round(j.comp.iloc[-1] / j.comp.iloc[-250] - 1, 3))
