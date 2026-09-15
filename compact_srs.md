# 1. System Overview

- CAB là nền tảng số hóa và tự động hóa toàn bộ vòng đời chuyến xe của ABC: đặt xe → tìm tài xế → thực hiện chuyến → tính cước → thanh toán → thông báo → đánh giá.
- CAB là hệ thống trung tâm kết nối Customer, Driver và Operation; tích hợp 3 nhóm external provider: Payment, Notification, Map/Location (MVP: 1 provider mỗi loại).
- Phạm vi tài liệu: **MVP**. Các quy tắc pricing, matching, timeout, cancellation, payment retry, location tracking và data retention **chưa được chốt**.

---

# 2. Business Context

## 2.1 Business Problem

- Booking và phân công tài xế phụ thuộc nhiều vào tổng đài và thao tác thủ công.
- Theo dõi chuyến, quản lý thanh toán, thông báo và hỗ trợ vận hành chưa tập trung trên một nền tảng thống nhất.
- Hệ quả: thời gian xử lý yêu cầu tăng, tải Operation tăng, thiếu thông tin realtime cho khách hàng, khó xử lý ngoại lệ.
- Kiến trúc hiện tại chưa đáp ứng việc mở rộng số lượng Customer/Driver/Trip và bổ sung dịch vụ, phương thức thanh toán, kênh thông báo mới.

## 2.2 Business Goals

| ID | Business Goal |
|---|---|
| BG1 | Số hóa và tự động hóa vòng đời chuyến xe (matching, thông báo, tính cước không cần thao tác thủ công). |
| BG2 | Nâng cao tỷ lệ đáp ứng chuyến (fulfillment rate) qua matching + timeout/reassign. |
| BG3 | Cải thiện trải nghiệm Customer/Driver: theo dõi realtime, lịch sử chuyến, thanh toán minh bạch, đánh giá sau chuyến. |
| BG4 | Tập trung hóa quản lý vận hành và dữ liệu: giám sát chuyến/tài xế, xử lý ngoại lệ, tra cứu lịch sử giao dịch, báo cáo vận hành. |
| BG5 | Đảm bảo scalability và high availability: thành phần scale độc lập, lỗi một phân hệ không làm gián đoạn toàn hệ thống. |
| BG6 | Nền tảng linh hoạt: bổ sung dịch vụ/phương thức thanh toán/kênh thông báo mới qua kiến trúc module hóa. |
| BG7 | An toàn và tuân thủ dữ liệu: bảo vệ PII, location, transaction, payment data; RBAC; audit log. |

## 2.3 Business Requirements

| ID | Business Requirement | BG | Nhóm |
|---|---|---|---|
| BR-01 | Customer tự đăng ký, xác thực và tạo yêu cầu đặt xe không qua tổng đài. | BG1, BG2 | Booking |
| BR-02 | Tự động tìm và phân công Driver theo vị trí và trạng thái sẵn sàng. | BG1, BG2 | Matching |
| BR-03 | Tự chuyển sang Driver khác khi Driver từ chối/không phản hồi, không yêu cầu Customer tạo lại yêu cầu. | BG2 | Matching |
| BR-04 | Customer theo dõi được trạng thái chuyến theo thời gian thực. | BG3 | Tracking |
| BR-05 | Tự động tính cước theo loại dịch vụ và thông tin chuyến sau khi hoàn thành. | BG1, BG2 | Payment |
| BR-06 | Hỗ trợ thanh toán tiền mặt và tích hợp một nhà cung cấp thanh toán điện tử. | BG3, BG6 | Payment |
| BR-07 | Không lưu trữ trực tiếp thông tin nhạy cảm về thẻ/tài khoản thanh toán. | BG7 | Payment/Security |
| BR-08 | Gửi thông báo tới Customer và Driver tại các mốc quan trọng của chuyến. | BG3 | Notification |
| BR-09 | Giao diện quản trị để Operation giám sát chuyến và xử lý ngoại lệ. | BG4 | Operation |
| BR-10 | Phân quyền truy cập; nhân viên thông thường không thực hiện được thao tác quản trị nhạy cảm. | BG7 | Security |
| BR-11 | Ghi log các thao tác quan trọng phục vụ tra soát sự cố. | BG7 | Security/Audit |
| BR-12 | Booking, Payment, Notification hoạt động/mở rộng độc lập; lỗi một thành phần không làm gián đoạn toàn hệ thống. | BG5 | Architecture |
| BR-13 | Cho phép bổ sung provider mới (payment, notification, map) mà không xây dựng lại hệ thống. | BG6 | Architecture |

## 2.4 Stakeholders

Business: Ban Giám đốc/Sponsor, Finance/Accounting · Operational: Operation Staff, Customer Support, Admin · End users: Customer, Driver · Technology: IT/Technical Team, Security/Compliance · External: Payment Provider, Notification Provider, Map/Location Provider, Other External Service Providers.

---

# 3. Scope

## 3.1 In-Scope (MVP)

- **Customer:** đăng ký/đăng nhập; cập nhật thông tin cá nhân; nhập điểm đón/điểm đến; chọn loại xe; gửi yêu cầu đặt xe; theo dõi trạng thái chuyến; xem lịch sử chuyến và số tiền đã thanh toán; đánh giá tài xế sau chuyến (rating đơn giản).
- **Driver:** đăng ký hoặc được Operation tạo tài khoản; cập nhật hồ sơ và thông tin phương tiện; chuyển trạng thái sẵn sàng/không sẵn sàng; nhận thông báo chuyến mới và chấp nhận/từ chối; cập nhật trạng thái chuyến (đã đến điểm đón, đã đón khách, đang di chuyển, hoàn thành).
- **Driver Matching:** tìm Driver theo vị trí và trạng thái sẵn sàng (thuật toán cơ bản, chưa tối ưu nâng cao); timeout + reassign khi không phản hồi/từ chối; thông báo Customer khi không tìm được Driver.
- **Pricing & Payment:** tính cước cơ bản theo loại dịch vụ + thông tin chuyến (công thức đơn giản, không surge/dynamic); thanh toán tiền mặt; tích hợp 1 Payment Provider cho thanh toán điện tử (không lưu thông tin thẻ trong CAB); thông báo khi giao dịch thất bại + retry cơ bản.
- **Notification:** thông báo Customer (tiếp nhận yêu cầu, Driver nhận chuyến, Driver đến, hoàn thành chuyến, kết quả thanh toán); thông báo Driver (chuyến mới, thay đổi chuyến đang thực hiện); 1 kênh thông báo, kiến trúc cho phép mở rộng.
- **Operation/Admin:** xem chuyến đang diễn ra và trạng thái Driver; hỗ trợ xử lý chuyến lỗi (thủ công); tra cứu lịch sử giao dịch; phân quyền cơ bản (Admin vs Operation Staff).
- **Non-functional tối thiểu:** xác thực người dùng (Customer, Driver, Admin); kiểm soát truy cập thao tác quản trị nhạy cảm; audit log cơ bản; module payment/notification lỗi độc lập không kéo sập hệ thống.

## 3.2 Out-of-Scope

Báo cáo nâng cao/dashboard BI · đa dạng phương thức thanh toán (ví điện tử, thẻ lưu sẵn, trả sau) · nhiều kênh thông báo đồng thời · matching nâng cao (ML, dự đoán nhu cầu, surge pricing) · đa loại hình dịch vụ (giao hàng, xe ghép, đặt trước theo lịch) · ứng dụng riêng cho Driver/Customer · location tracking nâng cao (ETA chính xác cao, bản đồ realtime chi tiết) · chính sách hủy chuyến phức tạp và phí phạt hủy · tích hợp nhiều Payment/Notification/Map Provider song song.

## 3.3 Assumptions / Ràng buộc nền tảng

- MVP chỉ dùng **1 provider cho mỗi loại** external integration.
- Pricing cơ bản, không dynamic pricing (BRL-028, FR-042).
- Cancellation policy phức tạp ngoài MVP; basic cancellation chưa được chốt `[TBD]`.

---

# 4. Actors & Roles

| Actor | Loại | Vai trò / Quyền chính |
|---|---|---|
| Customer | Primary | Đăng ký, đăng nhập, quản lý profile, tạo booking, theo dõi trip, xem lịch sử trip/payment, retry payment, đánh giá Driver. Chỉ truy cập dữ liệu của chính mình. |
| Driver | Primary | Đăng nhập, quản lý profile và vehicle, set availability, nhận trip request, accept/reject, cập nhật trip status. Chỉ truy cập dữ liệu thuộc chuyến của mình. |
| Operation Staff | Primary | Giám sát active trips và trạng thái Driver, xử lý trip exception trong phạm vi permission, tra cứu lịch sử chuyến/giao dịch, cập nhật hồ sơ/phương tiện Driver theo quyền được cấp. |
| Admin | Primary | Quản lý User, quản lý Role & Permission; quyền quản trị nhạy cảm cao hơn Operation Staff. |
| System (CAB) | System | Validate, matching, timeout/reassign, kiểm tra state transition, tính cước, tạo payment/notification event, ghi audit log. |
| Payment Provider | External | Xử lý thanh toán điện tử, trả kết quả/callback. |
| Notification Provider | External | Gửi notification tới Customer/Driver. |
| Map/Location Provider | External | Cung cấp location/distance data cho matching và tracking. |

- **Generalization (tham khảo):** `User → {Customer, Staff}`, `Staff → {Operation Staff, Admin}`. Không bắt buộc tạo actor `User` trong Use Case Diagram.
- **Use Case theo actor:** Customer: UC-01 Register, UC-02 Login, UC-03 Manage Profile, UC-04 Create Booking, UC-05 Track Trip, UC-06 View Trip History, UC-07 View Payment History, UC-08 Retry Payment, UC-09 Rate Driver · Driver: UC-10 Login, UC-11 Manage Driver Profile, UC-12 Manage Vehicle, UC-13 Set Availability, UC-14 Receive Trip Request, UC-15 Accept/Reject Trip, UC-16 Update Trip Status · Operation: UC-17 Monitor Active Trips, UC-18 Monitor Driver Status, UC-19 Handle Trip Exception, UC-20 View Transaction History · Admin: UC-21 Manage Users, UC-22 Manage Roles & Permissions · Integration: UC-23 Process Electronic Payment, UC-24 Send Notification.
- Map/Location Provider tham gia UC-04 và UC-05, không có standalone use case.

---

# 5. Domain Entities

21 entity cho MVP.

## 5.1 Identity & Access

| Entity | Purpose | Key attributes / Constraints |
|---|---|---|
| User | Tài khoản đăng nhập, định danh chung cho authentication/authorization | Định danh duy nhất (BRL-001); account status active/inactive (BRL-003); credential không lưu plaintext (NFR-034) |
| Role | Vai trò hệ thống | Cơ sở cho RBAC (BRL-002, NFR-026) |
| UserRole | Quan hệ User–Role | Một User có thể có một/nhiều Role |

## 5.2 Customer / Driver / Vehicle

| Entity | Purpose | Key attributes / Constraints |
|---|---|---|
| Customer | Profile nghiệp vụ của khách hàng | 1:1 với User; sở hữu Booking/Trip/Payment/Rating |
| Driver | Profile nghiệp vụ của tài xế | 1:1 với User; availability status; vị trí hiện tại (`current_latitude`, `current_longitude`); chỉ Driver đủ điều kiện mới tham gia matching (BRL-004) |
| Vehicle | Phương tiện của Driver | Phải thuộc đúng Driver; phải có VehicleType hợp lệ |
| VehicleType | Loại xe/dịch vụ | Đầu vào cho pricing và matching |

## 5.3 Booking & Trip

