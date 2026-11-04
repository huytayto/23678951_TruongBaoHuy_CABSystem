# Demo 20 phút — API nghiệp vụ

Trước lượt chấm mới: đặt `SMOKE_MODE=true`, `SEED_DEMO_PASSWORD=` trong `.env`, chạy `docker compose up --build -d`, rồi `npm.cmd run demo:reset`. Reset tự sao lưu, dọn dữ liệu dư và đưa mã mẫu về c1–c5, d1–d10, b1–b5.

Import **collection.json + environment.json**, chọn Environment **CAB - Demo 20 phút**, Send từ bước 06 theo thứ tự. Có 23 request chính qua URL `/api/...`; scripts tự gọi bước phụ qua Gateway. Environment chỉ có base_url, không cần sửa token/ID/body. Xem [bảng gõ tay](../TYPING.md) và [dữ liệu mẫu](../DATA.md).

Seed: ad/adminpassword, kh0–kh4/customerpassword, tx1–tx10/driverpassword. Bước 09 tạo kh5, bước 21 tạo tx11; giữ mật khẩu theo vai trò. Họ tên An, địa chỉ seed HN; bằng lái L1–L11, biển số P1–P11.

Input ngắn: `user/pass`, `license/plate`, `lat/lng`, `from_lat/from_lng`, `to_lat/to_lng`, `trip`. Response giữ tên đầy đủ. Trạng thái nhập `start → done` vẫn phải đúng thứ tự; status cuối trả COMPLETED.

Ngay sau reset: customer mới c6, driver mới d11, booking mới b6. Bước 10 tạo/hủy b6–b10 nên bước 15 dùng b11/t1; bước 18 tạo b12/t2 để hủy với lý do Ban. Bước 19 dùng payment p1, key pay1; bước 20 nhận xét Tot. OTP: response.code và điện thoại 0901234567 chỉ dùng local.

| STT | Request | Giây |
|---|---|---:|
| 6 | 06 - API health check | 25 |
| 9 | 09 - Đăng ký tài khoản khách hàng | 25 |
| 10 | 10 - Đăng nhập khách hàng | 30 |
| 11 | 11 - Lấy thông tin khách hàng với mã số | 15 |
| 12 | 12 - Lấy thông tin tài xế với mã số | 15 |
| 13 | 13 - Liệt kê danh sách tài xế tại khu vực | 25 |
| 14 | 14 - Liệt kê danh sách các booking của Customer | 25 |
| 15 | 15 - Đặt xe | 30 |
| 16 | 16 - Tài xế nhận chuyến | 35 |
| 17 | 17 - Cập nhật trạng thái chuyến | 25 |
| 18 | 18 - Hủy chuyến | 30 |
| 19 | 19 - Thanh toán online | 40 |
| 20 | 20 - Đánh giá chuyến đi | 20 |
| 21 | 21 - Đăng ký tài xế | 40 |
| 22 | 22 - Duyệt hồ sơ tài xế | 25 |
| 23 | 23 - Bật/tắt trạng thái nhận chuyến | 20 |
| 24 | 24 - Data encryption at rest | 40 |
| 25 | 25 - SQL injection attempt | 20 |
| 26 | 26 - XSS input test | 25 |
| 27 | 27 - JWT tampering | 20 |
| 28 | 28 - Unauthorized API access | 20 |
| 29 | 29 - Rate limit attack | 40 |
| 30 | 30 - Replay attack (idempotency) | 30 |

**620s Postman + 210s ngoài Postman = 830s; dự phòng 370s trong 20 phút.** Đây là ngân sách thao tác, phụ thuộc tốc độ giải thích và kiểm tra.

**19:** request online trả PENDING; scripts gọi callback local `/api/payments/{id}/callback` bằng token Admin và kiểm tra COMPLETED/PAID. **24:** chạy `npm.cmd run demo:at-rest` để xem bằng chứng DB; GET profile không chứng minh mã hóa at rest. **29:** header `Limit: 1` dùng ngưỡng local 20/10s, không chứng minh tải 1000/s.

**30:** gửi lại đúng body và key pay1 của bước 19; response gốc PENDING giữ nguyên dù payment đã COMPLETED. Chỉ lặp riêng bước 29/30. Muốn chạy lại toàn luồng phải `npm.cmd run demo:reset`, rồi bắt đầu bước 06; kh5/tx11 và pay1 không được dùng lại cho một giao dịch khác trước reset. Tắt chế độ demo bằng SMOKE_MODE=false rồi tạo lại stack.
