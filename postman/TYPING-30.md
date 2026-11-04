# Bảo vệ bằng gõ tay — đủ 30 tiêu chí, không dùng biến Postman

Đối chiếu `PHIEU_CHAM_PROJECT.pdf`, cập nhật ngày 02/11/2026. Tất cả URL dưới đây được gõ đầy đủ. Không dùng Environment, Collection Variables, Runner hay scripts gửi request phụ. Các tài khoản, mã và token được ghi riêng để không nhầm người thao tác với người có dữ liệu đang xem.

## Chuẩn bị trước giờ chấm

Trong `.env` giữ `SMOKE_MODE=true`, `SEED_DEMO_PASSWORD=` và các khóa/mật khẩu hiện có. Mở terminal tại thư mục `3.0`:

```powershell
docker compose up --build -d
npm.cmd run demo:reset
```

Đợi `Reset complete. Start Postman again from step 06.`. Không chạy thêm `demo:check`, `demo:prepare`, Collection smoke hay API tạo dữ liệu trước khi bắt đầu bảng.

Trong Postman:

1. Chọn **No environment**. Dùng request mới trống; không kế thừa Authorization/scripts từ Collection smoke.
2. Request login/register: **Authorization → No Auth**.
3. Sau login thành công, copy **giá trị trường token trong response**, không copy dấu ngoặc kép.
4. Ở request được bảo vệ: **Authorization → Bearer Token → dán token thật vào ô Token**. Không nhập tên tài khoản vào ô này, không nhập thêm chữ Bearer vì Postman tự thêm vào header.
5. Body có JSON: **Body → raw → JSON**. GET và các hàng ghi “Không body” thì để trống body.
6. Khi một mục dùng hai tài khoản, giữ hai tab login hoặc hai tab ghi chú token có ghi rõ tên tài khoản. Đổi token bằng copy/paste theo từng hàng, không dùng biến hay script tự điền.
7. Không đăng nhập bằng các request có script sẵn của Collection smoke, vì chúng có thể tự tạo booking hoặc thực hiện bước nghiệp vụ khác.

**Mỗi tiêu chí cần xác thực đều ghi lại bước login ngay trong tiêu chí đó.** Vì vậy bạn có thể đọc và làm một mục mà không giả định đang có token sẵn. Khi chấm liên tục và còn tab response login đúng tài khoản, có thể dùng lại token còn hạn để bớt thao tác; không cần logout chỉ để đổi vai trò.

## Tài khoản: người thao tác khác với đối tượng đang xem

| Tài khoản | Mật khẩu | Vai trò | Dữ liệu liên quan |
|---|---|---|---|
| ad | adminpassword | ADMIN mẫu | Xem customer/driver, duyệt d11, callback payment |
| kh0 | customerpassword | CUSTOMER mẫu | Customer c1; có sẵn booking b1–b5 |
| kh5 | customerpassword | CUSTOMER đăng ký ở mục 9 | Customer c6; dùng để chứng minh đăng ký/login và thử XSS |
| tx1 | driverpassword | DRIVER mẫu | Driver d1; tài xế nhận chuyến t1/t2 |
| tx11 | driverpassword | DRIVER đăng ký ở mục 21 | Driver d11; chờ duyệt rồi online/offline |

Ví dụ: ở mục 11, **người gọi API là ad**, **hồ sơ được xem là c1 của kh0**. Mục 12 cũng dùng ad nhưng xem **d1 của tx1**. Không dùng token Admin để giả làm customer đặt xe hoặc driver nhận chuyến.

## ID theo đúng thứ tự của bảng này

| Dữ liệu | Mã |
|---|---|
| Customer mẫu kh0–kh4; customer mới kh5 | c1–c5; c6 |
| Driver mẫu tx1–tx10; driver mới tx11 | d1–d10; d11 |
| Booking lịch sử có sẵn của kh0 | b1–b5, CANCELED |
| Booking/chuyến chính ở mục 15–17 | b6 → t1 |
| Booking/chuyến riêng để hủy ở mục 18 | b7 → t2 |
| Payment cho t1 | p1 |

Kịch bản dùng kh5 để chứng minh đăng ký/login; dùng kh0 có sẵn 5 booking để giảm 10 lượt tạo/hủy dữ liệu phân trang. Vì vậy b6/b7 ở đây khác b11/b12 của Collection tự động. Nếu đã thao tác thêm dữ liệu, lấy uid/booking_id/trip_id/payment_id thực tế từ response; muốn theo đúng mã cố định thì reset trước lượt mới.

## Tổng quan: ai login ở tiêu chí nào, bao nhiêu URL và Send

