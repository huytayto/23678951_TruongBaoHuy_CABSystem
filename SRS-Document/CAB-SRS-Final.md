# SOFTWARE REQUIREMENTS SPECIFICATION (SRS)
## HỆ THỐNG NỀN TẢNG ĐẶT XE CÔNG NGHỆ CAB (CAB PLATFORM)
### Phiên bản: 3.0 - Bản Tinh gọn Chuẩn hóa 8 Microservices (Theo Rubric IUH MSA)

--------------------------------------------------------------------------------

## MỤC LỤC
1. **NGỮ CẢNH NGHIỆP VỤ & BUSINESS PROBLEM**
2. **STAKEHOLDERS & STAKEHOLDER MATRIX**
3. **MỤC TIÊU NGHIỆP VỤ (BUSINESS GOALS - BG)**
4. **PHẠM VI HỆ THỐNG (SYSTEM SCOPE & MVP CONSTRAINTS)**
5. **YÊU CẦU NGHIỆP VỤ (BUSINESS REQUIREMENTS - BR)**
6. **QUY TRÌNH NGHIỆP VỤ (BUSINESS PROCESS - BP)**
7. **YÊU CẦU CHỨC NĂNG (FUNCTIONAL REQUIREMENTS - FR)**
8. **QUY TẮC NGHIỆP VỤ & XỬ LÝ NGOẠI LỆ (BUSINESS RULES & EXCEPTIONS)**
9. **MÔ HÌNH MIỀN DỮ LIỆU & THỰC THỂ (DOMAIN MODEL & ENTITIES)**
10. **YÊU CẦU PHI CHỨC NĂNG & KIẾN TRÚC 8 MICROSERVICES (NFR & MSA ARCHITECTURE)**
11. **USE CASES & MÔ TẢ CHI TIẾT USE CASE**
12. **TIÊU CHÍ CHẤM NHẬN (ACCEPTANCE CRITERIA - AC)**
13. **MA TRẬN TRUY XUẤT YÊU CẦU (TRACEABILITY MATRIX)**
14. **KỊCH BẢN KIỂM THỬ SMOKE TEST & RUBRIC COVERAGE**
15. **HƯỚNG DẪN TRIỂN KHAI DOCKER COMPOSE & SMOKE TESTING**

--------------------------------------------------------------------------------

## 1. NGỮ CẢNH NGHIỆP VỤ & BUSINESS PROBLEM
Hệ thống Đặt xe Công nghệ CAB (CAB Platform) là giải pháp chuyển đổi số toàn diện cho dịch vụ vận tải hành khách bằng xe ô tô công nghệ. Hệ thống kết nối ba đối tượng cốt lõi: Khách hàng (Customer), Tài xế (Driver), và Quản trị viên (Admin).
Hệ thống được thiết kế theo kiến trúc **8 Microservices độc lập**, đóng gói bằng Docker Compose, giao tiếp nội bộ qua **gRPC** và luồng sự kiện bất đồng bộ qua **Apache Kafka / RabbitMQ**, cổng vào duy nhất đi qua **API Gateway**.

## 2. STAKEHOLDERS & STAKEHOLDER MATRIX
- **Customer (Khách hàng):** Đặt xe, theo dõi tài xế, thanh toán (Online/Tiền mặt), đánh giá chuyến đi.
- **Driver (Tài xế):** Đăng ký hồ sơ, bật/tắt sẵn sàng (Online/Offline), nhận chuyến đi, cập nhật 2 bước trạng thái chuyến đi.
- **Admin (Quản trị viên):** Phê duyệt/từ chối hồ sơ tài xế, quản lý tài khoản người dùng, giám sát hệ thống.

## 3. MỤC TIÊU NGHIỆP VỤ (BUSINESS GOALS - BG)
- **BG-01:** Tự động hóa 100% luồng tìm kiếm và ghép nối tài xế trong bán kính 1km.
- **BG-02:** Đáp ứng kiến trúc Microservices độc lập, chịu lỗi tốt (Fault Isolation), uptime ≥ 99.9%.
- **BG-03:** Bảo mật toàn diện đáp ứng 30/30 tiêu chí Rubric môn MSA (IUH).

## 4. PHẠM VI HỆ THỐNG (SYSTEM SCOPE & MVP CONSTRAINTS)
Để tối ưu hóa cho việc kiểm thử Smoke Test và Postman Automation Testing theo Rubric IUH MSA, phạm vi hệ thống được giới hạn tinh gọn (MVP Constraints):
1. **Loại xe mặc định:** Mặc định duy nhất 1 loại xe ô tô 4 chỗ (`CAB_4_SEAT`).
2. **Hình thức thanh toán:** Hỗ trợ 2 hình thức:
   - **Trả trước Online (`ONLINE_PREPAID`):** Xử lý qua Webhook Callback và kiểm tra Idempotency.
   - **Trả sau Tiền mặt (`CASH_POSTPAID`):** Tài xế bấm xác nhận đã nhận tiền mặt khi kết thúc chuyến đi.
