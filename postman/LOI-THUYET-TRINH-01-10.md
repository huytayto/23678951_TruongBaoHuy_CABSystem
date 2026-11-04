# Lời thuyết trình và thao tác câu 1–10 — khoảng 4 phút

Mỗi câu có 1–2 câu nói. Vừa nói vừa chỉ vào bằng chứng trên màn hình; tổng thời gian dự kiến 3 phút 45 giây, còn 15 giây dự phòng chuyển cửa sổ hoặc chờ API.

## Chuẩn bị trước khi bắt đầu tính giờ

- Mở project trong VS Code, hiện cây thư mục và mở sẵn các file được ghi bên dưới.
- Mở repo của bạn trên GitHub. Mở `.gitignore`, `.env.example`; không trình chiếu giá trị trong `.env`.
- Mở terminal tại thư mục `3.0`, chạy sẵn `docker compose ps`.
- Mở Kafka UI tại `http://localhost:8081`, vào cluster `cab-local`; chuẩn bị trang Topics và Consumers.
- Mở Postman, chọn **No environment**, chuẩn bị 5 tab request trống cho câu 6, 9, 10. Không dùng tab có scripts tự gửi thêm request.
- Nếu bắt đầu một lượt demo mới và cần dữ liệu đúng như kịch bản, làm phần chuẩn bị/reset trong [TYPING-30.md](TYPING-30.md) trước giờ trình bày. Tài khoản `kh5` phải chưa tồn tại để câu 9 đăng ký thành công; không reset giữa bài.

## Câu 1 — Kiến trúc hệ thống

**Thời gian:** 25 giây · Mốc kết thúc: 0:25.

**Mở và chỉ:** Cây thư mục VS Code: `api-gateway/`, `services/`, `shared/proto/`, `infrastructure/`, `tests/`. Mở [README.md](../README.md), phần **Services and infrastructure**, để chỉ danh sách dịch vụ và database.

**Nói:**

> Em xin giới thiệu CAB là hệ thống đặt xe theo kiến trúc microservices, gồm một API Gateway và bảy dịch vụ: xác thực, khách hàng, tài xế, đặt xe, chuyến đi, thanh toán và thông báo. Các dịch vụ dùng chung bộ mã nguồn nghiệp vụ nhưng chạy thành các tiến trình riêng theo `SERVICE_CONTEXT`, mỗi dịch vụ có database PostgreSQL riêng.

## Câu 2 — Quản lý mã nguồn và cấu hình

**Thời gian:** 15 giây · Mốc kết thúc: 0:40.

**Mở và chỉ:** Repo trên GitHub, sau đó chuyển sang [.gitignore](../.gitignore) và [.env.example](../.env.example). Chuẩn bị sẵn kết quả hai lệnh dưới đây trong terminal: lệnh đầu phải chỉ ra `.env` bị ignore, lệnh sau không trả về file `.env`.

```powershell
git check-ignore .env
git ls-files -- .env
```

**Nói:**

> Mã nguồn được quản lý bằng Git và lưu trên GitHub; file `.env` chứa cấu hình nhạy cảm được loại khỏi quản lý bằng `.gitignore`. File `.env.example` cung cấp mẫu cấu hình để triển khai hệ thống.

## Câu 3 — API Gateway

**Thời gian:** 20 giây · Mốc kết thúc: 1:00.

**Mở và chỉ:** [server.js](../api-gateway/src/server.js), tìm `gatewayRateLimit` và một route có `authn, authorize`. Chuyển nhanh sang [auth.js](../api-gateway/src/auth.js) và [grpcClients.js](../api-gateway/src/grpcClients.js) để chỉ phần xác thực và gọi gRPC.

**Nói:**

> API Gateway là đầu vào chung, đảm nhiệm định tuyến, xác thực JWT, phân quyền và giới hạn số lượng request. Gateway tiếp nhận REST API từ người dùng rồi gọi dịch vụ nghiệp vụ qua gRPC, đồng thời lấy danh tính người thao tác từ token.

## Câu 4 — Giao tiếp giữa các dịch vụ

**Thời gian:** 20 giây · Mốc kết thúc: 1:20.

**Mở và chỉ:** [cab-domain.proto](../shared/proto/cab-domain.proto), sau đó [domain-service.js](../services/domain-service.js). Dùng tìm kiếm đã chuẩn bị sẵn để chỉ `invokePeer('driver', 'nearby_available'` và `event_type: 'TripCanceled'`.

**Nói:**

> Hệ thống dùng gRPC cho giao tiếp đồng bộ, ví dụ dịch vụ đặt xe gọi dịch vụ tài xế để tìm tài xế khả dụng. Với xử lý bất đồng bộ, sự kiện như hủy chuyến được gửi qua Kafka để dịch vụ thông báo tiếp nhận và xử lý.

## Câu 5 — Docker Compose và container

**Thời gian:** 15 giây · Mốc kết thúc: 1:35.

**Mở và chỉ:** Terminal có kết quả lệnh sau; chỉ cột `SERVICE` và `STATUS`.

```powershell
docker compose ps
```

**Nói:**