URL là số địa chỉ khác nhau trong từng mục, tính cả query string. Hai lần login khác tài khoản vẫn chỉ là một URL login nhưng hai lần Send. Không tính câu SQL, lệnh terminal, browser hay retry đọc thông báo vào số Send. Mỗi Send trong bảng này tạo đúng một HTTP request.

| STT | Nội dung | Tài khoản login ngay tại mục này | Người dùng token cho nghiệp vụ | URL | Send tối thiểu |
|---:|---|---|---|---:|---:|
| 1 | Kiến trúc source | Không | Không | 0 | 0 |
| 2 | GitHub/.gitignore/.env | Không | Không | 0 | 0 |
| 3 | Gateway | Không | Không | 0 | 0 |
| 4 | IPC | Không | Không | 0 | 0 |
| 5 | Compose/container | Không | Không | 0 | 0 |
| 6 | Health | Không | No Auth | 3 | 3 |
| 7 | Kafka | Không | Không | 0 | 0 |
| 8 | Qua Gateway | Không | Không | 0 | 0 |
| 9 | Đăng ký customer kh5 | Chưa login | No Auth | 1 | 1 |
| 10 | Đăng nhập customer mới | kh5 | Xem token được cấp cho kh5 | 1 | 1 |
| 11 | Xem customer c1 | ad | ad xem dữ liệu kh0 | 2 | 2 |
| 12 | Xem driver d1 | ad | ad xem dữ liệu tx1 | 2 | 2 |
| 13 | Driver lân cận/paging | ad | ad | 4 | 4 |
| 14 | Booking/paging | kh0 | kh0 xem booking của mình | 4 | 4 |
| 15 | Đặt xe | kh0 | kh0 | 2 | 2 |
| 16 | Nhận chuyến/thông báo | tx1 và kh0 | tx1 nhận; kh0 xem kết quả | 6 | 8 |
| 17 | Trạng thái/vị trí | tx1 | tx1 | 3 | 4 |
| 18 | Hủy/thông báo hai bên | kh0 và tx1 | kh0 hủy; cả hai xem thông báo | 6 | 8 |
| 19 | Payment/callback/PAID | kh0 và ad | kh0 thanh toán; ad callback | 5 | 6 |
| 20 | Đánh giá | kh0 | kh0 | 2 | 2 |
| 21 | Đăng ký driver/OTP | tx11 sau khi đăng ký | tx11 | 5 | 5 |
| 22 | Duyệt/thông báo | ad và tx11 | ad duyệt; tx11 nhận kết quả | 5 | 6 |
| 23 | Online/offline | tx11 | tx11 | 3 | 4 |
| 24 | Mã hóa DB | Không | Terminal/DBeaver | 0 | 0 |
| 25 | SQL injection | Không login hợp lệ | No Auth | 1 | 1 |
| 26 | XSS | ad | ad cập nhật customer c6 | 2 | 2 |
| 27 | JWT tampering | Không | Token giả sai chữ ký | 1 | 1 |
| 28 | Sai quyền | kh0 | kh0 cố ý gọi API driver | 2 | 2 |
| 29 | Rate limit, bấm tay | kh0 | kh0 | 2 | 22 |
| 30 | Replay payment | kh0 | kh0 | 3 | 4 |

Tổng **94 lần Send/94 HTTP request tối thiểu**, gồm **22 lượt login thành công**, nếu login lại đầy đủ ở từng mục và mục 29 đạt 429 sau 21 lần POST trong 10 giây. Retry/polling có thể tăng số này.

Để tiến tới mục tiêu dưới 20 phút: mở sẵn source/Kafka UI/terminal, giữ các tab login có nhãn tài khoản và copy/paste token. Nếu chỉ login lần đầu cho mỗi tài khoản rồi tái dùng token từ tab response, bỏ được 17 lượt login lặp lại, còn **77 lần Send tối thiểu**; vẫn không dùng biến. Bản thuần gõ tay này có nhiều thao tác hơn Collection tự động; ngân sách của Collection có scripts không bảo đảm thời gian gõ tay. Mục 29 cần nói đúng giới hạn tải ở phần riêng bên dưới.

## 01 — Kiến trúc source

**0 URL, 0 Send; không login.** Mở `api-gateway/`, `services/`, `shared/proto/`, `infrastructure/`, `tests/` và Compose.

Trình bày Gateway REST, 7 domain service gRPC (auth/customer/driver/booking/trip/payment/notification), source domain dùng chung nhưng chọn tiến trình bằng SERVICE_CONTEXT. PostgreSQL tách database theo service; Redis cho Geo/lock/OTP/rate limit; Kafka truyền sự kiện.

## 02 — .gitignore và .env trên GitHub

**0 URL API, 0 Send; không login ứng dụng.** Mở repo GitHub của bạn, `.gitignore`, `.env.example` và chạy:

```powershell
git check-ignore .env
git ls-files -- .env
```