3. **Tìm kiếm vị trí 1km:** Sử dụng dữ liệu tĩnh (Static Seed Data) kết hợp Redis GeoSpatial Indexing để truy vấn danh sách tài xế xung quanh bán kính 1km có hỗ trợ `limit` và `paging`.

## 5. YÊU CẦU NGHIỆP VỤ (BUSINESS REQUIREMENTS - BR)
- **BR-01 (Xác thực & Phân quyền):** Sử dụng JWT Token, mã hóa mật khẩu Bcrypt, áp dụng RBAC (Member vs Admin).
- **BR-02 (Luồng Chuyến đi 2 Bước):** Bắt buộc chuyển đổi trạng thái tuần tự: `DRIVER_ASSIGNED` -> `IN_PROGRESS` -> `COMPLETED`.
- **BR-03 (Ghép nối Chống tranh chấp):** Kích hoạt Sequential Dispatch với Redis Distributed Lock (Mutex) đảm bảo chỉ 1 tài xế nhận được chuyến.
- **BR-04 (Bảo mật NFR):** Chống SQL Injection, XSS HTML Escaping, JWT Tampering (401), Unauthorized Access (403), Rate Limiting 1000 req/s (429), Idempotency Replay Attack (300).

## 6. QUY TRÌNH NGHIỆP VỤ (BUSINESS PROCESS - BP)
1. **Đăng ký/Đăng nhập:** Customer/Driver đăng ký -> Login nhận JWT Token.
2. **Onboarding Tài xế:** Driver gửi hồ sơ (`PENDING_APPROVAL`) -> Admin duyệt (`ACTIVE`) -> Driver bật `AVAILABLE`.
3. **Đặt xe & Ghép chuyến:** Customer tạo Booking (`SEARCHING_DRIVER`) -> Quét tài xế 1km -> Gửi Offer -> Driver chấp nhận -> Tạo Trip (`DRIVER_ASSIGNED`).
4. **Thực hiện Chuyến đi:** Driver cập nhật 2 bước trạng thái -> Tự động tính cước khi `COMPLETED`.
5. **Thanh toán & Đánh giá:** Thanh toán Online/Tiền mặt -> Customer gửi Đánh giá 5 sao.

## 7. YÊU CẦU CHỨC NĂNG (FUNCTIONAL REQUIREMENTS - FR)
- **FR-AUTH-01:** Đăng ký / Đăng nhập / Đăng xuất tài khoản (PostgreSQL, Bcrypt, JWT).
- **FR-CUST-01:** CRUD Hồ sơ Khách hàng (MongoDB/Postgres, RBAC Member view / Admin write).
- **FR-DRV-01:** Đăng ký tài xế, Admin phê duyệt/từ chối, Toggle Online/Offline.
- **FR-GEO-01:** Tra cứu danh sách tài xế xung quanh 1km (`limit`, `page`).
- **FR-BOOK-01:** Tạo Booking, Sequential Dispatch, Hủy chuyến kèm lý do.
- **FR-TRIP-01:** Quản lý 2 bước trạng thái chuyến đi, Tính cước cố định, Đánh giá 5 sao.
- **FR-PAY-01:** Webhook Callback thanh toán Online, Xác nhận Tiền mặt, Check Idempotency-Key.
- **FR-NOTIF-01:** Tiêu thụ sự kiện bất đồng bộ Kafka (`BookingCreated`, `DriverAssigned`, `TripCompleted`).

## 8. QUY TẮC NGHIỆP VỤ & XỬ LÝ NGOẠI LỆ (BUSINESS RULES & EXCEPTIONS)
- **BRL-01:** Mật khẩu phải từ 8 ký tự, chứa chữ hoa, chữ thường, số và ký tự đặc biệt.
- **BRL-02:** Tài xế chưa được Admin duyệt (`PENDING_APPROVAL`) không thể bật `AVAILABLE` hoặc nhận chuyến.
- **BRL-03:** Không cho phép nhảy cóc trạng thái chuyến đi (VD: `DRIVER_ASSIGNED` -> `COMPLETED` sẽ trả 400 Bad Request).
- **BRL-04:** Mỗi chuyến đi chỉ được đánh giá duy nhất 1 lần.

## 9. MÔ HÌNH MIỀN DỮ LIỆU & THỰC THỂ (DOMAIN MODEL & ENTITIES)
- **User (Auth DB):** `uid`, `username`, `password_hash`, `role` (`CUSTOMER`, `DRIVER`, `ADMIN`), `status`.
- **Customer (Customer DB):** `uid`, `fullname`, `age`, `address`, `created_at`.
- **Driver (Driver DB):** `uid`, `license_number`, `plate_number`, `vehicle_type` (`CAB_4_SEAT`), `approval_status` (`PENDING_APPROVAL`, `ACTIVE`, `REJECTED`), `availability` (`OFFLINE`, `AVAILABLE`, `BUSY`).
- **Booking (Booking DB):** `booking_id`, `customer_id`, `pickup_location`, `dropoff_location`, `vehicle_type`, `status` (`CREATED`, `SEARCHING_DRIVER`, `DRIVER_ASSIGNED`, `CANCELED`).
- **Trip (Trip DB):** `trip_id`, `booking_id`, `driver_id`, `customer_id`, `status` (`DRIVER_ASSIGNED`, `IN_PROGRESS`, `COMPLETED`, `CANCELED`), `fare_amount`.
- **Payment (Payment DB):** `payment_id`, `trip_id`, `payment_method` (`ONLINE_PREPAID`, `CASH_POSTPAID`), `status` (`PENDING`, `COMPLETED`, `FAILED`), `idempotency_key`.
- **Rating (Trip DB):** `rating_id`, `trip_id`, `stars`, `comment`.

