"""Ghép CSS và JS vào một trang duy nhất: site/index.html."""
import pathlib

ROOT = pathlib.Path(__file__).parent
SRC = ROOT / "src"


HEAD = ('<!doctype html><html lang="vi"><head><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'
        '<style>:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}'
        'body{margin:0}[hidden]{display:none!important}img{max-width:100%}</style></head><body>')
TAIL = "</body></html>"


def full_page():
    """Trang hoàn chỉnh để chạy ngoài artifact: site/index.html chỉ là phần thân."""
    return HEAD + (ROOT / "site" / "index.html").read_text(encoding="utf-8") + TAIL


def main():
    tpl = (SRC / "index.tpl.html").read_text(encoding="utf-8")
    css = (SRC / "app.css").read_text(encoding="utf-8")
    js = "\n".join((SRC / f).read_text(encoding="utf-8") for f in ("core.js", "chart.js", "picks.js", "app.js"))
    page = tpl.replace("/*__CSS__*/", css).replace("/*__JS__*/", js.replace("</script", "<\\/script"))
    out = ROOT / "site" / "index.html"
    out.parent.mkdir(exist_ok=True)
    out.write_text(page, encoding="utf-8")
    print(f"site/index.html: {len(page.encode('utf-8')) / 1024:.0f} KB")


if __name__ == "__main__":
    main()