Lệnh đầu chỉ ra file bị ignore; lệnh sau không trả `.env`. Kiểm tra lịch sử GitHub riêng; ignore không tự xóa secret từng được commit. Không trình chiếu giá trị secret.

## 03 — Nhiệm vụ Gateway

**0 URL, 0 Send; không login.** Mở `server.js`, `auth.js`, `grpcClients.js`, `shared/api-paths.js`. Giải thích routing/alias, JWT, RBAC, thu hồi token, rate limit, REST → gRPC. Danh tính thực hiện nghiệp vụ lấy từ token, không tin customer/driver ID tự khai trong body.

## 04 — IPC

**0 URL, 0 Send; không login.** Mở `shared/proto/cab-domain.proto` và phần invokePeer/publish/consumer trong domain service. Ví dụ gọi đồng bộ Booking → Driver; ví dụ bất đồng bộ TripCanceled → Kafka → inbox. Các mục 16/18/22 sẽ xem sự kiện thật.

## 05 — Compose/container

**0 URL, 0 Send; không login.**

```powershell
docker compose ps
```

Có 12 container: Gateway + 7 domain service + PostgreSQL/Redis/Kafka/Kafka UI. Những container có healthcheck phải healthy; Kafka UI có thể chỉ running.

## 06 — Health

**3 URL, 3 Send; tất cả chọn No Auth, không body.**

| Request | Method | URL gõ đầy đủ | Kết quả |
|---|---|---|---|
| 6.1 | GET | `http://localhost:8080/health` | 200, healthy |
| 6.2 | GET | `http://localhost:8080/ready` | 200, ready |
| 6.3 | GET | `http://localhost:8080/health/services` | 200, UP và danh sách service |

## 07 — Kafka

**0 URL API, 0 Send; không login ứng dụng.** Browser `http://localhost:8081` → cluster cab-local. Chỉ ra topic `cab.booking.events`, `cab.driver.events`, `cab.trip.events`, `cab.payment.events`, group `cab-notification-service`. Kafka có thể còn lịch sử dù inbox DB đã reset.

## 08 — Request qua Gateway

**0 URL mới, 0 Send; không login.** Chỉ ra mọi URL nghiệp vụ dùng localhost:8080. Xem Compose: Gateway public, cổng gRPC nội bộ không publish ra host. Kafka UI/DBeaver là công cụ quản trị.

## 09 — Đăng ký customer mới

**1 URL, 1 Send; No Auth, chưa login.**

| Request | Method | URL | Body |
|---|---|---|---|
| 9.1 | POST | `http://localhost:8080/api/register` | `{"user":"kh5","pass":"customerpassword","fullname":"An","role":"CUSTOMER"}` |

201, kh5, CUSTOMER, có uid; profile tương ứng c6. Không gửi đăng ký lại. Bước 10 chứng minh tài khoản mới đăng nhập được.

## 10 — Đăng nhập customer mới

**1 URL, 1 Send; đăng nhập kh5.**

| Request | Method | URL | Authorization | Body |
|---|---|---|---|---|
| 10.1 | POST | `http://localhost:8080/api/login` | No Auth | `{"user":"kh5","pass":"customerpassword"}` |

200, response có token. Chỉ ra token được cấp cho tài khoản vừa tạo. Không cần token kh5 để xem c1 hay driver d1 ở mục tiếp theo; hai mục đó sẽ login Admin riêng.

## 11 — Xem customer bằng mã: login Admin rồi tra c1

**2 URL, 2 Send. Người gọi là ad; hồ sơ được xem là c1 của kh0.**

| Request | Method | URL | Authorization | Body / kết quả |
|---|---|---|---|---|
| 11.1 | POST | `http://localhost:8080/api/login` | No Auth | `{"user":"ad","pass":"adminpassword"}`; 200, copy giá trị token |
| 11.2 | GET | `http://localhost:8080/api/customers/c1` | Bearer Token: **dán token ad từ 11.1** | Không body; 200, c1, fullname An, address HN |

Không dùng mật khẩu/token kh0 trong ô Bearer của 11.2 theo kịch bản này. Backend cho phép Admin xem customer bất kỳ; customer tự xem mình cũng được phép nhưng không phải nhánh đang trình bày.

## 12 — Xem driver bằng mã: login Admin rồi tra d1

**2 URL, 2 Send. Người gọi là ad; hồ sơ được xem là d1 của tx1.**

| Request | Method | URL | Authorization | Body / kết quả |
|---|---|---|---|---|
| 12.1 | POST | `http://localhost:8080/api/login` | No Auth | `{"user":"ad","pass":"adminpassword"}`; 200, copy token |
| 12.2 | GET | `http://localhost:8080/api/drivers/d1` | Bearer: **token ad từ 12.1** | Không body; 200, d1, L1, P1, ACTIVE/AVAILABLE |