> Hệ thống được triển khai bằng Docker Compose với 12 container, gồm Gateway, bảy dịch vụ nghiệp vụ, PostgreSQL, Redis, Kafka và Kafka UI. Kết quả tại đây cho thấy trạng thái của từng container; các thành phần có healthcheck cần đạt healthy.

## Câu 6 — Kiểm tra sức khỏe hệ thống

**Thời gian:** 35 giây · Mốc kết thúc: 2:10.

**Mở và thao tác:** Ba tab Postman bên dưới, đều chọn **Authorization → No Auth**, không body. Bấm **Send** lần lượt và chỉ HTTP status cùng nội dung response.

| Method | URL | Kết quả cần chỉ |
|---|---|---|
| GET | `http://localhost:8080/health` | HTTP 200, `status: healthy` |
| GET | `http://localhost:8080/ready` | HTTP 200, `status: ready` |
| GET | `http://localhost:8080/health/services` | HTTP 200, `status: UP`, danh sách dịch vụ |

**Nói:**

> Em gửi ba request để kiểm tra Gateway đang hoạt động, hệ thống sẵn sàng phục vụ và trạng thái các dịch vụ cùng hạ tầng phụ thuộc. Khi cả ba trả HTTP 200 và các thành phần đều UP, em tiếp tục phần demo nghiệp vụ.

## Câu 7 — Kafka

**Thời gian:** 20 giây · Mốc kết thúc: 2:30.

**Mở và chỉ:** Kafka UI tại `http://localhost:8081` → cluster `cab-local` → **Topics**, chỉ `cab.booking.events`, `cab.driver.events`, `cab.trip.events`, `cab.payment.events`. Chuyển sang **Consumers**, chỉ group `cab-notification-service`.

**Nói:**

> Đây là Kafka UI, cho phép quan sát các topic sự kiện của đặt xe, tài xế, chuyến đi và thanh toán. Dịch vụ thông báo sử dụng consumer group riêng để nhận và xử lý các sự kiện liên quan.

## Câu 8 — Request đi qua Gateway

**Thời gian:** 15 giây · Mốc kết thúc: 2:45.

**Mở và chỉ:** Thanh URL các request Postman đều dùng `localhost:8080`, rồi [docker-compose.yml](../docker-compose.yml), phần `api-gateway` có publish cổng `8080:8080`; các domain service không publish cổng gRPC ra host.

**Nói:**

> Toàn bộ request nghiệp vụ trong phần demo đều đi qua API Gateway tại cổng 8080. Các cổng gRPC chỉ được sử dụng trong mạng Docker nội bộ; Kafka UI và công cụ truy cập database phục vụ quản trị.

## Câu 9 — Đăng ký khách hàng

**Thời gian:** 35 giây · Mốc kết thúc: 3:20.

**Mở và thao tác:** Postman → **POST** `http://localhost:8080/api/register` → **Authorization: No Auth** → **Body → raw → JSON**.

```json
{"user":"kh5","pass":"customerpassword","fullname":"An","role":"CUSTOMER"}
```

Bấm **Send một lần**, chỉ HTTP **201**, tài khoản `kh5`, vai trò `CUSTOMER` và mã người dùng trong response. Theo dữ liệu sau reset, hồ sơ khách hàng tương ứng là `c6`; ưu tiên kết quả thực tế trên màn hình.

**Nói:**

> Em đăng ký một tài khoản khách hàng mới với tên đăng nhập kh5, thông tin cá nhân và vai trò CUSTOMER. Response trả HTTP 201 cùng mã người dùng, xác nhận tài khoản được tạo thành công.

## Câu 10 — Đăng nhập tài khoản vừa tạo

**Thời gian:** 25 giây · Mốc kết thúc: 3:45.

**Mở và thao tác:** Postman → **POST** `http://localhost:8080/api/login` → **Authorization: No Auth** → **Body → raw → JSON**.

```json
{"user":"kh5","pass":"customerpassword"}
```

Bấm **Send**, chỉ HTTP **200** và trường `token`. Giữ lại tab response có nhãn **Login kh5**; câu 11–12 theo kịch bản dùng tài khoản Admin riêng.

**Nói:**

> Tiếp theo, em đăng nhập bằng chính tài khoản kh5 vừa đăng ký. Hệ thống trả HTTP 200 và JWT để xác thực các request tiếp theo của tài khoản này.

## Nhịp trình bày

| Nhóm | Thời gian |
|---|---|
| Câu 1–5: giới thiệu và chỉ source/container | 1 phút 35 giây |
| Câu 6–8: health, Kafka và Gateway | 1 phút 10 giây |
| Câu 9–10: đăng ký và đăng nhập | 1 phút |
| Dự phòng | 15 giây |
| **Tổng** | **4 phút** |

Mở sẵn file, vị trí code và tab request trước giờ trình bày để tránh mất thời gian tìm kiếm. Thời gian trên giả định URL/body đã chuẩn bị; nếu phải gõ trực tiếp tại chỗ, ưu tiên nói ngắn trong lúc nhập và giữ phần chuyển màn hình thật nhanh.