## 10. YÊU CẦU PHI CHỨC NĂNG & KIẾN TRÚC 8 MICROSERVICES (NFR & MSA ARCHITECTURE)

| Container Name | Service Name | Công nghệ Core | Nhiệm vụ chính |
| :--- | :--- | :--- | :--- |
| `cab-gateway` | API Gateway | Node.js / Kong | Single Entry Point, JWT Verification (401), RBAC (403), Rate Limiting (429), gRPC Routing. |
| `cab-auth-service` | Auth Service | Node.js / Go | Đăng ký, Đăng nhập, Cấp JWT Token, Mã hóa Bcrypt. |
| `cab-customer-service`| Customer Service | Node.js / Python | CRUD Profile Khách hàng, phân quyền RBAC Member/Admin. |
| `cab-driver-service` | Driver Service | Node.js / Go | Đăng ký/Duyệt hồ sơ tài xế, Toggle Online/Offline, Tra cứu tài xế 1km qua Redis Geo. |
| `cab-booking-service` | Booking Service | Java / Node.js | Đặt xe, Ghép chuyến (Sequential Dispatch), Mutex Lock nhận chuyến, Hủy chuyến. |
| `cab-trip-service` | Ride & Trip Service | Java / Node.js | Quản lý 2 bước trạng thái chuyến đi, Tính cước cố định, Đánh giá 5 sao. |
| `cab-notification-svc`| Notification Service| Node.js / Go | Tiêu thụ Kafka Event (`BookingCreated`, `TripCompleted`), Gửi Push/SMS log. |
| `cab-payment-service` | Payment Service | Java / Node.js | Webhook Callback thanh toán Online, Xác nhận Tiền mặt, Chống Replay Idempotency. |
| `cab-db-postgres` | PostgreSQL DB | PostgreSQL 16 | CSDL Quan hệ chính (User, Driver, Booking, Trip, Payment). |
| `cab-redis-cache` | Redis Cache | Redis 7 | Redis GeoSpatial (Tọa độ 1km), Distributed Mutex Lock. |
| `cab-message-broker` | Message Broker | Apache Kafka / RabbitMQ | Luồng truyền thông điệp sự kiện bất đồng bộ. |

## 11. USE CASES & MÔ TẢ CHI TIẾT USE CASE
- **UC-01:** Đăng ký & Đăng nhập Hệ thống.
- **UC-02:** Đăng ký & Phê duyệt Hồ sơ Tài xế.
- **UC-03:** Tra cứu Tài xế Bán kính 1km.
- **UC-04:** Đặt xe & Ghép tài xế Tự động.
- **UC-05:** Thực hiện Chuyến đi 2 Bước Trạng thái.
- **UC-06:** Hủy chuyến đi kèm Lý do.
- **UC-07:** Thanh toán Online Webhook & Xác nhận Tiền mặt.
- **UC-08:** Đánh giá Chuyến đi 5 Sao.
- **UC-09:** Health Check Hệ thống (`/health/services`).

## 12. TIÊU CHÍ CHẤM NHẬN (ACCEPTANCE CRITERIA - AC)
- **AC-01:** 100% Request từ Client đi qua `cab-gateway`.
- **AC-02:** Sai JWT Token trả HTTP 401 Unauthorized; Member gọi API Admin trả HTTP 403 Forbidden.
- **AC-03:** Spam > 1000 req/s trả HTTP 429 Too Many Requests.
- **AC-04:** Trùng Idempotency-Key không bị trừ tiền 2 lần.
- **AC-05:** `/health/services` trả về HTTP 200 OK với đầy đủ trạng thái 8 Microservices.

## 13. MA TRẬN TRUY XUẤT YÊU CẦU (TRACEABILITY MATRIX)
Khớp 1:1 giữa Business Goals (BG), Functional Requirements (FR), Microservices và Rubric Items 1-30.

## 14. KỊCH BẢN KIỂM THỬ SMOKE TEST & RUBRIC COVERAGE
Thực thi bộ Postman Collection kiểm thử tự động 30 tiêu chí Rubric.

## 15. HƯỚNG DẪN TRIỂN KHAI DOCKER COMPOSE & SMOKE TESTING
Khởi chạy hệ thống bằng lệnh duy nhất: `docker-compose up -d`.