Nếu chấm liên tục và còn token ad từ 11.1 thì có thể copy lại token đó, bỏ 12.1; bảng vẫn ghi đầy đủ login để mục này không phụ thuộc token có sẵn. Không dùng token kh5 của mục 10 để gọi API driver.

## 13 — 5 driver lân cận, limit/paging

**4 URL, 4 Send. Login ad rồi dùng chính token đó cho ba GET.**

| Request | Method | URL | Authorization | Body |
|---|---|---|---|---|
| 13.1 | POST | `http://localhost:8080/api/login` | No Auth | `{"user":"ad","pass":"adminpassword"}` |
| 13.2 | GET | `http://localhost:8080/api/drivers/nearby?lat=22&lng=111&radius=1km&limit=5&page=1` | Token ad từ 13.1 | Không body |
| 13.3 | GET | `http://localhost:8080/api/drivers/nearby?lat=22&lng=111&radius=1km&limit=2&page=1` | Token ad từ 13.1 | Không body |
| 13.4 | GET | `http://localhost:8080/api/drivers/nearby?lat=22&lng=111&radius=1km&limit=2&page=2` | Token ad từ 13.1 | Không body |

13.2 trả d1–d5, total 5, mỗi người trong 1000m, nhiều approval_status/availability. Hai trang limit 2 không trùng người. Danh sách dùng vị trí cuối của cả offline/chờ duyệt/từ chối; ghép chuyến vẫn chỉ chọn ACTIVE/AVAILABLE. Driver d6–d10 nằm ngoài bán kính 1 km.

## 14 — Booking của customer, limit/paging

**4 URL, 4 Send. Login kh0; chính kh0 sở hữu b1–b5.**

| Request | Method | URL | Authorization | Body |
|---|---|---|---|---|
| 14.1 | POST | `http://localhost:8080/api/login` | No Auth | `{"user":"kh0","pass":"customerpassword"}` |
| 14.2 | GET | `http://localhost:8080/api/bookings?limit=5&page=1` | Token kh0 từ 14.1 | Không body |
| 14.3 | GET | `http://localhost:8080/api/bookings?limit=2&page=1` | Token kh0 từ 14.1 | Không body |
| 14.4 | GET | `http://localhost:8080/api/bookings?limit=2&page=2` | Token kh0 từ 14.1 | Không body |

14.2 có 5 phần tử b1–b5. API này có pagination.page/limit, không có total. Kiểm tra độ dài mảng và hai trang không trùng booking; không cần b1/b2 xuất hiện đúng thứ tự vì sort theo created_at. Không dùng kh5 vì tài khoản mới chưa có booking lịch sử.

## 15 — Đặt xe

**2 URL, 2 Send. Login kh0 rồi tạo booking cho chính kh0.**

| Request | Method | URL | Authorization | Body / kết quả |
|---|---|---|---|---|
| 15.1 | POST | `http://localhost:8080/api/login` | No Auth | `{"user":"kh0","pass":"customerpassword"}` |
| 15.2 | POST | `http://localhost:8080/api/bookings` | Token kh0 từ 15.1 | `{"from_lat":22,"from_lng":111,"to_lat":22.01,"to_lng":111.01}`; 201, b6, SEARCHING_DRIVER |

Ghi lại booking_id b6. Không Send tạo booking lần hai. Sang mục 16 trong offer smoke 600 giây; gần nhất là d1.

## 16 — Driver xem offer, nhận chuyến; customer nhận thông tin

**6 URL, 8 Send. Login hai tài khoản: tx1 để nhận chuyến, kh0 để xem kết quả.**

| Request | Method | URL | Authorization | Body / kết quả |
|---|---|---|---|---|
| 16.1 | POST | `http://localhost:8080/api/login` | No Auth | `{"user":"tx1","pass":"driverpassword"}`; copy token tx1 |
| 16.2 | GET | `http://localhost:8080/api/notifications/me?limit=10` | Token tx1 từ 16.1 | Không body; DriverOfferCreated |
| 16.3 | GET | `http://localhost:8080/api/drivers/offers` | Token tx1 từ 16.1 | Không body; offer b6 |
| 16.4 | GET | `http://localhost:8080/api/bookings/b6` | Token tx1 từ 16.1 | Không body; xem chi tiết trước khi nhận |
| 16.5 | POST | `http://localhost:8080/api/bookings/b6/accept` | Token tx1 từ 16.1 | Không body; 200, t1, DRIVER_ASSIGNED |
| 16.6 | POST | `http://localhost:8080/api/login` | No Auth | `{"user":"kh0","pass":"customerpassword"}`; copy token kh0 |
| 16.7 | GET | `http://localhost:8080/api/bookings/b6/trip` | Token kh0 từ 16.6 | Không body; trip t1 và thông tin d1 |
| 16.8 | GET | `http://localhost:8080/api/notifications/me?limit=10` | Token kh0 từ 16.6 | Không body; DriverAssigned |

