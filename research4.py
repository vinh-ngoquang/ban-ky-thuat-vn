"""Nghiên cứu 4: Điểm chọn mã có giá trị thực không? So với VNINDEX, trượt giá, từng quý. Chỉ in kết quả."""
import numpy as np
import pandas as pd

import engine as E
from export import topn_portfolio

pd.set_option("display.width", 220, "display.max_columns", 40, "display.max_rows", 100)
d = E.indicators(E.load())
m = E.market(d)
E.trend_state(d)
E.score(d)
E.signals(d)
base = pd.DataFrame(False, index=d["c"].index, columns=d["c"].columns)
base.iloc[205::10] = True
d["signals"]["random"] = base & d["liquid"] & d["traded"]
keys = ("pick_a", "pick_b", "pot_a", "leader", "random")
ev, _ = E.simulate({**d, "signals": {k: d["signals"][k] for k in keys}}, m)
e = ev[ev.complete]
cut = d["c"].index[-E.OOS_SESSIONS]
for k in keys:
    x = e[e.setup == k]
    s = E.summarize(x)
    p, q = E.summarize(x[x.date < cut]), E.summarize(x[x.date >= cut])
    print(f'{k:8} n={s["n"]} win={s["win"]:.3f} exp={s["exp_r"]:.3f} [{s["exp_lo"]:.2f},{s["exp_hi"]:.2f}] ret={s["avg_ret"]*100:.2f}% | sớm {p.get("exp_r",0):.3f} muộn {q.get("exp_r",0):.3f} (n {q.get("n")}) | +0,2%: {((x.ret-.002)/x.risk_pct).mean():.3f} +0,5%: {((x.ret-.005)/x.risk_pct).mean():.3f}')
x = e[e.setup == "pick_a"]
if len(x):
    print(x.groupby(x.date.dt.to_period("Q"))["r"].agg(["count", "mean"]).round(2).T.to_string())
    print("regime", {g: (len(v), round(v.r.mean(), 3)) for g, v in x.groupby("regime")}, "top10 share", round(x.r.nlargest(10).sum() / max(x.r.sum(), 1e-9), 2), "mã", x.symbol.nunique())
rank = d["pick_pts"].where(~(d["veto_broke"] | d["veto_dump"]))
print("điểm cuối:", rank.iloc[-1].dropna().sort_values(ascending=False).round(1).head(10).to_dict())
print("phân bố điểm:", d["pick_pts"].stack().describe(percentiles=[.5, .9, .99]).round(1).to_dict())
for label, f in (("Chọn mã top 10", rank), ("Mã tiềm năng top 10", d["pot"]), ("Điểm Bền top 10", d["score"])):
    P = topn_portfolio(d, f, 10)
    print(label, {k: P[k] for k in ("ret", "baseRet", "dd", "baseDd", "periods", "avgHeld", "vnRet", "vnDd")})
