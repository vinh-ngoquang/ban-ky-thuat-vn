"""Tính toàn bộ số liệu và ghi dữ liệu cho trang vào site/data/."""
import datetime as dt
import json
import pathlib
import shutil
import sys

import numpy as np
import pandas as pd

import engine as E

ROOT = pathlib.Path(__file__).parent
SITE = ROOT / "site"
DATA = SITE / "data"
SHARD_SIZE = 16
HORIZONS = (5, 10, 20)
STOP_KS = (1.5, 2, 2.5, 3, 4)


def num(x, digits=4):
    if x is None:
        return None
    x = float(x)
    return None if not np.isfinite(x) else round(x, digits)


def clean(v, digits=4):
    return [num(x, digits) for x in v]


def dump(path, obj):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, ensure_ascii=False, separators=(",", ":"), allow_nan=False), encoding="utf-8")


def lift_ci(ev, rand, n=800, seed=11):
    """Độ vượt so với vào lệnh ngẫu nhiên, lấy mẫu lại theo tháng để hai bên cùng chịu một bối cảnh."""
    a = ev.assign(m=ev["date"].dt.to_period("M").astype(str)).groupby("m")["r"].agg(["sum", "count"])
    b = rand.assign(m=rand["date"].dt.to_period("M").astype(str)).groupby("m")["r"].agg(["sum", "count"])
    months = a.index.intersection(b.index)
    if len(months) < 6:
        return None, None, None
    a, b = a.loc[months], b.loc[months]
    rng = np.random.default_rng(seed)
    idx = rng.integers(0, len(months), size=(n, len(months)))
    sa, ca, sb, cb = (x.to_numpy()[idx].sum(axis=1) for x in (a["sum"], a["count"], b["sum"], b["count"]))
    diff = sa / ca - sb / cb
    point = a["sum"].sum() / a["count"].sum() - b["sum"].sum() / b["count"].sum()
    return float(point), float(np.percentile(diff, 5)), float(np.percentile(diff, 95))


def verdict(lo, hi):
    if lo is None:
        return "thin"
    if lo > 0:
        return "better"
    if hi < 0:
        return "worse"
    return "same"


def block(ev, rand):
    s = E.summarize(ev)
    if not s.get("n"):
        return {"n": 0}
    complete = ev[ev["complete"]]
    lift, lo, hi = lift_ci(complete, rand)
    out = {"n": s["n"], "months": s["months"], "win": num(s["win"]), "exp": num(s["exp_r"], 3),
           "lo": num(s["exp_lo"], 3), "hi": num(s["exp_hi"], 3), "ret": num(s["avg_ret"]), "med": num(s["med_ret"]),
           "stop": num(s["hit_stop"]), "target": num(s["hit_target"]), "bars": num(s["avg_bars"], 1),
           "lift": num(lift, 3), "liftLo": num(lo, 3), "liftHi": num(hi, 3), "verdict": verdict(lo, hi)}
    return out


def evidence(d, m, ev, paths):
    cut = d["c"].index[-E.OOS_SESSIONS]
    score = d["score"].to_numpy()
    ev = ev.copy()
    ev["score"] = score[ev["t"].to_numpy(), ev["j"].to_numpy()]
    rand = ev[(ev.setup == "random") & ev["complete"]]
    out = []
    for key, cfg in E.SETUPS.items():
        e = ev[ev.setup == key]
        item = {"key": key, "name": cfg["name"], "side": cfg["side"], "rule": cfg["rule"], "all": block(e, rand),
                "early": block(e[e.date < cut], rand[rand.date < cut]), "late": block(e[e.date >= cut], rand[rand.date >= cut]),
                "highScore": block(e[e.score >= 60], rand), "lowScore": block(e[e.score < 40], rand),
                "regime": {r: block(e[e.regime == r], rand[rand.regime == r]) for r in ("risk_on", "neutral", "risk_off")}}
        p = [x[2] for x in paths if x[0] == key]
        item["path"] = clean(np.nanmedian(np.array(p), axis=0) * 100, 2) if len(p) >= 20 else None
        out.append(item)
    return out