Login URL được gửi hai lần, notifications URL được gửi hai lần bằng hai token khác nhau. Chỉ retry GET nếu Kafka chưa cập nhật; không tạo/accept lại booking để chờ thông báo.

## 17 — Trạng thái đúng thứ tự và cập nhật vị trí

**3 URL, 4 Send: 1 login, 2 cập nhật trạng thái, 1 cập nhật vị trí. Login tx1; tất cả PATCH dùng token tx1 vừa lấy.**

| Request | Method | URL | Authorization | Body / kết quả |
|---|---|---|---|---|
| 17.1 | POST | `http://localhost:8080/api/login` | No Auth | `{"user":"tx1","pass":"driverpassword"}` |
| 17.2 | PATCH | `http://localhost:8080/api/trips/t1/status` | Token tx1 từ 17.1 | `{"status":"start"}` → IN_PROGRESS |
| 17.3 | PATCH | `http://localhost:8080/api/trips/t1/location` | Token tx1 từ 17.1 | `{"lat":22.01,"lng":111.01}` → vị trí mới |
| 17.4 | PATCH | `http://localhost:8080/api/trips/t1/status` | Token tx1 từ 17.1 | `{"status":"done"}` → COMPLETED |

Mọi PATCH thành công trả 200. Luồng rút gọn là DRIVER_ASSIGNED → IN_PROGRESS → COMPLETED; gửi done ngay khi vừa nhận chuyến vẫn bị 400. Chỉ tài xế được gán mới cập nhật được; không dùng token Admin. Giữ t1 cho thanh toán/rating, không hủy t1 ở mục sau. Bản này gộp các trạng thái đi/đến điểm đón vào thao tác bắt đầu; không còn trạng thái riêng cho từng bước đón khách trong PDF.

## 18 — Customer hủy, cả hai bên nhận thông báo

**6 URL, 8 Send. Login kh0 và tx1; giữ hai tab response login để copy đúng token.** Tạo riêng b7/t2 vì t1 đã hoàn thành.

| Request | Method | URL | Authorization | Body / kết quả |
|---|---|---|---|---|
| 18.1 | POST | `http://localhost:8080/api/login` | No Auth | `{"user":"kh0","pass":"customerpassword"}` |
| 18.2 | POST | `http://localhost:8080/api/bookings` | Token kh0 từ 18.1 | `{"from_lat":22,"from_lng":111,"to_lat":22.01,"to_lng":111.01}`; 201, b7 |
| 18.3 | POST | `http://localhost:8080/api/login` | No Auth | `{"user":"tx1","pass":"driverpassword"}` |
| 18.4 | POST | `http://localhost:8080/api/bookings/b7/accept` | Token tx1 từ 18.3 | Không body; 200, t2 |
| 18.5 | POST | `http://localhost:8080/api/trips/t2/cancel` | Token kh0 từ 18.1 | `{"reason":"Ban"}`; 200, CANCELED |
| 18.6 | GET | `http://localhost:8080/api/notifications/me?limit=10` | Token tx1 từ 18.3 | Không body; TripCanceled, reason Ban |
| 18.7 | GET | `http://localhost:8080/api/notifications/me?limit=10` | Token kh0 từ 18.1 | Không body; customer cũng có TripCanceled |
| 18.8 | GET | `http://localhost:8080/api/trips/t2` | Token tx1 từ 18.3 | Không body; driver thấy CANCELED |

Driver biết customer hủy qua inbox được Notification ghi từ Kafka. Đây là polling API, không phải push/SMS tự hiện; chỉ lặp GET nếu chưa thấy sự kiện.

## 19 — Thanh toán, callback, chuyến PAID

**5 URL, 6 Send. Login kh0 để tạo/xem thanh toán; login ad để gọi callback local.**

| Request | Method | URL | Authorization | Header thêm | Body / kết quả |
|---|---|---|---|---|---|
| 19.1 | POST | `http://localhost:8080/api/login` | No Auth | Không | `{"user":"kh0","pass":"customerpassword"}` |
| 19.2 | POST | `http://localhost:8080/api/payments/online` | Token kh0 từ 19.1 | `Idempotency-Key: pay1` | `{"trip":"t1"}`; 200, p1, PENDING |
| 19.3 | POST | `http://localhost:8080/api/login` | No Auth | Không | `{"user":"ad","pass":"adminpassword"}` |
| 19.4 | POST | `http://localhost:8080/api/payments/p1/callback` | Token ad từ 19.3 | Không | `{"status":"SUCCESS"}`; 200, COMPLETED |
| 19.5 | GET | `http://localhost:8080/api/payments/p1` | Token kh0 từ 19.1 | Không | Không body; COMPLETED |
| 19.6 | GET | `http://localhost:8080/api/trips/t1` | Token kh0 từ 19.1 | Không | Không body; payment_status PAID |

