"""Nghiên cứu: tín hiệu và điểm kỹ thuật có lợi thế thật không? Chỉ in kết quả, không ghi gì."""
import time

import numpy as np
import pandas as pd

import engine as E

pd.set_option("display.width", 200, "display.max_columns", 40, "display.max_rows", 200)
t0 = time.time()
d = E.indicators(E.load())
m = E.market(d)
E.trend_state(d)
E.score(d)
E.signals(d)
print("phiên", len(d["c"]), "mã", d["c"].shape[1], "tính xong", round(time.time() - t0, 1), "s")
print("mã đủ thanh khoản hiện tại:", int(d["liquid"].iloc[-1].sum()))
print(m.tail(3).T)
print("chế độ thị trường:", m["regime"].value_counts().to_dict())

ev, paths = E.simulate(d, m)
print("số lệnh mô phỏng", len(ev), "xong", round(time.time() - t0, 1), "s")
cut = d["c"].index[-E.OOS_SESSIONS]
rows = []
for name in E.SETUPS:
    e = ev[ev.setup == name]
    for label, part in (("tất cả", e), ("trước", e[e.date < cut]), ("250p cuối", e[e.date >= cut])):
        s = E.summarize(part)
        rows.append({"setup": name, "kỳ": label, **{k: s.get(k) for k in ("n", "months", "win", "exp_r", "exp_lo", "exp_hi", "avg_ret", "med_ret", "x20", "hit_stop", "hit_target")}})
print(pd.DataFrame(rows).round(3).to_string(index=False))

rows = []
for name in E.SETUPS:
    for reg in ("risk_on", "neutral", "risk_off"):
        s = E.summarize(ev[(ev.setup == name) & (ev.regime == reg)])
        rows.append({"setup": name, "regime": reg, **{k: s.get(k) for k in ("n", "win", "exp_r", "exp_lo", "exp_hi", "x20")}})
print(pd.DataFrame(rows).round(3).to_string(index=False))

# điểm kỹ thuật: lấy mẫu mỗi 10 phiên để giảm chồng lấp, so lợi suất vượt thị trường 20 phiên sau
fwd = (d["c"].shift(-21) / d["o"].shift(-1)) - 1
mkt = (m["comp"].shift(-21) / m["comp"].shift(-1)) - 1
ex = fwd.sub(mkt, axis=0)
sample = d["c"].index[210::10]
sc = d["score"].where(d["liquid"]).loc[sample]
stack = pd.DataFrame({"score": sc.stack(), "ex": ex.loc[sample].stack()}).dropna()
stack["bucket"] = pd.cut(stack["score"], [0, 30, 45, 60, 75, 101], right=False)
print(stack.groupby("bucket", observed=True)["ex"].agg(["count", "mean", "median", lambda x: (x > 0).mean()]).round(4))
ic = stack.reset_index().groupby("date")[["score", "ex"]].apply(lambda g: g["score"].corr(g["ex"], method="spearman"))
print("IC trung bình", round(ic.mean(), 4), "IC>0:", round((ic > 0).mean(), 3), "t", round(ic.mean() / ic.std() * np.sqrt(len(ic)), 2), "số kỳ", len(ic))
for label, part in (("trước", ic[ic.index < cut]), ("250p cuối", ic[ic.index >= cut])):
    print(label, round(part.mean(), 4), len(part))

for reg in ("risk_on", "neutral", "risk_off"):
    r = (m["comp"].shift(-20) / m["comp"] - 1)[m["regime"] == reg].dropna()
    print(reg, "n", len(r), "TB 20 phiên", round(r.mean(), 4), "trung vị", round(r.median(), 4), "%dương", round((r > 0).mean(), 3))
