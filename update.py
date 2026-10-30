"""Cập nhật dữ liệu rồi dựng lại trang.

Mỗi lần tốn khoảng 130 request. SDK rải đều hạn mức còn lại tới nửa đêm, nên thời gian chạy
phụ thuộc giờ trong ngày: khoảng 25 phút lúc 18:00, 6 phút lúc gần nửa đêm, hơn 1 giờ buổi sáng.
Có sẵn cache: chỉ tải 20 ngày gần nhất, và tải lại riêng mã có giá điều chỉnh thay đổi.
"""
import datetime as dt
import sys
import time
import warnings

import pandas as pd

import finlens

import build_page
import export
import fetch_data as F

TOLERANCE = 0.003


def merge(old, new):
    return pd.concat([old, new]).drop_duplicates(["symbol", "date"], keep="last").sort_values(["symbol", "date"], ignore_index=True)


def main():
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    warnings.simplefilter("ignore")
    t0 = time.time()
    if not (F.CACHE / "adjusted.pkl").exists():
        print("Chưa có dữ liệu, tải đủ 3 năm...", flush=True)
        F.main()
    else:
        client = finlens.client()
        end = dt.date.today()
        start = end - dt.timedelta(days=20)
        meta = pd.DataFrame(client.meta.symbols(kind="stock"))
        symbols = sorted(meta["symbol"].astype(str))
        adjusted = pd.read_pickle(F.CACHE / "adjusted.pkl")
        raw = pd.read_pickle(F.CACHE / "raw.pkl")
        for frame in (adjusted, raw):
            frame["symbol"] = frame["symbol"].astype(str)

        recent_adj, _ = F.fetch_prices(symbols, start, end, True)
        recent_raw, _ = F.fetch_prices(symbols, start, end, False)
        recent_adj["symbol"] = recent_adj["symbol"].astype(str)
        recent_raw["symbol"] = recent_raw["symbol"].astype(str)

        # so giá điều chỉnh trên phần chồng lấp: lệch nghĩa là nguồn đã điều chỉnh lại lịch sử
        both = adjusted.merge(recent_adj, on=["symbol", "date"], suffixes=("_old", "_new"))
        moved = both[(both["close_new"] / both["close_old"] - 1).abs() > TOLERANCE]
        changed = sorted(moved["symbol"].unique())
        adjusted, raw = merge(adjusted, recent_adj), merge(raw, recent_raw)
        if changed:
            print(f"{len(changed)} mã có điều chỉnh giá, tải lại lịch sử: {changed[:20]}", flush=True)
            first = end - dt.timedelta(days=F.HISTORY_DAYS)
            redo, _ = F.fetch_prices(changed, first, end, True)
            redo["symbol"] = redo["symbol"].astype(str)
            adjusted = merge(adjusted[~adjusted["symbol"].isin(changed)], redo)

        # giữ đúng cửa sổ lịch sử mà gói tài khoản cho phép
        cutoff = pd.Timestamp(end - dt.timedelta(days=F.HISTORY_DAYS))
        adjusted = adjusted[adjusted["date"] >= cutoff].reset_index(drop=True)
        raw = raw[raw["date"] >= cutoff].reset_index(drop=True)
        meta.to_pickle(F.CACHE / "meta.pkl")
        adjusted.to_pickle(F.CACHE / "adjusted.pkl")
        raw.to_pickle(F.CACHE / "raw.pkl")
        last = adjusted["date"].max().date()
        print(f"Dữ liệu đến {last}, còn {client.limits()['requests_remaining']} request hôm nay", flush=True)

    export.main()
    build_page.main()
    print(f"Xong sau {(time.time() - t0) / 60:.1f} phút.", flush=True)


if __name__ == "__main__":
    sys.exit(main())