def quintiles(d, m):
    c, o = d["c"], d["o"]
    sample = c.index[210::10]
    cut = c.index[-E.OOS_SESSIONS]
    res = []
    frames = {}
    for h in (20, 60):
        fwd = c.shift(-(h + 1)) / o.shift(-1) - 1
        mkt = m["comp"].shift(-(h + 1)) / m["comp"].shift(-1) - 1
        ex = fwd.sub(mkt, axis=0)
        st = pd.DataFrame({"f": d["score"].loc[sample].stack(), "ex": ex.loc[sample].stack(), "raw": fwd.loc[sample].stack()}).dropna()
        st = st.reset_index()
        st.columns = ["date", "symbol", "f", "ex", "raw"]
        st["q"] = st.groupby("date")["f"].transform(lambda x: pd.qcut(x.rank(method="first"), 5, labels=False)) + 1
        frames[h] = st
    for q in range(1, 6):
        row = {"q": q}
        for h, st in frames.items():
            x = st[st.q == q]
            row[f"ex{h}"] = num(x["ex"].mean())
            row[f"win{h}"] = num((x["raw"] > 0).mean())
            row[f"ret{h}"] = num(x["raw"].mean())
            row[f"early{h}"] = num(x[x["date"] < cut]["ex"].mean())
            row[f"late{h}"] = num(x[x["date"] >= cut]["ex"].mean())
            row[f"n{h}"] = int(len(x))
        res.append(row)
    return res


def portfolio(d, m):
    """Danh mục kiểm chứng: 20% mã điểm cao nhất, tái cân bằng mỗi 20 phiên."""
    c, o, liquid = d["c"], d["o"], d["liquid"]
    dates = c.index
    score = d["score"]
    nav, base, when, churns = [1.0], [1.0], [], []
    hold = None
    rebals = list(range(210, len(dates) - 1, 20))
    for t in rebals:
        s = score.iloc[t].dropna()
        if s.empty:
            continue
        top = list(s[s >= s.quantile(0.8)].index)
        churn = 1.0 if hold is None else 1 - len(set(top) & hold) / max(len(top), 1)
        hold = set(top)
        end = min(t + 21, len(dates) - 1)
        if end <= t + 1:
            continue
        r = (c[top].iloc[end] / o[top].iloc[t + 1] - 1).mean()
        uni = list(liquid.iloc[t][liquid.iloc[t]].index)
        ru = (c[uni].iloc[end] / o[uni].iloc[t + 1] - 1).mean()
        nav.append(nav[-1] * (1 + r - churn * E.COST))
        base.append(base[-1] * (1 + ru))
        when.append(str(dates[end].date()))
        churns.append(churn)
    drawdown = lambda x: float((pd.Series(x) / pd.Series(x).cummax() - 1).min())
    return {"start": str(dates[rebals[0] + 1].date()), "dates": when, "port": clean(nav[1:], 4), "base": clean(base[1:], 4),
            "ret": num(nav[-1] - 1), "baseRet": num(base[-1] - 1), "dd": num(drawdown(nav)), "baseDd": num(drawdown(base)),
            "turnover": num(np.mean(churns)), "periods": len(when)}


def risk_tables(d):
    c, liquid = d["c"], d["liquid"]
    dates = c.index
    cut = dates[-E.OOS_SESSIONS]
    sample = dates[210::10]
    atrp = d["atrp"]
    cone = {}
    for h in HORIZONS:
        z = (c.shift(-h) / c - 1) / (atrp * np.sqrt(h))
        st = z.loc[sample].stack().dropna()
        idx = st.index.get_level_values(0)
        early, late = st[idx < cut], st[idx >= cut]
        p = st.quantile([0.1, 0.5, 0.9]).to_numpy()
        lo, hi = early.quantile(0.1), early.quantile(0.9)
        cone[str(h)] = {"p10": num(p[0], 3), "p50": num(p[1], 3), "p90": num(p[2], 3),
                        "coverage": num(((late >= lo) & (late <= hi)).mean(), 3)}
    L, C, A, Q = d["l"].to_numpy(), c.to_numpy(), d["atr"].to_numpy(), liquid.to_numpy()
    idx = list(range(210, len(dates) - 21, 10))
    stops = []
    for k in STOP_KS:
        hit = tot = hit_late = tot_late = 0
        for t in idx:
            mask = Q[t] & np.isfinite(A[t])
            lowest = np.nanmin(L[t + 1:t + 21], axis=0)
            h = ((lowest <= C[t] - k * A[t]) & mask).sum()
            hit += h
            tot += mask.sum()
            if dates[t] >= cut:
                hit_late += h
                tot_late += mask.sum()
        stops.append({"k": k, "p": num(hit / tot, 3), "late": num(hit_late / tot_late, 3)})
    return cone, stops


levels = E.levels