| Entity | Purpose | Key attributes / Constraints |
|---|---|---|
| Booking | Yêu cầu đặt xe do Customer tạo | Bắt buộc: customer, pickup_location, dropoff_location, vehicle_type (BRL-006); id duy nhất (BRL-007, FR-012); ghi nhận thời gian tạo (FR-013); có lifecycle state |
| Trip | Chuyến xe thực tế sau khi matching thành công | 1:1 (hoặc 1:0..1) với Booking; gắn Driver và Vehicle; có state machine riêng; không tồn tại nếu không có Booking hợp lệ (NFR-046) |
| DriverAssignment | Bản ghi phân công Driver, lưu lịch sử matching/reassignment | booking, driver, status (PENDING/ACCEPTED/REJECTED/TIMEOUT); một Booking tối đa 1 assignment active (NFR-053) |
| TripStatusHistory | Lịch sử thay đổi trạng thái Trip | Mỗi status change hợp lệ phải được ghi (AC-06.07) |

> **Lý do tách Booking/Trip:** phân biệt *request* và *actual ride*; xử lý được trường hợp không tìm được Driver; Trip có lịch sử DriverAssignment; Pricing/Payment/Rating gắn với **Trip**.

## 5.4 Location

| Entity | Purpose | Ghi chú |
|---|---|---|
| Location | Địa điểm đón/trả hoặc tọa độ liên quan chuyến | MVP: có thể lưu trực tiếp `pickup_location`/`dropoff_location` trên Booking |
| DriverLocation | Vị trí hiện tại/lịch sử của Driver | MVP: Driver lưu tọa độ hiện tại; bảng lịch sử (`driver_id`, `latitude`, `longitude`, `recorded_at`) chỉ bổ sung khi cần tracking chi tiết |
| LocationProvider | Thông tin Map/Location Provider | |

## 5.5 Pricing & Payment

| Entity | Purpose | Key attributes / Constraints |
|---|---|---|
| PricingRule | Rule/cấu hình tính giá | Công thức cụ thể `[TBD]` |
| Fare | Kết quả tính cước của một Trip | 1:1 với Trip; tạo khi Trip hoàn thành (BRL-027); không duplicate (AC-09.05); lưu đủ thông tin tra soát (BRL-029) |
| Payment | Nghĩa vụ/giao dịch thanh toán của Trip | 1:1 với Trip/Fare (NFR-047); amount, status, payment method (cash/electronic), payment reference |
| PaymentAttempt | Một lần attempt thanh toán (1 Payment có N Attempt) | Cần cho retry: lưu lịch sử từng lần FAILED/SUCCESS |
| PaymentProvider | Provider thanh toán bên ngoài | Xử lý PaymentAttempt |

## 5.6 Notification

| Entity | Purpose |
|---|---|
| Notification | Business notification/event cần gửi |
| NotificationDelivery | Kết quả gửi của một Notification qua một provider (trạng thái gửi — FR-060) |
| NotificationProvider | Provider/kênh notification |

## 5.7 Rating & Audit

| Entity | Purpose | Constraints |
|---|---|---|
| Rating | Đánh giá của Customer cho Driver sau Trip | Tối đa 1 Rating/Trip (BRL-049); chỉ Customer của Trip (BRL-050); chỉ Trip COMPLETED (BRL-048); liên kết đúng Customer–Driver–Trip (BRL-051, NFR-048) |
| AuditLog | Lưu thao tác quan trọng của User/Staff | Tối thiểu: actor, action, entity, entity_id, old_value, new_value, reason, created_at (BRL-052→056, NFR-080) |

## 5.8 Entity KHÔNG thuộc MVP

`Cancellation`, `CancellationFee` (policy chưa chốt/ngoài MVP), `SurgePricing`, `Promotion`, `Wallet`, `SavedPaymentMethod`, `ScheduledBooking`, `RideSharing`, `DeliveryOrder`, `DriverPerformance`, `DemandForecast`, `EmailTemplate`. `OperationAction` chưa tạo ở MVP — dùng `AuditLog` thay thế.

---

# 6. Entity Relationships

```text
USER 1—N USER_ROLE N—1 ROLE ; USER 1—0..1 CUSTOMER ; USER 1—0..1 DRIVER
DRIVER 1—N VEHICLE ; VEHICLE_TYPE 1—N VEHICLE
CUSTOMER 1—N BOOKING ; VEHICLE_TYPE 1—N BOOKING (requested_for)
BOOKING 1—0..1 TRIP ; BOOKING 1—N DRIVER_ASSIGNMENT N—1 DRIVER
TRIP 1—N TRIP_STATUS_HISTORY ; DRIVER 1—N TRIP ; VEHICLE 1—N TRIP
TRIP 1—1 FARE ; PRICING_RULE 1—N FARE
TRIP 1—1 PAYMENT ; PAYMENT 1—N PAYMENT_ATTEMPT ; PAYMENT_PROVIDER 1—N PAYMENT_ATTEMPT
NOTIFICATION 1—N NOTIFICATION_DELIVERY ; NOTIFICATION_PROVIDER 1—N NOTIFICATION_DELIVERY
CUSTOMER 1—N RATING ; DRIVER 1—N RATING ; TRIP 1—0..1 RATING
USER 1—N AUDIT_LOG
```

Ví dụ DriverAssignment history của một Booking: `DA001|BK001|D001|TIMEOUT` → `DA002|BK001|D002|REJECTED` → `DA003|BK001|D003|ACCEPTED`.

---

# 7. Core Business Processes — Tổng quan

```text
Register/Login
  → Create Booking (validate → CREATED → SEARCHING_DRIVER)
  → Driver Matching (candidate → DriverAssignment PENDING → notify Driver)
      Accept → Booking DRIVER_ASSIGNED → Trip activated
      Reject/Timeout → Reassign (loop)
      Hết candidate → NO_DRIVER_FOUND → notify Customer → kết thúc
  → Trip execution (EN_ROUTE → ARRIVED → PICKED_UP → IN_PROGRESS → COMPLETED)
  → Fare calculation → Payment (Cash | Electronic → SUCCESS/FAILED → Retry)
  → Notification tại mỗi milestone → Rate Driver
Operation giám sát và can thiệp thủ công tại các điểm bất thường.
```

---

# 8. Booking

## 8.1 Functional Requirements

- **FR-008/FR-009:** cho phép Customer nhập điểm đón, điểm đến và chọn loại xe/dịch vụ được hỗ trợ.
- **FR-010:** nhận yêu cầu đặt xe và tạo booking tương ứng.
- **FR-011:** kiểm tra các thông tin bắt buộc trước khi tạo booking.
- **FR-012:** tạo mã định danh duy nhất cho mỗi booking/chuyến xe.
- **FR-013:** ghi nhận thời gian tạo booking, Customer, điểm đón, điểm đến, loại xe.
- **FR-014:** xác nhận cho Customer rằng yêu cầu đã được tiếp nhận.
- **FR-015:** hiển thị trạng thái hiện tại của booking cho Customer.
- **FR-016:** ngăn Customer tạo booking không hợp lệ theo business rule được cấu hình.

## 8.2 Workflow: Create Booking (UC-04)

- **Actor:** Customer (primary); System, Driver, Map Provider, Notification Provider (supporting) — **Priority:** Critical
- **Trigger:** Customer submit booking request
- **Preconditions:** Customer đã đăng nhập; account active; pickup hợp lệ; destination hợp lệ; VehicleType hợp lệ
- **Steps:**
  1. Customer nhập pickup location, destination, chọn Vehicle Type và gửi booking request.
  2. System validate request (thông tin bắt buộc) và tạo Booking (`CREATED`).
  3. Booking chuyển `SEARCHING_DRIVER`; System xác định thông tin cần thiết cho matching.
  4. System tìm Driver phù hợp, tạo DriverAssignment (`PENDING`) và gửi trip request cho Driver.
  5. Driver accept → System xác nhận Driver cho Booking (concurrency-safe).
  6. System tạo/activate Trip và thông báo Customer; Customer theo dõi Trip.
- **Alternative flows:** AF-01 Driver Reject → Assignment `REJECTED`, loại Driver khỏi vòng matching hiện tại, tìm Driver tiếp theo · AF-02 Driver Timeout → Assignment `TIMEOUT`, thực hiện reassignment.
- **Exception flow:** EF-01 No Driver Available → Booking `NO_DRIVER_FOUND` → notify Customer → Booking kết thúc.
- **Business Rules:** BRL-006 → BRL-019 · **Exceptions:** BE-001 → BE-005, BE-008, BE-009
- **Postconditions:** Booking ở trạng thái xác định (`DRIVER_ASSIGNED` hoặc `NO_DRIVER_FOUND`); Trip được tạo/activate nếu matching thành công.
- **Related entities:** Customer, Booking, DriverAssignment, Driver, Trip, VehicleType

## 8.3 Input / Output nghiệp vụ

- **Input bắt buộc:** customer (từ authenticated context), pickup location, destination, vehicle type.
- **Validation:** đủ thông tin bắt buộc (BRL-006); pickup/destination hợp lệ; vehicle type hợp lệ; Customer authenticated và active.
- **Output:** booking id duy nhất, booking status, xác nhận tiếp nhận, thông tin theo dõi Trip sau khi assign.

---

# 9. Driver Matching

## 9.1 Functional Requirements

- **FR-017/FR-018:** xác định Driver đang sẵn sàng nhận chuyến và dùng vị trí hiện tại của Driver để xác định Driver phù hợp với booking.
- **FR-019/FR-020:** gửi yêu cầu nhận chuyến tới Driver phù hợp và ghi nhận phản hồi của Driver.
- **FR-021:** xác định yêu cầu đã timeout nếu Driver không phản hồi trong khoảng thời gian được cấu hình.
- **FR-022:** khi Driver từ chối hoặc timeout, thực hiện matching lại với Driver khác.
- **FR-023:** không gửi cùng một booking tới Driver đã từ chối booking đó trong cùng vòng matching, trừ khi có business rule khác được cấu hình.
- **FR-024:** xác nhận Driver đầu tiên đáp ứng hợp lệ theo cơ chế locking/concurrency phù hợp.
- **FR-025/FR-026:** cập nhật booking sang trạng thái đã có Driver khi matching thành công; sang trạng thái không tìm được Driver khi hết Driver phù hợp.
- **FR-027:** thông báo cho Customer khi không tìm được Driver.
- **FR-063/FR-064:** cho phép Driver chuyển trạng thái sẵn sàng / không sẵn sàng nhận chuyến.
- **FR-065/FR-066:** chỉ đưa Driver đang sẵn sàng vào danh sách matching; lưu trạng thái hiện tại của Driver.
- **FR-068:** cập nhật trạng thái Driver phù hợp sau khi Driver nhận/thực hiện/hoàn thành chuyến.

> **Open point `[TBD]`:** giá trị timeout, bán kính tìm Driver, tiêu chí "phù hợp", thứ tự ưu tiên Driver, số vòng reassign.

## 9.2 Workflow: Matching & Reassignment (UC-04 + UC-14)

- **Actor:** System (Matching), Driver — **Trigger:** Booking `SEARCHING_DRIVER`, hoặc assignment trước đó REJECTED/TIMEOUT
- **Precondition:** Booking hợp lệ, đang ở trạng thái matching
- **Steps:**
  1. System xác định candidate list: Driver `AVAILABLE`, đủ điều kiện hồ sơ, phù hợp VehicleType, dựa trên vị trí hiện tại.
  2. System tạo DriverAssignment (`PENDING`) và gửi notification trip request tới Driver được chọn.
  3. System chờ phản hồi trong timeout được cấu hình `[TBD]`; ghi nhận ACCEPTED / REJECTED / TIMEOUT.
  4. REJECTED hoặc TIMEOUT → loại Driver khỏi vòng matching hiện tại → quay lại bước 1.
  5. ACCEPTED → concurrency check → xác nhận Driver → Booking `DRIVER_ASSIGNED` → activate Trip.
  6. Hết candidate → Booking `NO_DRIVER_FOUND` → notify Customer.