Callback là mô phỏng provider local, không chuyển tiền thật. Giữ response 19.2 để so sánh mục 30. Chỉ POST payments/online cần header pay1; không để sót body login vào request callback hoặc GET.

## 20 — Rating

**2 URL, 2 Send. Login kh0, chủ chuyến t1.**

| Request | Method | URL | Authorization | Body / kết quả |
|---|---|---|---|---|
| 20.1 | POST | `http://localhost:8080/api/login` | No Auth | `{"user":"kh0","pass":"customerpassword"}` |
| 20.2 | POST | `http://localhost:8080/api/trips/t1/rating` | Token kh0 từ 20.1 | `{"stars":5,"comment":"Tot"}`; 201, rating gắn t1 |

Không dùng ad/tx1 để đánh giá thay customer. Không Send lại rating vì mỗi chuyến chỉ một đánh giá.

## 21 — Đăng ký driver, phone, OTP, hồ sơ

**5 URL, 5 Send. Tạo tài khoản tx11 rồi đăng nhập tx11 để lấy token.**

| Request | Method | URL | Authorization | Body / kết quả |
|---|---|---|---|---|
| 21.1 | POST | `http://localhost:8080/api/register` | No Auth | `{"user":"tx11","pass":"driverpassword","role":"DRIVER"}`; 201 |
| 21.2 | POST | `http://localhost:8080/api/login` | No Auth | `{"user":"tx11","pass":"driverpassword"}`; copy token tx11 |
| 21.3 | POST | `http://localhost:8080/api/otp/request` | Token tx11 từ 21.2 | `{"phone":"0901234567"}`; 201, LOCAL_DEMO, code: random 6-digit string |
| 21.4 | POST | `http://localhost:8080/api/otp/verify` | Token tx11 từ 21.2 | `{"code":"<code from OTP response>"}`; 200, phone_verified |
| 21.5 | POST | `http://localhost:8080/api/drivers/register` | Token tx11 từ 21.2 | `{"license":"L11","plate":"P11"}`; 201, d11, PENDING_APPROVAL |

Tài khoản cần được tạo/login trước để có token; sau đó là luồng phone → OTP → hồ sơ trong phiếu. OTP is a random 6-digit string returned in response.code; cooldown 30 giây, hạn OTP 300 giây. Không dùng token tx1 để tạo hồ sơ tx11.

## 22 — Admin duyệt, driver nhận kết quả

**5 URL, 6 Send. Login ad cho các bước duyệt; login tx11 để đọc kết quả của mình.**

| Request | Method | URL | Authorization | Body / kết quả |
|---|---|---|---|---|
| 22.1 | POST | `http://localhost:8080/api/login` | No Auth | `{"user":"ad","pass":"adminpassword"}` |
| 22.2 | GET | `http://localhost:8080/api/drivers/pending?limit=10&page=1` | Token ad từ 22.1 | Không body; thấy d11 chờ duyệt, có thể cùng d3 |
| 22.3 | GET | `http://localhost:8080/api/drivers/d11` | Token ad từ 22.1 | Không body; xem L11/P11, phone_verified |
| 22.4 | PATCH | `http://localhost:8080/api/drivers/d11/approve` | Token ad từ 22.1 | `{"approve":true}`; 200, ACTIVE |
| 22.5 | POST | `http://localhost:8080/api/login` | No Auth | `{"user":"tx11","pass":"driverpassword"}` |
| 22.6 | GET | `http://localhost:8080/api/notifications/me?limit=10` | Token tx11 từ 22.5 | Không body; DriverApprovalChanged |

Chọn nhánh approve true để làm tiếp mục 23. Nếu từ chối d11 thì không bật nhận chuyến được; không thực hiện cả hai nhánh trên cùng hồ sơ.

## 23 — Online/offline

**3 URL, 4 Send. Login tx11, không dùng tx1 hay ad.**

| Request | Method | URL | Authorization | Body / kết quả |
|---|---|---|---|---|
| 23.1 | POST | `http://localhost:8080/api/login` | No Auth | `{"user":"tx11","pass":"driverpassword"}` |
| 23.2 | PATCH | `http://localhost:8080/api/drivers/availability` | Token tx11 từ 23.1 | `{"online":true,"lat":22.02,"lng":111}` → AVAILABLE |
| 23.3 | PATCH | `http://localhost:8080/api/drivers/availability` | Token tx11 từ 23.1 | `{"online":false}` → OFFLINE |
| 23.4 | GET | `http://localhost:8080/api/drivers/d11` | Token tx11 từ 23.1 | Không body; OFFLINE đã được lưu |