def main():
    d = E.indicators(E.load())
    m = E.market(d)
    E.trend_state(d)
    E.score(d)
    E.signals(d)

    base = pd.DataFrame(False, index=d["c"].index, columns=d["c"].columns)
    base.iloc[205::10] = True
    d["signals"]["random"] = base & d["liquid"] & d["traded"]
    E.SETUPS["random"] = {"name": "Vào lệnh ngẫu nhiên", "side": "base", "rule": "Mọi mã đủ thanh khoản, cứ 10 phiên vào một lần. Đây là mốc so sánh."}
    ev, paths = E.simulate(d, m)

    dates = d["c"].index
    syms = list(d["c"].columns)
    meta = d["meta"].reindex(syms)
    exch = meta["exchange"].astype(str)
    T = len(dates)
    day = [str(x.date()) for x in dates]

    if DATA.exists():
        shutil.rmtree(DATA)
    (DATA / "s").mkdir(parents=True)

    cone, stops = risk_tables(d)
    report = {
        "asOf": day[-1], "generated": dt.datetime.now().strftime("%Y-%m-%d %H:%M"),
        "sessions": T, "start": day[0], "symbols": len(syms), "liquid": int(d["liquid"].iloc[-1].sum()),
        "minAdv": E.MIN_ADV, "cost": E.COST, "stopAtr": E.STOP_ATR, "targetR": E.TARGET_R, "hold": E.MAX_HOLD,
        "repairs": len(d["repairs"]), "setups": evidence(d, m, ev, paths), "quintiles": quintiles(d, m),
        "portfolio": portfolio(d, m), "cone": cone, "stops": stops,
        "regimeFwd": [
            {"regime": r, **{f"h{h}": num((m["comp"].shift(-h) / m["comp"] - 1)[m["regime"] == r].mean()) for h in (5, 20, 60)},
             "pos20": num(((m["comp"].shift(-20) / m["comp"] - 1)[m["regime"] == r].dropna() > 0).mean()),
             "n": int((m["regime"] == r).sum())}
            for r in ("risk_on", "neutral", "risk_off")],
    }
    report["thongAlt"] = thong_long(d, m)
    report["potential"] = potential_report(d, m)
    report["picks"] = picks_report(d, ev)
    code = {"risk_on": 1, "neutral": 0, "risk_off": -1}
    market = {
        "dates": day, "comp": clean(m["comp"], 2), "ma50": clean(m["ma50"], 2), "ma200": clean(m["ma200"], 2),
        "above50": clean(m["above50"] * 100, 1), "above200": clean(m["above200"] * 100, 1),
        "adv": m["adv"].astype(int).tolist(), "dec": m["dec"].astype(int).tolist(),
        "newHi": m["new_hi"].astype(int).tolist(), "newLo": m["new_lo"].astype(int).tolist(),
        "turnover": clean(m["turnover"], 0), "nLiquid": m["n_liquid"].astype(int).tolist(),
        "regime": [code[x] for x in m["regime"]],
    }
    dump(DATA / "market.json", market)
    dump(DATA / "report.json", report)

    # tín hiệu theo mã
    by_sym = {s: [] for s in syms}
    for row in ev[ev.setup != "random"].itertuples():
        by_sym[row.symbol].append([int(row.t), row.setup, None if pd.isna(row.r) else round(float(row.r), 2), row.why])

    universe = []
    last = T - 1
    nonadj = d["raw_close"].ffill()
    ret = lambda n: (d["c"].iloc[-1] / d["c"].iloc[-1 - n] - 1)
    r1, r5, r20, r60, r250 = ret(1), ret(5), ret(20), ret(60), ret(250)
    C, H, L, O, V = (d[k].to_numpy() for k in ("c", "h", "l", "o", "v"))
    raw_np = nonadj.to_numpy()
    close_real = d["close"].notna().to_numpy()
    shard, shard_no = {}, 0
    for j, s in enumerate(syms):
        idx = np.flatnonzero(close_real[:, j])
        if len(idx) == 0:
            continue
        # phiên có giao dịch, ghi dưới dạng các đoạn liên tiếp để gọn
        runs, a = [], idx[0]
        for p, q in zip(idx[:-1], idx[1:]):
            if q != p + 1:
                runs += [int(a), int(p - a + 1)]
                a = q
        runs += [int(a), int(idx[-1] - a + 1)]
        c = np.round(C[idx, j] * 100).astype(np.int64)
        o = np.round(O[idx, j] * 100).astype(np.int64) - c
        h = np.round(H[idx, j] * 100).astype(np.int64) - c
        l = np.round(L[idx, j] * 100).astype(np.int64) - c
        v = np.round(V[idx, j] / 100).astype(np.int64)
        dc = np.diff(c, prepend=0)
        lim = LIMIT(exch.iloc[j])
        rr = raw_np[idx, j]
        rc = np.full(len(idx), 0.0)
        rc[1:] = rr[1:] / rr[:-1] - 1
        ceil = np.flatnonzero((rc >= lim - 0.008) & (rc <= lim + 0.02) & (C[idx, j] >= H[idx, j] - 1e-9))
        floor = np.flatnonzero((rc <= -lim + 0.008) & (rc >= -lim - 0.02) & (C[idx, j] <= L[idx, j] + 1e-9))
        sr = levels(H[idx, j], L[idx, j], C[idx, j], V[idx, j], float(d["atr"].iat[last, j]))
        for x in sr:
            x["last"] = int(idx[x["last"]])
        sc = d["score"].iloc[-260:, j].to_numpy()
        item = {"r": runs, "c": dc.tolist(), "o": o.tolist(), "h": h.tolist(), "l": l.tolist(), "v": v.tolist(),
                "up": ceil.tolist(), "dn": floor.tolist(), "sr": sr, "ev": by_sym[s],
                "sc": [None if not np.isfinite(x) else int(round(x)) for x in sc]}
        if len(shard) == SHARD_SIZE:
            dump(DATA / "s" / f"{shard_no}.json", shard)
            shard, shard_no = {}, shard_no + 1
        shard[s] = item

        spark = C[-40:, j]
        spark = spark[np.isfinite(spark)]
        lo, hi = (spark.min(), spark.max()) if len(spark) else (0, 0)
        sp = [] if not hi > lo else [int(round((x - lo) / (hi - lo) * 99)) for x in spark]
        todays = [e[1] for e in by_sym[s] if e[0] >= last - 2]
        trend = d["trend"].iat[last, j]
        universe.append([
            s, str(meta["short_name"].iat[j] or ""), str(meta["name"].iat[j] or ""), exch.iat[j], str(meta["icb_name2"].iat[j] or "Khác"),
            str(meta["icb_name4"].iat[j] or ""), num(raw_np[last, j], 2), num(r1.iat[j]), num(d["score"].iat[last, j], 1),
            num(d["stab"].iat[last, j], 1), num(d["pos52"].iat[last, j], 1), trend, num(d["rs"].iat[last, j], 0),
            num(d["atr"].iat[last, j] / d["c"].iat[last, j]), num(d["c"].iat[last, j] / d["hh252"].iat[last, j] - 1),
            num(d["adv20"].iat[last, j], 2), num(d["vol_ratio"].iat[last, j], 2), num(d["rsi"].iat[last, j], 1),
            num(r5.iat[j]), num(r20.iat[j]), num(r60.iat[j]), num(r250.iat[j]), num(d["ext"].iat[last, j], 2),
            num(d["atr"].iat[last, j], 3), bool(d["liquid"].iat[last, j]), todays, sp, shard_no, str(meta["company_type"].iat[j] or ""),
            num(d["score"].iat[-6, j], 1), trend_was(d, j),
        ])
    if shard:
        dump(DATA / "s" / f"{shard_no}.json", shard)
    dump(DATA / "universe.json", universe)
    dump(DATA / "thong.json", thong_table(d, syms))
    size = sum(p.stat().st_size for p in DATA.rglob("*.json"))
    print(f"Đã ghi {len(universe)} mã, {shard_no + 1} mảnh, tổng {size / 1e6:.1f} MB, phiên cuối {day[-1]}, sửa {len(d['repairs'])} phiên lệch hệ số")