- **Business Rules:** BRL-004, BRL-012 → BRL-019 · **Exceptions:** BE-001 → BE-007, BE-009
- **Postconditions:** Booking có Driver xác nhận duy nhất hoặc `NO_DRIVER_FOUND`; toàn bộ assignment được lưu lịch sử.

## 9.3 Workflow: Accept / Reject Trip (UC-15)

- **Actor:** Driver — **Priority:** Critical — **Precondition:** Driver có DriverAssignment `PENDING` hợp lệ
- **Accept flow:** Driver chọn Accept → System kiểm tra Assignment thuộc Driver → kiểm tra Booking còn available → concurrency check (lock/claim Booking) → xác nhận Driver → Assignment `ACCEPTED` → Booking `DRIVER_ASSIGNED` → Trip được activate → Customer được thông báo.
- **Reject flow:** Assignment `REJECTED` → loại Driver khỏi matching cycle hiện tại → tìm Driver tiếp theo.
- **Exceptions:** Concurrent acceptance → chỉ **first valid acceptance** thắng, request đến sau nhận `BOOKING_ALREADY_ASSIGNED` (BE-009, NFR-052 → NFR-056) · Driver không thuộc Assignment → reject action (AC-08.04) · Accept request lặp lại → idempotent, không tạo duplicate Assignment/Trip (AC-08.06).
- **Business Rules:** BRL-015 → BRL-018
- **Postconditions:** Booking có tối đa một assignment `ACCEPTED`; Trip tồn tại khi accept thành công.

## 9.4 Workflow: Receive Trip Request (UC-14)

- **Actor:** Driver — **Steps:** Matching xác định Driver phù hợp → System tạo DriverAssignment → gửi notification → Driver nhận Trip Request → có thể Accept hoặc Reject.
- **Exception:** Notification failure → Assignment vẫn tồn tại, **không rollback matching** (BE-014, BRL-042).
- **Related entities:** Booking, Driver, DriverAssignment, Notification, NotificationDelivery

## 9.5 Workflow: Set Driver Availability (UC-13)

- **Actor:** Driver — **Steps:** Driver chọn trạng thái → System validate Driver account/profile → cập nhật availability → trạng thái mới được dùng cho matching.
- **States:** `OFFLINE` → `AVAILABLE` → `BUSY`
- **Business Rules:** chỉ Driver đủ điều kiện mới được `AVAILABLE` (BRL-004); Driver không available không được đưa vào matching (BRL-012); Driver `BUSY` không được assign Trip mới (AC-07.03); Driver không hợp lệ chuyển Available → reject (AC-07.04).

---

# 10. Trip Lifecycle

## 10.1 Functional Requirements

- **FR-028:** quản lý trạng thái vòng đời của chuyến xe.
- **FR-029 → FR-032:** cho phép Driver cập nhật trạng thái "Đã đến điểm đón", "Đã đón khách", "Đang di chuyển", "Hoàn thành".
- **FR-033:** kiểm tra tính hợp lệ của chuyển đổi trạng thái trước khi cập nhật.
- **FR-034:** cập nhật trạng thái chuyến cho Customer khi trạng thái thay đổi.
- **FR-037/FR-084:** ghi nhận các sự kiện trạng thái quan trọng của chuyến để phục vụ tra cứu.
- **FR-082/FR-083:** lưu lịch sử chuyến của Customer và cho phép Customer xem lịch sử của chính mình.

## 10.2 Workflow: Update Trip Status (UC-16)

- **Actor:** Driver — **Priority:** Critical — **Trigger:** Driver chọn trạng thái mới
- **Precondition:** Trip đang active và Driver là Driver của Trip
- **Steps:**
  1. Driver chọn trạng thái mới; System kiểm tra quyền.
  2. System kiểm tra current status và tính hợp lệ của transition.
  3. System cập nhật Trip và ghi TripStatusHistory.
  4. System tạo notification event; Customer nhận thông tin mới.
- **Business Rules:** BRL-020 → BRL-024
- **Exceptions:** Invalid transition → reject, giữ nguyên trạng thái (BE-017) · duplicate request → idempotent (BE-019, AC-06.08) · Driver mất kết nối khi đang chạy → không tự động kết luận chuyến thất bại (BE-016).
- **Postconditions:** Trip ở trạng thái mới hợp lệ; TripStatusHistory có bản ghi; notification event được tạo.
- **Related entities:** Trip, TripStatusHistory, Driver, Notification

## 10.3 Workflow: Track Trip (UC-05)

- **Actor:** Customer — **Precondition:** Trip thuộc Customer
- **Steps:** Customer mở Trip → System kiểm tra quyền truy cập → trả Trip status → trả Driver/Vehicle information → hiển thị location nếu có → cập nhật khi Trip thay đổi.
- **Thông tin tracking (giới hạn MVP):** Trip status; Driver information; Vehicle information; current location nếu available; basic ETA nếu provider hỗ trợ.
- **Alternative:** Location unavailable → vẫn hiển thị Trip status, không hiển thị location (BE-006, AC-05.04).
- **Exception:** Trip không thuộc Customer → từ chối truy cập (BRL-008, AC-05.05).
- **Business Rules:** BRL-008, BRL-020 → BRL-024

## 10.4 Workflow: View Trip History (UC-06)

- **Actor:** Customer — **Steps:** mở Trip History → System xác định Customer → truy vấn Trip thuộc Customer → trả danh sách → chọn Trip xem chi tiết.
- **Business Rules:** Customer chỉ được xem Trip của mình (BRL-008); Trip detail hiển thị Fare/Payment theo permission (AC-14.05).
- **Related entities:** Customer, Booking, Trip, TripStatusHistory, Fare, Payment

---

# 11. Pricing & Fare

## 11.1 Functional Requirements

- **FR-038:** xác định mức cước dựa trên loại dịch vụ và thông tin chuyến.
- **FR-039/FR-040:** tính cước cuối chuyến khi Driver hoàn thành chuyến và lưu số tiền cước cuối cùng.
- **FR-041:** cung cấp số tiền cần thanh toán cho Customer.
- **FR-042:** không áp dụng surge/dynamic pricing trong MVP.

> **Open point `[TBD]`:** công thức pricing cụ thể; FR-038 cần bổ sung rule chi tiết sau khi Business xác nhận.

## 11.2 Workflow: Calculate Fare

- **Actor:** System — **Trigger:** Trip chuyển `COMPLETED` — **Precondition:** Trip hoàn thành; pricing configuration hợp lệ
- **Steps:** Trip completed → System áp dụng PricingRule theo VehicleType/Service Type và thông tin chuyến → tạo Fare → liên kết Fare với Trip → cung cấp số tiền cho Customer.
- **Business Rules:** BRL-025 → BRL-029
- **Exceptions:** BE-020 không thể tính cước → không xác nhận payment amount, chuyển exception để xử lý · pricing configuration không hợp lệ → không tạo Fare sai và ghi nhận lỗi (AC-09.04) · gọi lại calculation → không tạo duplicate Fare (AC-09.05).
- **Postconditions:** Fare tồn tại, gắn 1:1 với Trip, đủ thông tin tra soát (BRL-029).

---

# 12. Cancellation

- Chính sách hủy chuyến phức tạp và phí hủy: **Out-of-scope MVP**.
- Basic cancellation có nằm trong MVP hay không: `[TBD]` (open point từ FR review và Definition of Done); cancellation policy: `[TBD]`.
- Entity `Cancellation`, `CancellationFee` chưa đưa vào ERD MVP vì policy chưa chốt.
- Booking state machine hiện tại **chưa định nghĩa** trạng thái cancelled; state model cần refine khi Business xác nhận cancellation `[TBD]`.

> Không được tự tạo trạng thái, quy tắc hoặc phí hủy.

---

# 13. Payment

## 13.1 Functional Requirements

- **FR-043:** cho phép Customer lựa chọn thanh toán tiền mặt hoặc thanh toán điện tử.
- **FR-044/FR-045:** gửi yêu cầu thanh toán tới Payment Provider và nhận/xử lý kết quả giao dịch.
- **FR-046/FR-047:** cập nhật trạng thái thành công khi Provider xác nhận thành công; ghi nhận thất bại khi Provider trả kết quả thất bại.
- **FR-048:** thông báo cho Customer khi thanh toán điện tử thất bại.
- **FR-049:** cho phép Customer retry thanh toán theo cơ chế được cấu hình.
- **FR-050:** đảm bảo retry không tạo giao dịch thanh toán trùng cho cùng một nghĩa vụ thanh toán.
- **FR-051:** không lưu trực tiếp thông tin thẻ hoặc thông tin thanh toán nhạy cảm.
- **FR-052:** lưu thông tin tham chiếu giao dịch cần thiết để tra cứu và đối soát.
- **FR-053:** hiển thị lịch sử thanh toán của Customer.

## 13.2 Workflow: Process Electronic Payment (UC-23)

- **Actor:** CAB (System) ↔ Payment Provider — **Trigger:** Customer chọn thanh toán điện tử / retry payment
- **Precondition:** Trip hoàn thành; Fare đã xác định
- **Steps:** CAB tạo PaymentAttempt → gửi payment request tới Provider → Provider xử lý → Provider trả result/callback → CAB verify result → CAB cập nhật PaymentAttempt và Payment → ghi transaction reference → thông báo Customer.
- **Business Rules:** BRL-031 → BRL-036
- **Exceptions:** BE-010 Provider timeout → **không kết luận SUCCESS**, giữ trạng thái phù hợp để retry/reconciliation · BE-012 duplicate callback → idempotent, không tạo duplicate payment · BE-013 callback chậm → vẫn xử lý nếu giao dịch còn hợp lệ.
- **Postconditions:** Payment có trạng thái xác định; transaction reference được lưu; Customer được thông báo kết quả.

## 13.3 Workflow: Cash Payment

- **Actor:** Customer / System — **Precondition:** Trip hoàn thành và Fare hợp lệ
- **Steps:** Customer chọn Cash → cash payment được xác nhận theo cơ chế nghiệp vụ ABC phê duyệt → Payment được ghi nhận → transaction liên kết với Trip và Fare.
- **Business Rules:** BRL-030, BRL-033, BRL-037 · **Exception:** không được tạo duplicate Cash Payment cho cùng nghĩa vụ thanh toán (AC-10.04).
- **`[TBD]`:** cơ chế ghi nhận/xác nhận cash payment (theo phê duyệt của ABC).

## 13.4 Workflow: Retry Payment (UC-08)

- **Actor:** Customer
- **Preconditions:** Trip đã hoàn thành; Fare đã xác định; Payment ở trạng thái `FAILED` hoặc trạng thái cho phép retry
- **Steps:**
  1. Customer chọn Retry Payment; System kiểm tra Payment status (retryable).
  2. System tạo PaymentAttempt mới và gửi request tới Payment Provider.
  3. Provider xử lý và trả kết quả.
  4. System cập nhật PaymentAttempt và Payment, thông báo Customer.
- **Alternative flows:** AF-01 success → Payment `PAID/SUCCESS` · AF-02 failed → Payment giữ `FAILED`, Customer có thể retry nếu còn trong policy.
- **Exception:** EF-01 Provider timeout → không kết luận successful; ghi nhận trạng thái phù hợp; cho phép reconciliation/retry theo policy.
- **Business Rules:** BRL-032 → BRL-037 · **Exceptions:** BE-010 → BE-013
- **Constraints:** Payment đã SUCCESS → không thể retry cùng payment obligation (AC-12.05); retry request gửi nhiều lần → không tạo duplicate PaymentAttempt ngoài policy (AC-12.06).
- **`[TBD]`:** retry limit, retry window, trạng thái cuối của Trip/Payment nếu thất bại vĩnh viễn.

## 13.5 Workflow: View Payment History (UC-07)

