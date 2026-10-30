# Chấm tay bằng URL ngắn

Backend dùng các công nghệ hiện có: Node.js/Express, gRPC, PostgreSQL, Redis, Kafka. Không thêm thư viện hoặc service để cung cấp URL/mã ngắn. UUID được giữ làm khóa nội bộ; PostgreSQL sequence cấp mã `C…`, `D…`, `B…`, `T…`, `P…` có unique index.

## Chuẩn bị một lần

```powershell
docker compose -f docker-compose.yml -f postman/docker-compose.manual.yml up --build -d
npm.cmd run manual:prepare
```

Import **`postman/CAB.manual.local.postman_environment.json`** vào Postman, chọn Environment **CAB — Chấm tay (local)**. Không cần bật helper cổng 8099 để thực hiện nghiệp vụ bằng tay. Chạy `manual:prepare` không để lại tiến trình nền.

Mở **[MANUAL.local.md](MANUAL.local.md)** để biết chính xác mã các tài khoản đang có. Setup tạo hoặc dùng lại `khach1`, `taixe1`…`taixe5` với mật khẩu demo mặc định **`CabDemo@2026!`**; có thể đổi bằng biến `MANUAL_DEMO_PASSWORD` trước khi tạo lần đầu. Không reset mật khẩu hay xóa dữ liệu có sẵn. Nếu trùng username nhưng khác mật khẩu, setup dừng. Chạy lại giữ nguyên kết quả duyệt đã thao tác, không reset hồ sơ đã duyệt về pending. Tài xế BUSY phải được hoàn tất/hủy chuyến trước.

- 2 tài xế sẵn sàng gần `10.77,106.70`; 1 chờ duyệt; 1 bị từ chối; 1 đã duyệt nhưng offline.
- Customer có ít nhất 5 booking mẫu để kiểm tra phân trang. Booking mẫu đã hủy; tạo booking mới để thực hiện luồng nhận chuyến.
- Environment chứa sẵn token admin/customer/5 driver. Token hết hạn sau một giờ; đăng nhập lại hoặc chạy lại prepare để lấy token mới.
- `booking_code`, `trip_code`, `payment_code` để trống. Sau khi tạo bản ghi, lấy trường **`code`** trong response rồi nhập trực tiếp vào URL hoặc lưu biến tương ứng.
- Với DB đã có dữ liệu, mã mới có thể là `C50`, `D39`, `B57`… thay vì `C1`, `D1`, `B1`. Không reset DB chỉ để ép số về 1; không dùng mã ví dụ để đoán tài khoản của mình.

## Quy ước khi nhập request

Base URL: **`http://localhost:8080`**. Gõ URL này vào browser sẽ thấy danh sách route gợi ý; các thao tác tạo/sửa dùng Postman với đúng HTTP method.

Trong tab **Authorization → Bearer Token**, nhập một trong:

| Người thao tác | Token |
|---|---|
| Admin | `{{admin_token}}` |
| Customer khach1 | `{{customer_token}}` |
| Tài xế taixe1 | `{{driver1_token}}` |
| Tài xế taixe2…5 | `{{driver2_token}}`…`{{driver5_token}}` |

Chọn **Body → raw → JSON** cho POST/PATCH có body. Không đưa token/password lên query string. Không đổi thao tác ghi thành GET. Các URL `/api/v1/...` và UUID cũ vẫn dùng được, với cùng kiểm tra JWT/RBAC/ownership.

Các mã `C1/D1/B1/T1/P1` dưới đây là ví dụ: thay bằng mã `code` thật trong response hoặc dùng biến trong Environment.

## Health, đăng ký và đăng nhập [6,9,10]

Không cần token:

```text
GET  http://localhost:8080/health
GET  http://localhost:8080/ready
GET  http://localhost:8080/health/services
POST http://localhost:8080/auth/register
```

```json
{"username":"khach2","password":"CabDemo@2026!","role":"CUSTOMER"}
```

```text
POST http://localhost:8080/auth/login
```

```json
{"username":"khach1","password":"CabDemo@2026!"}
```

Đăng ký trả 201; đăng nhập trả 200 và token. Đổi username khi demo đăng ký lại. Nhập username admin và mật khẩu trong `.env` để đăng nhập admin; không tự đăng ký ADMIN qua public API.

## Xem hồ sơ, nearby và phân trang [11–14]

