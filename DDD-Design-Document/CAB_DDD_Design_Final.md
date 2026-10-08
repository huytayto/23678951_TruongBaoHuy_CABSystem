# DOMAIN-DRIVEN DESIGN (DDD) ARCHITECTURAL SPECIFICATION
## HỆ THỐNG NỀN TẢNG ĐẶT XE CÔNG NGHỆ CAB (CAB PLATFORM)
### Phiên bản: 3.0 - Thiết kế Tinh gọn 8 Bounded Contexts (Theo Rubric IUH MSA)

--------------------------------------------------------------------------------

## 1. TỔNG QUAN KIẾN TRÚC MIỀN (DOMAIN ARCHITECTURE OVERVIEW)
Tài liệu này xác định mô hình Domain-Driven Design (DDD) cho Hệ thống Đặt xe CAB, được phân rã thành **8 Bounded Contexts** khớp 1:1 với **8 Microservices** trong hạ tầng Docker Compose.

```text
┌────────────────────────────────────────────────────────────────────────┐
│                        API GATEWAY CONTEXT                             │
│                         (cab-gateway)                                  │
│  - Centralized Auth JWT Check (401)   - RBAC Authorization Check (403) │
│  - Rate Limiting 1000 req/s (429)     - gRPC Routing to Services       │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │ gRPC / REST
       ┌───────────────────────────┼───────────────────────────┐
       ▼                           ▼                           ▼
┌──────────────┐           ┌──────────────┐            ┌──────────────┐
│ IDENTITY &   │           │ CUSTOMER     │            │ DRIVER &     │
│ ACCESS (BC1) │           │ PROFILE (BC2)│            │ FLEET (BC3)  │
│ cab-auth-svc │           │ cab-cust-svc │            │ cab-drv-svc  │
└──────────────┘           └──────────────┘            └──────────────┘
       │                           │                           │
       └───────────────────────────┼───────────────────────────┘
                                   │ Async Kafka Events
       ┌───────────────────────────┼───────────────────────────┐
       ▼                           ▼                           ▼
┌──────────────┐           ┌──────────────┐            ┌──────────────┐
│ BOOKING &    │           │ RIDE & TRIP  │            │ PAYMENT &    │
│ MATCH (BC4)  │           │ EXEC (BC5)   │            │ SETTLE (BC6) │
│ cab-book-svc │           │ cab-trip-svc │            │ cab-pay-svc  │
└──────────────┘           └──────────────┘            └──────────────┘
       │                           │                           │
       └───────────────────────────┴───────────────────────────┘
                                   │
                                   ▼
                       ┌──────────────────────┐
                       │ NOTIFICATION (BC7)   │
                       │ cab-notification-svc │
                       └──────────────────────┘
```

## 2. DANH SÁCH 8 BOUNDED CONTEXTS & MÁY TRẠM DỊCH VỤ

| Bounded Context | Microservice | Domain Type | Database | Chức năng chính |
| :--- | :--- | :--- | :--- | :--- |
| **BC-1: Identity & Access** | `cab-auth-service` | Generic | PostgreSQL | Đăng ký, Đăng nhập, Cấp JWT, Mã hóa Bcrypt. |
| **BC-2: Customer Profile** | `cab-customer-service` | Supporting | MongoDB / Postgres | CRUD Hồ sơ Khách hàng, Phân quyền RBAC Member/Admin. |
| **BC-3: Driver & Fleet** | `cab-driver-service` | Core | PostgreSQL + Redis | Đăng ký/Duyệt tài xế (`PENDING` -> `ACTIVE`), Toggle Online/Offline, Quét 1km. |
| **BC-4: Booking & Matching** | `cab-booking-service` | Core | PostgreSQL + Redis Lock | Tạo Booking, Sequential Dispatch, Mutex Lock nhận chuyến, Hủy chuyến. |
| **BC-5: Ride & Trip Execution** | `cab-trip-service` | Core | PostgreSQL | Tiến trình 5 bước chuyến đi, Tính cước cố định, Đánh giá 5 sao. |
| **BC-6: Notification** | `cab-notification-service`| Generic | Message Broker Kafka | Tiêu thụ Async Event (`BookingCreated`, `TripCompleted`), Push Log. |
| **BC-7: Payment & Settlement** | `cab-payment-service` | Core | PostgreSQL | Callback Webhook thanh toán Online, Xác nhận Tiền mặt, Idempotency Check. |
| **BC-8: API Gateway & Security**| `cab-gateway` | Generic | Redis Rate Limiter | Routing, JWT Verification (401), RBAC (403), Rate Limit (429), Health Check. |

## 3. THIẾT KẾ AGGREGATES & BOUNDARY INVARIANTS
1. **User Aggregate (BC-1):** Root `User` (`uid`, `username`, `password_hash`, `role`, `status`). Enforces unique username and Bcrypt password hashing.
2. **Customer Aggregate (BC-2):** Root `Customer` (`uid`, `fullname`, `age`, `address`). Enforces RBAC permissions.
3. **Driver Aggregate (BC-3):** Root `Driver` (`uid`, `license_number`, `plate_number`, `vehicle_type`=`CAB_4_SEAT`, `approval_status`, `availability`). Enforces `PENDING_APPROVAL` rule before activating `AVAILABLE`.
4. **Booking Aggregate (BC-4):** Root `Booking` (`booking_id`, `customer_id`, `pickup_location`, `dropoff_location`, `status`). Enforces sequential dispatch and cancellation invariants.
5. **Trip Aggregate (BC-5):** Root `Trip` (`trip_id`, `booking_id`, `driver_id`, `status`, `fare_amount`). Enforces 5-step state transitions: `DRIVER_ASSIGNED` -> `EN_ROUTE` -> `ARRIVED` -> `PICKED_UP` -> `IN_PROGRESS` -> `COMPLETED`.
6. **Payment Aggregate (BC-7):** Root `Payment` (`payment_id`, `trip_id`, `amount`, `payment_method`, `status`, `idempotency_key`). Enforces replay attack prevention via unique `idempotency_key`.

## 4. EVENT-DRIVEN ARCHITECTURE & KAFKA TOPICS
- Topic `cab.booking.events`: `BookingCreated`, `BookingCanceled`
- Topic `cab.trip.events`: `DriverAssigned`, `TripStatusUpdated`, `TripCompleted`
- Topic `cab.payment.events`: `PaymentCompleted`, `PaymentFailed`

## 5. POLYGLOT PERSISTENCE & DATA OWNERSHIP
- Database-per-Service principle strictly enforced.
- No direct cross-database queries or shared tables between microservices.
- Communication strictly via gRPC (synchronous) or Kafka (asynchronous).