- **Actor:** Customer — **Steps:** mở Payment History → System lấy Payment thuộc Customer → hiển thị amount, status, payment reference và Trip liên quan → xem chi tiết Payment.
- **Exception:** Customer không được xem Payment của Customer khác (BRL-008, NFR-028).
- **Related entities:** Customer, Trip, Fare, Payment, PaymentAttempt

---

# 14. Notification

## 14.1 Functional Requirements

- **FR-054 → FR-058:** gửi thông báo khi booking được tiếp nhận, khi Driver nhận chuyến, khi Driver đến điểm đón, khi chuyến hoàn thành, và kết quả thanh toán cho Customer.
- **FR-059:** gửi thông báo chuyến mới cho Driver phù hợp.
- **FR-060 (Should):** ghi nhận trạng thái gửi thông báo phục vụ monitoring/troubleshooting.
- **FR-061:** tách logic nghiệp vụ khỏi Notification Provider qua abstraction/interface.
- **FR-062 (Should):** cho phép thay thế hoặc bổ sung Notification Provider trong tương lai.

## 14.2 Workflow: Send Notification (UC-24)

- **Actor:** System ↔ Notification Provider — **Trigger:** Business event xảy ra
- **Steps:** Business event → CAB tạo Notification → tạo NotificationDelivery → gửi tới Provider → Provider xử lý → CAB cập nhật delivery status.
- **Business event chính:** `BOOKING_RECEIVED`, `DRIVER_ASSIGNED`, `DRIVER_ARRIVED`, `TRIP_COMPLETED`, `PAYMENT_SUCCESS`, `PAYMENT_FAILED`.
- **Notification tới Driver:** chuyến mới (trip request); thay đổi quan trọng liên quan chuyến đang thực hiện.
- **Business Rules:** BRL-038 → BRL-042
- **Exceptions:** Provider lỗi → log/retry, **không rollback** Booking/Trip/Payment (BE-014, BRL-042, NFR-010) · duplicate notification event → idempotency/deduplication (AC-13.09).
- **Postconditions:** Notification và NotificationDelivery được ghi nhận với trạng thái gửi tương ứng.

## 14.3 Notification Matrix (AC-13)

| Event | Người nhận |
|---|---|
| Booking created / received | Customer |
| Driver assigned | Customer |
| New Trip Request | Driver |
| Driver arrived | Customer |
| Trip completed | Customer |
| Payment success / Payment failed | Customer |

---

# 15. Location Tracking

- **FR-035:** cung cấp cho Customer khả năng theo dõi trạng thái chuyến gần realtime.
- **FR-036:** sử dụng Map/Location Provider để hỗ trợ thông tin vị trí phục vụ matching/tracking.
- **FR-067:** hiển thị danh sách và trạng thái Driver cho Operation Staff.
- Matching phải dựa trên vị trí hiện tại của Driver và thông tin vị trí của booking (BRL-013).
- Không lấy được vị trí Driver → không dùng Driver đó cho matching nếu không đáp ứng điều kiện location (BE-006).
- Map Provider lỗi → không làm sập CAB; ghi nhận lỗi, fallback/retry theo cấu hình; chức năng phụ thuộc Map có thể trả degraded response (BE-007, AC-20.07, AC-20.08).
- Location data chỉ dùng cho chức năng nghiệp vụ được phép và phải kiểm soát truy cập (NFR-039, NFR-040).
- **`[TBD]`:** tần suất cập nhật location, mức độ realtime, độ chính xác ETA, retention của location data.

---

# 16. Rating

## 16.1 Functional Requirements

- **FR-078/FR-079:** cho phép Customer đánh giá Driver sau khi chuyến hoàn thành, theo thang điểm được cấu hình `[TBD]`.
- **FR-080:** lưu rating gắn với chuyến và Driver tương ứng.
- **FR-081:** không cho phép Customer đánh giá cùng một chuyến nhiều lần.

## 16.2 Workflow: Rate Driver (UC-09)

- **Actor:** Customer — **Preconditions:** Trip thuộc Customer; Trip đã `COMPLETED`; chưa có Rating cho Trip
- **Steps:** Customer chọn Trip (từ Trip History) → chọn Rating → System validate Trip ownership → kiểm tra Trip status → kiểm tra duplicate Rating → tạo Rating → thông báo thành công.
- **Business Rules:** BRL-048 → BRL-051
- **Exceptions:** Trip chưa completed → reject · Rating đã tồn tại → reject duplicate, chỉ rating hợp lệ đầu tiên được ghi nhận (BE-023) · Trip không thuộc Customer → reject unauthorized (BE-024) · rating ngoài range được phép → reject (AC-15.05).
- **Postconditions:** Rating được lưu, liên kết đúng Customer–Driver–Trip.

---

# 17. Operational / Support Functions

## 17.1 Functional Requirements

- **FR-069 → FR-071:** màn hình cho Operation Staff xem các chuyến đang diễn ra, trạng thái hiện tại của từng chuyến và Driver đang được phân công.
- **FR-072/FR-073:** tra cứu lịch sử chuyến và lịch sử giao dịch.
- **FR-074:** cho phép Operation xử lý các chuyến lỗi theo quyền được cấp.
- **FR-075 (Should):** yêu cầu xác nhận trước các thao tác quản trị có khả năng thay đổi trạng thái chuyến.
- **FR-076/FR-077:** phân biệt quyền Admin và Operation Staff; hạn chế thao tác quản trị nhạy cảm với Operation Staff không có quyền.
- **FR-085 → FR-087:** ghi audit log cho thao tác quản trị quan trọng (tối thiểu: người thực hiện, thời gian, hành động, đối tượng bị tác động); hạn chế quyền truy cập audit log theo role/permission.
- **FR-005:** cho phép Driver/Operation cập nhật hồ sơ và thông tin phương tiện theo quyền được cấp.

## 17.2 Workflow: Monitor Active Trips (UC-17)

- **Actor:** Operation Staff — **Steps:** mở Active Trips → System lấy các Trip chưa kết thúc → hiển thị Trip status, Customer, Driver, Vehicle, Location nếu available → chọn Trip xem chi tiết.
- **Exceptions:** Location unavailable → vẫn hiển thị Trip · external provider lỗi → hiển thị trạng thái dữ liệu phù hợp.
- **Business Rules:** BRL-002, BRL-043

## 17.3 Workflow: Monitor Driver Status (UC-18)

- **Actor:** Operation Staff — **Steps:** mở Driver Monitoring → System lấy Driver status → hiển thị `AVAILABLE`/`BUSY`/`OFFLINE` và location nếu có → xem Driver detail.
- **Acceptance:** Driver thay đổi availability → monitoring phản ánh trạng thái mới (AC-16.04); Trip đổi status → monitoring phản ánh theo cơ chế realtime/near-realtime được thống nhất (AC-16.03).
- **Related entities:** Driver, Vehicle, Trip

## 17.4 Workflow: Handle Trip Exception (UC-19)

- **Actor:** Operation Staff (human fallback) — **Preconditions:** đã authenticated; có permission phù hợp
- **Steps:**
  1. Operation chọn Trip exception từ danh sách Trip bất thường; System hiển thị Trip detail.
  2. Operation xem status history và xác định nguyên nhân.
  3. Operation chọn action được phép; System kiểm tra permission.
  4. System thực hiện action (cập nhật trạng thái/dữ liệu) và ghi AuditLog.
  5. System thông báo các actor liên quan nếu cần.
- **Business Rules:** BRL-044 → BRL-047, BRL-052 → BRL-056
- **Exceptions:** Unauthorized action → reject, ghi security log nếu cần (BE-018) · Trip không thể tự động xử lý → chuyển Operation xử lý thủ công (BE-022, EP-05).
- **Postconditions:** Trip state được cập nhật; AuditLog chứa actor, action, target, timestamp, reason, result.
- **Related entities:** Trip, TripStatusHistory, AuditLog, User · **`[TBD]`:** Operation được phép override những trạng thái nào; có cần approval không.

## 17.5 Workflow: View Transaction History (UC-20)

- **Actor:** Operation Staff — **Steps:** mở Transaction History → System xác thực permission → nhập filter → System tìm Payment/PaymentAttempt → hiển thị kết quả → xem transaction detail.
- **Related entities:** Payment, PaymentAttempt, Trip, Fare, PaymentProvider

## 17.6 Workflow: Manage Users (UC-21) / Manage Roles & Permissions (UC-22)

- **Actor:** Admin
- **UC-21 Steps:** mở User Management → System hiển thị User list → tìm User → xem detail → thực hiện action được phép → System validate permission → cập nhật User → ghi AuditLog. **Exceptions:** không đủ permission → reject; User không tồn tại → not found.
- **UC-22 Steps:** mở Role Management → hiển thị Roles → chọn Role → cập nhật permission → System validate → lưu thay đổi → ghi AuditLog.
- **Business Rules:** không được cấp permission vượt quá quyền của actor hiện tại; mọi thay đổi quyền phải được audit (BRL-005, BRL-046).

---

# 18. Business Rules

## 18.1 Account & Access

- **BRL-001** Unique Account: mỗi tài khoản người dùng phải được định danh duy nhất trong hệ thống.
- **BRL-002** Role-based Access: người dùng chỉ được thực hiện các chức năng phù hợp với role được cấp.
- **BRL-003** Active Account: chỉ tài khoản đang hoạt động mới được sử dụng các chức năng nghiệp vụ tương ứng.
- **BRL-004** Driver Eligibility: chỉ Driver đủ điều kiện theo trạng thái hồ sơ/hoạt động mới được tham gia matching.
- **BRL-005** Admin Privilege: thao tác quản trị nhạy cảm chỉ được thực hiện bởi role có quyền tương ứng.

## 18.2 Booking

- **BRL-006** Valid Booking: booking chỉ được tạo khi đủ thông tin bắt buộc: Customer, điểm đón, điểm đến, loại xe.
- **BRL-007** Unique Booking: mỗi booking phải có mã định danh duy nhất.
- **BRL-008** Booking Ownership: Customer chỉ được xem booking thuộc tài khoản của mình.
- **BRL-009** Booking Lifecycle: booking phải tuân thủ lifecycle trạng thái được định nghĩa của CAB.
- **BRL-010** One Active Booking: một Customer không được tạo nhiều booking đang hoạt động nếu business chưa cho phép. `[UNCONFIRMED]`
- **BRL-011** Immutable Trip Data: sau khi Driver nhận chuyến, thông tin quan trọng như điểm đón/điểm đến không được tự ý thay đổi nếu chưa có business rule hỗ trợ.

## 18.3 Driver Matching

- **BRL-012** Available Driver: chỉ Driver đang sẵn sàng nhận chuyến mới được đưa vào matching.
- **BRL-013** Location-based Matching: matching phải dựa trên vị trí hiện tại của Driver và thông tin vị trí của booking.
- **BRL-014** Driver Eligibility: Driver phải phù hợp với loại xe/dịch vụ Customer yêu cầu.
- **BRL-015** No Duplicate Assignment: một Driver không được đồng thời nhận nhiều chuyến vượt khả năng phục vụ được cấu hình.
- **BRL-016** First Valid Acceptance: booking chỉ được xác nhận cho một Driver hợp lệ đầu tiên đáp ứng yêu cầu.
- **BRL-017** Reassignment: Driver từ chối hoặc không phản hồi trong thời gian quy định thì booking phải được đưa trở lại matching.
- **BRL-018** Exclude Rejected Driver: Driver đã từ chối booking không được nhận lại booking đó trong cùng vòng matching.
- **BRL-019** Matching Exhaustion: khi không còn Driver phù hợp, booking phải chuyển sang trạng thái không tìm được Driver.

> `[TBD]`: bán kính matching, tiêu chí ưu tiên Driver, timeout, số lần reassign.

## 18.4 Trip Execution

