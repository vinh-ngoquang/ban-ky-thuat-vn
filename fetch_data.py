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

ROOT = pathlib.Path(__file__).parent
CACHE = ROOT / "cache"
BATCH = 25
CONCURRENCY = 4        # trần của gói tài khoản hiện tại
DEADLINE = 1800        # giây chờ cho mỗi lời gọi: SDK rải đều hạn mức tới nửa đêm, càng sớm trong ngày càng phải chờ lâu
RETRIES = 6            # số lần thử cho mỗi nhóm mã khi FinLens lỗi tạm thời
RETRY_WAIT = 30        # giây, tăng dần sau mỗi lần thử
HISTORY_DAYS = 1090


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


def fetch_prices(symbols, start, end, adjusted):
    results = asyncio.run(_fetch_all(symbols, start, end, adjusted))
    return pd.concat([r[0] for r in results], ignore_index=True), [s for r in results for s in r[1]]


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

    meta.to_pickle(CACHE / "meta.pkl")
    adjusted.to_pickle(CACHE / "adjusted.pkl")
    raw.to_pickle(CACHE / "raw.pkl")

    left = client.limits()
    print(f"Xong: {len(adjusted):,} dòng điều chỉnh, {len(raw):,} dòng gốc, "
          f"lỗi {len(set(failed_a + failed_r))} mã, còn {left['requests_remaining']} request hôm nay", flush=True)
    if failed_a or failed_r:
        print("Mã lỗi:", sorted(set(failed_a + failed_r))[:40], flush=True)


if __name__ == "__main__":
    sys.exit(main())