def topn_portfolio(d, score, n=10):
    """Giữ n mã điểm cao nhất, đổi mỗi 20 phiên, so với toàn thị trường và VNINDEX cùng thời điểm."""
    c, o, liquid = d["c"], d["o"], d["liquid"]
    dates = c.index
    path = E.CACHE / "vnindex.pkl"
    index = None
    if path.exists():
        raw = pd.read_pickle(path)
        index = raw.set_index(pd.to_datetime(raw["date"]))["close"].astype(float).reindex(dates).ffill()
    nav, base, vn, when, held = [1.0], [1.0], [1.0], [], []
    hold = set()
    for i in range(210, len(dates) - 1, 20):
        ranked = score.iloc[i].dropna().sort_values(ascending=False)
        top = list(ranked.index[:n])
        end = min(i + 21, len(dates) - 1)
        if end <= i + 1:
            continue
        churn = (1 - len(set(top) & hold) / len(top)) if top else (1.0 if hold else 0.0)
        r = (c[top].iloc[end] / o[top].iloc[i + 1] - 1).mean() if top else 0.0
        uni = list(liquid.iloc[i][liquid.iloc[i]].index)
        ru = (c[uni].iloc[end] / o[uni].iloc[i + 1] - 1).mean()
        nav.append(nav[-1] * (1 + r - churn * E.COST))
        base.append(base[-1] * (1 + ru))
        if index is not None:
            vn.append(vn[-1] * index.iloc[end] / index.iloc[i + 1])
        when.append(str(dates[end].date()))
        held.append(len(top))
        hold = set(top)
    drawdown = lambda x: float((pd.Series(x) / pd.Series(x).cummax() - 1).min())
    out = {"dates": when, "port": clean(nav[1:], 4), "base": clean(base[1:], 4), "ret": num(nav[-1] - 1), "baseRet": num(base[-1] - 1),
           "dd": num(drawdown(nav)), "baseDd": num(drawdown(base)), "periods": len(when), "avgHeld": num(np.mean(held), 1), "start": str(dates[211].date())}
    if index is not None:
        out.update(vn=clean(vn[1:], 4), vnRet=num(vn[-1] - 1), vnDd=num(drawdown(vn)))
    return out