- **BRL-020** Valid Status Transition: chuyến chỉ được chuyển trạng thái nếu trạng thái hiện tại cho phép.
- **BRL-021** Driver-controlled Trip Status: Driver là actor chính cập nhật trạng thái thực tế của chuyến.
- **BRL-022** Sequential Trip Lifecycle: Assigned → En Route → Arrived → Picked Up → In Progress → Completed.
- **BRL-023** Completion Authority: chỉ Driver hoặc actor có quyền tương ứng mới được xác nhận chuyến hoàn thành.
- **BRL-024** Completed Trip Immutability: sau khi hoàn thành, không được tự ý thay đổi thông tin nghiệp vụ quan trọng nếu không có quyền override.

## 18.5 Pricing

- **BRL-025** Configured Pricing: cước phải được tính theo công thức pricing được Business phê duyệt. `[TBD — công thức]`
- **BRL-026** Service-based Pricing: giá cước phụ thuộc tối thiểu vào loại dịch vụ/loại xe và thông tin chuyến.
- **BRL-027** Final Fare: cước cuối cùng được xác định khi chuyến hoàn thành.
- **BRL-028** No Dynamic Pricing in MVP: MVP không áp dụng surge/dynamic pricing.
- **BRL-029** Fare Traceability: phải lưu thông tin cần thiết để giải thích/tra soát số tiền cước đã tính.

## 18.6 Payment

- **BRL-030** Supported Payment Methods: MVP hỗ trợ tiền mặt và một phương thức thanh toán điện tử qua Payment Provider.
- **BRL-031** No Sensitive Payment Storage: CAB không lưu trực tiếp thông tin thẻ/tài khoản thanh toán nhạy cảm.
- **BRL-032** Payment Reference: mỗi giao dịch điện tử phải có thông tin tham chiếu để đối soát.
- **BRL-033** Payment Idempotency: một nghĩa vụ thanh toán không được tạo nhiều giao dịch thành công do retry hoặc duplicate request.
- **BRL-034** Successful Payment: chỉ giao dịch được Provider xác nhận thành công mới được ghi nhận là thanh toán thành công.
- **BRL-035** Failed Payment: giao dịch thất bại phải được ghi nhận và thông báo Customer.
- **BRL-036** Payment Retry: Customer có thể retry thanh toán theo chính sách retry được cấu hình. `[TBD — policy]`
- **BRL-037** Cash Payment: thanh toán tiền mặt phải được ghi nhận theo cơ chế nghiệp vụ được ABC phê duyệt. `[TBD]`

> `[TBD]`: số lần retry tối đa, thời gian retry, trạng thái của chuyến khi payment thất bại.

## 18.7 Notification

- **BRL-038** Event-based Notification: notification được kích hoạt dựa trên business event quan trọng.
- **BRL-039** Customer Notification: Customer phải nhận thông báo tại các milestone được quy định.
- **BRL-040** Driver Notification: Driver phải nhận thông báo khi có booking phù hợp hoặc thay đổi quan trọng liên quan chuyến.
- **BRL-041** Provider Abstraction: business logic không phụ thuộc trực tiếp vào một Notification Provider cụ thể.
- **BRL-042** Notification Failure Isolation: notification thất bại không làm thất bại transaction nghiệp vụ chính.

## 18.8 Operation

- **BRL-043** Operational Visibility: Operation Staff phải xem được chuyến đang diễn ra và trạng thái Driver.
- **BRL-044** Exception Handling: Operation được xử lý ngoại lệ trong phạm vi quyền được cấp.
- **BRL-045** Controlled Override: thao tác override trạng thái phải giới hạn theo role/permission.
- **BRL-046** Auditability: thao tác override hoặc xử lý exception quan trọng phải được audit log.
- **BRL-047** No Unauthorized Modification: Operation không được thay đổi dữ liệu ngoài phạm vi quyền hạn.

## 18.9 Rating

- **BRL-048** Completed Trip Only: Customer chỉ được đánh giá sau khi chuyến đã hoàn thành.
- **BRL-049** One Rating per Trip: một Customer chỉ được đánh giá một lần cho một chuyến.
- **BRL-050** Trip Ownership: chỉ Customer thực hiện chuyến mới được đánh giá Driver của chuyến đó.
- **BRL-051** Rating Association: rating phải được liên kết với đúng Trip và Driver.

## 18.10 Audit & Data

- **BRL-052** Audit Critical Actions: các thao tác quan trọng phải được ghi audit log.
- **BRL-053** Audit Actor: audit log phải xác định được ai thực hiện thao tác.
- **BRL-054** Audit Timestamp: audit log phải lưu thời điểm thực hiện thao tác.
- **BRL-055** Audit Target: audit log phải xác định đối tượng/dữ liệu bị tác động.
- **BRL-056** Access-controlled Audit: chỉ role được cấp quyền mới được xem audit log.
- **BRL-057** Data Retention: dữ liệu phải được lưu theo chính sách retention được ABC phê duyệt. `[TBD]`

## 18.11 Business Rule Priority

`Must` = bắt buộc cho MVP · `Should` = nên có trong MVP, có thể defer · `Future` = không thuộc MVP.
Các rule về **matching timeout, cancellation, pricing formula, payment retry limit, location tracking frequency, data retention** đang ở trạng thái **TBD / Business Confirmation Required**.

---

# 19. State Machines

## 19.1 Booking

**States:** `CREATED`, `SEARCHING_DRIVER`, `DRIVER_ASSIGNED`, `NO_DRIVER_FOUND` (+ các trạng thái trong business status model hợp nhất — xem 19.5)

| Transition | Trigger | Condition | Actor |
|---|---|---|---|
| `[*]` → CREATED | Booking được tạo | Booking data hợp lệ (BRL-006) | Customer/System |
| CREATED → SEARCHING_DRIVER | Bắt đầu matching | Booking hợp lệ | System |
| SEARCHING_DRIVER → DRIVER_ASSIGNED | Driver accept hợp lệ đầu tiên | Booking còn available; concurrency check pass (BRL-016) | System |
| SEARCHING_DRIVER → NO_DRIVER_FOUND | Hết Driver phù hợp | Matching exhaustion (BRL-019) | System |
| DRIVER_ASSIGNED → IN_PROGRESS | Chuyến bắt đầu thực hiện | Theo trip lifecycle | System/Driver |
| DRIVER_ASSIGNED → COMPLETED | Chuyến kết thúc | Theo trip lifecycle | System/Driver |
| NO_DRIVER_FOUND → `[*]` | Kết thúc booking | — | System |

> Trạng thái cancelled và các trạng thái trung gian khác: `[TBD]`.

## 19.2 Driver Assignment

**States:** `PENDING`, `ACCEPTED`, `REJECTED`, `TIMEOUT`

| Transition | Trigger | Condition | Actor |
|---|---|---|---|
| `[*]` → PENDING | System gửi trip request | Driver nằm trong candidate list | System |
| PENDING → ACCEPTED | Driver accept | Booking còn available; first valid acceptance (BRL-016) | Driver |
| PENDING → REJECTED | Driver reject | Assignment thuộc Driver | Driver |
| PENDING → TIMEOUT | Hết thời gian chờ phản hồi `[TBD]` | Driver không phản hồi trong timeout | System |
| ACCEPTED / REJECTED / TIMEOUT → `[*]` | Kết thúc assignment | REJECTED/TIMEOUT kích hoạt reassignment (BRL-017) | System |

## 19.3 Trip

**States:** `DRIVER_ASSIGNED`, `DRIVER_EN_ROUTE`, `DRIVER_ARRIVED`, `PASSENGER_PICKED_UP`, `IN_PROGRESS`, `COMPLETED`

| Transition | Trigger | Condition | Actor |
|---|---|---|---|
| `[*]` → DRIVER_ASSIGNED | Driver accept được xác nhận | Assignment `ACCEPTED` | System |
| DRIVER_ASSIGNED → DRIVER_EN_ROUTE | Driver di chuyển tới điểm đón | Transition hợp lệ (BRL-020) | Driver |
| DRIVER_EN_ROUTE → DRIVER_ARRIVED | Cập nhật "Đã đến điểm đón" | Trip đang EN_ROUTE | Driver |
| DRIVER_ARRIVED → PASSENGER_PICKED_UP | Cập nhật "Đã đón khách" | Trip đang ARRIVED | Driver |
| PASSENGER_PICKED_UP → IN_PROGRESS | Bắt đầu di chuyển | Passenger đã được đón | Driver |
| IN_PROGRESS → COMPLETED | Cập nhật "Hoàn thành" | Trip đang IN_PROGRESS; completion authority (BRL-023) | Driver |
| COMPLETED → `[*]` | Kết thúc trip | Fare được tính (BRL-027) | System |

**Cấm** transition nhảy cóc, ví dụ `DRIVER_ASSIGNED → COMPLETED`, nếu business chưa định nghĩa cơ chế override (EP-04). Mỗi transition hợp lệ phải ghi TripStatusHistory; duplicate update không tạo duplicate business event.

## 19.4 Payment

**States:** `PENDING`, `PROCESSING`, `SUCCESS`, `FAILED`

| Transition | Trigger | Condition | Actor |
|---|---|---|---|
| `[*]` → PENDING | Nghĩa vụ thanh toán được tạo sau khi Fare xác định | Fare tồn tại | System |
| PENDING → PROCESSING | Gửi payment request tới Provider (hoặc xử lý cash) | PaymentAttempt được tạo | System |
| PROCESSING → SUCCESS | Provider xác nhận thành công | BRL-034 | Payment Provider/System |
| PROCESSING → FAILED | Provider trả về thất bại | BRL-035 | Payment Provider/System |
| FAILED → PROCESSING | Customer retry | Payment retryable; theo retry policy `[TBD]` | Customer/System |
| SUCCESS → `[*]` | Hoàn tất | Không cho phép retry sau SUCCESS (AC-12.05) | System |

**Provider timeout:** không được tự động chuyển SUCCESS; giữ trạng thái phù hợp cho retry/reconciliation (BE-010).

## 19.5 Business Status Model hợp nhất (Booking/Trip/Payment)

```text
CREATED → SEARCHING_DRIVER → DRIVER_ASSIGNED | NO_DRIVER_FOUND
DRIVER_ASSIGNED → DRIVER_EN_ROUTE → DRIVER_ARRIVED → PASSENGER_PICKED_UP → IN_PROGRESS → COMPLETED
COMPLETED → PAYMENT_PENDING
PAYMENT_PENDING → PAID | PAYMENT_FAILED
PAYMENT_FAILED → PAYMENT_RETRY → PAYMENT_PENDING
PAYMENT_FAILED → PAYMENT_PENDING (Retry later)
NO_DRIVER_FOUND → [*] ; PAID → [*]
```

> **Inconsistency cần chốt `[TBD]`:** SRS gốc tồn tại song song hai cách mô hình hóa — (a) status model hợp nhất với `PAYMENT_PENDING/PAID/PAYMENT_FAILED/PAYMENT_RETRY`, và (b) state machine tách rời Booking/Trip/Payment với `PENDING/PROCESSING/SUCCESS/FAILED`. Cần chốt bộ status chính thức trước khi generate API; không tự hợp nhất hoặc đặt tên mới.

## 19.6 Driver Availability

**States:** `OFFLINE`, `AVAILABLE`, `BUSY`

| Transition | Trigger | Condition | Actor |
|---|---|---|---|
| OFFLINE → AVAILABLE | Driver bật sẵn sàng | Driver đủ điều kiện (BRL-004) | Driver |
| AVAILABLE → BUSY | Driver được assign/đang thực hiện chuyến | Assignment ACCEPTED | System |
| AVAILABLE → OFFLINE | Driver tắt sẵn sàng | — | Driver |
| BUSY → AVAILABLE / OFFLINE | Sau khi hoàn thành chuyến | FR-068 | System/Driver |

Driver `BUSY` hoặc `OFFLINE` không được đưa vào matching (BRL-012, AC-04.02, AC-07.03).

