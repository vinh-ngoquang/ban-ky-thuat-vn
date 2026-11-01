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
| `src/` | Mã giao diện: `core.js`, `chart.js`, `picks.js` (bước 1 và 3), `app.js` (bước 2), `app.css` |
| `build_page.py` | Ghép giao diện thành `site/index.html` |
| `serve.py` | Máy chủ cục bộ, chỉ nhận kết nối từ chính máy này |
| `research*.py` | Các nghiên cứu dẫn tới thiết kế, chỉ in kết quả |

## Đưa thay đổi lên trang công khai

- **Chỉ đổi giao diện** (`src/`, `build_page.py`, `make_public.py`): `git push` là đủ. GitHub tự dựng lại trong 1 đến 2 phút, dùng lại dữ liệu đang có và không gọi FinLens.
- **Đổi công thức, ngưỡng hoặc dữ liệu cho trang** (`engine.py`, `export.py`): sau khi `git push`, chạy `gh workflow run update.yml`. Lần này phải tải và tính lại, khoảng 25 phút lúc 18:00, hơn 1 giờ nếu chạy buổi sáng. Nếu không chạy tay, thay đổi sẽ có ở lần 18:00 kế tiếp.
- **Giao diện cần thêm dữ liệu mới:** đổi cả `src/` và `export.py` thì vẫn phải chạy đầy đủ như trên. Thêm `[skip ci]` vào nội dung commit để đường nhanh không đăng giao diện mới với dữ liệu cũ.

## Đổi quy tắc

Ngưỡng và tham số nằm ở đầu `engine.py`: `MIN_ADV`, `COST`, `STOP_ATR`, `TARGET_R`, `MAX_HOLD`, `SETUPS`.
Sau khi đổi, chạy `export.py` rồi `build_page.py`. Mọi số kiểm chứng trên trang sẽ tính lại theo tham số mới.

Tiêu chí của Thông lấy ngưỡng từ `THONG_*` trong `engine.py`: đỉnh ngắn hạn, độ lệch RSI, vùng chạm EMA, khoảng cách tới kháng cự và số phiên giảm so khối lượng.

Không có khóa API trong tệp nào ở đây. Khóa chỉ được đọc từ biến môi trường khi chạy.
