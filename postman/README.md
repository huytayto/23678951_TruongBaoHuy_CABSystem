# Kiểm thử CAB

**Bảo vệ thuần gõ tay, không dùng biến Environment/Collection hay scripts:** [TYPING-30.md](TYPING-30.md). URL đầy đủ, từng tiêu chí có bước login và chỉ rõ copy token của tài khoản nào vào từng request. Bảng tính cả số URL/lần Send cho các lượt đăng nhập.

Danh mục tài khoản, tọa độ, booking mẫu và nơi lưu: [DATA.md](DATA.md).

Bảng username/mã và JSON ngắn để gõ tay: [TYPING.md](TYPING.md). Sau mỗi lượt demo, chạy `npm.cmd run demo:reset` trước khi dùng lại kh5, tx11 và key pay1.

Collection dùng URL ngắn qua Gateway; các script phụ cũng dùng URL ngắn. Token, phân quyền và nghiệp vụ dùng chung handler với API gốc.

| Thao tác | URL sau `http://localhost:8080` |
|---|---|
| Đăng ký / đăng nhập | `/api/register`, `/api/login` |
| OTP | `/api/otp/request`, `/api/otp/verify` |
| Hồ sơ customer / driver | `/api/customers/{id}`, `/api/drivers/{id}` |
| 5 tài xế lân cận, nhiều trạng thái | `/api/drivers/nearby?lat=22&lng=111&radius=1km&limit=5&page=1` |
| Hồ sơ chờ duyệt / duyệt | `/api/drivers/pending`, `/api/drivers/{id}/approve` |
| Đặt xe / nhận chuyến | `/api/bookings`, `/api/bookings/{id}/accept` |
| Trạng thái chuyến | `/api/trips/{id}/status` |
| Thanh toán / callback mô phỏng | `/api/payments/online`, `/api/payments/{id}/callback` |
| Thông báo | `/api/notifications/me` |
| Health / readiness / services | `/api/health`, `/api/ready`, `/api/services` |

HTTP method và body giữ như trong collection. Dùng ID thật chữ thường c1/d1/b1/t1/p1 trong URL và body; response trả uid/booking_id/trip_id/payment_id, không có code. Sau migration, import lại Collection và login lại vì token chứa UUID cũ bị từ chối. Các URL `/api/v1/...` vẫn được hỗ trợ.

Bộ đang sử dụng: [smoke-20p/README.md](smoke-20p/README.md). Import [collection.json](smoke-20p/collection.json) và [environment.json](smoke-20p/environment.json), chọn Environment rồi Send lần lượt 23 request chính qua API nghiệp vụ.

Các lệnh hiện tại:

- `npm.cmd run demo:build`: sinh lại collection, environment và hướng dẫn từ `scripts/build-demo20.js`.
- `npm.cmd run demo:prepare`: nạp lại fixture smoke; không xóa dữ liệu dư hay đưa bộ đếm mã về đầu.
- `npm.cmd run demo:reset`: sao lưu PostgreSQL/Redis rồi xóa dữ liệu dư, giữ admin cấu hình và bộ smoke. Tạm dừng app và khởi động lại; cần `SMOKE_MODE=true`, `SEED_DEMO_PASSWORD=`. Dùng `npm.cmd run demo:reset -- --check` để chỉ xem dữ liệu hiện có, không xóa.
- `npm.cmd run demo:check`: kiểm tra luồng collection trên backend đang chạy; có tạo dữ liệu.
- `npm.cmd run demo:at-rest`: kiểm tra mã hóa dữ liệu trong database.
- `npm.cmd run smoke`: kiểm tra tích hợp backend độc lập với collection.
- `npm.cmd run sync:api-docs`: đồng bộ OpenAPI JSON từ YAML.

Ngân sách Collection dự kiến 13 phút 50 giây, dự phòng 6 phút 10 giây sau khi rút còn hai trạng thái chuyến đi. Chi tiết điều kiện và giới hạn xem hướng dẫn smoke-20p.

Các collection/environment cũ, [MANUAL.md](MANUAL.md) và [RUBRIC.md](RUBRIC.md) được giữ làm tài liệu tham khảo. Script sinh bộ cũ, chuẩn bị environment, helper bằng chứng và runner cũ đã được xóa; các bước phụ thuộc chúng không còn dùng được.