def vn_series(d):
    """VNINDEX theo từng phiên của dashboard, chỉ để so sánh hiệu quả của giỏ."""
    path = E.CACHE / "vnindex.pkl"
    if not path.exists():
        return {}
    raw = pd.read_pickle(path)
    index = raw.set_index(pd.to_datetime(raw["date"]))["close"].astype(float).reindex(d["c"].index).ffill().bfill()
    return {"vnAt": clean(index, 2), "vnFirst": num(index.iloc[0], 2), "vnLast": num(index.iloc[-1], 2)}


def fin_report(d):
    """Tài chính 8 quý và phép tính P/E hiện tại của mã đủ thanh khoản. Chỉ để hiển thị.

    P/E lấy báo cáo đã qua FIN_LAG_DAYS. EPS tự tính vì EPS nguồn của doanh nghiệp thường chậm một quý và gồm cả cổ đông thiểu số. Số cổ phiếu là
    số lớn hơn giữa vốn điều lệ và số suy từ giá trị sổ sách (số này thường đi trước vốn điều lệ một quý),
    nhân hệ số chia cổ phiếu sau cuối kỳ. Lấy theo cách này khớp số quý sau trong 5% ở 95% trường hợp.
    """
    path = E.CACHE / "fin.pkl"
    if not path.exists():
        return None
    x = pd.read_pickle(path)
    if (E.CACHE / "stmt.pkl").exists():
        x = pd.concat([x, pd.read_pickle(E.CACHE / "stmt.pkl")], ignore_index=True)
    x = x[x["quarter"].isin([1, 2, 3, 4])].copy()
    x["symbol"] = x["symbol"].astype(str)
    idx, cols = d["c"].index, d["c"].columns
    price = d["raw_close"].ffill().iloc[-1] * 1000
    fac = (d["c"] / d["raw_close"]).ffill()
    wide = x.pivot_table(index=["symbol", "year", "quarter"], columns="code", values="value", aggfunc="last").reset_index()
    rows = {}
    for s, g in wide.groupby("symbol"):
        if s not in cols or not d["liquid"].iloc[-1].get(s, False):
            continue
        g = g.sort_values(["year", "quarter"]).copy()
        col = lambda k: g[k] if k in g else pd.Series(np.nan, index=g.index)
        g["profit"] = (col("parent") - col("minority").fillna(0)).fillna(col("npat"))
        pos = g["year"] * 4 + g["quarter"]
        g["ttm"] = g["profit"].rolling(4).sum().where(pos.diff(3) == 3)   # bỏ khi thiếu quý giữa chừng
        g["shares"] = pd.concat([col("capital") / 1e4, col("total_equity") / col("bvps")], axis=1).max(axis=1)
        g["sales"] = col("revenue").fillna(col("total_operating_income")).fillna(col("total_operating_revenue"))
        g["eps_calc"] = g["ttm"] / g["shares"]
        qend = pd.PeriodIndex.from_fields(year=g["year"].astype(int), quarter=g["quarter"].astype(int), freq="Q").end_time.normalize()
        used = g[qend + pd.Timedelta(days=E.FIN_LAG_DAYS) <= idx[-1]].tail(1)
        now = None
        if len(used) and pd.notna(used["eps_calc"].iloc[0]) and pd.notna(price[s]) and used["eps_calc"].iloc[0] != 0:
            u, end = used.iloc[0], qend[g.index.get_loc(used.index[0])]
            if (idx >= end + pd.Timedelta(days=E.FIN_LAG_DAYS)).sum() <= E.FIN_STALE:
                past = fac[s][fac.index <= end].dropna()
                split = float(fac[s].iloc[-1] / past.iloc[-1]) if len(past) else 1.0
                split = split if split >= E.SPLIT_MIN else 1.0
                shares = u["shares"] * split
                now ={"q": f"Q{int(u.quarter)} {int(u.year)}", "ttm": num(u["ttm"] / 1e9, 1), "shares": num(shares / 1e6, 1), "split": num(split, 3),
                       "eps": num(u["ttm"] / shares, 0), "price": num(price[s], 0)}
        ty = lambda r, k: num(r.get(k) / 1e9, 1) if pd.notna(r.get(k)) else None
        hist = [{"q": f"Q{int(r.quarter)} {int(r.year)}", "sales": ty(r, "sales"), "profit": ty(r, "profit"), "ttm": ty(r, "ttm"), "equity": ty(r, "total_equity"),
                 "shares": num(r.get("shares") / 1e6, 1), "roe": num(r.get("roe")), "npat": num(r.get("npat_growth")), "rev": num(r.get("revenue_growth")),
                 "eps": num(r.get("eps"), 0), "epsCalc": num(r.get("eps_calc"), 0), "npl": num(r.get("npl_ratio"), 4)} for _, r in g.tail(8).iterrows()]
        rows[s] = {"now": now, "hist": hist}
    return {"lag": E.FIN_LAG_DAYS, "rows": rows}


