# Dữ liệu mẫu và vị trí lưu

Bộ gõ tay cập nhật ngày 02/11/2026. Xem body JSON và thứ tự thao tác tại [TYPING.md](TYPING.md).

## Tài khoản và hồ sơ có sẵn sau reset

| Username | Vai trò | Mật khẩu smoke | uid (khóa chính) |
|---|---|---|---|
| ad | ADMIN | adminpassword | a1 |
| kh0 | CUSTOMER | customerpassword | c1 |
| kh1 | CUSTOMER | customerpassword | c2 |
| kh2 | CUSTOMER | customerpassword | c3 |
| kh3 | CUSTOMER | customerpassword | c4 |
| kh4 | CUSTOMER | customerpassword | c5 |
| tx1 | DRIVER | driverpassword | d1 |
| tx2 | DRIVER | driverpassword | d2 |
| tx3 | DRIVER | driverpassword | d3 |
| tx4 | DRIVER | driverpassword | d4 |
| tx5 | DRIVER | driverpassword | d5 |
| tx6 | DRIVER | driverpassword | d6 |
| tx7 | DRIVER | driverpassword | d7 |
| tx8 | DRIVER | driverpassword | d8 |
| tx9 | DRIVER | driverpassword | d9 |
| tx10 | DRIVER | driverpassword | d10 |

Admin cấu hình trong `.env` vẫn được giữ riêng, dùng `ADMIN_USERNAME` và `ADMIN_PASSWORD`. Với cấu hình hiện tại username là `admin`; không chép mật khẩu admin cấu hình vào tài liệu. Tổng cộng sau reset có 17 tài khoản, 5 customer, 10 driver, 5 booking; trip/rating/payment/notification đều trống.

Customer c1 có họ tên `An`, địa chỉ `HN`. Họ tên/địa chỉ được mã hóa AES-GCM trong database. Customer không có GPS riêng trong hồ sơ; điểm đón nằm trên booking.

| Driver | Trạng thái duyệt | Nhận chuyến | Vĩ độ | Kinh độ | Bằng lái | Biển số |
|---|---|---|---:|---:|---|---|
| d1 / tx1 | ACTIVE | AVAILABLE | 22.0005 | 111.0003 | L1 | P1 |
| d2 / tx2 | ACTIVE | AVAILABLE | 22.001 | 110.999 | L2 | P2 |
| d3 / tx3 | PENDING_APPROVAL | OFFLINE | 21.998 | 111.0015 | L3 | P3 |
| d4 / tx4 | REJECTED | OFFLINE | 22.003 | 111.002 | L4 | P4 |
| d5 / tx5 | ACTIVE | OFFLINE | 21.996 | 110.997 | L5 | P5 |
| d6 / tx6 | ACTIVE | OFFLINE | 22.020 | 111.020 | L6 | P6 |
| d7 / tx7 | ACTIVE | OFFLINE | 22.025 | 111.025 | L7 | P7 |
| d8 / tx8 | PENDING_APPROVAL | OFFLINE | 22.030 | 111.030 | L8 | P8 |
| d9 / tx9 | REJECTED | OFFLINE | 22.035 | 111.035 | L9 | P9 |
| d10 / tx10 | ACTIVE | OFFLINE | 22.040 | 111.040 | L10 | P10 |

Chỉ d1–d5 nằm trong bán kính 1 km quanh `(22,111)`; d6–d10 ở ngoài vùng này.

Các driver dùng loại xe `CAB_4_SEAT`, `phone_verified=true`. Bằng lái/biển số lưu mã hóa. Danh sách lân cận dành cho Admin đọc vị trí cuối trong PostgreSQL và trả cả 5 tài xế kèm trạng thái. Redis Geo chỉ chứa d1/d2 khi bắt đầu để ghép chuyến đúng người ACTIVE/AVAILABLE.

Booking b1–b5 thuộc c1, điểm đón `(22,111)`, điểm đến `(22.01,111.01)`, trạng thái `CANCELED`, lý do seed `Seed for pagination`. booking_id chính là b1–b5; không có cột code hay UUID nghiệp vụ.

## Dữ liệu được tạo khi chạy Collection

| Bước | Dữ liệu ngắn | Nơi lưu |
|---|---|---|
| 06 | Đăng nhập ad/tx1, lưu token | Token trong Postman Collection variables |
| 09 | Tạo kh5, mật khẩu customerpassword, fullname An; mã c6 | `cab_auth.users`, `cab_customer.customers` |
| 10 | Tạo/hủy b6–b10 cho c6 để phân trang, lý do Mau | `cab_booking.bookings` |
| 13 | Xem 5 tài xế quanh `(22,111)`, bán kính 1km, limit 5; scripts kiểm tra limit 2, page 1/2 | Vị trí cuối và trạng thái trong `cab_driver.drivers`; lọc khoảng cách bằng SQL |
| 15–17 | b11 → t1, driver d1; `start → done`; vị trí `(22.01,111.01)` | `cab_booking.bookings`, `cab_trip.trips` |
| 18 | b12 → t2, hủy với lý do Ban | Booking/trip và thông báo |
| 19 | Payment p1 cho t1; header `Idempotency-Key: pay1`; callback SUCCESS | `cab_payment.payments`; trip PAID |
| 20 | 5 sao, nhận xét Tot | `cab_trip.ratings` |
| 21 | Tài khoản tx11/driverpassword; điện thoại 0901234567, OTP: response.code; bằng lái L11, biển số P11; mã d11 | `cab_auth.users`, `cab_driver.drivers`; OTP tạm trong Redis |
| 22–23 | Duyệt d11, bật nhận chuyến tại `(22.02,111)` rồi tắt | Driver DB và Redis Geo |
| 24 | Kiểm tra mã hóa trực tiếp từ DB bằng `npm.cmd run demo:at-rest` | Các DB auth/customer/driver |
| 25 | User SQL injection `' OR 1=1 --`, mật khẩu anything | Payload kiểm thử, không tạo tài khoản |
| 26 | Fullname `<script>alert('hack')</script>` | Profile c6; response escape HTML |
| 27–28 | JWT sai chữ ký; token customer gọi driver API | Payload kiểm thử, phải bị từ chối |
| 29 | Tọa độ sai `(999,999)`, header demo; nhận 429 khi vượt ngưỡng | Bộ đếm Redis, không tạo booking |
| 30 | Gửi lại payment với `{"trip":"t1"}` và key pay1 | Dùng lại payment/response gốc |

