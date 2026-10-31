"""Tải OHLCV ngày của toàn bộ cổ phiếu từ FinLens (eod.stock.ohlcv) về cache/.

Lấy cả hai loại giá:
  adjusted=True  dùng cho mọi chỉ báo và kiểm chứng (chuỗi liên tục qua cổ tức, chia tách)
  adjusted=False dùng cho thanh khoản thật, giá trần/sàn, giá đặt lệnh

API key đọc từ biến môi trường FINLENS_API_KEY, không ghi ra đâu cả.
"""
import asyncio
import datetime as dt
import pathlib
import sys
import time
import warnings

import pandas as pd

import finlens

import engine as E

ROOT = pathlib.Path(__file__).parent
CACHE = ROOT / "cache"
BATCH = 25
CONCURRENCY = 4        # trần của gói tài khoản hiện tại
DEADLINE = 1800        # giây chờ cho mỗi lời gọi: SDK rải đều hạn mức tới nửa đêm, càng sớm trong ngày càng phải chờ lâu
RETRIES = 6            # số lần thử cho mỗi nhóm mã khi FinLens lỗi tạm thời
RETRY_WAIT = 30        # giây, tăng dần sau mỗi lần thử
HISTORY_DAYS = 1090
FIN_CODES = ["roe", "eps", "npat_growth", "revenue_growth", "npl_ratio", "npat", "total_equity", "bvps",
             "revenue", "total_operating_income", "total_operating_revenue"]
STMT_BATCH = 12        # mỗi mã khoảng 120 dòng mỗi quý, giữ dưới trần 25.000 dòng mỗi lần gọi
STMT_LINES = {         # số thứ tự dòng trong báo cáo gốc theo loại doanh nghiệp
    "income_statement": {"CT": {22: "parent"}, "BH": {62: "parent"}, "CK": {61: "parent"}, "NH": {21: "parent", 22: "minority"}},
    "balance_sheet": {"CT": {96: "capital"}, "BH": {98: "capital"}, "CK": {108: "capital"}, "NH": {64: "capital"}},
}


async def _fetch_all(symbols, start, end, adjusted):
    chunks = [symbols[i:i + BATCH] for i in range(0, len(symbols), BATCH)]
    gate = asyncio.Semaphore(CONCURRENCY)
    t0 = time.time()
    done = 0

    async def one(client, chunk):
        nonlocal done
        for attempt in range(1, RETRIES + 1):
            try:
                async with gate:
                    df = await client.eod.stock.ohlcv(chunk, start=start, end=end, adjusted=adjusted, refresh=True)
                break
            except finlens.TransportError as ex:
                if attempt == RETRIES:
                    raise
                wait = RETRY_WAIT * attempt
                print(f"  FinLens lỗi tạm thời ({type(ex).__name__}), thử lại sau {wait}s, lần {attempt}/{RETRIES - 1}", flush=True)
                await asyncio.sleep(wait)
        done += len(chunk)
        if done % 250 == 0 or done == len(symbols):
            print(f"  adjusted={adjusted}: {done}/{len(symbols)} mã, {time.time() - t0:.0f}s", flush=True)
        return pd.DataFrame(df), list((df.attrs.get("finlens") or {}).get("failed") or {})

    async with finlens.AsyncClient(deadline=DEADLINE) as client:
        results = await asyncio.gather(*(one(client, c) for c in chunks))
    return results


def fetch_index(client, start, end):
    """VNINDEX chỉ dùng làm mốc so sánh hiệu quả, không tham gia chấm điểm."""
    df = pd.DataFrame(client.eod.index.ohlcv("VNINDEX", start=start, end=end))
    df[["date", "close"]].to_pickle(CACHE / "vnindex.pkl")


def fetch_prices(symbols, start, end, adjusted):
    results = asyncio.run(_fetch_all(symbols, start, end, adjusted))
    return pd.concat([r[0] for r in results], ignore_index=True), [s for r in results for s in r[1]]