def picks_report(d, ev):
    """Dữ liệu tab Chọn mã: mọi mã đủ thanh khoản, phễu lọc và bằng chứng so với VNINDEX."""
    t = len(d["c"]) - 1
    syms = list(d["c"].columns)
    H, L, C, V = (d[k].to_numpy() for k in ("h", "l", "c", "v"))
    liquid = d["liquid"].iloc[-1]
    gate = d["pot_gate"].iloc[-1]
    pot = d["pot"].iloc[-1]
    rows = []
    for j, s in enumerate(syms):
        if not liquid.iat[j]:
            continue
        score, trend, ext = d["score"].iat[t, j], d["trend"].iat[t, j], d["ext"].iat[t, j]
        checks = [bool(d[k].iat[t, j]) for k in ("t1", "t2", "t3")]
        fails = []
        if not score >= E.POT_MIN_SCORE:
            fails.append("score")
        if trend not in ("strong", "up"):
            fails.append("trend")
        if not ext <= E.POT_MAX_EXT:
            fails.append("ext")
        flags = []
        if d["veto_broke"].iat[t, j]:
            flags.append("broke")
        if d["veto_dump"].iat[t, j]:
            flags.append("dump")
        pillars = {k: num(d["pick_pillars"][k].iat[t, j], 1) for k in ("ben", "trend", "signal", "buy", "liq")}
        pillars["thong"] = num(sum(checks) * 100 / 3, 1)
        idx = np.flatnonzero(np.isfinite(C[:, j]))
        atr = float(d["atr"].iat[t, j])
        near = levels(H[idx, j], L[idx, j], C[idx, j], V[idx, j], atr)
        res = min((x["price"] for x in near if x["kind"] == "res"), default=None)
        sup = max((x["price"] for x in near if x["kind"] == "sup"), default=None)
        pts = pot.iat[j]
        if not gate.iat[j]:
            tier = "out"
        elif flags:
            tier = "avoid"
        else:
            tier = "first" if pts >= E.POT_A else "second" if pts >= E.POT_B else "watch"
        rows.append({"s": s, "tier": tier, "pot": num(pts, 1), "pillars": pillars, "checks": checks, "fails": fails, "flags": flags,
                     "res": res, "sup": sup, "stop": num(E.STOP_ATR * atr / C[t, j])})
    # phễu theo thứ tự lọc
    total = int(d["close"].notna().any().sum())
    left = rows
    funnel = [{"key": "all", "n": total}, {"key": "liquid", "n": len(left)}]
    for key in ("score", "trend", "ext"):
        left = [r for r in left if key not in r["fails"]]
        funnel.append({"key": key, "n": len(left)})
    left = [r for r in left if not r["flags"]]
    funnel.append({"key": "clean", "n": len(left)})
    funnel.append({"key": "second", "n": sum(r["tier"] in ("first", "second") for r in rows)})
    funnel.append({"key": "first", "n": sum(r["tier"] == "first" for r in rows)})

    comp = ev[ev["complete"]]
    def stress(key):
        x = comp[comp.setup == key]
        return {"n": int(len(x)), "ret": num(x["ret"].mean()), "risk": num(x["risk_pct"].mean()), "bars": num(x["bars"].mean(), 1),
                "s0": num(x["r"].mean(), 3), "s2": num(((x["ret"] - 0.002) / x["risk_pct"]).mean(), 3), "s5": num(((x["ret"] - 0.005) / x["risk_pct"]).mean(), 3)}
    a = comp[comp.setup == "pot_a"]
    quarters = [{"q": str(q).replace("Q", " Q"), "n": int(len(g)), "exp": num(g["r"].mean(), 2)} for q, g in a.groupby(a["date"].dt.to_period("Q"))]
    wins = a["r"].nlargest(10).sum()
    styles = {}
    clean = ~(d["veto_broke"] | d["veto_dump"])
    for key, cfg in E.PICK_STYLES.items():
        f = E.pick_score(d, cfg["w"]).where(clean)
        p = topn_portfolio(d, f, 10)
        styles[key] = {"name": cfg["name"], "note": cfg["note"], "w": cfg["w"], "ret": p["ret"], "dd": p["dd"]}
    f = d["pick_pts"].where(clean)
    top10, top5 = topn_portfolio(d, f, 10), topn_portfolio(d, f, 5)
    return {"rows": rows, "funnel": funnel, "gradeA": E.POT_A, "gradeB": E.POT_B, "minScore": E.POT_MIN_SCORE, "maxExt": E.POT_MAX_EXT,
            "styles": styles, "top10": top10, "top5": {k: top5[k] for k in ("ret", "dd")},
            "stress": {"first": stress("pot_a"), "second": stress("pot_b"), "random": stress("random")},
            "quarters": quarters, "topShare": num(wins / a["r"].sum() if a["r"].sum() > 0 else None, 2),
            "avgPerDay": num((d["pot"] >= E.POT_A).sum(axis=1).mean(), 2), "dump": E.PICK_DUMP, "fin": fin_report(d), **vn_series(d)}


