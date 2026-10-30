"""Chạy dashboard trên máy tại http://localhost:8765 (chỉ nhận kết nối từ chính máy này)."""
import functools
import http.server
import pathlib
import sys
import webbrowser

import build_page

SITE = pathlib.Path(__file__).parent / "site"
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8765


class Handler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path.split("?")[0] in ("/", "/index.html"):
            body = build_page.full_page().encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        super().do_GET()

    def log_message(self, *args):
        pass


def main():
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")   # console Windows mặc định không in được tiếng Việt
    handler = functools.partial(Handler, directory=str(SITE))
    with http.server.ThreadingHTTPServer(("127.0.0.1", PORT), handler) as srv:
        url = f"http://localhost:{PORT}"
        print(f"Dashboard đang chạy tại {url}. Nhấn Ctrl+C để dừng.", flush=True)
        if "--no-open" not in sys.argv:
            webbrowser.open(url)
        srv.serve_forever()


if __name__ == "__main__":
    main()