Các bước thành công trả 200. Vị trí cuối có thể được giữ khi offline, nhưng tài xế bị loại khỏi Geo index nhận chuyến.

## 24 — Mã hóa at rest/key management

**0 URL API, 0 Send; không login ứng dụng.** GET profile không chứng minh DB đã mã hóa. Chạy terminal:

```powershell
npm.cmd run demo:at-rest
```

Xem ba kết quả: auth password băm bcrypt cost 12; customer và driver có dữ liệu nhạy cảm lưu trong envelope mã hóa AES-GCM. Password là hash một chiều; tên/địa chỉ/bằng lái/biển số được mã hóa AES-256-GCM.

Nếu cần xem DB trực tiếp, mở từng database trong DBeaver và chạy câu tương ứng (không tính vào HTTP):

`cab_auth`:

```sql
SELECT username, LEFT(password_hash,7) AS bcrypt_prefix
FROM users WHERE username IN ('ad','kh0','tx1','tx11');
```

`cab_customer`:

```sql
SELECT uid, LEFT(fullname,7) AS name_prefix, LEFT(address,7) AS address_prefix
FROM customers WHERE uid IN ('c1','c6');
```

`cab_driver`:

```sql
SELECT uid, LEFT(license_number,7) AS license_prefix, LEFT(plate_number,7) AS plate_prefix
FROM drivers WHERE uid IN ('d1','d11');
```

Prefix là `$2a$12$`/`$2b$12$` cho bcrypt, `enc:v1:` cho ciphertext. Chỉ ra tên key CUSTOMER_DATA_ENCRYPTION_KEY/DRIVER_DATA_ENCRYPTION_KEY và cách inject từ environment trong Compose/.env.example; không trình chiếu giá trị key. Không in toàn bộ password hash/secret.

## 25 — SQL injection

**1 URL, 1 Send; chọn No Auth. Đây là cố gắng login sai, không phải lấy token hợp lệ.**

| Request | Method | URL | Body / kết quả |
|---|---|---|---|
| 25.1 | POST | `http://localhost:8080/api/login` | `{"user":"' OR 1=1 --","pass":"anything"}` → 401 |

Phiếu chấp nhận 400/401. Không có token hoặc dữ liệu DB. API dùng username/user thực tế thay cho email minh họa trong PDF; payload tấn công được đưa vào trường đăng nhập thật.

## 26 — XSS

**2 URL, 2 Send. Login ad rồi cập nhật hồ sơ c6 của kh5.**

| Request | Method | URL | Authorization | Body / kết quả |
|---|---|---|---|---|
| 26.1 | POST | `http://localhost:8080/api/login` | No Auth | `{"user":"ad","pass":"adminpassword"}` |
| 26.2 | PUT | `http://localhost:8080/api/customers/c6` | Token ad từ 26.1 | `{"fullname":"<script>alert('hack')</script>"}` |

200, customer.fullname trả `&lt;script&gt;alert(&#x27;hack&#x27;)&lt;/script&gt;`. Chứng minh output escape. Không có popup trong Postman tự nó không phải bằng chứng chống XSS vì Postman không chạy HTML như browser.

## 27 — JWT tampering

**1 URL, 1 Send; không login, dùng token giả bên dưới.**

| Request | Method | URL | Authorization |
|---|---|---|---|
| 27.1 | GET | `http://localhost:8080/api/drivers/pending` | Chọn Bearer Token, dán nguyên token sai chữ ký dưới đây |

```text
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJhZG1pbl8wMDEiLCJyb2xlIjoiQURNSU4iLCJpc3MiOiJjYWItYXV0aCIsImV4cCI6NDEwMjQ0NDgwMH0.dGFtcGVyZWQtc2lnbmF0dXJl
```

Không body. Payload tự khai sub admin_001/role ADMIN nhưng signature sai; phải 401, không có danh sách driver. Đây là token âm tính để copy, không phải token Admin thật. Decode payload không đồng nghĩa verify chữ ký thành công.

## 28 — Customer gọi trái quyền

**2 URL, 2 Send. Login kh0 rồi cố ý dùng token customer gọi driver API.**

| Request | Method | URL | Authorization | Body / kết quả |
|---|---|---|---|---|
| 28.1 | POST | `http://localhost:8080/api/login` | No Auth | `{"user":"kh0","pass":"customerpassword"}` |
| 28.2 | GET | `http://localhost:8080/api/drivers/d1` | Token kh0 từ 28.1 | Không body; 403 Forbidden |

Không dùng token giả của mục 27 vì sẽ trả 401 thay vì kiểm tra quyền 403. Không dùng ad vì Admin được phép xem driver.

## 29 — Rate limit, hoàn toàn bấm tay