---

# 20. External Integrations

## 20.1 Payment Provider

- **Mục đích:** xử lý thanh toán điện tử. **Hướng gọi:** CAB → Provider (payment request); Provider → CAB (result/callback).
- **Dữ liệu trao đổi:** payment request (amount, payment reference), payment result, transaction reference. **Không** lưu raw card data tại CAB (BRL-031, NFR-033).
- **Success:** Payment → SUCCESS/PAID; ghi transaction reference; notify Customer. **Failure:** ghi nhận FAILED; notify Customer; cho phép retry theo policy `[TBD]`.
- **Timeout:** không kết luận SUCCESS; giữ trạng thái phù hợp cho retry/reconciliation (BE-010). **Duplicate callback:** idempotent (BE-012, NFR-020); callback đến muộn vẫn xử lý nếu giao dịch còn hợp lệ (BE-013).
- **Dependency:** MVP 1 provider; qua abstraction (NFR-057, NFR-064); hỗ trợ cơ chế xác minh kết quả giao dịch (NFR-063).

## 20.2 Notification Provider

- **Mục đích:** gửi notification tới Customer và Driver. **Hướng gọi:** CAB → Provider; CAB cập nhật delivery status.
- **Dữ liệu trao đổi:** notification event/nội dung, người nhận, kết quả gửi.
- **Failure:** ghi nhận lỗi, log/retry; **không rollback** business transaction chính (BE-014, BRL-042, NFR-010).
- **Dependency:** MVP 1 kênh (push hoặc SMS — `[TBD]`); kiến trúc cho phép bổ sung kênh/provider (FR-061, FR-062, BRL-041).

## 20.3 Map / Location Provider

- **Mục đích:** cung cấp location/distance data phục vụ matching và tracking. **Hướng gọi:** CAB → Provider trong flow Booking/Matching/Tracking.
- **Failure:** không làm sập CAB; ghi nhận lỗi, fallback/retry theo cấu hình; chức năng phụ thuộc Map có thể trả degraded response (BE-007, AC-20.07, AC-20.08).
- **Dependency:** MVP 1 provider; không hard-code vào Booking business logic (AC-22.05).

## 20.4 Nguyên tắc chung cho integration

- **NFR-057/NFR-058:** integration qua interface/adapter abstraction; business logic không phụ thuộc trực tiếp implementation của provider cụ thể.
- **NFR-059/NFR-060:** external API failure phải được xử lý rõ ràng, không crash business service; integration phải hỗ trợ timeout.
- **NFR-061 (Should):** có thể retry với lỗi tạm thời theo policy phù hợp.
- **NFR-062:** request tới provider phải có correlation/reference identifier để trace.
- **NFR-063/NFR-064:** payment integration hỗ trợ xác minh kết quả giao dịch; có thể thay thế provider mà không thay đổi business logic chính.

---

# 21. Authentication & Authorization

## 21.1 Functional Requirements

- **FR-001:** cho phép Customer đăng ký tài khoản bằng thông tin định danh được cấu hình cho MVP `[TBD]`.
- **FR-002/FR-003:** cho phép đăng nhập bằng thông tin xác thực hợp lệ; xác thực trước khi cấp quyền truy cập chức năng.
- **FR-004:** cho phép Customer cập nhật thông tin cá nhân cơ bản.
- **FR-006/FR-007:** phân biệt vai trò Customer, Driver, Operation Staff, Admin khi đăng nhập; từ chối truy cập nếu không có quyền tương ứng.

## 21.2 Workflow: Register Account (UC-01)

- **Actor:** Customer — **Trigger:** Customer chọn Register — **Preconditions:** chưa có tài khoản tương ứng; thông tin đăng ký đầy đủ
- **Steps:** mở Register → nhập thông tin → System validate dữ liệu → kiểm tra tài khoản đã tồn tại → tạo User → tạo Customer profile → kích hoạt tài khoản theo cơ chế xác thực được cấu hình `[TBD]` → thông báo thành công.
- **Alternative:** AF-01 account đã tồn tại → không tạo tài khoản mới → thông báo Customer. **Exception:** EF-01 invalid registration data → từ chối request, trả validation error.
- **Postcondition:** Customer account được tạo và có thể dùng để login. **Related entities:** User, Customer

## 21.3 Workflow: Login (UC-02 / UC-10)

- **Actor:** Customer / Driver / Operation Staff / Admin
- **Steps:** nhập credential → System xác thực credential → kiểm tra account status → xác định role → tạo authenticated session/token → truy cập chức năng tương ứng.
- **Exceptions:** EF-01 invalid credential → từ chối login · EF-02 inactive account → từ chối login, không cấp session/token.
- **Business Rules:** BRL-002, BRL-003, BRL-005 · **`[TBD]`:** phương thức đăng ký/đăng nhập (email, phone hay khác), cơ chế authentication, session/token expiration.

## 21.4 Workflow: Manage Profile / Vehicle (UC-03, UC-11, UC-12)

- **Actor:** Customer / Driver — **Steps:** mở Profile → System hiển thị thông tin hiện tại → Actor cập nhật → System validate → lưu thay đổi → thông báo thành công.
- **Vehicle (UC-12):** Driver thêm/cập nhật Vehicle → validate → lưu → Vehicle liên kết với Driver. Rule: Vehicle phải thuộc Driver tương ứng và có VehicleType hợp lệ.
- **Exception:** invalid information → không lưu, trả validation error.

## 21.5 Authorization Rules (bắt buộc cho API)

- **NFR-025:** mọi chức năng yêu cầu authentication phải xác thực người dùng trước khi xử lý.
- **NFR-026/NFR-027:** áp dụng RBAC; User chỉ truy cập dữ liệu thuộc phạm vi quyền của mình.
- **NFR-028/NFR-029:** Customer không truy cập dữ liệu Customer khác; Driver không truy cập dữ liệu ngoài phạm vi chuyến của mình.
- **NFR-030:** Operation Staff và Admin có quyền khác nhau với chức năng quản trị nhạy cảm.
- **NFR-035/NFR-036:** authorization kiểm tra tại server-side (không chỉ dựa vào UI); thao tác quản trị nhạy cảm phải được audit.

---

# 22. Non-functional Requirements

## 22.1 Performance

- **NFR-001:** đáp ứng request nghiệp vụ thông thường trong thời gian phù hợp SLA được thống nhất.
- **NFR-002 (Should):** API synchronous thông thường mục tiêu **P95 ≤ 2 giây**, không gồm thời gian chờ external provider.
- **NFR-003:** booking không phụ thuộc trực tiếp vào thời gian phản hồi của Notification Provider.
- **NFR-004 (Should):** gửi notification xử lý asynchronous khi phù hợp.
- **NFR-005:** tra cứu lịch sử chuyến/giao dịch có response time phù hợp SLA vận hành.
- **NFR-006:** xử lý đồng thời nhiều booking mà không làm sai lệch trạng thái booking hoặc Driver.
- `[TBD]`: concurrent users, requests/second, booking/second.

## 22.2 Availability

- **NFR-007:** CAB hoạt động liên tục trong thời gian cung cấp dịch vụ.
- **NFR-008:** lỗi một external provider không làm CAB ngừng hoạt động hoàn toàn.
- **NFR-009/NFR-010:** Payment Provider không khả dụng không làm gián đoạn theo dõi/quản lý Trip; Notification Provider không khả dụng không làm thất bại Booking/Trip transaction.
- **NFR-011 (Should):** có cơ chế retry/recovery cho integration lỗi tạm thời.
- **NFR-012:** có health check để phát hiện service/component không hoạt động.
- `[TBD]`: availability target (ví dụ 99.9%) chưa được xác nhận thành SLA chính thức.

## 22.3 Scalability

- **NFR-013/NFR-014:** module có tải cao scale độc lập; Booking, Matching, Payment, Notification, Tracking không bắt buộc scale cùng nhau.
- **NFR-015:** hỗ trợ tăng số lượng Customer/Driver/Trip mà không thay đổi lớn kiến trúc tổng thể.
- **NFR-016 (Should):** thành phần asynchronous scale theo queue/message workload.
- **NFR-017:** thêm instance không tạo duplicate processing cho transaction nghiệp vụ quan trọng.

## 22.4 Reliability & Fault Tolerance

- **NFR-018:** lỗi một component không làm mất dữ liệu nghiệp vụ đã ghi nhận thành công.
- **NFR-019/NFR-020:** operation có khả năng retry phải idempotent; payment callback xử lý idempotent để tránh ghi nhận thanh toán nhiều lần.
- **NFR-021:** driver acceptance xử lý concurrency-safe; một booking không được xác nhận đồng thời cho nhiều Driver.
- **NFR-022/NFR-023 (Should):** xử lý message/event thất bại mà không mất event quan trọng; có cơ chế recovery sau gián đoạn service/integration.
- **NFR-024:** đảm bảo transaction consistency cho các thay đổi trạng thái quan trọng.

## 22.5 Security

- **NFR-031/NFR-032:** communication client–backend được bảo vệ bằng encryption phù hợp; sensitive data được bảo vệ khi lưu trữ và truyền tải theo chính sách security của ABC.
- **NFR-033:** CAB không lưu trực tiếp thông tin thẻ/payment credential nhạy cảm.
- **NFR-034:** credential/password không lưu plaintext.
- **NFR-037 (Should):** bảo vệ API khỏi request không hợp lệ hoặc abuse cơ bản.
- (NFR-025 → NFR-030, NFR-035, NFR-036: xem mục 21.5)

## 22.6 Privacy & Data Protection

- **NFR-038:** hạn chế thu thập dữ liệu cá nhân ở mức cần thiết cho nghiệp vụ.
- **NFR-039/NFR-040:** dữ liệu vị trí chỉ dùng cho chức năng nghiệp vụ được phép; kiểm soát quyền truy cập PII và location data.
- **NFR-041/NFR-042:** có chính sách retention cho Trip, Payment, Location, Audit Log; hết retention xử lý theo chính sách của ABC (Should).
- **NFR-043:** truy cập dữ liệu nhạy cảm từ Operation/Admin phải audit được.
- `[TBD]`: retention period và yêu cầu compliance cụ thể.

## 22.7 Data Integrity & Consistency

- **NFR-044/NFR-045:** mỗi Booking, Trip, Payment, Rating có identifier duy nhất; đảm bảo referential integrity giữa các entity liên quan.
- **NFR-046:** Trip không tồn tại nếu không có Booking hợp lệ theo business model đã thống nhất.
- **NFR-047/NFR-048:** Payment liên kết đúng Trip/Fare; Rating liên kết đúng Customer, Driver, Trip.
- **NFR-049/NFR-050:** không tạo duplicate Payment do repeated request/callback; không tạo duplicate Trip do repeated booking request.
- **NFR-051:** thay đổi trạng thái quan trọng phải nhất quán với lịch sử trạng thái.

## 22.8 Concurrency

- **NFR-052/NFR-053:** xử lý đồng thời nhiều Driver phản hồi cho cùng một Booking; một Booking chỉ có tối đa một Driver assignment active.
- **NFR-054/NFR-055:** đảm bảo atomicity khi xác nhận Driver; request duplicate/concurrent không làm sai trạng thái Booking/Trip.
- **NFR-056:** payment processing không tạo duplicate successful transaction khi concurrent retry.

## 22.9 Observability & Monitoring

- **NFR-065/NFR-066:** ghi application log cho lỗi và sự kiện quan trọng; hỗ trợ correlation ID để trace request qua nhiều service.
- **NFR-067/NFR-068:** monitoring tình trạng các service chính; theo dõi lỗi của Payment/Notification/Map Provider.
- **NFR-069/NFR-070 (Should):** phát hiện payment failure tăng bất thường; theo dõi matching failure và timeout.
- **NFR-071:** audit log tách biệt mục đích sử dụng với application log.

