# Bàn Kỹ Thuật VN

Dashboard phân tích kỹ thuật cổ phiếu Việt Nam theo 3 bước: tìm mã, xem từng mã và dựng giỏ, kèm kiểm chứng lịch sử.

Trang được GitHub Actions dựng lại lúc 18:00 giờ Việt Nam, từ thứ Hai đến thứ Sáu, dùng dữ liệu `eod.stock.ohlcv` của FinLens.

Đây là công cụ phân tích chung dựa trên quy tắc, không phải tư vấn đầu tư. Hiệu quả trong quá khứ không bảo đảm kết quả tương lai.

Xem [HUONG-DAN.md](HUONG-DAN.md) để chạy trên máy và đổi quy tắc.

## Cấu hình kho

- Secret `FINLENS_API_KEY`: khóa API FinLens, không bao giờ ghi vào mã nguồn.
- Settings, Pages, Source: chọn GitHub Actions.