```text
GET http://localhost:8080/customers/me                         (Customer)
GET http://localhost:8080/customers/C1                         (chính chủ hoặc Admin)
GET http://localhost:8080/drivers/me                           (Driver)
GET http://localhost:8080/drivers/D1                           (chính chủ hoặc Admin)
GET http://localhost:8080/drivers/nearby?lat=10.77&lng=106.70&radius=1km&limit=1&page=1  (Admin)
GET http://localhost:8080/drivers/nearby?lat=10.77&lng=106.70&radius=1km&limit=1&page=2  (Admin)
GET http://localhost:8080/bookings?limit=2&page=1                (Customer)
GET http://localhost:8080/bookings?limit=2&page=2                (Customer)
```

Kiểm tra đúng mã chủ hồ sơ, số lượng giới hạn và hai trang không lặp. Nearby không trả tài xế pending/rejected/offline. Tọa độ demo cố định chỉ phục vụ dữ liệu local; nếu đã có tài xế khác tại đúng điểm đón, kiểm tra mã `offered_driver_uid`/inbox để biết ai được offer.

## OTP, đăng ký và duyệt tài xế [21–23]

Để kiểm tra đăng ký mới, tạo tài khoản role DRIVER và đăng nhập bằng username mới như `taixe6`. Dùng token tài xế đó:

```text
POST http://localhost:8080/auth/otp/request
```

```json
{"phone":"0901234567"}
```

```text
GET  http://localhost:8080/auth/otp
POST http://localhost:8080/auth/otp/verify
```

```json
{"code":"123456"}
```

Thay `123456` bằng OTP ngẫu nhiên vừa đọc. **Không cần gõ challenge UUID**: verify dùng challenge hiện tại của đúng tài khoản. Mã sai bị chặn, hết hạn sau 5 phút, dùng một lần; gửi lại OTP có cooldown 30 giây. `/auth/otp` là hộp thư SMS mô phỏng của chính driver, chỉ bật khi `OTP_TEST_MODE=true`, không phải OTP cố định/bypass xác thực.

```text
POST http://localhost:8080/drivers/register                    (Driver mới)
```

```json
{"license_number":"BL-006","plate_number":"51A-006"}
```

Nhận `code` của hồ sơ, trạng thái PENDING_APPROVAL. Dùng Admin:

```text
GET   http://localhost:8080/admin/drivers
GET   http://localhost:8080/drivers/D1
PATCH http://localhost:8080/admin/drivers/D1/approve
```

```json
{"approve":true}
```

Đổi thành `false` để từ chối **một hồ sơ còn pending**. Dùng Driver gọi `GET /notifications/me` để xem kết quả. Kafka bất đồng bộ nên có thể cần bấm Send lại sau khoảng một giây.

```text
PATCH http://localhost:8080/drivers/availability               (Driver đã duyệt)
```

```json
{"online":true,"latitude":10.77,"longitude":106.70}
```

Tắt bằng `{"online":false}`. Driver BUSY không được tự chuyển AVAILABLE.

## Đặt xe → nhận chuyến → hoàn thành [15–17]

Customer:

```text
POST http://localhost:8080/bookings
```

```json
{"pickup_lat":10.77,"pickup_lng":106.70,"dropoff_lat":10.78,"dropoff_lng":106.71}
```

Đọc `booking.code`, ví dụ B1. Trong chế độ manual, response có `offer_expires_in:300`: có **5 phút** để nhập lệnh nhận chuyến; cấu hình mặc định ngoài chế độ manual vẫn là 15 giây. Nếu hết hạn, xem offer của tài xế tiếp theo hoặc hủy booking và tạo mới; không bỏ kiểm tra hạn offer.

Driver đang được offer:

```text
GET  http://localhost:8080/drivers/offers
GET  http://localhost:8080/notifications/me
POST http://localhost:8080/bookings/B1/accept
```

Accept không cần body; đọc `trip.code`, ví dụ T1. Sai driver trả 409. Customer lấy chuyến và tài xế qua:

```text
GET http://localhost:8080/bookings/B1/trip
GET http://localhost:8080/trips/T1
```

Driver dùng **cùng URL** sau, chỉ đổi trường status và bấm Send lần lượt:

```text
PATCH http://localhost:8080/trips/T1/status
```

```json
{"status":"EN_ROUTE"}
```

Tiếp tục với `ARRIVED`, `PICKED_UP`, `IN_PROGRESS`, `COMPLETED`. Gửi COMPLETED ngay từ đầu phải bị chặn. Khi đang IN_PROGRESS, kiểm tra vị trí:

```text
PATCH http://localhost:8080/trips/T1/location                   (Driver)
```

```json
{"latitude":10.775,"longitude":106.705}
```

Customer gọi lại `GET /trips/T1` để kiểm tra vị trí lưu bền.

## Thanh toán và replay [19,30]

Customer, sau khi trip COMPLETED:

```text
POST http://localhost:8080/payments/online
Header: Idempotency-Key: pay-1
```

```json
{"trip_id":"T1"}
```

Đọc `payment.code`, ví dụ P1. Gửi lại **cùng request và key** phải nhận đúng response cũ, không payment mới. Với chuyến khác dùng key khác như `pay-2`; key là chuỗi tự đặt, không bắt buộc UUID.

Dùng Admin để mô phỏng provider callback, không cần tính HMAC bằng tay:

```text
POST http://localhost:8080/demo/payments/P1/callback
```

```json
{"status":"SUCCESS"}
```

Payment chuyển COMPLETED; `GET /payments/P1` và `GET /trips/T1` bằng Customer cho thấy PAID/liên kết payment. Callback mô phỏng **chỉ bật trong manual override bằng PAYMENT_TEST_MODE=true, chỉ Admin gọi được**; vẫn tạo chữ ký và gọi cùng handler webhook. Customer gọi simulator phải nhận 403. Đây là giao dịch local, không chuyển tiền thật.

Endpoint webhook gốc vẫn kiểm tra HMAC bắt buộc:

```text
POST http://localhost:8080/payments/webhook
```

```json
{"order_id":"P1","status":"SUCCESS","signature":"invalid"}
```

Phải trả 401. Chữ ký thật được tính trên `order_id:status` đúng chuỗi trong request. Gửi replay online với key `pay-1` sau settlement vẫn nhận snapshot gốc PENDING như response đầu tiên; trạng thái hiện tại xem bằng GET payment, không suy từ snapshot replay.

## Rating và hủy [18,20,26]

Customer, trip COMPLETED:

```text
POST http://localhost:8080/trips/T1/rating
```

```json
{"stars":5,"comment":"<script>alert('hack')</script>"}
```

Trả 201, đúng trip và comment đã escape; gửi lại trả 409.

Tạo booking/trip **mới** để hủy, dùng một trong:

```text
POST http://localhost:8080/bookings/B2/cancel                   (khi còn tìm tài xế)
POST http://localhost:8080/trips/T2/cancel                      (khi chuyến chưa hoàn tất)
```

```json
{"reason":"Doi lich trinh"}
```

Đọc lại `GET /bookings/B2` hoặc `GET /trips/T2` để thấy CANCELED. Với hủy trip, cả Driver và Customer xem `GET /notifications/me` bằng token tương ứng.

## Các phép thử bảo mật và bằng chứng ngoài API [24–29]

| Mục | Thao tác |
|---|---|
| 24 | API trả dữ liệu đã giải mã nên không thể dùng GET profile để chứng minh encryption at rest. Chạy `docker compose exec -T customer-service node services/verify-encryption.js customer` và tương tự driver; xem trực tiếp bảng auth để kiểm tra bcrypt hash. Giữ key trong `.env`/injected env, không nhập key vào URL. |
| 25 | `POST /auth/login`, JSON `{"username":"' OR 1=1 --","password":"anything"}` → 401, không token. Payload email theo phiếu cũng phải 400/401. |
| 26 | Rating/profile với script như trên → output escape. |
| 27 | Sửa payload `sub` và `role` trong token, giữ signature cũ rồi `GET /admin/drivers` → 401. Không dùng token Admin thật để thử JWT tampering. |
| 28 | Token Customer gọi `GET /drivers/D1` hoặc `GET /drivers/nearby?...` → 403; bỏ token → 401. |
| 29 | Một lần bấm Send không tạo được >1000 request/giây. Dùng phép thử tải đã có trong Collection/helper hoặc công cụ tải với `POST /bookings`; giữ ngưỡng 1000, cần chứng minh có 429 và readiness phục hồi. Không thay việc đo tải bằng một endpoint giả trả 429. |

Các tiêu chí mô tả/Git/Compose/Kafka dùng [RUBRIC.md](RUBRIC.md). Để hồi quy tự động: `npm.cmd run test:manual` (sau prepare, tạo một chuyến thử) và `npm.cmd run test:postman`. Khi kết thúc manual demo, trở về cấu hình mặc định bằng `docker compose up -d auth-service payment-service booking-service`; dữ liệu được giữ lại.