## 22.10 Maintainability & Extensibility

- **NFR-072/NFR-073:** thiết kế theo module/component rõ ràng; business logic tách khỏi external integration logic.
- **NFR-074:** Payment, Notification và Map Provider có abstraction riêng.
- **NFR-075 (Should):** codebase có coding convention và documentation cần thiết.
- **NFR-076:** business rule quan trọng phải có automated test.
- **NFR-077 (Should):** các API chính phải có API documentation.
- **NFR-078:** thay đổi một provider không yêu cầu thay đổi rộng khắp business logic.

## 22.11 Auditability

- **NFR-079/NFR-080:** audit các thao tác quản trị quan trọng; audit log xác định được actor, action, target, timestamp.
- **NFR-081/NFR-082:** audit log hỗ trợ tra cứu phục vụ investigation và không dễ bị sửa/xóa bởi user thông thường.
- **NFR-083:** thao tác manual override phải có audit trail.

## 22.12 Backup & Recovery

- **NFR-084/NFR-085:** backup dữ liệu nghiệp vụ quan trọng theo chính sách ABC; có khả năng restore từ backup.
- **NFR-086:** database backup được bảo vệ khỏi truy cập trái phép.
- **NFR-087 (Should):** quy trình recovery được kiểm thử định kỳ. `[TBD]`: RPO/RTO.

## 22.13 API & Interoperability

- **NFR-088/NFR-089:** API dùng format dữ liệu thống nhất và trả HTTP status/error code nhất quán.
- **NFR-090:** API có cơ chế validation input.
- **NFR-091/NFR-092 (Should):** API có versioning strategy phù hợp và pagination cho API trả về danh sách lớn.
- **NFR-093:** API không expose sensitive internal information trong error response.

---

# 23. Exceptions & Edge Cases

## 23.1 Business Exceptions

| ID | Exception | Điều kiện | Business Handling |
|---|---|---|---|
| BE-001 | Không tìm được Driver | Không có Driver phù hợp | Booking → `NO_DRIVER_FOUND`, thông báo Customer |
| BE-002 | Driver không phản hồi | Không phản hồi trong timeout | Booking quay lại matching, tìm Driver khác |
| BE-003 | Driver từ chối | Driver reject | Loại Driver khỏi vòng matching hiện tại, tìm Driver khác |
| BE-004 | Hết Driver khả dụng | Tất cả Driver phù hợp reject/timeout | Kết thúc matching, thông báo Customer không tìm được xe |
| BE-005 | Driver mất kết nối | Mất kết nối khi đang xử lý booking | Xác định trạng thái booking, xử lý theo timeout/reassign phù hợp |
| BE-006 | Location không khả dụng | Không lấy được vị trí Driver | Không dùng Driver đó cho matching nếu không đáp ứng điều kiện location |
| BE-007 | Map Provider lỗi | Provider không phản hồi | Không làm sập CAB; ghi nhận lỗi, fallback/retry theo cấu hình |
| BE-008 | Booking duplicate | Customer gửi cùng request nhiều lần | Ngăn tạo nhiều booking ngoài ý muốn |
| BE-009 | Concurrent Driver Acceptance | Nhiều Driver accept gần đồng thời | Chỉ một Driver được xác nhận; request còn lại bị từ chối/đánh dấu hết hiệu lực |
| BE-010 | Payment Provider timeout | Provider không phản hồi | Không tự kết luận thành công; giữ trạng thái phù hợp để retry/reconciliation |
| BE-011 | Payment failed | Provider trả về thất bại | Ghi nhận failed, thông báo Customer, cho phép retry theo policy |
| BE-012 | Payment duplicate callback | Provider gửi callback nhiều lần | Xử lý idempotent, không tạo nhiều payment thành công |
| BE-013 | Payment callback chậm | Callback đến sau request timeout | Vẫn xử lý callback nếu giao dịch còn hợp lệ |
| BE-014 | Notification Provider lỗi | Không gửi được notification | Ghi nhận lỗi; không rollback business transaction chính |
| BE-015 | Customer mất kết nối | Mất mạng khi booking/tracking | Booking/Trip tiếp tục theo trạng thái server; Customer xem lại khi kết nối lại |
| BE-016 | Driver mất kết nối khi đang chạy | Không gửi được update | Không tự kết luận chuyến thất bại; Operation có thể kiểm tra và xử lý |
| BE-017 | Invalid status transition | Yêu cầu chuyển trạng thái không hợp lệ | Từ chối thao tác, giữ nguyên trạng thái hiện tại |
| BE-018 | Unauthorized operation | User thực hiện chức năng ngoài quyền | Từ chối request và ghi log phù hợp |
| BE-019 | Trip completion conflict | Nhiều request hoàn thành cùng một chuyến | Chỉ một request hợp lệ được ghi nhận; duplicate phải idempotent |
| BE-020 | Pricing calculation error | Không thể tính cước | Không xác nhận payment amount; chuyển exception để xử lý |
| BE-021 | Payment pending sau khi Trip hoàn thành | Trip completed nhưng payment chưa hoàn tất | Trip và Payment quản lý như trạng thái độc lập; không làm mất dữ liệu chuyến |
| BE-022 | Operation cần can thiệp | Trip ở trạng thái bất thường không thể tự xử lý | Operation xử lý thủ công theo quyền; phải có audit log |
| BE-023 | Rating duplicate | Customer gửi rating nhiều lần | Chỉ rating hợp lệ đầu tiên được ghi nhận |
| BE-024 | Rating cho trip không thuộc Customer | Customer đánh giá trip của người khác | Từ chối thao tác |
| BE-025 | Service unavailable | External provider tạm thời không hoạt động | Cô lập lỗi provider, duy trì các chức năng không phụ thuộc provider đó nếu có thể |

## 23.2 Exception Handling Principles

- **EP-01 Không làm mất trạng thái nghiệp vụ:** khi lỗi integration hoặc lỗi tạm thời, ưu tiên bảo toàn trạng thái/dữ liệu nghiệp vụ thay vì rollback toàn bộ workflow nếu không cần thiết.
- **EP-02 External Failure Isolation:** lỗi Payment/Notification/Map Provider không được làm CAB ngừng hoạt động hoàn toàn (hỗ trợ BG5/BR-12).
- **EP-03 Idempotency:** bắt buộc cho booking creation, driver acceptance, trip completion, payment, payment callback, notification event.
- **EP-04 State Consistency:** mọi thay đổi trạng thái phải kiểm tra dựa trên trạng thái hiện tại của entity; không nhảy trạng thái khi chưa có cơ chế override được định nghĩa.
- **EP-05 Manual Intervention:** khi hệ thống không tự xử lý được, case phải chuyển tới Operation Staff, không để dữ liệu ở trạng thái không xác định.
- **EP-06 Auditability:** thao tác xử lý exception thủ công phải có audit log tối thiểu: Who, When, What, Target, Reason, Result.

---

# 24. TBD / Unconfirmed Requirements

| # | Hạng mục | Trạng thái |
|---|---|---|
| 1 | Phương thức đăng ký/đăng nhập (email, phone hoặc khác) và cơ chế authentication | [TBD] |
| 2 | Cơ chế kích hoạt/xác thực tài khoản khi đăng ký | [TBD] |
| 3 | Session/token expiration | [TBD] |
| 4 | Bán kính tìm Driver, tiêu chí "phù hợp", thứ tự ưu tiên Driver | [TBD] |
| 5 | Driver response timeout (accept/reject) | [TBD] |
| 6 | Số vòng reassign tối đa / thời gian tối đa để tìm Driver | [TBD] |
| 7 | Khả năng phục vụ tối đa đồng thời của một Driver (BRL-015) | [TBD] |
| 8 | One Active Booking — business có cho phép nhiều booking active không (BRL-010) | [UNCONFIRMED] |
| 9 | Công thức pricing chính xác (BRL-025, FR-038) | [TBD] |
| 10 | Basic cancellation có thuộc MVP không; cancellation policy và phí hủy | [TBD] |
| 11 | Payment retry limit và retry window | [TBD] |
| 12 | Trạng thái cuối của Trip/Payment nếu payment thất bại vĩnh viễn | [TBD] |
| 13 | Payment timeout với Provider | [TBD] |
| 14 | Cơ chế ghi nhận/xác nhận cash payment được ABC phê duyệt (BRL-037) | [TBD] |
| 15 | Kênh notification MVP: Push hay SMS | [TBD] |
| 16 | Notification delivery SLA | [TBD] |
| 17 | Tần suất cập nhật location, mức độ realtime, độ chính xác ETA | [TBD] |
| 18 | Thang điểm rating được cấu hình (FR-079) | [TBD] |
| 19 | Operation được phép override những trạng thái nào; có cần approval không | [TBD] |
| 20 | Data retention cho trip, location, payment, audit log (BRL-057, NFR-041) | [TBD] |
| 21 | Performance: P95/P99 response time, requests/second, booking/second, concurrent users | [TBD] |
| 22 | Availability/uptime SLA | [TBD] |
| 23 | RTO / RPO | [TBD] |
| 24 | Bộ status chính thức: status model hợp nhất vs state machine tách rời (xem 19.5) | [TBD] |
| 25 | Hai hệ thống đánh số FR song song: FR-001→FR-087 (chi tiết) và FR-01→FR-22 (nhóm chức năng trong RTM) | [UNCONFIRMED] |
| 26 | Hai hệ thống đánh số NFR song song: NFR-001→NFR-093 (chi tiết) và NFR-01→NFR-08 (nhóm trong RTM) | [UNCONFIRMED] |

> Các mục trên **không được** biến thành giá trị cụ thể ở bước generate API.

---

# 25. Traceability

## 25.1 Business Goal → Business Requirement

BG1: BR-01, BR-02, BR-05 · BG2: BR-01, BR-02, BR-03, BR-05 · BG3: BR-04, BR-06, BR-08 · BG4: BR-09 · BG5: BR-12 · BG6: BR-06, BR-13 · BG7: BR-07, BR-10, BR-11.

## 25.2 Business Requirement → Functional Requirement (chi tiết)

BR-01: FR-001→FR-016 · BR-02: FR-017→FR-020, FR-024→FR-026 · BR-03: FR-021→FR-023 · BR-04: FR-028→FR-037 · BR-05: FR-038→FR-042 · BR-06: FR-043→FR-049 · BR-07: FR-050→FR-052 · BR-08: FR-054→FR-062 · BR-09: FR-069→FR-075 · BR-10: FR-006, FR-007, FR-076, FR-077 · BR-11: FR-084→FR-087 · BR-12: FR-061, FR-062 + yêu cầu kiến trúc/NFR liên quan · BR-13: FR-061, FR-062 + abstraction cho Payment/Map Provider.

## 25.3 BR → FR (nhóm, dùng trong RTM) → UC → AC

| BR | FR (nhóm) | Use Case | Acceptance Criteria |
|---|---|---|---|
| BR-01 | FR-01 Customer Registration, FR-02 User Authentication, FR-03 Create Booking | UC-01, UC-02, UC-04 | AC-01.*, AC-02.*, AC-03.* |
| BR-02 | FR-04 Driver Matching | UC-04, UC-14 | AC-04.*, AC-08.* |
| BR-03 | FR-05 Driver Timeout & Reassignment | UC-04, UC-15 | AC-03.05→AC-03.07, AC-04.* |
| BR-04 | FR-06 Trip Status Tracking, FR-07 Trip Status Management | UC-05, UC-16 | AC-05.*, AC-06.* |
| BR-05 | FR-08 Fare Calculation | UC-04 / Pricing | AC-09.* |
| BR-06 | FR-09 Cash Payment, FR-10 Electronic Payment, FR-12 Payment Retry | UC-08, UC-23, Cash payment flow | AC-10.*, AC-11.*, AC-12.* |
| BR-07 | FR-11 Payment Data Protection | UC-23 | AC-11.08, AC-NFR-10 |
| BR-08 | FR-13 Notification Management | UC-14, UC-16, UC-24 | AC-13.* |
| BR-09 | FR-14 Active Trip Monitoring, FR-15 Driver Monitoring, FR-16 Trip Exception Handling, FR-17 Transaction History | UC-17→UC-20 | AC-16.*, AC-17.* |
| BR-10 | FR-18 RBAC | UC-02, UC-21, UC-22 | AC-02.*, AC-18.* |
| BR-11 | FR-19 Audit Logging | UC-19, UC-21, UC-22 | AC-19.* |
| BR-12 | FR-20 Independent Failure Handling, FR-21 Idempotency & Concurrency | UC-04, UC-15, UC-23, UC-24 | AC-20.*, AC-21.* |
| BR-13 | FR-22 Provider Abstraction | UC-23, UC-24 | AC-22.* |