def thong_long(d, m):
    """Mẫu tích lũy thường cần nhiều thời gian hơn, nên thử thêm cách giữ lệnh dài: 3 ATR, 3R, 60 phiên."""
    kept = (E.STOP_ATR, E.TARGET_R, E.MAX_HOLD)
    E.STOP_ATR, E.TARGET_R, E.MAX_HOLD = 3.0, 3.0, 60
    picked = {k: d["signals"][k] for k in ("thong", "thong2", "random")}
    ev, _ = E.simulate({**d, "signals": picked}, m)
    E.STOP_ATR, E.TARGET_R, E.MAX_HOLD = kept
    rand = ev[(ev.setup == "random") & ev["complete"]]
    return {"stop": 3, "target": 3, "hold": 60, "thong": block(ev[ev.setup == "thong"], rand),
            "thong2": block(ev[ev.setup == "thong2"], rand), "random": block(rand, rand)}


def potential_report(d, m):
    """Danh sách mã tiềm năng hôm nay và phép thử danh mục 10 mã điểm cao nhất."""
    t = len(d["c"]) - 1
    syms = list(d["c"].columns)
    H, L, C, V = (d[k].to_numpy() for k in ("h", "l", "c", "v"))
    bonus_key = {v: k for k, v in E.POT_BONUS.items()}
    rows = []
    for j, s in enumerate(syms):
        pts = d["pot"].iat[t, j]
        if not np.isfinite(pts):
            continue
        checks = [bool(d[k].iat[t, j]) for k in ("t1", "t2", "t3")]
        idx = np.flatnonzero(np.isfinite(C[:, j]))
        atr = float(d["atr"].iat[t, j])
        near = levels(H[idx, j], L[idx, j], C[idx, j], V[idx, j], atr)
        res = min((x["price"] for x in near if x["kind"] == "res"), default=None)
        sup = max((x["price"] for x in near if x["kind"] == "sup"), default=None)
        bonus = float(d["pot_bonus"].iat[t, j])
        fired = [k for k in E.POT_BONUS if bool(d["signals"][k].iloc[-E.POT_SIGNAL_WINDOW:, j].any())]
        rows.append({"s": s, "pts": num(pts, 1), "grade": "A" if pts >= E.POT_A else "B" if pts >= E.POT_B else "C",
                     "bonus": num(bonus, 0), "signals": fired, "checks": checks, "res": res, "sup": sup,
                     "stop": num(E.STOP_ATR * atr / C[t, j])})
    rows.sort(key=lambda r: -r["pts"])

    c, o, liquid, pot = d["c"], d["o"], d["liquid"], d["pot"]
    dates = c.index
    nav, base, when, held = [1.0], [1.0], [], []
    hold = set()
    for i in range(210, len(dates) - 1, 20):
        ranked = pot.iloc[i].dropna().sort_values(ascending=False)
        top = list(ranked.index[:10])
        end = min(i + 21, len(dates) - 1)
        if end <= i + 1:
            continue
        churn = (1 - len(set(top) & hold) / len(top)) if top else (1.0 if hold else 0.0)
        r = (c[top].iloc[end] / o[top].iloc[i + 1] - 1).mean() if top else 0.0
        uni = list(liquid.iloc[i][liquid.iloc[i]].index)
        ru = (c[uni].iloc[end] / o[uni].iloc[i + 1] - 1).mean()
        nav.append(nav[-1] * (1 + r - churn * E.COST))
        base.append(base[-1] * (1 + ru))
        when.append(str(dates[end].date()))
        held.append(len(top))
        hold = set(top)
    drawdown = lambda x: float((pd.Series(x) / pd.Series(x).cummax() - 1).min())
    kept = (E.STOP_ATR, E.TARGET_R, E.MAX_HOLD)
    E.STOP_ATR, E.TARGET_R, E.MAX_HOLD = 3.0, 3.0, 60
    picked = {k: d["signals"][k] for k in ("pot_a", "pot_b", "random")}
    ev, _ = E.simulate({**d, "signals": picked}, m)
    E.STOP_ATR, E.TARGET_R, E.MAX_HOLD = kept
    rand = ev[(ev.setup == "random") & ev["complete"]]
    return {"rows": rows, "minScore": E.POT_MIN_SCORE, "maxExt": E.POT_MAX_EXT, "gradeA": E.POT_A, "gradeB": E.POT_B,
            "thongPts": E.POT_THONG_PTS, "bonus": E.POT_BONUS,
            "long": {"a": block(ev[ev.setup == "pot_a"], rand), "b": block(ev[ev.setup == "pot_b"], rand), "random": block(rand, rand)},
            "portfolio": {"dates": when, "port": clean(nav[1:], 4), "base": clean(base[1:], 4), "ret": num(nav[-1] - 1), "baseRet": num(base[-1] - 1),
                          "dd": num(drawdown(nav)), "baseDd": num(drawdown(base)), "periods": len(when), "avgHeld": num(np.mean(held), 1)}}