async def _fetch_fin(symbols, start_year):
    chunks = [symbols[i:i + BATCH] for i in range(0, len(symbols), BATCH)]
    gate = asyncio.Semaphore(CONCURRENCY)

    async def one(client, chunk):
        for attempt in range(1, RETRIES + 1):
            try:
                async with gate:
                    return pd.DataFrame(await client.financials.indicators(chunk, codes=FIN_CODES, period="quarterly", start_year=start_year, refresh=True))
            except finlens.TransportError:
                if attempt == RETRIES:
                    raise
                await asyncio.sleep(RETRY_WAIT * attempt)

    async with finlens.AsyncClient(deadline=DEADLINE) as client:
        return await asyncio.gather(*(one(client, c) for c in chunks))


def stmt_lines(df, kind):
    """Giữ lợi nhuận công ty mẹ, cổ đông thiểu số và vốn điều lệ, đặt tên như một chỉ tiêu."""
    out = []
    for company_type, lines in STMT_LINES[kind].items():
        x = df[(df["company_type"] == company_type) & df["item_id"].isin(lines)]
        out.append(x.assign(code=x["item_id"].map(lines))[["symbol", "year", "quarter", "code", "value"]])
    return pd.concat(out, ignore_index=True)


async def _fetch_stmt(symbols, start_year):
    chunks = [symbols[i:i + STMT_BATCH] for i in range(0, len(symbols), STMT_BATCH)]
    gate = asyncio.Semaphore(CONCURRENCY)

    async def one(client, chunk, kind):
        for attempt in range(1, RETRIES + 1):
            try:
                async with gate:
                    return stmt_lines(pd.DataFrame(await client.financials.statement(chunk, kind=kind, period="quarterly", start_year=start_year, refresh=True)), kind)
            except finlens.TransportError:
                if attempt == RETRIES:
                    raise
                await asyncio.sleep(RETRY_WAIT * attempt)

    async with finlens.AsyncClient(deadline=DEADLINE) as client:
        return await asyncio.gather(*(one(client, c, k) for k in STMT_LINES for c in chunks))


def fetch_financials(raw):
    """Chỉ tiêu quý của các mã đang đủ thanh khoản, chỉ để hiển thị. Lỗi thì giữ bản cũ, không chặn cập nhật giá."""
    recent = raw[raw["date"] >= sorted(raw["date"].unique())[-20]]
    value = (recent["close"] * recent["volume"] / 1e6).groupby(recent["symbol"].astype(str)).sum() / 20
    symbols = sorted(value[value >= E.MIN_ADV / 2].index)     # rộng hơn ngưỡng để không sót mã vừa đủ thanh khoản
    try:
        frames = asyncio.run(_fetch_fin(symbols, dt.date.today().year - 3))
        stmt = asyncio.run(_fetch_stmt(symbols, dt.date.today().year - 3))
    except finlens.FinLensError as ex:
        print(f"Không tải được tài chính ({type(ex).__name__}), giữ bản cũ", flush=True)
        return
    df = pd.concat(frames, ignore_index=True)
    df.to_pickle(CACHE / "fin.pkl")
    pd.concat(stmt, ignore_index=True).to_pickle(CACHE / "stmt.pkl")
    print(f"Tài chính: {df['symbol'].nunique()} mã, {len(df):,} dòng", flush=True)


def main():
    CACHE.mkdir(exist_ok=True)
    warnings.simplefilter("ignore")
    client = finlens.client()
    end = dt.date.today()
    start = end - dt.timedelta(days=HISTORY_DAYS)

    meta = pd.DataFrame(client.meta.symbols(kind="stock"))
    symbols = sorted(meta["symbol"].astype(str))
    print(f"{len(symbols)} mã, {start} đến {end}", flush=True)

    adjusted, failed_a = fetch_prices(symbols, start, end, True)
    raw, failed_r = fetch_prices(symbols, start, end, False)

    fetch_index(client, start, end)
    meta.to_pickle(CACHE / "meta.pkl")
    adjusted.to_pickle(CACHE / "adjusted.pkl")
    raw.to_pickle(CACHE / "raw.pkl")
    fetch_financials(raw)

    left = client.limits()
    print(f"Xong: {len(adjusted):,} dòng điều chỉnh, {len(raw):,} dòng gốc, "
          f"lỗi {len(set(failed_a + failed_r))} mã, còn {left['requests_remaining']} request hôm nay", flush=True)
    if failed_a or failed_r:
        print("Mã lỗi:", sorted(set(failed_a + failed_r))[:40], flush=True)


if __name__ == "__main__":
    sys.exit(main())