## 25.4 Use Case → Entity

UC-01: User, Customer · UC-02/UC-10: User, Role · UC-03/UC-11: User, Customer/Driver · UC-04: Customer, Booking, DriverAssignment, Driver, Trip, VehicleType · UC-05: Trip, TripStatusHistory, Driver, Vehicle · UC-06: Customer, Booking, Trip · UC-07: Customer, Trip, Fare, Payment, PaymentAttempt · UC-08: Payment, PaymentAttempt, PaymentProvider · UC-09: Customer, Driver, Trip, Rating · UC-12: Driver, Vehicle, VehicleType · UC-13: Driver · UC-14: Booking, DriverAssignment, Notification, NotificationDelivery · UC-15: Booking, DriverAssignment, Driver, Trip · UC-16: Trip, TripStatusHistory, Notification · UC-17: Trip, Driver · UC-18: Driver, Vehicle · UC-19: Trip, TripStatusHistory, AuditLog, User · UC-20: Payment, PaymentAttempt, Trip, Fare, PaymentProvider · UC-21: User, Role, AuditLog · UC-22: Role, UserRole, AuditLog · UC-23: Payment, PaymentAttempt, PaymentProvider · UC-24: Notification, NotificationDelivery, NotificationProvider.

## 25.5 NFR (nhóm) → BR/FR → Validation

NFR-01 Performance ← BR-01, BR-02, BR-04 ← FR-03, FR-04, FR-06 → Performance Test · NFR-02 Authentication & Authorization ← BR-01, BR-10 ← FR-02, FR-18 → Security Test · NFR-03 Data Integrity ← BR-05, BR-06, BR-12 ← FR-08→FR-12, FR-21 → Integration/Data Test · NFR-04 Availability & Resilience ← BR-12 ← FR-20, FR-21 → Failure/Resilience Test · NFR-05 Realtime Tracking ← BR-04 ← FR-06, FR-07 → Integration Test · NFR-06 Payment Security ← BR-07, BR-10 ← FR-10, FR-11, FR-18 → Security Test · NFR-07 Auditability ← BR-11 ← FR-19 → Audit Test · NFR-08 Extensibility ← BR-13 ← FR-22 → Architecture Review.

## 25.6 Use Case Priority

- **Core business flow:** UC-01 → UC-02 → UC-04 → UC-14 → UC-15 → UC-16 → UC-05 → Payment (UC-07/UC-23) → UC-09.
- **Supporting flow:** UC-03, UC-06, UC-07, UC-08, UC-11, UC-12, UC-13.
- **Operational flow:** UC-17, UC-18, UC-19, UC-20, UC-21, UC-22.
- **Integration flow:** UC-23, UC-24.

---

# 26. API-Relevant Summary

## 26.1 Actors (API consumers)

`Customer`, `Driver`, `Operation Staff`, `Admin`, `Payment Provider` (callback), `Notification Provider`, `Map/Location Provider`, `System`.

## 26.2 Resources

`User`, `Role`, `UserRole`, `Customer`, `Driver`, `Vehicle`, `VehicleType`, `Booking`, `Trip`, `DriverAssignment`, `TripStatusHistory`, `DriverLocation`, `PricingRule`, `Fare`, `Payment`, `PaymentAttempt`, `PaymentProvider`, `Notification`, `NotificationDelivery`, `NotificationProvider`, `Rating`, `AuditLog`.

## 26.3 Main Operations (chỉ nghiệp vụ đã tồn tại trong SRS)

- **Identity & Access:** register customer account (UC-01) · login/authenticate (UC-02, UC-10) · view/update customer profile (UC-03) · view/update driver profile (UC-11) · create/update vehicle (UC-12) · manage users (UC-21) · manage roles & permissions (UC-22).
- **Booking & Matching:** create booking (UC-04) · view booking status (FR-015) · match/search driver (FR-017→FR-019) · receive trip request (UC-14) · accept trip / reject trip (UC-15) · handle assignment timeout & reassign (FR-021, FR-022) · mark booking `NO_DRIVER_FOUND` (FR-026) · set driver availability (UC-13).
- **Trip:** update trip status — en route / arrived / picked up / in progress / completed (UC-16, FR-029→FR-032) · track trip (UC-05) · view trip history (UC-06) · view trip status history (FR-037, FR-084).
- **Pricing & Payment:** calculate fare on trip completion (FR-039) · provide payable amount (FR-041) · select payment method cash/electronic (FR-043) · process electronic payment (UC-23) · receive/process payment result & callback (FR-045, BE-012, BE-013) · record cash payment (BRL-037) · retry payment (UC-08) · view payment history (UC-07) · view transaction history — Operation (UC-20).
- **Notification:** send notification for business event (UC-24) · record notification delivery status (FR-060).
- **Rating:** submit rating for completed trip (UC-09).
- **Operation & Audit:** monitor active trips (UC-17) · monitor driver status (UC-18) · handle trip exception / manual intervention (UC-19) · write audit log (FR-085) · query audit log theo permission (FR-087).

> SRS **không** định nghĩa endpoint nào; API design là bước sau.

## 26.4 State-dependent Operations

| Operation | Điều kiện trạng thái bắt buộc |
|---|---|
| Matching / gửi trip request | Booking = `SEARCHING_DRIVER` |
| Accept trip | Assignment = `PENDING` **và** Booking chưa được assign; first valid acceptance thắng |
| Reject trip | Assignment = `PENDING` |
| Timeout assignment | Assignment = `PENDING` quá timeout `[TBD]` |
| Driver vào candidate list | Driver = `AVAILABLE` và đủ điều kiện (BRL-004, BRL-012, BRL-014) |
| Update trip → `DRIVER_EN_ROUTE` | Trip = `DRIVER_ASSIGNED` |
| Update trip → `DRIVER_ARRIVED` | Trip = `DRIVER_EN_ROUTE` |
| Update trip → `PASSENGER_PICKED_UP` | Trip = `DRIVER_ARRIVED` |
| Update trip → `IN_PROGRESS` | Trip = `PASSENGER_PICKED_UP` |
| Update trip → `COMPLETED` | Trip = `IN_PROGRESS`; actor có completion authority (BRL-023) |
| Calculate fare | Trip = `COMPLETED`; chưa có Fare |
| Process payment | Fare đã xác định; Payment ở trạng thái cho phép |
| Retry payment | Payment = `FAILED` hoặc trạng thái retryable; **không** khi đã SUCCESS |
| Submit rating | Trip = `COMPLETED`, thuộc Customer, chưa có Rating |
| Track trip / view trip | Trip thuộc Customer (hoặc actor có permission) |
| Operation override | Actor có permission; phải ghi AuditLog |

## 26.5 Important Business Rules cho API

- **AuthN/AuthZ:** BRL-001, BRL-002, BRL-003, BRL-005; NFR-025→NFR-030, NFR-035.
- **Booking validation & ownership:** BRL-006→BRL-011.
- **Matching & assignment:** BRL-012→BRL-019; NFR-052→NFR-055.
- **Trip transitions:** BRL-020→BRL-024; EP-04.
- **Pricing:** BRL-025→BRL-029. **Payment:** BRL-030→BRL-037; NFR-020, NFR-049, NFR-056.
- **Notification:** BRL-038→BRL-042. **Operation/override:** BRL-043→BRL-047. **Rating:** BRL-048→BRL-051. **Audit/data:** BRL-052→BRL-057.
- **Idempotency bắt buộc (EP-03):** booking creation, driver acceptance, trip completion, payment, payment callback, notification event.

## 26.6 Known Error / Conflict Behaviors (đã có trong SRS)

| Tình huống | Hành vi nghiệp vụ |
|---|---|
| Driver khác đã accept trước | Trả `BOOKING_ALREADY_ASSIGNED`; chỉ một Driver được assign |
| Invalid status transition | Từ chối, giữ nguyên trạng thái (BE-017) |
| Unauthorized operation | Từ chối request + ghi log (BE-018) |
| Duplicate booking request | Không tạo duplicate Booking ngoài behavior đã định nghĩa (BE-008, AC-21.01) |
| Duplicate accept request | Idempotent, không tạo duplicate Assignment/Trip (AC-08.06, AC-21.02) |
| Duplicate trip completion | Chỉ một request được ghi nhận, phần còn lại idempotent (BE-019) |
| Duplicate payment callback | Không tạo duplicate Payment (BE-012, AC-21.04) |
| Duplicate rating | Reject; chỉ rating hợp lệ đầu tiên được ghi nhận (BE-023) |
| Rating ngoài range cho phép | Reject (AC-15.05) |
| Rating trip không thuộc Customer | Reject (BE-024) |
| Payment provider timeout | Không kết luận SUCCESS (BE-010, AC-11.05) |
| Location/Map provider lỗi | Degraded response, không làm sập Booking (BE-006, BE-007) |
| Notification provider lỗi | Không rollback Booking/Trip/Payment (BE-014, AC-13.08) |
| Error response | Không expose sensitive internal information (NFR-093) |

## 26.7 External Dependencies

| Provider | CAB gọi | Gọi lại CAB | Dữ liệu chính |
|---|---|---|---|
| Payment Provider | Payment request (từ PaymentAttempt) | Payment result / callback | amount, payment reference, transaction reference, result status |
| Notification Provider | Send notification | Delivery result (nếu có) | event type, recipient, delivery status |
| Map/Location Provider | Location/distance query | — | tọa độ, khoảng cách, ETA (nếu hỗ trợ) |

Mọi integration phải qua abstraction, có timeout, correlation/reference id và không làm crash business service (NFR-057→NFR-064).

## 26.8 API Cross-cutting Requirements

Format dữ liệu thống nhất và error code nhất quán (NFR-088, NFR-089) · validation input server-side (NFR-090, FR-011) · versioning (NFR-091) và pagination cho list API lớn (NFR-092) · authorization kiểm tra server-side (NFR-035) · correlation ID cho tracing (NFR-066) · audit log cho administrative/override action (NFR-079→NFR-083) · idempotency cho operation retryable (NFR-019, NFR-020, EP-03).

## 26.9 TBD ảnh hưởng trực tiếp tới API design

- Bộ status chính thức của Booking/Trip/Payment (19.5) — ảnh hưởng enum trạng thái và điều kiện chuyển trạng thái.
- Cancellation có thuộc MVP hay không — ảnh hưởng operation và state.
- Driver response timeout, số vòng reassign — ảnh hưởng hành vi bất đồng bộ của matching.
- Payment retry limit/window và trạng thái cuối khi thất bại — ảnh hưởng điều kiện retry.
- Cơ chế authentication và session/token expiration — ảnh hưởng auth scheme.
- Thang điểm rating — ảnh hưởng validation của rating input.
- Location update frequency/realtime mechanism — ảnh hưởng thiết kế tracking.
- Pricing formula — ảnh hưởng dữ liệu đầu vào/đầu ra của fare.
- Data retention — ảnh hưởng khả năng truy vấn lịch sử.
