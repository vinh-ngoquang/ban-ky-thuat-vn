# Bàn Kỹ Thuật VN: tài liệu tổng hợp

Tài liệu này mô tả toàn bộ dashboard: dữ liệu, công thức, chỉ số, tín hiệu, cách kiểm chứng và từng màn hình.

- Trang công khai: https://vinh-ngoquang.github.io/ban-ky-thuat-vn/
- Mã nguồn: https://github.com/vinh-ngoquang/ban-ky-thuat-vn
- Mọi kết quả kiểm chứng và số thị trường ở đây là **ảnh chụp ngày 30/10/2026**. Trang tự tính lại sau mỗi lần cập nhật nên số trên trang có thể khác. Công thức và ngưỡng thì giữ nguyên trừ khi mã nguồn thay đổi.
- Đây là công cụ phân tích chung dựa trên quy tắc, không phải tư vấn đầu tư. Hiệu quả trong quá khứ không bảo đảm kết quả tương lai.

## Mục lục

1. [Kết luận chính](#1-kết-luận-chính)
2. [Dữ liệu](#2-dữ-liệu)
3. [Chỉ báo cơ bản](#3-chỉ-báo-cơ-bản)
4. [Chỉ số thị trường](#4-chỉ-số-thị-trường)
5. [Xu hướng và sức mạnh tương đối](#5-xu-hướng-và-sức-mạnh-tương-đối)
6. [Điểm Bền](#6-điểm-bền)
7. [Tín hiệu](#7-tín-hiệu)
8. [Cách kiểm chứng](#8-cách-kiểm-chứng)
9. [Kết quả kiểm chứng](#9-kết-quả-kiểm-chứng)
10. [Công cụ rủi ro và kế hoạch lệnh](#10-công-cụ-rủi-ro-và-kế-hoạch-lệnh)
11. [Phân tích của Thông](#11-phân-tích-của-thông)
12. [Mã tiềm năng](#12-mã-tiềm-năng)
13. [Từng màn hình](#13-từng-màn-hình)
14. [Cập nhật tự động](#14-cập-nhật-tự-động)
15. [Giới hạn cần biết](#15-giới-hạn-cần-biết)

## 1. Kết luận chính

- **Tín hiệu kỹ thuật kinh điển gần như không có lợi thế** trong 3 năm dữ liệu sau khi trừ phí. Trong các tín hiệu đơn lẻ, chỉ "Dẫn dắt gần đỉnh" đạt nhãn "Có bằng chứng", và mức này vẫn mỏng.
- **Kết hợp nhiều phương pháp cho kết quả tốt nhất:** Mã tiềm năng hạng A đạt +0,14R, vượt ngẫu nhiên +0,30R, nhưng vẫn thua khoảng một nửa số lệnh và được ghép sau khi đã biết từng phần có ích.
- **Yếu tố ổn định nhất là biến động:** mã biến động cao thua thị trường rõ rệt ở cả hai giai đoạn kiểm tra. Điểm Bền được xây trên phát hiện này.
- **Rủi ro dự báo được tốt hơn lợi nhuận:** dải giá theo ATR và xác suất chạm cắt lỗ giữ được độ chính xác trên giai đoạn kiểm tra độc lập.
- **Thị trường đang hẹp:** một năm qua VNINDEX +3,3% trong khi cổ phiếu thanh khoản điển hình giảm khoảng 17%.
- **Bộ lọc của Thông** chưa tách được khỏi vào lệnh ngẫu nhiên khi mua ngay lúc mẫu xuất hiện. Hiện phù hợp để tạo danh sách theo dõi hơn là tín hiệu mua.

## 2. Dữ liệu

| Mục | Giá trị |
|---|---|
| Nguồn giá | FinLens `eod.stock.ohlcv` |
| Tên và ngành | FinLens `meta.symbols` |
| Số mã | 1.626 mã yêu cầu, 1.620 mã có dữ liệu trên trang |
| Lịch sử | 743 phiên, từ 06/11/2023 đến 30/10/2026 |
| Giá điều chỉnh | Dùng cho mọi chỉ báo và kiểm chứng |
| Giá khớp thật | Dùng cho thanh khoản, giá hiển thị, trần sàn và đặt lệnh |
| Đơn vị giá | Nghìn đồng |

5 mã bị lỗi khi tải: CTC, DVV, GE2, KSS, LUT. Nhiều mã lấy trong một lần gọi, tối đa 25 mã và 4 luồng song song.

### Làm sạch dữ liệu

- Bỏ phiên có dưới 100 mã có giá, vì đó không phải phiên giao dịch thật.
- Phiên không có giá hoặc giá bằng 0: dùng giá đóng cửa gần nhất.
- Sửa hệ số điều chỉnh lệch: nếu lợi suất điều chỉnh vượt `biên độ sàn + 2%` trong khi lợi suất khớp thật không vượt, nhân phần lịch sử trước đó với một hệ số để hai lợi suất khớp nhau. Hiện đã sửa **11 phiên**. Ví dụ VCK ngày 09/03/2026: giá điều chỉnh −41,9% nhưng giá thật chỉ −7%.

### Ngưỡng thanh khoản

```text
Giá trị giao dịch (tỷ đồng) = giá khớp thật (nghìn đồng) × khối lượng / 1.000.000
GTGD TB 20 phiên            = trung bình 20 phiên, cần tối thiểu 10 phiên
Mã thanh khoản              = GTGD TB 20 phiên ≥ 3 tỷ đồng
```

Hiện có 203 mã đạt ngưỡng. Chỉ các mã này được tính vào chỉ số thị trường, RS, Điểm Bền và kiểm chứng. Điều kiện này xét **tại từng thời điểm**, không dùng thanh khoản hiện tại để nhìn ngược về quá khứ.

## 3. Chỉ báo cơ bản

Mỗi giá trị tại phiên `t` chỉ dùng dữ liệu đến hết phiên `t`.

| Chỉ báo | Công thức |
|---|---|
| MA20, MA50, MA200 | Trung bình đơn giản của giá đóng cửa |
| EMA n | `span = n`, `α = 2/(n+1)`, cần tối thiểu n phiên |
| RSI 14 | `100 − 100/(1 + TB tăng/TB giảm)`, làm mượt Wilder với `α = 1/14` |
| MACD | `EMA12 − EMA26`, đường tín hiệu là EMA9 của MACD, histogram là hiệu hai đường |
| True Range | `max(cao − thấp, |cao − đóng cửa trước|, |thấp − đóng cửa trước|)` |
| ATR 14 | Làm mượt Wilder của True Range |
| ATR% | `ATR / giá đóng cửa` |
| Bollinger | `MA20 ± 2 × độ lệch chuẩn 20 phiên` |
| Độ rộng Bollinger | `4 × độ lệch chuẩn 20 phiên / MA20` |
| Hạng độ rộng | Thứ hạng phần trăm của độ rộng trong 120 phiên, cần tối thiểu 60 phiên |
| Tỷ lệ khối lượng | `khối lượng hôm nay / TB 20 phiên trước đó` |
| Đỉnh, đáy 20 phiên | Cao nhất, thấp nhất của 20 phiên trước, không tính hôm nay |
| Đỉnh, đáy 52 tuần | Cao nhất, thấp nhất của 252 phiên, cần tối thiểu 120 phiên |
| Cách MA20 theo ATR | `(giá − MA20) / ATR` |

### Khung tuần và các khung phụ

- Khung tuần được gộp từ nến ngày trên trình duyệt, các chỉ báo tính lại trên nến tuần.
- Các khung phụ có thể bật: khối lượng, RSI, MACD, RS. Hiển thị tối đa 3 khung phụ cùng lúc.
- Đường RS trên biểu đồ: `giá mã / chỉ số điển hình`, quy về 100 ở đầu chuỗi.
- Khối lượng theo giá: 120 phiên gần nhất ở khung ngày, 40 nến ở khung tuần, chia 26 mức giá.

### Màu nến

| Màu | Ý nghĩa |
|---|---|
| Xanh lá | Đóng cửa trên giá mở cửa |
| Đỏ | Đóng cửa dưới giá mở cửa |
| Vàng | Đóng cửa bằng giá mở cửa |
| Tím | Đóng cửa ở giá trần, tức lợi suất thật đạt `biên độ − 0,8%` đến `biên độ + 2%` và đóng cửa ở giá cao nhất phiên |
| Xanh lơ | Đóng cửa ở giá sàn, quy tắc ngược lại |

## 4. Chỉ số thị trường

### Chỉ số điển hình

Chỉ số tự tính từ giá từng mã, không dùng VNINDEX, để phản ánh cổ phiếu thanh khoản điển hình.

```text
Trọng số mã   = GTGD TB 20 phiên của phiên trước, chỉ gồm mã thanh khoản phiên trước
Lợi suất ngày = trung bình gia quyền của lợi suất từng mã, cắt ở ±15%
Chỉ số        = tích lũy lợi suất ngày, bắt đầu từ 100
```

Đối chiếu riêng cho thấy tương quan lợi suất ngày với VNINDEX là 0,92. Trang không dùng dữ liệu VNINDEX.

### Các thẻ chỉ số

| Thẻ | Cách tính | 30/10/2026 |
|---|---|---|
| Trạng thái thị trường | Xem bên dưới | Suy yếu |
| Trên MA50 | % mã thanh khoản có giá trên MA50 | 29% |
| Trên MA200 | % mã thanh khoản có giá trên MA200 | 28% |
| Tăng / giảm | Số mã thanh khoản tăng và giảm trong phiên | 25 / 159 |
| Đỉnh / đáy 52 tuần | Số mã thanh khoản chạm đỉnh, đáy mới | 1 / 7 |
| Giá trị giao dịch | Tổng giá trị của mọi mã trong phiên | 13.027 tỷ |
| Chỉ số điển hình | Như trên | 122,39, MA50 127,14, MA200 134,93 |
| Thay đổi một năm | So với 250 phiên trước | −17,1% |

### Trạng thái thị trường

```text
Lan tỏa : chỉ số > MA50 của chỉ số VÀ tỷ lệ mã trên MA50 ≥ 55%
Suy yếu : chỉ số < MA200 của chỉ số HOẶC tỷ lệ mã trên MA50 < 35%
Trung tính: còn lại, hoặc chưa đủ dữ liệu MA200
```

Khi hai điều kiện cùng đúng, Suy yếu được ưu tiên. Tiêu đề "suy yếu và rất hẹp" xuất hiện khi trạng thái Suy yếu và dưới 35% mã trên MA200.

Trạng thái này **mô tả hiện tại, không phải tín hiệu thời điểm**:

| Trạng thái | Số phiên | TB 20 phiên sau | Tỷ lệ dương |
|---|---:|---:|---:|
| Lan tỏa | 135 | +2,6% | 59% |
| Trung tính | 310 | 0,0% | 56% |
| Suy yếu | 298 | +0,8% | 54% |

## 5. Xu hướng và sức mạnh tương đối

### Xu hướng

| Nhãn | Điều kiện |
|---|---|
| Tăng mạnh | Giá > MA50, MA50 > MA200, MA200 cao hơn 20 phiên trước |
| Tăng | Giá > MA200 và MA50 > MA200, chưa đạt Tăng mạnh |
| Giảm | Giá < MA50 và MA50 < MA200 |
| Đi ngang | Các trường hợp còn lại |
| Chưa đủ lịch sử | Chưa có MA200 |

### Sức mạnh tương đối (RS)

```text
Hiệu suất = 0,4 × lợi suất 63 phiên + 0,3 × lợi suất 126 phiên + 0,3 × lợi suất 252 phiên
RS        = thứ hạng phần trăm của hiệu suất trong nhóm mã thanh khoản × 99
```

Khi thiếu lịch sử 252 hoặc 126 phiên, công thức dùng kỳ ngắn hơn thay thế. RS vẫn hiển thị để tham khảo, nhưng kiểm tra cho thấy gần như không dự báo được lợi suất sau đó.

## 6. Điểm Bền

```text
Độ ổn định     = (1 − thứ hạng ATR%) × 100
Vị thế đỉnh    = thứ hạng của (giá / đỉnh 52 tuần − 1) × 100
Điểm Bền       = 0,6 × Độ ổn định + 0,4 × Vị thế đỉnh
```

Thứ hạng chỉ tính trong nhóm mã thanh khoản tại cùng phiên. Mã dưới 3 tỷ/phiên không có điểm.

### Vì sao chọn hai yếu tố này

Đã kiểm 13 yếu tố bằng tương quan thứ hạng với lợi suất vượt thị trường, lấy mẫu mỗi 10 phiên:

| Yếu tố | 20 phiên | t | 60 phiên | t |
|---|---:|---:|---:|---:|
| ATR% (biến động) | −0,116 | −4,1 | −0,165 | −3,4 |
| Cách đỉnh 52 tuần | +0,046 | +1,4 | +0,082 | +1,6 |
| RS | −0,029 | −0,9 | −0,037 | −0,7 |
| RSI | +0,008 | +0,3 | +0,010 | +0,2 |

Điểm tổng hợp ban đầu theo xu hướng, RS, đà giá và khối lượng không phân loại được nên đã bị loại. ATR% vượt qua hiệu chỉnh kiểm định bội, còn vị thế so với đỉnh thì chưa.

### Năm nhóm Điểm Bền

Mỗi 10 phiên, chia mã thanh khoản thành 5 nhóm đều nhau, nhóm 5 có điểm cao nhất. Giá vào là giá mở cửa phiên sau.

| Nhóm | Có lãi T+20 | Vượt TT 20 phiên | Vượt TT 60 phiên | Giai đoạn trước | 250 phiên cuối |
|---|---:|---:|---:|---:|---:|
| 1 | 42% | −1,4% | −4,1% | −1,1% | −1,8% |
| 2 | 43% | −1,0% | −3,6% | −1,3% | −0,5% |
| 3 | 45% | −0,3% | −0,9% | −0,5% | −0,1% |
| 4 | 47% | −0,3% | −1,5% | −0,7% | +0,5% |
| 5 | 51% | +0,6% | +0,6% | −0,2% | +1,8% |

Hai cột cuối là lợi suất vượt thị trường sau 20 phiên.

### Danh mục kiểm chứng

- Giữ 20% mã có Điểm Bền cao nhất, đồng tỷ trọng, đổi danh mục mỗi 20 phiên.
- Trừ phí 0,4% trên phần danh mục thay đổi. Vòng quay trung bình 34% mỗi kỳ.
- So với toàn bộ mã thanh khoản đồng tỷ trọng, 27 kỳ từ 12/09/2024.

| | Lợi suất | Sụt giảm tối đa |
|---|---:|---:|
| Danh mục Điểm Bền | +29,5% | −9,9% |
| Toàn thị trường | +0,4% | −20,5% |

Kết quả này có thể lạc quan vì yếu tố được chọn sau khi xem dữ liệu.

## 7. Tín hiệu

Mọi tín hiệu yêu cầu mã thanh khoản và có giao dịch trong phiên. Cùng tín hiệu trên cùng mã phải cách nhau hơn 10 phiên.

| Tín hiệu | Điều kiện |
|---|---|
| Bứt phá nền | Đóng cửa vượt đỉnh 20 phiên, khối lượng từ 1,5 lần TB, trên MA50, hạng độ rộng phiên trước ≤ 40%, đóng cửa ở 40% trên của biên phiên |
| Kéo về xu hướng | Xu hướng Tăng mạnh, giá thấp nhất chạm MA20 hoặc MA50 (sai số 1%), đóng cửa trên MA50 và trên giá mở cửa, RSI 38–58, RS ≥ 50 |
| Dẫn dắt gần đỉnh | RS ≥ 90, giá ≥ 95% đỉnh 52 tuần, xu hướng Tăng mạnh |
| Siết biên độ | Hạng độ rộng ≤ 10%, giá trên MA50, xu hướng không phải Giảm hoặc thiếu lịch sử |
| Giao cắt vàng | MA50 cắt lên MA200 |
| Bật từ quá bán | RSI vượt lại 30 từ dưới lên, phiên đóng cửa tăng |
| Gãy xu hướng | Đóng cửa thủng MA50, phiên trước còn trên MA50, khối lượng từ 1,3 lần TB |
| Giao cắt tử thần | MA50 cắt xuống MA200 |
| Mẫu Thông | Xem [mục 11](#11-phân-tích-của-thông) |
| Mã tiềm năng hạng A, B | Xem [mục 12](#12-mã-tiềm-năng) |

### Nhãn đánh giá

| Nhãn | Điều kiện |
|---|---|
| Có bằng chứng | Vượt ngẫu nhiên có ý nghĩa, kỳ vọng ≥ +0,05R, và kỳ vọng 250 phiên cuối ≥ −0,1R |
| Đỡ hơn ngẫu nhiên | Vượt ngẫu nhiên có ý nghĩa nhưng chưa đạt hai điều kiện còn lại |
| Kém ngẫu nhiên | Khoảng tin cậy của độ vượt nằm hẳn dưới 0 |
| Thua lỗ rõ | Không khác ngẫu nhiên, nhưng khoảng tin cậy của kỳ vọng nằm hẳn dưới 0 |
| Không hơn ngẫu nhiên | Các trường hợp còn lại |
| Chưa đủ mẫu | Dưới 30 lệnh hoặc dưới 6 tháng để so sánh |

## 8. Cách kiểm chứng

Mỗi tín hiệu được mô phỏng thành một lệnh mua theo luật thị trường Việt Nam:

| Quy tắc | Giá trị |
|---|---|
| Thời điểm tín hiệu | Giá đóng cửa phiên `t` |
| Giá vào | Giá mở cửa phiên `t+1` |
| Không mua được | Bỏ lệnh nếu giá mở cửa cách trần dưới 0,5% |
| Giá đứng im | Bỏ lệnh nếu khoảng cắt lỗ dưới 1% giá vào, vì R gần 0 làm méo thống kê |
| Cắt lỗ | Giá vào − 2 ATR |
| Mục tiêu | Giá vào + 2R, tức cách giá vào 4 ATR |
| Giữ tối đa | 20 phiên |
| Bán sớm nhất | Phiên `t+3`, tương ứng T+2 sau phiên mua |
| Phí và thuế | 0,4% khứ hồi |

Thứ tự xử lý trong mỗi phiên: mở cửa dưới cắt lỗ, chạm cắt lỗ, mở cửa trên mục tiêu, chạm mục tiêu. Khi cả hai cùng chạm trong phiên, lệnh được tính là cắt lỗ. Lệnh chưa kết thúc không được đưa vào thống kê.

```text
R        = (ATR × 2) / giá vào, tính theo tỷ lệ
Kết quả  = (giá thoát / giá vào − 1 − 0,4%) / R
Kỳ vọng  = trung bình kết quả của mọi lệnh
```

### Mốc so sánh và khoảng tin cậy

- **Mốc ngẫu nhiên:** mọi mã thanh khoản, cứ 10 phiên vào một lần, theo đúng quy tắc trên. Mốc này cần thiết vì thị trường giảm làm ngay cả lệnh ngẫu nhiên cũng lỗ.
- **Khoảng tin cậy 90%:** lấy mẫu lại 800 lần theo tháng, vì các tín hiệu cùng tháng tương quan với nhau.
- **Độ vượt ngẫu nhiên:** tín hiệu và mốc được lấy mẫu trên cùng các tháng.
- **Tách giai đoạn:** 250 phiên cuối được báo cáo riêng so với phần trước.
- **Giữ dài:** Mẫu Thông được thử thêm với 3 ATR, 3R, 60 phiên.

## 9. Kết quả kiểm chứng

Quy tắc giữ ngắn, mốc ngẫu nhiên: **−0,14R**, thắng 36%, 13.585 lệnh.

| Tín hiệu | Lệnh | Thắng | Kỳ vọng | Khoảng 90% | Vượt ngẫu nhiên | Trước | 250p cuối | Điểm ≥ 60 | Đánh giá |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| Mã tiềm năng hạng A | 299 | 47% | +0,14R | −0,03 … +0,33 | +0,30R | +0,19R | +0,08R | +0,14R | Có bằng chứng |
| Dẫn dắt gần đỉnh | 614 | 42% | +0,07R | −0,08 … +0,22 | +0,21R | +0,11R | 0,00R | +0,21R | Có bằng chứng |
| Mã tiềm năng hạng A và B | 1.429 | 41% | +0,01R | −0,14 … +0,16 | +0,15R | +0,05R | −0,09R | +0,01R | Đỡ hơn ngẫu nhiên |
| Giao cắt vàng | 446 | 41% | +0,01R | −0,18 … +0,18 | +0,15R | +0,14R | −0,32R | +0,12R | Đỡ hơn ngẫu nhiên |
| Bật từ quá bán | 1.494 | 45% | 0,00R | −0,14 … +0,14 | +0,07R | +0,08R | −0,13R | −0,12R | Không hơn ngẫu nhiên |
| Giao cắt tử thần | 483 | 45% | −0,01R | −0,15 … +0,14 | +0,13R | +0,06R | −0,08R | +0,08R | Không hơn ngẫu nhiên |
| Siết biên độ | 1.469 | 38% | −0,07R | −0,28 … +0,16 | +0,07R | 0,00R | −0,21R | −0,09R | Không hơn ngẫu nhiên |
| Mẫu Thông, 4 tiêu chí | 583 | 38% | −0,07R | −0,28 … +0,15 | +0,07R | −0,03R | −0,19R | −0,04R | Không hơn ngẫu nhiên |
| Kéo về xu hướng | 1.937 | 38% | −0,10R | −0,24 … +0,05 | +0,04R | −0,05R | −0,17R | +0,01R | Không hơn ngẫu nhiên |
| Mẫu Thông, đủ 5 tiêu chí | 277 | 37% | −0,12R | −0,35 … +0,11 | +0,02R | −0,07R | −0,25R | −0,10R | Không hơn ngẫu nhiên |
| Gãy xu hướng | 1.325 | 36% | −0,13R | −0,28 … +0,03 | −0,02R | −0,15R | −0,10R | −0,12R | Không hơn ngẫu nhiên |
| Bứt phá nền | 1.246 | 28% | −0,30R | −0,48 … −0,11 | −0,10R | −0,27R | −0,37R | −0,25R | Thua lỗ rõ |

Cách đọc:

- Khoảng 90% là khoảng tin cậy của kỳ vọng, đơn vị R.
- "Gãy xu hướng" và "Giao cắt tử thần" là tín hiệu rủi ro nhưng được đo bằng lệnh mua. Kết quả cho thấy mua sau các tín hiệu này không xấu hơn rõ rệt so với ngẫu nhiên, tức chúng không dự báo được đà giảm tiếp.
- "Dẫn dắt gần đỉnh" ở mã có Điểm Bền từ 60 là nhóm mạnh nhất: 235 lệnh, thắng 50%, +0,21R.

## 10. Công cụ rủi ro và kế hoạch lệnh

### Dải giá có thể đi tới

```text
Giá dự kiến = giá hiện tại × (1 + z × ATR% × căn(số phiên))
```

Hệ số `z` lấy từ phân vị thực tế của toàn thị trường, lấy mẫu mỗi 10 phiên.

| Số phiên | z phân vị 10 | z phân vị 90 | Độ phủ kiểm tra độc lập |
|---:|---:|---:|---:|
| 5 | −0,77 | +0,83 | 78% |
| 10 | −0,76 | +0,82 | 82% |
| 20 | −0,78 | +0,88 | 82% |

Dải được thiết kế phủ 80%. Độ phủ đo trên 250 phiên cuối, dùng ngưỡng hiệu chuẩn từ giai đoạn trước.

### Xác suất chạm cắt lỗ trong 20 phiên

| Cắt lỗ cách | Toàn giai đoạn | 250 phiên cuối |
|---:|---:|---:|
| 1,5 ATR | 58% | 61% |
| 2 ATR | 47% | 49% |
| 2,5 ATR | 37% | 40% |
| 3 ATR | 30% | 31% |
| 4 ATR | 18% | 19% |

Bảng kế hoạch nội suy tuyến tính giữa các mức này. Xác suất là trung bình toàn thị trường, không riêng từng mã.

### Bảng tính lệnh

Đầu vào gồm vốn, phần trăm rủi ro, giá vào, khoảng cắt lỗ theo ATR và mục tiêu theo R.

```text
Cắt lỗ      = giá vào − k × ATR, làm tròn xuống theo bước giá
Rủi ro/cp   = giá vào − cắt lỗ
Mục tiêu    = giá vào + R × rủi ro/cp, làm tròn lên theo bước giá
Theo rủi ro = (vốn × % rủi ro) / (rủi ro/cp + giá vào × 0,4%), làm tròn xuống lô 100
Theo vốn    = vốn / giá vào, làm tròn xuống lô 100
Khối lượng  = số nhỏ hơn trong hai số trên
```

Phí được tính vào khối lượng để lỗ khi chạm cắt lỗ không vượt mức rủi ro đã đặt. Ví dụ VPB: vốn 500 triệu, rủi ro 1%, giá 22,95, ATR 0,59 cho cắt lỗ 21,75, mục tiêu 25,35, khối lượng 3.800 cổ phiếu, lỗ khoảng 4,9 triệu.

### Quy tắc thị trường

| Sàn | Biên độ | Bước giá |
|---|---:|---|
| HOSE | ±7% | 0,01 dưới 10, 0,05 từ 10 đến dưới 50, 0,1 từ 50 |
| HNX | ±10% | 0,1 |
| UPCOM | ±15% | 0,1 |

Giá trần làm tròn xuống, giá sàn làm tròn lên theo bước giá. Ngày bán sớm nhất là phiên mua cộng 2 ngày làm việc, chưa trừ ngày nghỉ lễ. Lô giao dịch mặc định 100 cổ phiếu.

### Cảnh báo tự động

| Cảnh báo | Điều kiện |
|---|---|
| Không đủ một lô | Khối lượng dưới 100 cổ phiếu |
| Bị giới hạn bởi vốn | Khối lượng theo vốn nhỏ hơn theo rủi ro |
| Khó khớp lệnh | Lệnh lớn hơn 10% GTGD TB 20 phiên |
| Thanh khoản mỏng | GTGD TB 20 phiên dưới 3 tỷ |
| Cắt lỗ hẹp | Xác suất chạm từ 50% trở lên |
| Cần hơn một phiên | Cắt lỗ thấp hơn giá sàn phiên tới |
| Kháng cự chắn đường | Kháng cự gần nhất nằm giữa giá vào và mục tiêu |

### Hỗ trợ và kháng cự

- Tìm đỉnh, đáy cục bộ trong 250 phiên, mỗi điểm so với 4 phiên mỗi bên.
- Gộp các điểm cách nhau không quá 0,75 ATR thành một mức, giá mức là trung bình cụm.
- Mức trên giá hiện tại là kháng cự, mức dưới là hỗ trợ. Lấy tối đa 4 mức mỗi bên.
- Số lần chạm càng nhiều, đường trên biểu đồ càng đậm.

## 11. Phân tích của Thông

Tab chấm toàn bộ mã theo 5 tiêu chí, kể cả mã thanh khoản thấp. Điểm đạt là số tiêu chí đúng trên 5.

| # | Tiêu chí | Quy tắc mã hóa | Số mã đạt |
|---:|---|---|---:|
| 1 | EMA xếp tầng | Giá > EMA10 > EMA20 > EMA50 > EMA150 > EMA200 | 106 |
| 2 | RSI | RSI 14 > 50 | 606 |
| 3 | EMA chưa giãn | `|EMA50/EMA150 − 1| < 20%` và `|EMA50/EMA200 − 1| < 20%` | 1.474 |
| 4 | Nền tích lũy | Bốn điều kiện bên dưới | 179 |
| 5 | POC tăng dần | POC1 < POC2 < POC3 | 153 |

Tiêu chí 1 hiển thị thêm "cắt lên" nếu EMA10 vừa cắt EMA20 trong 10 phiên gần nhất.

### Tiêu chí 4: nền tích lũy

Mặc định xét 30 phiên gần nhất. Phải đạt đủ:

1. **Biên hẹp:** `đỉnh nền / đáy nền − 1 ≤ 20%`.
2. **Biên co lại:** biên 10 phiên cuối không quá 60% biên cả nền.
3. **Khối lượng cạn:** khối lượng TB 10 phiên thấp hơn TB của cả nền.
4. **Yếu ở hỗ trợ:** TB khối lượng các phiên đóng cửa ở 1/3 dưới của nền thấp hơn các phiên ở 1/3 trên. Điều kiện được bỏ qua nếu một trong hai nhóm có dưới 3 phiên.

### Tiêu chí 5: POC tăng dần

- Chia dữ liệu thành 3 đoạn cố định liền nhau, mỗi đoạn dài bằng độ dài nền, tính ngược từ phiên cuối.
- Mỗi đoạn chia thành 24 mức giá từ đáy đến đỉnh đoạn. Khối lượng từng phiên được chia đều trên dải cao–thấp của phiên đó.
- POC là giá giữa của mức có khối lượng lớn nhất.

Giá dùng ở đây là giá điều chỉnh, khối lượng là số cổ phiếu thật.

### Chỉnh trên trang

- Độ dài đoạn: 20, 30 hoặc 40 phiên.
- Biên nền tối đa, mặc định 20%.
- Số tiêu chí tối thiểu, sàn, ngành, GTGD, tìm kiếm.
- Bấm thẻ tiêu chí để bắt buộc phải đạt.

### Kết quả hiện tại và kiểm chứng

Ngày 30/10/2026 với mặc định: **4 mã đạt đủ** là FRT, MCP, SGB, FT1, trong đó chỉ FRT đủ thanh khoản 3 tỷ/phiên. Có 46 mã đạt 4 tiêu chí.

Kiểm chứng dùng độ dài 30 phiên, biên nền 20%, mã thanh khoản:

| Mẫu | Giữ ngắn (2 ATR, 2R, 20 phiên) | Giữ dài (3 ATR, 3R, 60 phiên) |
|---|---|---|
| Đủ 5 tiêu chí | 277 lệnh, thắng 37%, −0,12R, lãi TB −0,5% | 267 lệnh, thắng 28%, −0,16R, lãi TB −1,3% |
| 4 tiêu chí đầu | 583 lệnh, thắng 38%, −0,07R, lãi TB −0,2% | 562 lệnh, thắng 28%, −0,12R, lãi TB −0,9% |
| Ngẫu nhiên | 13.585 lệnh, thắng 36%, −0,14R, lãi TB −0,9% | 13.155 lệnh, thắng 31%, −0,11R, lãi TB −1,2% |

Bài kiểm chứng mua ngay khi mẫu xuất hiện. Phương pháp Wyckoff thường chờ giá vượt khỏi nền kèm khối lượng, cách vào lệnh đó chưa được kiểm chứng. Đây là diễn giải bằng quy tắc, không thay được việc đọc biểu đồ.

## 12. Mã tiềm năng

Tab kết hợp Điểm Bền, tín hiệu đã kiểm chứng và 5 tiêu chí của Thông. Quy tắc được đặt trước khi xem kết quả và không chỉnh theo số kiểm chứng.

### Cổng bắt buộc

Mã phải đạt đủ:

- GTGD TB 20 phiên từ 3 tỷ đồng.
- Điểm Bền từ 60.
- Xu hướng Tăng hoặc Tăng mạnh.
- Giá cách MA20 không quá 4 ATR.

### Điểm kết hợp

```text
Điểm kết hợp = 0,5 × Điểm Bền + 6 × số tiêu chí Thông đạt + thưởng tín hiệu
Thưởng       = 20 nếu có Dẫn dắt gần đỉnh, 10 nếu có Kéo về hoặc Giao cắt vàng, 0 nếu không có
```

Tín hiệu còn hiệu lực trong 3 phiên, nếu có nhiều tín hiệu thì lấy mức cao nhất. Tiêu chí Thông dùng mặc định 30 phiên, biên nền 20%, không phụ thuộc phần chỉnh trên tab Thông. Điểm tối đa là 100.

| Hạng | Điểm kết hợp |
|---|---:|
| A | Từ 75 |
| B | Từ 60 đến dưới 75 |
| Theo dõi | Dưới 60 |

Cột Tới kháng cự có dấu kiểm khi kháng cự gần nhất xa hơn mục tiêu 2R, tức xa hơn 2 lần khoảng cắt lỗ 2 ATR. Cột này chỉ để tham khảo, không tính vào điểm.

### Kết quả hiện tại

Ngày 30/10/2026: **chưa có mã hạng A**, 6 mã hạng B là NTP, ABB, VTZ, MSB, BAF, OCB, và 17 mã Theo dõi.

### Kiểm chứng

| Mẫu | Giữ ngắn (2 ATR, 2R, 20 phiên) | Giữ dài (3 ATR, 3R, 60 phiên) |
|---|---|---|
| Hạng A | 299 lệnh, thắng 47%, +0,14R, lãi TB +0,8% | 282 lệnh, thắng 44%, +0,39R, lãi TB +3,2% |
| Hạng A và B | 1.429 lệnh, thắng 41%, +0,01R, lãi TB +0,1% | 1.392 lệnh, thắng 35%, +0,06R, lãi TB +0,6% |
| Ngẫu nhiên | 13.585 lệnh, thắng 36%, −0,14R, lãi TB −0,9% | 13.155 lệnh, thắng 31%, −0,11R, lãi TB −1,2% |

Chi tiết hạng A:

- Vượt ngẫu nhiên +0,30R, khoảng 90% từ +0,18 đến +0,42.
- Khoảng tin cậy của riêng kỳ vọng là −0,03 đến +0,33, tức vẫn chạm 0.
- Giai đoạn trước +0,19R, 250 phiên cuối +0,08R.
- Theo trạng thái thị trường: Lan tỏa +0,55R (75 lệnh), Suy yếu +0,21R (157 lệnh), Trung tính −0,47R (67 lệnh).

Danh mục 10 mã điểm cao nhất, đổi mỗi 20 phiên, đạt +26,2% với sụt giảm tối đa −14,1%. Danh mục nhóm Điểm Bền đạt +29,5% với sụt giảm −9,9%, nên ở cấp danh mục, phần kết hợp chưa cho thấy vượt trội.

Quy tắc được ghép sau khi đã biết từng phần có ích, nên kết quả có thể lạc quan. Danh sách cũng chưa xét báo cáo tài chính hay tin tức.

## 13. Từng màn hình

### Hôm nay

- Câu kết luận và 6 thẻ sức khỏe thị trường.
- Biểu đồ chỉ số điển hình với MA50, MA200 và nền trạng thái; biểu đồ tỷ lệ mã trên MA50, MA200. Có khoảng 6 tháng, 1 năm, 3 năm.
- Bảng "Tín hiệu nào từng có ích?".
- Ba danh sách, xét tín hiệu trong 3 phiên gần nhất:
  - **Bền và có tín hiệu tốt:** điểm ≥ 60, có Dẫn dắt, Kéo về hoặc Giao cắt vàng.
  - **Dễ thành bẫy:** Bứt phá, hoặc Siết biên độ với điểm dưới 40.
  - **Đang gãy xu hướng:** Gãy xu hướng hoặc Giao cắt tử thần.
- Ngành: nhóm mã thanh khoản theo ICB cấp 2, từ 3 mã trở lên, xếp theo Điểm Bền trung vị.

### Sàng lọc

| Góc nhìn | Điều kiện |
|---|---|
| Bền nhất | Điểm ≥ 80 |
| Tín hiệu ở mã bền | Điểm ≥ 60 và có Dẫn dắt, Kéo về hoặc Vàng |
| Gần đỉnh và ổn định | Cách đỉnh dưới 5%, ATR% dưới 2,5% |
| Bứt phá và siết biên | Có Bứt phá hoặc Siết biên độ |
| Gãy xu hướng | Có Gãy xu hướng hoặc Giao cắt tử thần |
| Biến động cao | Nhóm 1 của Điểm Bền |
| Tất cả | Chỉ dùng bộ lọc |

Bộ lọc gồm sàn, ngành, xu hướng, GTGD (mặc định từ 3 tỷ), Điểm Bền và tìm kiếm. Bảng hiện tối đa 300 mã, sắp xếp được, có sao chép CSV. Phím `↑ ↓` chọn dòng, `Enter` mở mã.

### Phân tích mã

- Giá, giá trần và sàn, câu kết luận bằng lời.
- Biểu đồ: MA, EMA, Bollinger, hỗ trợ và kháng cự, kế hoạch, tín hiệu, khối lượng theo giá, POC. Khung ngày hoặc tuần.
- **Đọc nhanh:** Điểm Bền, nhóm, lịch sử điểm 260 phiên, xu hướng, biến động, thanh khoản, đà giá, tín hiệu gần nhất.
- Bảng kế hoạch, dải giá, mức giá quan trọng, lịch sử tín hiệu của mã, so sánh cùng ngành, bảng giá 15 phiên.

Nhãn thanh khoản: từ 10 tỷ là Dễ giao dịch, từ 3 tỷ là Vừa phải, dưới 3 tỷ là Rất mỏng.

Thao tác biểu đồ: kéo để cuộn, lăn chuột để phóng to, nhấp đúp để đặt lại. Phím `[` `]` chuyển mã trước, mã sau trong danh sách đang xem. Phím `/` mở ô tìm kiếm.

### Phân tích của Thông

Chấm toàn bộ mã theo 5 tiêu chí, xem [mục 11](#11-phân-tích-của-thông).

### Mã tiềm năng

Bảng mã qua cổng bắt buộc, lọc theo hạng, ngành, GTGD, kèm kiểm chứng và danh mục thử nghiệm. Xem [mục 12](#12-mã-tiềm-năng).

## 14. Cập nhật tự động

| Mục | Giá trị |
|---|---|
| Lịch | 18:00 giờ Việt Nam, thứ Hai đến thứ Sáu |
| Nơi chạy | GitHub Actions, không cần bật máy |
| Thời gian | Khoảng 25 phút lúc 18:00. SDK rải đều hạn mức đến nửa đêm, nên chạy càng sớm trong ngày càng lâu: buổi sáng có thể hơn 1 giờ, gần nửa đêm khoảng 6 phút |
| Hạn mức | Khoảng 130 request mỗi lần, trên 2.000 request/ngày |
| Khóa API | GitHub Secret `FINLENS_API_KEY` |

Quy trình: tải đủ dữ liệu, tính toán, dựng trang, kiểm tra, đăng lên GitHub Pages. Khi FinLens lỗi tạm thời, mỗi nhóm mã tự thử lại tối đa 5 lần. Chỉ đổi giao diện thì `git push` tự chạy đường nhanh 1–2 phút, dùng lại dữ liệu đang có trên trang và không gọi FinLens. Lần chạy dừng và giữ trang cũ nếu có dưới 1.000 mã hoặc dữ liệu cũ hơn 7 ngày. Mỗi lần chạy thành công ghi tệp `LAST_UPDATE` để GitHub không tắt lịch sau 60 ngày im lặng.

| Tệp | Vai trò |
|---|---|
| `engine.py` | Chỉ báo, tín hiệu, Điểm Bền, mô phỏng lệnh, tham số |
| `export.py` | Tính báo cáo và ghi dữ liệu cho trang |
| `fetch_data.py`, `update.py` | Tải dữ liệu |
| `src/core.js` | Chỉ báo trên trình duyệt, kế hoạch, nhãn đánh giá |
| `src/chart.js` | Biểu đồ nến |
| `src/app.js`, `src/app.css` | Giao diện |
| `build_page.py`, `make_public.py` | Dựng và kiểm tra trang |
| `.github/workflows/update.yml` | Lịch tự động |
| `research*.py` | Các nghiên cứu dẫn tới thiết kế |

## 15. Giới hạn cần biết

- **Mẫu ngắn:** khoảng 3 năm, chưa đủ nhiều chu kỳ thị trường.
- **Thiên lệch sống sót:** dữ liệu chỉ gồm mã còn niêm yết, nên kết quả có thể đẹp hơn thực tế.
- **Chọn sau khi nhìn:** Điểm Bền được chọn sau khi xem 13 yếu tố. Với nhiều tín hiệu, một vài kết quả đẹp có thể do may mắn.
- **Khớp lệnh lý tưởng:** chưa tính trượt giá, không mô phỏng hàng chờ ở giá sàn. Thực tế có thể khó bán khi cổ phiếu giảm sàn.
- **Dữ liệu FinLens:** chưa đối chiếu với nguồn độc lập, trừ tương quan với VNINDEX.
- **Chưa có:** dữ liệu trong phiên, báo cáo tài chính, tin tức, sự kiện doanh nghiệp, ngày nghỉ lễ trong T+2.
- **Điều khoản dữ liệu:** chưa tìm thấy điều khoản của FinLens về việc công khai lại dữ liệu.
- **Tài khoản FinLens hết hạn 13/12/2026.** Sau ngày đó trang sẽ dừng cập nhật nếu không gia hạn.
