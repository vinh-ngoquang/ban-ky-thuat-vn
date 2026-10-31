"""Lấy dữ liệu đang chạy trên trang công khai về site/data, không gọi FinLens.

Dùng khi chỉ đổi giao diện: dựng lại trang với dữ liệu hiện có, chỉ mất 1 đến 2 phút.
"""
import concurrent.futures
import json
import pathlib
import sys
import time
import urllib.request

BASE = "https://vinh-ngoquang.github.io/ban-ky-thuat-vn/data/"
OUT = pathlib.Path(__file__).parent / "site" / "data"
FILES = ("report.json", "market.json", "universe.json", "thong.json")
SHARD_COLUMN = 27      # vị trí số mảnh trong mỗi dòng của universe.json
ATTEMPTS = 4


def get(name):
    target = OUT / name
    target.parent.mkdir(parents=True, exist_ok=True)
    for attempt in range(1, ATTEMPTS + 1):
        try:
            with urllib.request.urlopen(BASE + name, timeout=60) as res:
                target.write_bytes(res.read())
            return
        except OSError:
            if attempt == ATTEMPTS:
                raise
            time.sleep(5 * attempt)


def main():
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    for name in FILES:
        get(name)
    rows = json.loads((OUT / "universe.json").read_text(encoding="utf-8"))
    shards = sorted({row[SHARD_COLUMN] for row in rows})
    with concurrent.futures.ThreadPoolExecutor(8) as pool:
        list(pool.map(get, [f"s/{n}.json" for n in shards]))
    size = sum(p.stat().st_size for p in OUT.rglob("*.json"))
    print(f"Đã lấy {len(FILES) + len(shards)} tệp, {size / 1e6:.1f} MB, {len(rows)} mã")


if __name__ == "__main__":
    sys.exit(main())