def thong_table(d, syms):
    """Kết quả 3 tiêu chí của từng mã ở phiên cuối, kèm số đo để giải thích."""
    t = len(d["c"]) - 1
    e10, e20 = d["ema10"].to_numpy(), d["ema20"].to_numpy()
    closes = d["c"].to_numpy()
    out = {}
    for j, s in enumerate(syms):
        if not np.isfinite(closes[t, j]):
            continue
        cross = None
        for k in range(0, min(10, t)):
            if e10[t - k, j] > e20[t - k, j] and e10[t - k - 1, j] <= e20[t - k - 1, j]:
                cross = k
                break
        atr = float(d["atr"].iat[t, j])
        res = E.nearest_res(d, t, j)
        out[s] = {"e": [num(d[f"ema{n}"].iat[t, j], 3) for n in (10, 20, 50, 150, 200)], "c": num(closes[t, j], 2), "x": cross,
                  "p": [bool(d[k].iat[t, j]) for k in ("t1", "t2", "t3")], "rsi": num(d["rsi"].iat[t, j], 1), "peakRsi": num(d["peak_rsi"].iat[t, j], 1),
                  "peakPx": num(d["peak_px"].iat[t, j], 2), "bounce": bool(d["bounce"].iat[t, j]), "res": res,
                  "resAtr": num((res - closes[t, j]) / atr, 2) if res is not None and atr > 0 else None,
                  "vol": num(d["v"].iat[t, j], 0), "downVol": num(d["down_vol"].iat[t, j], 0)}
    return {"rsiGap": E.THONG_RSI_GAP, "nearAtr": E.THONG_NEAR_ATR, "touch": E.THONG_TOUCH, "touchDays": E.THONG_TOUCH_DAYS,
            "downDays": E.THONG_DOWN_DAYS, "peakDays": E.THONG_PEAK_LOOKBACK, "rows": out}


def LIMIT(ex):
    return E.LIMITS.get(ex, 0.07)


def trend_was(d, j):
    return d["trend"].iat[-6, j]


if __name__ == "__main__":
    sys.exit(main())