**2 URL, ít nhất 22 Send: 1 login kh0 + ít nhất 21 lần POST cùng URL. Không script/Runner.**

| Request | Method | URL | Authorization | Body / kết quả |
|---|---|---|---|---|
| 29.1 | POST | `http://localhost:8080/api/login` | No Auth | `{"user":"kh0","pass":"customerpassword"}` |
| 29.2–29.22 | POST | `http://localhost:8080/api/bookings` | Token kh0 từ 29.1 | `{"from_lat":999,"from_lng":999}`; gửi ít nhất 21 lần trong 10 giây |

Thêm header ở request bookings:

```text
Limit: 1
```

Giữ nguyên URL/body/Bearer/header và bấm Send liên tiếp. Những lần đầu là 400 vì tọa độ sai; khi vượt ngưỡng phải có 429. Tọa độ sai giúp không tạo booking thừa. Nếu bấm chậm quá 10 giây, có thể phải gửi nhiều hơn; số 22 là tối thiểu có điều kiện, không phải cứ Send lần 22 tổng cộng là chắc chắn 429.

Header demo sử dụng giới hạn **20 request/10 giây**, chỉ khi SMOKE_MODE=true. Phiếu ghi **hơn 1000 request/giây**; thao tác bấm tay này chỉ minh họa cơ chế trả 429 ở ngưỡng demo, chưa chứng minh tải 1000/s. Bài kiểm tra tải đúng mức đó cần công cụ riêng và nằm ngoài kịch bản không scripts/Runner này; không cam kết 30/30 chỉ từ màn minh họa này. Xóa header demo trước khi dùng request bookings cho nghiệp vụ bình thường.

## 30 — Replay/idempotency payment

**3 URL, 4 Send. Login kh0, rồi gửi lại đúng thanh toán t1/key pay1.**

| Request | Method | URL | Authorization | Header thêm | Body / kết quả |
|---|---|---|---|---|---|
| 30.1 | POST | `http://localhost:8080/api/login` | No Auth | Không | `{"user":"kh0","pass":"customerpassword"}` |
| 30.2 | POST | `http://localhost:8080/api/payments/online` | Token kh0 từ 30.1 | `Idempotency-Key: pay1` | `{"trip":"t1"}`; 200, response gốc từ 19.2 |
| 30.3 | POST | `http://localhost:8080/api/payments/online` | Token kh0 từ 30.1 | `Idempotency-Key: pay1` | Gửi lại cùng body; payment_id p1 không đổi |
| 30.4 | GET | `http://localhost:8080/api/payments/p1` | Token kh0 từ 30.1 | Không | Không body; trạng thái thực tế vẫn COMPLETED |

So sánh với response giữ ở 19.2. Replay trả snapshot PENDING của lần tạo đầu, còn GET p1 là COMPLETED; payment không bị chuyển ngược. Không mong idempotent_replay tự đổi thành true vì toàn bộ response gốc được giữ nguyên.

Nếu cần chứng minh DB có đúng một transaction cho chuyến đó, chạy ở `cab_payment`:

```sql
SELECT count(*) AS payment_count
FROM payments
WHERE trip_id = (SELECT trip_id FROM payments WHERE payment_id='p1');
```

Kết quả phải là 1. Không thay key hoặc body khi so sánh replay; token mới vẫn là cùng customer kh0 nên không làm thay đổi nghiệp vụ idempotency.

## Tra nhanh khi gặp lỗi

- **401:** đã chọn Bearer Token chưa, đã copy đủ token từ đúng response login chưa, token còn hạn không? Gửi lại login được ghi trong chính tiêu chí đó và dán token mới.
- **403:** token có thuộc đúng tài khoản trong từng hàng không? ad không thay tx1 để cập nhật chuyến; kh0 không xem driver API. 403 ở mục 28 là kết quả cần đạt.
- **409 kh5/tx11/pay1:** dữ liệu lượt cũ còn hoặc đã chạy Collection smoke; reset trước lượt mới, không reset giữa bài.
- **Chưa thấy thông báo:** chỉ lặp GET notifications. Không tạo/accept/cancel/callback lại để chờ thông báo.
- **Mã khác b6/b7/t1/t2/p1:** ưu tiên ID trong response thực tế; mã cố định chỉ đúng nếu đi từ đầu sau reset, không có request tự động tạo thêm dữ liệu.
- **t1 đã COMPLETED:** không chạy lại status hay hủy t1; dùng riêng t2 để hủy.
- **Đổi tài khoản:** chọn No Auth ở login; sau login chuyển request nghiệp vụ sang Bearer và dán token. Đừng để token/body của bước trước sót trong request mới.

Tài liệu này chỉ hướng dẫn thao tác, không tự đăng nhập, lưu token, gửi request hoặc thay đổi backend/database.
