"""Gom trang và dữ liệu vào public/ để đăng lên GitHub Pages. Dừng nếu dữ liệu có dấu hiệu bất thường."""
import datetime as dt
import json
import pathlib
import shutil
import sys

import build_page

ROOT = pathlib.Path(__file__).parent
SITE = ROOT / "site"
OUT = ROOT / "public"
MIN_SYMBOLS = 1000     # ít hơn mức này nghĩa là lần tải bị thiếu, không đăng đè bản tốt
MAX_AGE_DAYS = 7       # dữ liệu cũ hơn mức này nghĩa là nguồn đang có vấn đề


def main():
    report = json.loads((SITE / "data" / "report.json").read_text(encoding="utf-8"))
    age = (dt.date.today() - dt.date.fromisoformat(report["asOf"])).days
    if report["symbols"] < MIN_SYMBOLS or age > MAX_AGE_DAYS:
        print(f"Dừng: {report['symbols']} mã, dữ liệu đến {report['asOf']}, cũ {age} ngày")
        return 1
    if OUT.exists():
        shutil.rmtree(OUT)
    shutil.copytree(SITE / "data", OUT / "data")
    (OUT / "index.html").write_text(build_page.full_page(), encoding="utf-8")
    (OUT / ".nojekyll").write_text("", encoding="utf-8")
    size = sum(p.stat().st_size for p in OUT.rglob("*") if p.is_file())
    print(f"public/: {size / 1e6:.1f} MB, {report['symbols']} mã, dữ liệu đến {report['asOf']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
