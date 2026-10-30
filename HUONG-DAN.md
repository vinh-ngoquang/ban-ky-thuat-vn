# Bàn Kỹ Thuật VN

Dashboard phân tích kỹ thuật cổ phiếu Việt Nam, dùng dữ liệu `eod.stock.ohlcv` của FinLens.

## Dùng hằng ngày

- `cap-nhat-va-mo.bat`: tải dữ liệu mới, tính lại mọi thứ rồi mở trang tại http://localhost:8765. Chạy sau khi hết phiên.
- `mo-dashboard.bat`: mở trang với dữ liệu hiện có, không tải thêm.

Cần có biến môi trường `FINLENS_API_KEY` và môi trường Python tại `%USERPROFILE%\.venv-finlens` có gói `finlens`.
Khi di chuyển thư mục này, hãy di chuyển cả thư mục `cache`, nếu không lần chạy sau sẽ tải lại từ đầu.

## Các tệp

| Tệp | Việc làm |
|---|---|
| `fetch_data.py` | Tải đủ lịch sử của mọi cổ phiếu |
| `update.py` | Cập nhật gia tăng rồi tính lại |
| `engine.py` | Chỉ báo, tín hiệu, Điểm Bền, mô phỏng lệnh |
| `export.py` | Ghi số liệu cho trang vào `site/data` |
| `src/` | Mã giao diện: `core.js`, `chart.js`, `app.js`, `app.css` |
| `build_page.py` | Ghép giao diện thành `site/index.html` |
| `serve.py` | Máy chủ cục bộ, chỉ nhận kết nối từ chính máy này |
| `research*.py` | Các nghiên cứu dẫn tới thiết kế, chỉ in kết quả |

## Đổi quy tắc

Ngưỡng và tham số nằm ở đầu `engine.py`: `MIN_ADV`, `COST`, `STOP_ATR`, `TARGET_R`, `MAX_HOLD`, `SETUPS`.
Sau khi đổi, chạy `export.py` rồi `build_page.py`. Mọi số kiểm chứng trên trang sẽ tính lại theo tham số mới.

Tab "Phân tích của Thông" lấy ngưỡng từ `THONG_*` trong `engine.py`. Độ dài đoạn và biên nền đổi được ngay trên trang. Số kiểm chứng trên tab luôn dùng giá trị mặc định trong `engine.py`.

Không có khóa API trong tệp nào ở đây. Khóa chỉ được đọc từ biến môi trường khi chạy.