Các ID trên đúng khi bắt đầu sau `demo:reset` và đi theo Collection. Nếu thao tác thêm hoặc đổi thứ tự, lấy đúng trường uid, booking_id, trip_id hoặc payment_id trong response. Kh1/tx11 và key pay1 không tự bỏ qua lỗi trùng; cần reset trước lượt mới.

## Nơi sửa cấu hình mẫu

| Nội dung | Source |
|---|---|
| Tài khoản, mật khẩu theo vai trò, tọa độ gốc, trạng thái driver | `services/smoke-fixtures.js` |
| Họ tên/địa chỉ, bằng lái/biển số, công thức vị trí, booking seed | Nhánh `smoke_seed` trong `services/domain-service.js` |
| Alias tên trường và trạng thái nhập vào | `shared/request-input.js` |
| URL ngắn về handler nghiệp vụ | `shared/api-paths.js` |
| Body, scripts, username kh5/tx11, key pay1 trong Collection | `scripts/build-demo20.js` |
| Dọn dữ liệu và đưa mã mẫu về c1–c5/d1–d10/b1–b5 | `scripts/reset-demo.js` |
| Admin cấu hình, khóa mã hóa/JWT/webhook, cờ smoke | `.env`, inject qua `docker-compose.yml` |

Tọa độ driver = vĩ độ gốc + `i * 0.001`, kinh độ giữ nguyên. Tọa độ booking seed trong SQL và tọa độ Collection được khai báo riêng; khi đổi vùng demo phải cập nhật đồng bộ. Sau khi sửa generator, chạy `npm.cmd run demo:build` rồi import lại Collection.

Alias input: `user/pass`, `license/plate`, `lat/lng`, `from_lat/from_lng`, `to_lat/to_lng`, `trip`. Tên trường dài vẫn dùng được. Không gửi hai tên với giá trị mâu thuẫn. Response giữ tên đầy đủ và trạng thái chuẩn. JWT, phân quyền, kiểm tra sở hữu, thứ tự trạng thái và idempotency vẫn được kiểm tra.

## Nơi dữ liệu tồn tại thực tế

| Thành phần | Nơi lưu |
|---|---|
| User / password bcrypt | `cab_auth.users` |
| Hồ sơ customer | `cab_customer.customers` |
| Hồ sơ driver | `cab_driver.drivers` |
| Booking | `cab_booking.bookings` |
| Chuyến / đánh giá | `cab_trip.trips`, `cab_trip.ratings` |
| Thanh toán | `cab_payment.payments` |
| Thông báo | `cab_notification.notification_logs`, JSONB payload |
| PostgreSQL trên Docker | Volume `30_postgres_data` → `/var/lib/postgresql/data` |
| Redis | Volume `30_redis_data` → `/data`; Geo key `cab:drivers:available`, OTP/offer/lock/rate limit/JWT revocation |
| Kafka | Volume `30_kafka_data` → `/var/lib/kafka/data`; các topic `cab.booking.events`, `cab.driver.events`, `cab.trip.events`, `cab.payment.events` |
| Postman Environment | `postman/smoke-20p/environment.json`, chỉ có base_url |
| Token / ID runtime | Postman Collection → Variables; không lưu token thật trong JSON source |
| Backup trước mỗi reset | `postman/reports/demo-reset-<thời gian>/` gồm postgres.sql, redis.rdb, notification-offsets.txt; được Git bỏ qua |

`demo:reset` sao lưu trước khi xóa, giữ admin cấu hình và 16 tài khoản smoke, đưa ID mẫu về c1–c5/d1–d10/b1–b5 và đưa các sequence về đầu lượt demo. Đây là reset dữ liệu trình bày, ID đã xóa có thể được cấp lại. Đăng nhập và chạy lại Collection từ bước 06 sau reset. Kafka vẫn giữ lịch sử; consumer bỏ qua sự kiện cũ chưa xử lý để không tạo lại thông báo đã dọn.

`demo:prepare` nạp lại fixture/trạng thái smoke nhưng không dọn toàn bộ dữ liệu dư. Khởi động Gateway chỉ tạo fixture còn thiếu, giữ nguyên các bản ghi đang có. Auth cấp cN/dN bằng sequence chung với tài khoản; booking/trip/payment/rating lần lượt dùng bN/tN/pN/rN. Không có bước tra code thành UUID.

Database UUID cũ được chuyển bằng `npm.cmd run demo:migrate-ids`, có backup tại `postman/reports/short-ids-<thời gian>/`. Thao tác migration giữ bản ghi và quan hệ, khác với reset. Token cũ có UUID không còn hợp lệ; cần login lại. OTP code, event_id/challenge_id/lock token là dữ liệu kỹ thuật, không phải cột code hay UUID của customer/driver/booking/trip/payment.

Phí cố định mặc định 50000; offer smoke 600 giây; OTP 300 giây và cooldown 30 giây; giới hạn demo 20 request/10 giây. Mục 29 hiện minh họa 429 ở ngưỡng demo, không chứng minh tải 1000 request/giây.
