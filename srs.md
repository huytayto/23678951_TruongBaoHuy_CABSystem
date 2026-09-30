# SOFTWARE REQUIREMENTS SPECIFICATION (SRS)
## HỆ THỐNG NỀN TẢNG ĐẶT XE CÔNG NGHỆ CAB (CAB PLATFORM)

--------------------------------------------------------------------------------

## MỤC LỤC
1. **NGỮ CẢNH NGHIỆP VỤ & BUSINESS PROBLEM (BUSINESS CONTEXT & PROBLEM)**
2. **STAKEHOLDERS & STAKEHOLDER MATRIX**
3. **MỤC TIÊU NGHIỆP VỤ (BUSINESS GOALS - BG)**
4. **PHẠM VI HỆ THỐNG (SYSTEM SCOPE)**
5. **YÊU CẦU NGHIỆP VỤ (BUSINESS REQUIREMENTS - BR)**
6. **QUY TRÌNH NGHIỆP VỤ (BUSINESS PROCESS - BP)**
7. **YÊU CẦU CHỨC NĂNG (FUNCTIONAL REQUIREMENTS - FR)**
8. **QUY TẮC NGHIỆP VỤ & XỬ LÝ NGOẠI LỆ (BUSINESS RULES & EXCEPTIONS)**
9. **MÔ HÌNH MIỀN DỮ LIỆU & THỰC THỂ (DOMAIN MODEL & ENTITIES)**
10. **YÊU CẦU PHI CHỨC NĂNG & KIẾN TRÚC MICROSERVICES (NFR & MSA ARCHITECTURE)**
11. **USE CASES & MÔ TẢ CHI TIẾT USE CASE**
12. **TIÊU CHÍ CHẤM NHẬN (ACCEPTANCE CRITERIA - AC)**
13. **MA TRẬN TRUY XUẤT YÊU CẦU (REQUIREMENTS TRACEABILITY MATRIX - RTM)**
14. **PHỤ LỤC: DANH MỤC API ENDPOINTS & QUY CHUẨN KỸ THUẬT**
15. **NHẬT KÝ THAY ĐỔI TÀI LIỆU (CHANGE LOG)**

--------------------------------------------------------------------------------

### BƯỚC 1. NGỮ CẢNH NGHIỆP VỤ VÀ BUSINESS PROBLEM

#### 1.1 Business Context
**CAB Platform** là hệ thống nền tảng số hóa và tự động hóa toàn bộ vòng đời chuyến xe công nghệ của doanh nghiệp vận tải ABC: Đăng ký/Đăng nhập → Tạo yêu cầu đặt xe → Phân công tài xế (Driver Matching) → Thực hiện chuyến đi (Trip Execution) → Cập nhật tọa độ thời gian thực (Real-time Tracking) → Tính cước tự động (Fare Calculation) → Thanh toán (Cash / Electronic Payment) → Thông báo (Notification) → Đánh giá (Rating).

Hệ thống được xây dựng theo kiến trúc **Microservices Architecture (MSA)**, bao gồm API Gateway đóng vai trò làm điểm truy cập duy nhất (Single Point of Entry), các dịch vụ độc lập (`Auth Service`, `Customer Service`, `Driver Service`, `Booking Service`, `Matching Service`, `Trip Service`, `Payment Service`, `Notification Service`) kết hợp với cơ chế giao tiếp đồng bộ (REST/gRPC) và bất đồng bộ qua Message Broker (Kafka/RabbitMQ). Hệ thống kết nối 3 nhóm External Provider chính: Payment Provider, Notification Provider, và Map/Location Provider.

#### 1.2 Business Problem
1. **Thao tác thủ công & Tổng đài quá tải:** Booking và phân công tài xế trước đây phụ thuộc vào tổng đài thủ công, dẫn đến thời gian chờ đợi kéo dài và tỷ lệ thất bại cao trong giờ cao điểm.
2. **Thiếu thông tin realtime:** Khách hàng và Vận hành không theo dõi được vị trí tài xế, trạng thái chuyến đi và tiến trình thanh toán theo thời gian thực.
3. **Quản lý phân tán:** Dữ liệu chuyến đi, lịch sử giao dịch và hồ sơ tài xế không được tập trung, gây khó khăn cho việc tra soát, hỗ trợ khách hàng và kiểm toán.
4. **Kiến trúc Monolith cũ không đáp ứng mở rộng:** Kiến trúc đơn khối không thể scale độc lập các thành phần có tải cao (như Tracking, Matching) và dễ gây sụp đổ toàn bộ hệ thống khi một module gặp sự cố.

--------------------------------------------------------------------------------

### BƯỚC 2. STAKEHOLDERS & STAKEHOLDER MATRIX

#### 2.1 Danh sách Stakeholders
* **Business:** Ban Giám đốc / Sponsor, Phòng Tài chính - Kế toán (Finance/Accounting).
* **Operational:** Quản trị viên hệ thống (Admin), Nhân viên vận hành (Operation Staff), Bộ phận Hỗ trợ khách hàng (Customer Support).
* **End Users:** Khách hàng (Customer), Tài xế (Driver).
* **Technology & Security:** Đội ngũ Phát triển Phần mềm (IT/Technical Team), An toàn thông tin & Tuân thủ (Security & Compliance), Hệ thống CAB (System).
* **External Providers:** Payment Provider (Cổng thanh toán), Notification Provider (Dịch vụ Push/SMS), Map/Location Provider (Dịch vụ Bản đồ/Tọa độ).

#### 2.2 Stakeholder Matrix
| Stakeholder | Loại Actor | Vai trò & Quyền hạn chính | BG liên quan | Use Case tham gia |
| :--- | :--- | :--- | :--- | :--- |
| **Customer** | Primary | Đăng ký, đăng nhập, quản lý profile, vị trí đón/trả, đặt xe, hủy chuyến, theo dõi realtime, xem lịch sử chuyến/thanh toán, retry thanh toán, đánh giá tài xế. Chỉ truy cập dữ liệu cá nhân. | BG1, BG2, BG3 | UC-01, UC-02, UC-03, UC-04, UC-05, UC-06, UC-07, UC-08, UC-09, UC-27 |
| **Driver** | Primary | Đăng ký tài khoản, gửi hồ sơ/phương tiện, bật/tắt Online/Offline, cập nhật tọa độ vị trí, nhận/chấp nhận/từ chối chuyến xe, cập nhật 5 trạng thái chuyến đi, xác nhận nhận tiền mặt. | BG2, BG3 | UC-10, UC-11, UC-12, UC-13, UC-14, UC-15, UC-16, UC-25, UC-28 |
| **Operation Staff** | Primary | Giám sát danh sách chuyến đi active, xem trạng thái và tọa độ tài xế, xử lý ngoại lệ chuyến đi (override có kiểm soát), tra cứu lịch sử giao dịch. | BG4 | UC-17, UC-18, UC-19, UC-20 |
| **Admin** | Primary | Quản lý User, phân quyền Role & Permission, duyệt/từ chối hồ sơ tài xế mới đăng ký, xem Audit Log toàn hệ thống. | BG4, BG7 | UC-21, UC-22, UC-26 |
| **Finance / Accounting** | Primary | Tra cứu báo cáo doanh thu, đối soát giao dịch thanh toán điện tử/tiền mặt, xử lý hoàn tiền/khiếu nại cước. | BG4, BG7 | UC-20 |
| **System (CAB)** | System | Routing API, xác thực JWT, matching tuần tự theo bán kính 1km, kiểm tra trạng thái hợp lệ, tính cước tự động, phát sinh event Kafka/RabbitMQ, ghi Audit Log. | BG1, BG2, BG5 | UC-04, UC-23, UC-24 |
| **Payment Provider** | External | Xử lý giao dịch thanh toán điện tử, trả về kết quả callback/webhook bất đồng bộ. | BG6 | UC-23 |
| **Notification Provider**| External | Gửi thông báo Push Notification / SMS tới ứng dụng Customer và Driver. | BG6 | UC-24 |
| **Map/Location Provider**| External | Cung cấp dịch vụ tính khoảng cách, định tuyến (Routing) và gợi ý địa điểm. | BG6 | UC-04, UC-05, UC-28 |

--------------------------------------------------------------------------------

### BƯỚC 3. MỤC TIÊU NGHIỆP VỤ (BUSINESS GOALS - BG)

| ID | Business Goal | Chỉ số đo lường (KPI Target) | BR liên quan |
| :--- | :--- | :--- | :--- |
| **BG1** | **Tự động hóa vòng đời chuyến xe:** Số hóa 100% quy trình đặt xe, tìm tài xế, tính cước và thanh toán không qua thủ công. | Tỷ lệ tự động hóa > 98%; Thời gian tạo booking < 3 giây. | BR-01, BR-02, BR-05 |
| **BG2** | **Tối ưu hóa tỷ lệ đáp ứng chuyến (Fulfillment Rate):** Phân công tài xế thông minh theo bán kính tọa độ 1km và tự động chuyển tài xế khi timeout/từ chối. | Tỷ lệ ghép chuyến thành công > 90%; Thời gian ghép tài xế trung bình < 15 giây. | BR-01, BR-02, BR-03, BR-05 |
| **BG3** | **Nâng cao trải nghiệm người dùng:** Cho phép theo dõi hành trình realtime, thanh toán minh bạch (tiền mặt/online), đánh giá chuyến đi và cho phép hủy chuyến hợp lệ. | Chỉ số hài lòng CSAT > 4.5/5; Tỷ lệ sự cố thanh toán < 0.5%. | BR-04, BR-06, BR-08, BR-14 |
| **BG4** | **Tập trung hóa quản lý vận hành & Kiểm toán:** Giám sát tập trung chuyến đi, tài xế, quy trình duyệt hồ sơ tài xế và ghi log toàn bộ thao tác nhạy cảm. | 100% thao tác quản trị được ghi Audit Log; Thời gian xử lý exception < 2 phút. | BR-09, BR-11, BR-15 |
| **BG5** | **Kiến trúc tin cậy & Độc lập chịu lỗi (Fault Tolerance):** Thiết kế Microservices cô lập lỗi, sự cố của Payment/Notification không làm gián đoạn chuyến đi. | Độ sẵn sàng Uptime ≥ 99.9%; Tải tính toán scale độc lập. | BR-12 |
| **BG6** | **Tích hợp linh hoạt (Extensibility):** Cho phép bổ sung nhà cung cấp thanh toán, thông báo, bản đồ qua Adapter Pattern mà không sửa lõi nghiệp vụ. | Thời gian tích hợp Provider mới < 3 ngày làm việc. | BR-06, BR-13 |
| **BG7** | **An toàn thông tin & Tuân thủ:** Bảo vệ dữ liệu cá nhân (PII), mã hóa mật khẩu, kiểm soát truy cập RBAC, chống các lỗ hổng OWASP Top 10. | 0 lỗi bảo mật nghiêm trọng (SQLi, XSS, JWT Tampering, Unauthenticated Access). | BR-07, BR-10, BR-11 |

--------------------------------------------------------------------------------

### BƯỚC 4. PHẠM VI HỆ THỐNG (SYSTEM SCOPE)

#### 4.1 In Scope (MVP)
1. **Quản lý Tài khoản & Định danh (Identity & Access):** Đăng ký/Đăng nhập Customer, Đăng ký Driver (kèm OTP/Hồ sơ phương tiện), Duyệt hồ sơ Driver bởi Admin, Cấp JWT Token, Phân quyền RBAC (Customer, Driver, Operation, Admin).
2. **Quản lý Tài xế & Vị trí (Driver & Location Management):** Bật/tắt trạng thái Online/Offline; Cập nhật tọa độ vị trí tài xế liên tục; Tra cứu danh sách tài xế xung quanh tọa độ theo bán kính 1km có phân trang (`page`, `limit`).
3. **Quản lý Đặt xe & Phân công (Booking & Dispatching):** Tạo yêu cầu đặt xe; Tìm tài xế xung quanh (bán kính 1km); Điều phối tuần tự (Sequential Dispatch) có Timeout (15s); Tự động chuyển tài xế tiếp theo khi từ chối/timeout; Thông báo khi không tìm thấy tài xế.
4. **Hủy chuyến đi (Trip Cancellation):** Cho phép Customer/Driver hủy chuyến khi chưa đón khách, yêu cầu lý do hủy, chuyển trạng thái `CANCELED`, cập nhật tài xế về `AVAILABLE` và thông báo cho các bên.
5. **Thực hiện Chuyến đi & Tracking (Trip Execution & Tracking):** Cập nhật 5 trạng thái chuyến đi (`DRIVER_ASSIGNED` → `DRIVER_EN_ROUTE` → `DRIVER_ARRIVED` → `PASSENGER_PICKED_UP` → `IN_PROGRESS` → `COMPLETED`); Cập nhật tọa độ chuyến đi; Theo dõi tiến trình gần realtime; Tra cứu danh sách booking của Customer có phân trang (`page`, `limit`).
6. **Tính cước & Thanh toán (Pricing & Payment):** Tính cước tự động dựa trên khoảng cách và loại xe; Hỗ trợ Tiền mặt (Driver xác nhận) và Thanh toán điện tử online (Callback/Webhook xử lý idempotent); Cho phép Retry thanh toán khi thất bại.
7. **Thông báo & Đánh giá (Notification & Rating):** Gửi thông báo sự kiện qua Notification Service; Khách hàng đánh giá sao (1-5 star) và nhận xét sau khi chuyến hoàn thành.
8. **Giám sát & Quản trị Vận hành (Operation & Admin):** Màn hình giám sát các chuyến đi active, giám sát tài xế, xử lý ngoại lệ chuyến đi, tra cứu lịch sử giao dịch, ghi Audit Log hệ thống.
9. **Kiến trúc Microservices & Hạ tầng Docker:** API Gateway (Routing, Rate Limiting 429, JWT Auth), Microservices độc lập (Auth, Customer, Driver, Booking, Matching, Trip, Payment, Notification), Message Broker Kafka/RabbitMQ cho async events, Docker Compose orchestrating toàn bộ container, API Health Check (`/health`, `/ready`, `/health/services`).
10. **An toàn thông tin (Security Requirements):** Mã hóa mật khẩu at-rest (Bcrypt), chống SQL Injection, chống XSS Output Escape, kiểm tra JWT Signature Tampering (trả 401), kiểm soát quyền truy cập API 403 Forbidden, cơ chế Chống Replay Attack / Idempotency.

#### 4.2 Out of Scope (Không thuộc phạm vi MVP)
* Dynamic / Surge Pricing (Giá biến đổi theo giờ cao điểm/thời tiết).
* Nhiều phương thức thanh toán ví điện tử cùng lúc (chỉ tích hợp 1 Online Payment Provider trong MVP).
* Hỗ trợ đặt xe trước (Scheduled Booking), Xe ghép (Ride Sharing), Giao hàng (Delivery).
* Lưu trữ thông tin thẻ ngân hàng trực tiếp tại hệ thống CAB (PCI-DSS compliance do Provider quản lý).
* Dashboard phân tích BI/Báo cáo nâng cao quá phức tạp.

--------------------------------------------------------------------------------

### BƯỚC 5. YÊU CẦU NGHIỆP VỤ (BUSINESS REQUIREMENTS - BR)

| ID | Business Requirement | BG liên quan | Nhóm | FR chi tiết liên quan |
| :--- | :--- | :--- | :--- | :--- |
| **BR-01** | Khách hàng tự đăng ký, đăng nhập xác thực JWT và tạo yêu cầu đặt xe không qua tổng đài. | BG1, BG2 | Booking | FR-001, FR-002, FR-008 → FR-016 |
| **BR-02** | Hệ thống tự động tìm và phân công tài xế phù hợp dựa trên bán kính tọa độ 1km và trạng thái Online. | BG1, BG2 | Matching | FR-017, FR-018, FR-019, FR-020, FR-024, FR-025, FR-026 |
| **BR-03** | Tự động chuyển sang tài xế tiếp theo khi tài xế hiện tại từ chối hoặc hết thời gian phản hồi (Timeout 15s). | BG2 | Matching | FR-021, FR-022, FR-023 |
| **BR-04** | Khách hàng và Vận hành theo dõi được vị trí và trạng thái chuyến đi theo thời gian thực. | BG3, BG4 | Tracking | FR-028 → FR-037, FR-090 |
| **BR-05** | Tự động tính cước chuyến đi dựa trên loại dịch vụ xe và thông tin khoảng cách khi hoàn thành. | BG1, BG2 | Pricing | FR-038 → FR-042 |
| **BR-06** | Hỗ trợ thanh toán Tiền mặt và Thanh toán điện tử qua Cổng thanh toán tích hợp với xử lý Callback an toàn. | BG3, BG6 | Payment | FR-043 → FR-049 |
| **BR-07** | Không lưu trữ trực tiếp dữ liệu thẻ nhạy cảm; đảm bảo mã hóa PII và mật khẩu at-rest. | BG7 | Security | FR-050, FR-051, FR-052 |
| **BR-08** | Gửi thông báo sự kiện tự động tới Khách hàng và Tài xế tại các mốc quan trọng của chuyến đi. | BG3 | Notification | FR-054 → FR-062 |
| **BR-09** | Giao diện vận hành cho phép giám sát chuyến đi active, theo dõi tài xế và xử lý ngoại lệ thủ công. | BG4 | Operation | FR-067, FR-069 → FR-075 |
| **BR-10** | Phân quyền truy cập RBAC (Customer, Driver, Operation, Admin); chặn truy cập trái phép với 403 Forbidden. | BG7 | Security | FR-006, FR-007, FR-076, FR-077 |
| **BR-11** | Ghi Audit Log toàn bộ các thao tác quản trị, thay đổi quyền và xử lý ngoại lệ phục vụ tra soát. | BG7 | Audit | FR-084 → FR-087 |
| **BR-12** | Kiến trúc Microservices cắm rút độc lập; sự cố của Payment/Notification không làm sập luồng đặt xe. | BG5 | Architecture | FR-061, FR-062, NFR-008..010 |
| **BR-13** | Cho phép thay thế hoặc mở rộng Payment/Notification/Map Provider qua cấu trúc Adapter Abstraction. | BG6 | Architecture | FR-061, FR-062 |
| **BR-14** | Cho phép hủy chuyến đi hợp lệ khi chưa đón khách, giải phóng trạng thái tài xế và lưu lý do hủy. | BG3 | Cancellation | FR-091, FR-092 |
| **BR-15** | Đăng ký và Quản lý duyệt hồ sơ Tài xế mới bởi Admin trước khi cho phép nhận chuyến. | BG4, BG7 | Driver Onboarding| FR-088, FR-089 |

--------------------------------------------------------------------------------

### BƯỚC 6. QUY TRÌNH NGHIỆP VỤ (BUSINESS PROCESS - BP)

#### BP-01. Đăng ký & Xác thực Người dùng (UC-01, UC-02, UC-10)
* **Main Flow:** Customer/Driver chọn Đăng ký → Nhập thông tin → Validate → Kiểm tra trùng lặp → Lưu User & Profile → Cấp token JWT khi Đăng nhập thành công.
* **Exceptions:** Sai mật khẩu/tài khoản bị khóa → Trả lỗi 401 Unauthorized.

#### BP-02. Quản lý Hồ sơ & Phương tiện (UC-03, UC-11, UC-12)
* **Main Flow:** User mở Profile → Cập nhật thông tin cá nhân / thông tin xe → System validate → Lưu thay đổi.

#### BP-03. Tạo Yêu cầu Đặt xe (UC-04)
* **Main Flow:** Customer chọn Điểm đón, Điểm đến, Loại xe → System validate request → Tính toán khoảng cách → Tạo Booking trạng thái `CREATED` → Chuyển `SEARCHING_DRIVER` → Kích hoạt BP-04.

#### BP-04. Quy trình Phân công Tài xế (Driver Matching - Sequential Dispatch) (UC-04, UC-14, UC-15)
* **Main Flow:** 
  1. System quét danh sách Driver có vị trí trong bán kính 1km xung quanh điểm đón, trạng thái `AVAILABLE` và đúng `VehicleType`.
  2. Sắp xếp danh sách theo khoảng cách gần nhất.
  3. Tạo `DriverAssignment` trạng thái `PENDING` cho Driver đầu tiên, phát event gửi Trip Request tới Driver.
  4. Đếm thời gian Timeout 15 giây.
  5. Nếu Driver **Accept**: Khóa Booking (concurrency check) → `DriverAssignment` = `ACCEPTED` → `Booking` = `DRIVER_ASSIGNED` → Khởi tạo `Trip` → Thông báo Khách hàng.
  6. Nếu Driver **Reject** hoặc **Timeout (15s)**: `DriverAssignment` = `REJECTED` / `TIMEOUT` → Chuyển sang Driver tiếp theo trong danh sách.
  7. Nếu hết danh sách mà không có Driver nhận: `Booking` = `NO_DRIVER_FOUND` → Thông báo Khách hàng kết thúc.

#### BP-05. Bật/Tắt Trạng thái Sẵn sàng của Tài xế (UC-13)
* **Main Flow:** Driver thao tác bật Online / Offline → System validate điều kiện (không đang thực hiện chuyến) → Cập nhật status `AVAILABLE` hoặc `OFFLINE`.

#### BP-06. Cập nhật Tọa độ & Thực hiện Chuyến đi (UC-16, UC-05, UC-28)
* **Main Flow:** Driver gửi tọa độ định kỳ (Telemetry) → Driver cập nhật lần lượt 5 trạng thái chuyến đi:
  `DRIVER_ASSIGNED` → `DRIVER_EN_ROUTE` → `DRIVER_ARRIVED` → `PASSENGER_PICKED_UP` → `IN_PROGRESS` → `COMPLETED`.
  Mỗi bước chuyển trạng thái hợp lệ đều ghi nhận vào `TripStatusHistory` và phát event thông báo cho Customer.

#### BP-07. Tính Cước Chuyến đi (Fare Calculation)
* **Main Flow:** Khi Trip chuyển sang `COMPLETED` → System lấy thông tin quãng đường thực tế và bảng giá `PricingRule` theo `VehicleType` → Tính cước `Fare` → Gắn 1:1 với Trip.

#### BP-08. Xử lý Thanh toán (UC-23, UC-08 & Cash Flow)
* **Main Flow (Electronic):** Customer chọn Thanh toán Online → System tạo `PaymentAttempt` → Gọi Payment Provider → Provider trả callback/webhook → System verify chữ ký & Idempotency → Cập nhật Payment = `COMPLETED` / `PAID`.
* **Main Flow (Cash):** Customer chọn Tiền mặt → Driver nhận tiền mặt khi kết thúc chuyến → Driver bấm xác nhận đã nhận tiền → System cập nhật Payment = `COMPLETED`.
* **Exception Flow (Retry):** Nếu Payment Online thất bại → Customer bấm Thanh toán lại (Retry) → Tạo `PaymentAttempt` mới.

#### BP-09. Xử lý Thông báo Sự kiện (UC-24)
* **Main Flow:** Khi phát sinh Business Event (`BOOKING_CREATED`, `DRIVER_ASSIGNED`, `DRIVER_ARRIVED`, `TRIP_COMPLETED`, `PAYMENT_SUCCESS`, `CANCELED`) → Notification Service nhận message từ Message Broker → Gửi Push Notification / SMS → Lưu `NotificationDelivery`.

#### BP-10. Đánh giá Chuyến đi (UC-09)
* **Main Flow:** Customer mở lịch sử chuyến đi ở trạng thái `COMPLETED` → Chọn số sao (1-5) & Nhập nhận xét → System lưu `Rating` (Đảm bảo mỗi chuyến chỉ đánh giá 1 lần).

#### BP-11. Giám sát & Xử lý Ngoại lệ Vận hành (UC-17, UC-18, UC-19, UC-20)
* **Main Flow:** Operation Staff mở màn hình giám sát chuyến active / tài xế → Khi chuyến gặp sự cố (mất kết nối, tranh chấp) → Operation chọn xử lý ngoại lệ (Override status có xác nhận) → System cập nhật và ghi `AuditLog`.

#### BP-12. Quản trị Người dùng & Phân quyền (UC-21, UC-22)
* **Main Flow:** Admin tra cứu danh sách User → Cập nhật quyền Role/Permission → System lưu và ghi `AuditLog`.

#### BP-13. Đăng ký & Duyệt Hồ sơ Tài xế (UC-25, UC-26) [Rubric Item 21, Rubric Item 22]
* **Main Flow:** Driver đăng ký tài khoản (SĐT, OTP, Bằng lái, Đăng ký xe) → Hồ sơ được tạo ở trạng thái `PENDING_APPROVAL` → Admin mở danh sách chờ duyệt → Mở chi tiết → Bấm Duyệt (`APPROVED` / `ACTIVE`) hoặc Từ chối (`REJECTED`) → Thông báo kết quả cho Driver.

#### BP-14. Hủy Chuyến đi (Trip Cancellation) (UC-27) [Rubric Item 18]
* **Main Flow:** Customer hoặc Driver chọn Hủy chuyến khi Trip đang ở trạng thái trước `PASSENGER_PICKED_UP` → Nhập lý do hủy → System kiểm tra điều kiện → Cập nhật Booking/Trip = `CANCELED` → Cập nhật trạng thái Driver về `AVAILABLE` → Phát event thông báo cho các bên.

--------------------------------------------------------------------------------

### BƯỚC 7. YÊU CẦU CHỨC NĂNG (FUNCTIONAL REQUIREMENTS - FR)

#### 7.1 Identity, Access & Onboarding (BP-01, BP-02, BP-13)
| FR ID | Tên Yêu cầu | Mô tả Chức năng | Actor | Priority | BP | BRL liên quan |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **FR-001** | Đăng ký Khách hàng | Cho phép Customer đăng ký tài khoản bằng SĐT/Email và mật khẩu. | Customer | Critical | BP-01 | BRL-001 |
| **FR-002** | Đăng nhập & Xác thực JWT | Xác thực tài khoản, kiểm tra mật khẩu đã mã hóa và cấp JWT Token. | All Users | Critical | BP-01 | BRL-001, BRL-003 |
| **FR-003** | Giải mã & Validate Token | API Gateway giải mã chữ ký JWT, kiểm tra thời hạn (exp) và role. | System | Critical | BP-01 | BRL-002 |
| **FR-004** | Cập nhật Profile Customer | Khách hàng cập nhật thông tin cá nhân (Họ tên, Email, Avatar). | Customer | Must | BP-02 | BRL-002 |
| **FR-005** | Cập nhật Profile & Xe Driver| Tài xế cập nhật thông tin cá nhân, bằng lái và thông tin phương tiện. | Driver | Must | BP-02 | BRL-002 |
| **FR-006** | Phân quyền RBAC | Kiểm soát quyền gọi API dựa trên Role (Customer, Driver, Operation, Admin). | System | Critical | BP-01 | BRL-002, BRL-005 |
| **FR-007** | Từ chối Truy cập Trái phép | Trả về HTTP 403 Forbidden khi User gọi API không thuộc quyền hạn. | System | Critical | BP-01 | BRL-002 |
| **FR-088** | Đăng ký Tài xế mới | Driver nhập SĐT, OTP xác thực, thông tin cá nhân, bằng lái và giấy tờ xe. | Driver | Critical | BP-13 | BRL-001, BRL-004 |
| **FR-089** | Duyệt Hồ sơ Tài xế | Admin xem danh sách hồ sơ tài xế `PENDING_APPROVAL`, bấm Duyệt hoặc Từ chối. | Admin | Critical | BP-13 | BRL-004, BRL-005 |

#### 7.2 Booking & Cancellation (BP-03, BP-14)
| FR ID | Tên Yêu cầu | Mô tả Chức năng | Actor | Priority | BP | BRL liên quan |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **FR-008** | Nhập Điểm đón & Điểm đến | Customer chọn tọa độ/địa chỉ điểm đón và điểm đến trên bản đồ. | Customer | Critical | BP-03 | BRL-006 |
| **FR-009** | Chọn Loại dịch vụ xe | Customer chọn loại xe mong muốn (`VehicleType`: 4 chỗ, 7 chỗ, xe máy). | Customer | Critical | BP-03 | BRL-006 |
| **FR-010** | Tạo Đặt xe (Booking) | Tiếp nhận yêu cầu, validate thông tin bắt buộc, tạo Booking `CREATED`. | System | Critical | BP-03 | BRL-006, BRL-007 |
| **FR-011** | Validate Booking Request | Kiểm tra dữ liệu đầu vào; trả lỗi HTTP 400 nếu thiếu trường bắt buộc. | System | Must | BP-03 | BRL-006 |
| **FR-012** | Mã định danh Booking & Trip | Tạo UUID duy nhất phân biệt rõ ràng giữa `booking_id` và `trip_id`. | System | Critical | BP-03 | BRL-007 |
| **FR-013** | Lưu thông tin Booking | Ghi nhận thời gian tạo, customer_id, pickup_location, dropoff_location. | System | Must | BP-03 | BRL-006, BRL-011 |
| **FR-014** | Phản hồi Tiếp nhận Booking | Trả về response JSON xác nhận tiếp nhận yêu cầu đặt xe thành công. | System | Must | BP-03 | BRL-039 |
| **FR-015** | Hiển thị Trạng thái Booking | Cho phép Customer tra cứu trạng thái hiện tại của Booking. | Customer | Must | BP-03 | BRL-008, BRL-009 |
| **FR-016** | Chống Tạo Booking Trùng | Chặn Khách hàng tạo thêm Booking mới khi đang có Booking chưa hoàn tất. | System | Must | BP-03 | BRL-010 |
| **FR-091** | Hủy Chuyến đi (Cancel Trip) | Cho phép Khách hàng/Tài xế hủy chuyến khi chưa đón khách kèm lý do hủy. | Customer, Driver| Critical | BP-14 | BRL-058 |
| **FR-092** | Xử lý Trạng thái khi Hủy | Chuyển trạng thái sang `CANCELED`, giải phóng Driver về `AVAILABLE`. | System | Critical | BP-14 | BRL-058 |

#### 7.3 Driver Search & Matching (BP-04, BP-05)
| FR ID | Tên Yêu cầu | Mô tả Chức năng | Actor | Priority | BP | BRL liên quan |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **FR-017** | Tìm Tài xế theo Bán kính 1km| Quét danh sách Driver `AVAILABLE` trong bán kính 1km xung quanh tọa độ pickup. | System | Critical | BP-04 | BRL-012, BRL-013 |
| **FR-018** | Lọc theo Loại xe Driver | Lọc chính xác Driver sở hữu loại xe khớp với `VehicleType` yêu cầu. | System | Critical | BP-04 | BRL-014 |
| **FR-019** | Gửi Yêu cầu Chuyến (Offer) | Gửi notification/message offer chuyến đi tới Driver được chọn. | System | Critical | BP-04 | BRL-012 |
| **FR-020** | Ghi nhận Phản hồi Driver | Ghi nhận hành động Accept hoặc Reject của Driver cho `DriverAssignment`. | Driver, System | Critical | BP-04 | BRL-012 |
| **FR-021** | Xử lý Timeout Matching (15s)| Tự động đánh dấu `TIMEOUT` nếu Driver không phản hồi sau 15 giây. | System | Critical | BP-04 | BRL-017 |
| **FR-022** | Điều phối Tuần tự (Reassign) | Tự động chuyển offer sang Driver tiếp theo khi bị Reject hoặc Timeout. | System | Critical | BP-04 | BRL-017 |
| **FR-023** | Bỏ qua Driver đã Từ chối | Không gửi lại cùng 1 booking cho Driver đã Reject trong cùng vòng matching. | System | Must | BP-04 | BRL-018 |
| **FR-024** | Concurrency Lock Accept | Đảm bảo chỉ 1 Driver đầu tiên accept hợp lệ được nhận chuyến (Mutex lock). | System | Critical | BP-04 | BRL-015, BRL-016 |
| **FR-025** | Cập nhật Booking DRIVER_ASSIGNED| Chuyển trạng thái Booking sang `DRIVER_ASSIGNED` khi có Driver nhận. | System | Critical | BP-04 | BRL-009 |
| **FR-026** | Chuyển NO_DRIVER_FOUND | Chuyển Booking sang `NO_DRIVER_FOUND` khi đã quét hết danh sách tài xế. | System | Critical | BP-04 | BRL-019 |
| **FR-027** | Thông báo Không tìm thấy Xe | Gửi thông báo cho Customer khi Booking chuyển `NO_DRIVER_FOUND`. | System | Must | BP-04 | BRL-019 |
| **FR-063** | Bật/Tắt Trạng thái Sẵn sàng | Driver thao tác chuyển đổi giữa trạng thái `AVAILABLE` và `OFFLINE`. | Driver | Critical | BP-05 | BRL-004 |
| **FR-064** | Cập nhật Status Driver | Hệ thống lưu trữ trạng thái hoạt động hiện tại của Driver. | System | Must | BP-05 | BRL-004 |
| **FR-065** | Loại Driver BUSY/OFFLINE | Ngăn không đưa Driver `BUSY` hoặc `OFFLINE` vào danh sách matching. | System | Critical | BP-05 | BRL-004, BRL-012 |
| **FR-068** | Chuyển Driver sang BUSY | Tự động chuyển Driver sang `BUSY` ngay khi chấp nhận chuyến đi thành công. | System | Critical | BP-05 | BRL-015 |
| **FR-093** | API Tra cứu Driver khu vực | API lấy danh sách Driver xung quanh bán kính 1km có phân trang (`limit`, `page`). | External/Postman| Critical | BP-05 | BRL-013 |

#### 7.4 Trip Lifecycle, Tracking & History (BP-06)
| FR ID | Tên Yêu cầu | Mô tả Chức năng | Actor | Priority | BP | BRL liên quan |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **FR-028** | Quản lý Vòng đời Chuyến đi | Thực thi State Machine của Trip qua 5 trạng thái chuyển tiếp tuần tự. | System | Critical | BP-06 | BRL-022, BRL-024 |
| **FR-029** | Cập nhật "Đang đến điểm đón"| Driver cập nhật trạng thái `DRIVER_EN_ROUTE`. | Driver | Critical | BP-06 | BRL-021 |
| **FR-030** | Cập nhật "Đã đến điểm đón" | Driver cập nhật trạng thái `DRIVER_ARRIVED`. | Driver | Critical | BP-06 | BRL-021 |
| **FR-031** | Cập nhật "Đã đón khách" | Driver cập nhật trạng thái `PASSENGER_PICKED_UP`. | Driver | Critical | BP-06 | BRL-021 |
| **FR-032** | Cập nhật "Bắt đầu/Hoàn thành"| Driver cập nhật trạng thái `IN_PROGRESS` và `COMPLETED`. | Driver | Critical | BP-06 | BRL-021, BRL-023 |
| **FR-033** | Kiểm tra Valid Transition | Chặn chuyển trạng thái nhảy cóc; trả lỗi 400 Bad Request nếu vi phạm. | System | Critical | BP-06 | BRL-020, BRL-022 |
| **FR-034** | Phát Event Cập nhật Chuyến | Phát event qua Message Broker khi trạng thái chuyến đi thay đổi. | System | Must | BP-06 | BRL-008 |
| **FR-035** | Theo dõi Tiến trình Realtime | Cho phép Customer xem tọa độ và trạng thái hiện tại của chuyến đi. | Customer | Critical | BP-06 | BRL-008 |
| **FR-036** | Tích hợp Map Provider | Gọi Map Provider để lấy khoảng cách, tuyến đường và định vị vị trí. | System | Must | BP-06 | BRL-013 |
| **FR-037** | Ghi Lịch sử Status (History) | Tự động chèn bản ghi vào `TripStatusHistory` tại mỗi bước chuyển trạng thái. | System | Must | BP-06 | BRL-052 |
| **FR-082** | Danh sách Booking Customer | API lấy danh sách booking của Customer có hỗ trợ phân trang (`page`, `limit`). | Customer | Critical | BP-06 | BRL-008 |
| **FR-083** | Xem Chi tiết Chuyến đi | Khách hàng xem chi tiết thông tin tài xế, xe, giá cước của chuyến đi đã chạy.| Customer | Must | BP-06 | BRL-008 |
| **FR-090** | Cập nhật Tọa độ Telemetry | Driver gửi tọa độ latitude/longitude định kỳ về hệ thống trong chuyến đi. | Driver | Critical | BP-06 | BRL-013 |

#### 7.5 Pricing & Payment (BP-07, BP-08)
| FR ID | Tên Yêu cầu | Mô tả Chức năng | Actor | Priority | BP | BRL liên quan |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **FR-038** | Công thức Tính cước | Tính cước dựa trên: Giá mở cửa + (Khoảng cách km * Đơn giá theo `VehicleType`). | System | Critical | BP-07 | BRL-025, BRL-026 |
| **FR-039** | Tự động Tạo Fare | Tạo bản ghi `Fare` 1:1 ngay khi Trip chuyển sang trạng thái `COMPLETED`. | System | Critical | BP-07 | BRL-027, BRL-029 |
| **FR-040** | Idempotency Tính cước | Chặn tính cước nhiều lần cho cùng một chuyến đi đã hoàn thành. | System | Critical | BP-07 | BRL-029 |
| **FR-041** | Hiển thị Số tiền Thanh toán| Cung cấp tổng số tiền cần thanh toán cho Customer và Driver. | System | Must | BP-07 | BRL-027 |
| **FR-042** | Cấu hình Giá Cố định (MVP) | Không áp dụng Surge/Dynamic pricing trong phạm vi MVP. | System | Must | BP-07 | BRL-028 |
| **FR-043** | Chọn Phương thức Thanh toán | Khách hàng chọn Tiền mặt (`CASH`) hoặc Thanh toán điện tử (`ELECTRONIC`). | Customer | Critical | BP-08 | BRL-030 |
| **FR-044** | Khởi tạo Payment Online | Tạo `PaymentAttempt` và gọi API Payment Provider để lấy URL thanh toán. | System | Critical | BP-08 | BRL-032 |
| **FR-045** | Xử lý Callback Webhook | Tiếp nhận Callback từ Payment Provider, verify chữ ký bảo mật checksum. | System | Critical | BP-08 | BRL-032, BRL-034 |
| **FR-046** | Cập nhật Payment SUCCESS | Cập nhật Payment = `COMPLETED` khi Provider xác nhận thanh toán thành công. | System | Critical | BP-08 | BRL-034 |
| **FR-047** | Cập nhật Payment FAILED | Ghi nhận trạng thái `FAILED` khi giao dịch bị từ chối hoặc hết hạn. | System | Must | BP-08 | BRL-035 |
| **FR-048** | Thông báo Kết quả Thanh toán| Gửi thông báo kết quả thanh toán (Thành công/Thất bại) cho Khách hàng. | System | Must | BP-08 | BRL-035 |
| **FR-049** | Thanh toán lại (Retry) | Cho phép Customer thực hiện thanh toán lại khi Payment ở trạng thái `FAILED`. | Customer | Must | BP-08 | BRL-036 |
| **FR-050** | Idempotency Payment Callback| Chặn xử lý trùng lặp khi Provider gửi callback nhiều lần cho 1 giao dịch. | System | Critical | BP-08 | BRL-033 |
| **FR-051** | Không lưu Dữ liệu Thẻ | Cam kết không lưu trữ số thẻ, CVV, OTP ngân hàng trực tiếp tại CAB DB. | System | Critical | BP-08 | BRL-031 |
| **FR-052** | Lưu Transaction Reference | Lưu vết mã giao dịch `transaction_reference` của Provider để đối soát. | System | Must | BP-08 | BRL-032 |
| **FR-053** | Tra cứu Lịch sử Thanh toán | Khách hàng xem lịch sử các giao dịch thanh toán của chính mình. | Customer | Must | BP-08 | BRL-008 |
| **FR-094** | Xác nhận Thanh toán Tiền mặt| Driver bấm xác nhận đã nhận đủ tiền mặt từ khách khi hoàn thành chuyến. | Driver | Critical | BP-08 | BRL-037 |

#### 7.6 Notification, Rating, Operation & Health Check (BP-09, BP-10, BP-11, BP-12)
| FR ID | Tên Yêu cầu | Mô tả Chức năng | Actor | Priority | BP | BRL liên quan |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **FR-054** | Thông báo Đã nhận Booking | Gửi thông báo cho Customer khi đặt xe thành công (`BOOKING_CREATED`). | System | Must | BP-09 | BRL-039 |
| **FR-055** | Thông báo Đã có Tài xế | Gửi thông báo cho Customer khi Driver chấp nhận chuyến (`DRIVER_ASSIGNED`).| System | Must | BP-09 | BRL-039 |
| **FR-056** | Thông báo Tài xế đã tới | Gửi thông báo cho Customer khi Driver tới điểm đón (`DRIVER_ARRIVED`). | System | Must | BP-09 | BRL-039 |
| **FR-057** | Thông báo Hoàn thành Chuyến | Gửi thông báo cho Customer khi chuyến đi hoàn tất (`TRIP_COMPLETED`). | System | Must | BP-09 | BRL-039 |
| **FR-058** | Thông báo Kết quả Thanh toán| Gửi thông báo trạng thái giao dịch thanh toán điện tử thành công/thất bại.| System | Must | BP-09 | BRL-039 |
| **FR-059** | Thông báo Offer cho Tài xế | Gửi thông báo nhận chuyến mới tới ứng dụng Tài xế. | System | Critical | BP-09 | BRL-040 |
| **FR-060** | Ghi nhận Delivery Status | Lưu vết trạng thái gửi thông báo (`SENT`, `FAILED`) trong `NotificationDelivery`.| System | Should | BP-09 | BRL-042 |
| **FR-061** | Provider Abstraction Adapter| Thiết kế Interface cô lập logic nghiệp vụ khỏi implementation của Provider. | System | Critical | BP-09 | BRL-041 |
| **FR-062** | Khả năng Thay đổi Provider | Cho phép cấu hình đổi Provider (Payment/Notification) qua Config/Adapter. | System | Should | BP-09 | BRL-041 |
| **FR-067** | Màn hình Giám sát Tài xế | Hiển thị danh sách, trạng thái Online/Offline và tọa độ hiện tại của Driver. | Operation | Must | BP-11 | BRL-043 |
| **FR-069** | Màn hình Giám sát Chuyến active| Hiển thị danh sách các chuyến đi đang diễn ra trên hệ thống. | Operation | Must | BP-11 | BRL-043 |
| **FR-072** | Tra cứu Lịch sử Chuyến đi | Vận hành/Finance tìm kiếm lịch sử chuyến đi theo khoảng thời gian, ID. | Operation | Must | BP-11 | BRL-002 |
| **FR-073** | Tra cứu Lịch sử Giao dịch | Vận hành/Finance tra cứu lịch sử thanh toán điện tử & tiền mặt để đối soát.| Operation | Must | BP-11 | BRL-002 |
| **FR-074** | Xử lý Ngoại lệ Chuyến đi | Cho phép Vận hành can thiệp hủy chuyến hoặc gán lại trạng thái khi gặp sự cố.| Operation | Critical | BP-11 | BRL-044, BRL-045 |
| **FR-075** | Xác nhận Thao tác Quản trị | Yêu cầu xác nhận (Dialog/Confirmation) trước khi thực hiện override dữ liệu.| Operation | Should | BP-11 | BRL-045 |
| **FR-076** | Phân quyền Admin vs Operation| Phân biệt rõ quyền hạn giữa Admin (User/Role/Audit) và Operation (Giám sát).| System | Critical | BP-12 | BRL-005, BRL-047 |
| **FR-078** | Đánh giá Sao & Nhận xét | Customer chấm điểm 1-5 sao và viết nhận xét cho Driver sau chuyến đi. | Customer | Must | BP-10 | BRL-048, BRL-050 |
| **FR-080** | Lưu bản ghi Rating | Lưu `Rating` gắn chặt với `customer_id`, `driver_id` và `trip_id`. | System | Must | BP-10 | BRL-051 |
| **FR-081** | Khóa Đánh giá Trùng lặp | Chặn không cho Khách hàng đánh giá quá 1 lần cho cùng 1 chuyến đi. | System | Critical | BP-10 | BRL-049 |
| **FR-085** | Ghi Audit Log Thao tác | Tự động ghi log người thực hiện, thời gian, hành động, đối tượng tác động. | System | Critical | BP-11, BP-12| BRL-046, BRL-052 |
| **FR-087** | Bảo vệ Dữ liệu Audit Log | Chỉ cấp quyền xem Audit Log cho Admin; chặn sửa/xóa bản ghi audit log. | System | Critical | BP-12 | BRL-056 |
| **FR-095** | Health Check API Endpoint | Cung cấp 3 endpoint `/health`, `/ready`, `/health/services` kiểm tra trạng thái.| System | Critical | Technical | Rubric Item 6 |

--------------------------------------------------------------------------------

### BƯỚC 8. QUY TẮC NGHIỆP VỤ & XỬ LÝ NGOẠI LỆ (BUSINESS RULES & EXCEPTIONS)

#### 8.1 Business Rules (BRL)
* **BRL-001 (Unique Account):** SĐT và Email của tài khoản người dùng phải là duy nhất trên toàn hệ thống.
* **BRL-002 (Role-based Access Control):** Người dùng chỉ được thực hiện các chức năng thuộc về Role được cấp.
* **BRL-003 (Active Account):** Chỉ tài khoản ở trạng thái `ACTIVE` mới được thực hiện các giao dịch đặt xe / nhận chuyến.
* **BRL-004 (Driver Eligibility):** Driver phải có hồ sơ `APPROVED`, tài khoản `ACTIVE` và phương tiện hợp lệ mới được bật `AVAILABLE`.
* **BRL-005 (Admin Privilege):** Các thao tác quản trị hệ thống, phân quyền và duyệt tài xế chỉ dành riêng cho Role `ADMIN`.
* **BRL-006 (Valid Booking):** Yêu cầu đặt xe bắt buộc phải có: Điểm đón, Điểm đến, Loại xe hợp lệ.
* **BRL-007 (Unique Identifiers):** Mã `booking_id` và `trip_id` phải là chuỗi UUID duy nhất.
* **BRL-008 (Data Isolation):** Khách hàng chỉ được xem dữ liệu chuyến đi và thanh toán thuộc sở hữu của chính mình.
* **BRL-009 (Booking State Machine):** Booking tuân thủ đúng chuỗi trạng thái: `CREATED` → `SEARCHING_DRIVER` → `DRIVER_ASSIGNED` → `COMPLETED` (hoặc `CANCELED` / `NO_DRIVER_FOUND`).
* **BRL-010 (One Active Booking):** Khách hàng không được tạo Booking mới khi đang có Booking/Trip chưa hoàn thành.
* **BRL-012 (Available Driver Only):** Chỉ tài xế đang ở trạng thái `AVAILABLE` mới được đưa vào danh sách Matching.
* **BRL-013 (Proximity Matching 1km):** Matching chỉ tìm kiếm tài xế trong bán kính tối đa 1km tính từ tọa độ điểm đón.
* **BRL-014 (Vehicle Type Match):** Loại phương tiện của tài xế phải khớp 100% với `VehicleType` khách hàng yêu cầu.
* **BRL-015 (Sequential Single Assignment):** Tại một thời điểm, một Booking chỉ gửi Offer cho đúng 1 Driver (Sequential Dispatch).
* **BRL-016 (First Valid Acceptance - Mutex):** Nếu có nhiều request accept, hệ thống dùng cơ chế Mutex Lock đảm bảo chỉ 1 Driver thắng offer.
* **BRL-017 (Matching Timeout 15s):** Driver có 15 giây để phản hồi offer; quá 15s hệ thống tự chuyển `TIMEOUT` và tìm tài xế khác.
* **BRL-018 (Exclude Rejected Driver):** Driver đã `REJECTED` hoặc `TIMEOUT` sẽ không nhận lại cùng 1 booking trong cùng 1 lượt matching.
* **BRL-019 (Matching Exhaustion):** Khi đã thử hết danh sách tài xế trong bán kính 1km mà không ai nhận, chuyển Booking sang `NO_DRIVER_FOUND`.
* **BRL-020 (Valid Status Transition):** Chuyến đi phải chuyển trạng thái theo đúng thứ tự 5 bước quy định, không nhảy cóc.
* **BRL-021 (Driver Control Trip):** Driver là actor chính bấm chuyển các trạng thái tiến trình chuyến đi.
* **BRL-022 (Sequential Trip Lifecycle):** `DRIVER_ASSIGNED` → `DRIVER_EN_ROUTE` → `DRIVER_ARRIVED` → `PASSENGER_PICKED_UP` → `IN_PROGRESS` → `COMPLETED`.
* **BRL-025 (Configured Pricing):** Giá cước được tính tự động theo công thức phê duyệt: Giá mở cửa + (Khoảng cách * Đơn giá/km).
* **BRL-028 (No Dynamic Pricing):** Hệ thống MVP không nhân hệ số giá theo giờ cao điểm/thời tiết.
* **BRL-030 (Supported Payment Methods):** MVP hỗ trợ 2 phương thức: Tiền mặt (`CASH`) và Điện tử (`ELECTRONIC`).
* **BRL-031 (No Card Storage):** Tuyệt đối không lưu trữ thông tin thẻ thanh toán trực tiếp trong cơ sở dữ liệu CAB.
* **BRL-033 (Payment Idempotency):** Một nghĩa vụ thanh toán chỉ có tối đa 1 giao dịch thành công. Callback lặp phải xử lý idempotent.
* **BRL-037 (Cash Confirmation):** Driver trực tiếp xác nhận đã nhận đủ tiền mặt khi hoàn thành chuyến đi.
* **BRL-048 (Completed Trip Rating Only):** Khách hàng chỉ được đánh giá chuyến đi sau khi chuyến đã ở trạng thái `COMPLETED`.
* **BRL-049 (One Rating Per Trip):** Mỗi chuyến đi chỉ được gửi đánh giá tối đa 1 lần.
* **BRL-052 (Audit Trail Mandatory):** Mọi thao tác quản trị nhạy cảm (duyệt hồ sơ, override chuyến, phân quyền) bắt buộc ghi Audit Log.
* **BRL-058 (Cancellation Rule):** Cho phép hủy chuyến khi Trip ở trạng thái trước `PASSENGER_PICKED_UP`; sau khi đã đón khách thì không được tự hủy trên app.

#### 8.2 Business Exceptions (BE)
| ID | Tên Ngoại lệ | Điều kiện Phát sinh | Cách xử lý Nghiệp vụ (Business Handling) |
| :--- | :--- | :--- | :--- |
| **BE-001** | No Driver Found | Đã quét hết tài xế bán kính 1km mà không ai nhận. | Chuyển Booking sang `NO_DRIVER_FOUND`, gửi thông báo cho Khách hàng. |
| **BE-002** | Driver Timeout | Driver không bấm Accept/Reject trong 15s. | Đánh giá `TIMEOUT`, chuyển ngay offer cho Driver tiếp theo. |
| **BE-003** | Driver Reject | Driver bấm Từ chối chuyến. | Đánh dấu `REJECTED`, loại Driver khỏi đợt quét, chuyển Driver tiếp theo. |
| **BE-008** | Concurrent Booking | Khách hàng bấm gửi yêu cầu đặt xe liên tục. | Chặn bằng BRL-010, chỉ xử lý request hợp lệ đầu tiên. |
| **BE-009** | Concurrent Acceptance | 2 Driver cùng bấm nhận 1 chuyến đi gần như đồng thời.| Dùng Mutex Lock: Driver đầu tiên thành công; Driver thứ 2 nhận thông báo 409 Conflict ("Chuyến đã có tài xế khác nhận"). |
| **BE-010** | Payment Timeout | Cổng thanh toán không phản hồi callback trong thời gian chờ.| Giữ Payment trạng thái `PROCESSING`, không tự động đánh dấu thành công; cho phép đối soát/retry. |
| **BE-012** | Duplicate Callback | Provider gửi callback thanh toán nhiều lần cho 1 order. | Kiểm tra trạng thái Payment: Nếu đã `COMPLETED` thì bỏ qua, trả response 200 OK cho Provider (Idempotent). |
| **BE-017** | Invalid Transition | Driver bấm nhảy bước trạng thái chuyến đi. | Chặn thao tác, trả lỗi HTTP 400 Bad Request, giữ nguyên trạng thái hiện tại.|
| **BE-018** | Unauthorized Access | User gọi API ngoài phạm vi phân quyền Role. | Từ chối request, trả lỗi HTTP 403 Forbidden, ghi Security Audit Log. |
| **BE-023** | Duplicate Rating | Khách hàng cố tình gửi đánh giá sao lần thứ 2. | Chặn thao tác, trả lỗi HTTP 400 Bad Request ("Chuyến đi đã được đánh giá"). |
| **BE-026** | Invalid JWT Signature | Attacker chỉnh sửa payload Token (JWT Tampering). | JWT Verification fail, trả ngay HTTP 401 Unauthorized, từ chối request.|
| **BE-027** | Rate Limit Exceeded | Client spam request quá 1000 req/sec tới API. | API Gateway chặn request, trả ngay HTTP 429 Too Many Requests. |
| **BE-028** | Replay Attack | Attacker gửi lại request thanh toán cũ. | Kiểm tra `Idempotency-Key` / Transaction ID: Bỏ qua xử lý lại, trả response cũ. |

#### 8.3 Exception Handling Principles (EP)
* **EP-01 (State Preservation):** Khi gặp sự cố mạng hoặc tích hợp, ưu tiên bảo toàn trạng thái dữ liệu hiện tại, không rollback vô căn cứ.
* **EP-02 (External Failure Isolation):** Sự cố ngắt kết nối của Payment/Notification/Map Provider tuyệt đối không làm sụp đổ hệ thống lõi.
* **EP-03 (Strict Idempotency):** Mọi API biến đổi dữ liệu quan trọng (Tạo booking, Accept chuyến, Payment callback, Rating) phải đảm bảo tính Idempotent.
* **EP-04 (State Consistency Enforcement):** Chuyển trạng thái bắt buộc kiểm tra chặt chẽ theo State Machine.
* **EP-05 (Human Intervention Fallback):** Khi hệ thống tự động không xử lý được ngoại lệ, case sẽ được đẩy về màn hình Vận hành (Operation) xử lý.
* **EP-06 (Auditability of Exceptions):** Mọi thao tác xử lý ngoại lệ thủ công bắt buộc ghi Audit Log chứa: Who, When, What, Target, Reason, Result.

--------------------------------------------------------------------------------

### BƯỚC 9. MÔ HÌNH MIỀN DỮ LIỆU & THỰC THỂ (DOMAIN MODEL & ENTITIES)

#### 9.1 Danh sách Thực thể (Entities)
1. **Identity & Access:** `User`, `Role`, `UserRole`.
2. **Profiles & Vehicle:** `Customer`, `Driver`, `Vehicle`, `VehicleType`.
3. **Booking & Dispatching:** `Booking`, `DriverAssignment`.
4. **Trip Lifecycle:** `Trip`, `TripStatusHistory`, `DriverLocationTelemetry`.
5. **Pricing & Payment:** `PricingRule`, `Fare`, `Payment`, `PaymentAttempt`, `PaymentProvider`.
6. **Notification:** `Notification`, `NotificationDelivery`, `NotificationProvider`.
7. **Rating & Audit:** `Rating`, `AuditLog`.

#### 9.2 Thuộc tính chính & Ràng buộc Thực thể

##### `User`
* `id` (UUID, PK), `phone_number` (String, Unique), `email` (String, Unique), `password_hash` (String, Bcrypt encrypted), `status` (Enum: `PENDING_APPROVAL`, `ACTIVE`, `INACTIVE`, `REJECTED`), `created_at`, `updated_at`.

##### `Driver`
* `id` (UUID, PK), `user_id` (UUID, FK -> User), `full_name` (String), `driver_license_number` (String), `availability_status` (Enum: `OFFLINE`, `AVAILABLE`, `BUSY`), `current_latitude` (Decimal), `current_longitude` (Decimal), `rating_average` (Float), `created_at`.

##### `Vehicle`
* `id` (UUID, PK), `driver_id` (UUID, FK -> Driver), `vehicle_type_id` (UUID, FK -> VehicleType), `license_plate` (String, Unique), `brand_model` (String), `color` (String).

##### `Booking`
* `id` (UUID, PK), `customer_id` (UUID, FK -> Customer), `vehicle_type_id` (UUID, FK -> VehicleType), `pickup_address` (String), `pickup_latitude` (Decimal), `pickup_longitude` (Decimal), `dropoff_address` (String), `dropoff_latitude` (Decimal), `dropoff_longitude` (Decimal), `status` (Enum: `CREATED`, `SEARCHING_DRIVER`, `DRIVER_ASSIGNED`, `COMPLETED`, `CANCELED`, `NO_DRIVER_FOUND`), `created_at`.

##### `DriverAssignment`
* `id` (UUID, PK), `booking_id` (UUID, FK -> Booking), `driver_id` (UUID, FK -> Driver), `status` (Enum: `PENDING`, `ACCEPTED`, `REJECTED`, `TIMEOUT`, `EXPIRED`), `offered_at`, `responded_at`.

##### `Trip`
* `id` (UUID, PK), `booking_id` (UUID, FK -> Booking, Unique 1:1), `driver_id` (UUID, FK -> Driver), `vehicle_id` (UUID, FK -> Vehicle), `status` (Enum: `DRIVER_ASSIGNED`, `DRIVER_EN_ROUTE`, `DRIVER_ARRIVED`, `PASSENGER_PICKED_UP`, `IN_PROGRESS`, `COMPLETED`, `CANCELED`), `started_at`, `completed_at`.

##### `Fare`
* `id` (UUID, PK), `trip_id` (UUID, FK -> Trip, Unique 1:1), `base_fare` (Decimal), `distance_fare` (Decimal), `total_amount` (Decimal), `currency` (String: `VND`), `calculated_at`.

##### `Payment`
* `id` (UUID, PK), `trip_id` (UUID, FK -> Trip, Unique 1:1), `fare_id` (UUID, FK -> Fare), `payment_method` (Enum: `CASH`, `ELECTRONIC`), `status` (Enum: `PENDING`, `PROCESSING`, `COMPLETED`, `FAILED`), `total_amount` (Decimal), `created_at`.

##### `PaymentAttempt`
* `id` (UUID, PK), `payment_id` (UUID, FK -> Payment), `payment_provider_id` (UUID, FK), `transaction_reference` (String), `status` (Enum: `PENDING`, `SUCCESS`, `FAILED`), `idempotency_key` (String, Unique), `attempted_at`.

##### `Rating`
* `id` (UUID, PK), `trip_id` (UUID, FK -> Trip, Unique 1:1), `customer_id` (UUID, FK -> Customer), `driver_id` (UUID, FK -> Driver), `star_rating` (Integer: 1-5), `comment` (Text), `created_at`.

##### `AuditLog`
* `id` (UUID, PK), `actor_id` (UUID), `actor_type` (Enum: `CUSTOMER`, `DRIVER`, `STAFF`, `ADMIN`, `SYSTEM`, `EXTERNAL_PROVIDER`), `action` (String), `entity_name` (String), `entity_id` (UUID), `old_value` (JSON), `new_value` (JSON), `reason` (String), `ip_address` (String), `created_at` (Timestamp).

#### 9.3 Sơ đồ Quan hệ Thực thể (ERD Logical Text)
```text
USER (1) <---> (0..1) CUSTOMER (1) <---> (N) BOOKING
USER (1) <---> (0..1) DRIVER (1) <---> (N) VEHICLE
DRIVER (1) <---> (N) DRIVER_ASSIGNMENT (N) <---> (1) BOOKING
BOOKING (1) <---> (0..1) TRIP (1) <---> (1) FARE
TRIP (1) <---> (1) PAYMENT (1) <---> (N) PAYMENT_ATTEMPT
TRIP (1) <---> (N) TRIP_STATUS_HISTORY
TRIP (0..1) <---> (1) RATING
USER (1) <---> (N) AUDIT_LOG
```

#### 9.4 State Machines (Chuyển đổi Trạng thái)

##### Booking State Machine
* `CREATED` → `SEARCHING_DRIVER` → `DRIVER_ASSIGNED` → `COMPLETED` (sau khi Trip COMPLETED).
* `SEARCHING_DRIVER` → `NO_DRIVER_FOUND` (khi hết tài xế).
* `CREATED` / `SEARCHING_DRIVER` / `DRIVER_ASSIGNED` → `CANCELED` (khi Hủy chuyến).

##### Trip State Machine (5 Bước Chuẩn)
1. `DRIVER_ASSIGNED` → `DRIVER_EN_ROUTE` (Tài xế di chuyển tới điểm đón)
2. `DRIVER_EN_ROUTE` → `DRIVER_ARRIVED` (Tài xế tới điểm đón)
3. `DRIVER_ARRIVED` → `PASSENGER_PICKED_UP` (Đã đón khách)
4. `PASSENGER_PICKED_UP` → `IN_PROGRESS` (Bắt đầu di chuyển)
5. `IN_PROGRESS` → `COMPLETED` (Hoàn thành chuyến đi)
* Trạng thái ngoại lệ: `DRIVER_ASSIGNED` / `DRIVER_EN_ROUTE` / `DRIVER_ARRIVED` → `CANCELED`.

--------------------------------------------------------------------------------

### BƯỚC 10. YÊU CẦU PHI CHỨC NĂNG & KIẾN TRÚC MICROSERVICES (NFR & MSA ARCHITECTURE)

#### 10.1 Kiến trúc Microservices & Đóng gói Container (Docker Compose) [Rubric Item 1, Rubric Item 3, Rubric Item 4, Rubric Item 5, Rubric Item 7, Rubric Item 8]
Hệ thống được thiết kế theo kiến trúc Microservices độc lập. **Mọi Request từ Client đều bắt buộc đi qua API Gateway** (Single Point of Entry). Các Service kết nối với nhau qua cơ chế gRPC/REST (Đồng bộ) và Message Broker Kafka/RabbitMQ (Bất đồng bộ).

| Container Name | Service Name | Công nghệ Core | Nhiệm vụ chính |
| :--- | :--- | :--- | :--- |
| `cab-gateway` | API Gateway | Kong / Spring Cloud Gateway | Reverse Proxy, Centralized Auth JWT Check, Rate Limiting (429), SSL Termination, Request Routing. |
| `cab-auth-service` | Auth Service | Node.js / Go / Java | Đăng ký, Đăng nhập, Cấp/Validate JWT Token, Phân quyền RBAC. |
| `cab-customer-service`| Customer Service | Node.js / Python | Quản lý Profile Khách hàng, Lịch sử đặt xe, Lịch sử thanh toán. |
| `cab-driver-service` | Driver Service | Node.js / Go | Quản lý Profile Tài xế, Đăng ký/Duyệt hồ sơ, Toggle Online/Offline, Telemetry vị trí (Geo-spatial index Redis). |
| `cab-booking-service` | Booking Service | Java / Node.js | Tiếp nhận Đặt xe, Hủy chuyến, Lưu trữ Booking state machine. |
| `cab-matching-service`| Matching Service | Go / Java | Thuật toán quét tài xế bán kính 1km, Sequential Dispatch, Timeout 15s, Reassign. |
| `cab-trip-service` | Trip Service | Java / Node.js | Quản lý 5 trạng thái chuyến đi, Ghi nhận TripStatusHistory, Tracking realtime. |
| `cab-payment-service` | Payment Service | Java / Node.js | Tính cước Fare, Tích hợp Online Payment Webhook, Idempotency Callback, Xác nhận Tiền mặt. |
| `cab-notification-svc`| Notification Service| Node.js / Go | Tiêu thụ event từ Kafka/RabbitMQ, Gửi Push Notification / SMS. |
| `cab-db-postgres` | PostgreSQL DB | PostgreSQL 16 | Lưu trữ dữ liệu quan hệ (User, Booking, Trip, Payment, AuditLog). |
| `cab-redis-cache` | Redis Cache | Redis 7 | Luân chuyển tọa độ Driver vị trí (GeoSpatial Indexing), Distributed Locking (Mutex for Matching). |
| `cab-message-broker` | Message Broker | Apache Kafka / RabbitMQ | Luồng truyền thông điệp sự kiện bất đồng bộ giữa các Microservices. |

#### 10.2 An toàn Thông tin & Bảo mật (Security NFR) [Rubric Item 2, Rubric Item 24, Rubric Item 25, Rubric Item 26, Rubric Item 27, Rubric Item 28, Rubric Item 29, Rubric Item 30]
* **NFR-SEC-01 (Mã hóa At-Rest & Key Management - Rubric Item 2, Rubric Item 24):** 100% mật khẩu mã hóa bằng Bcrypt (Salt factor ≥ 10). Thông tin nhạy cảm PII được mã hóa AES-256. Không lưu `.env` hay mật khẩu plain-text trên Github repo (có file `.gitignore` chuẩn).
* **NFR-SEC-02 (Chống SQL Injection - Rubric Item 25):** Mọi truy vấn DB sử dụng Parameterized Queries / ORM Framework. Kiểm thử input chứa `' OR 1=1 --` bị từ chối hoàn toàn, trả lỗi 400/401 Bad Request, không lộ cấu trúc DB.
* **NFR-SEC-03 (Chống XSS Input Escape - Rubric Item 26):** Mọi dữ liệu chuỗi đầu vào (Nhận xét rating, lý do hủy) được Encode HTML/Escape trước khi xử lý, ngăn chặn thực thi Script `<script>alert('hack')</script>`.
* **NFR-SEC-04 (Chống JWT Signature Tampering - Rubric Item 27):** API Gateway kiểm tra chữ ký HMAC-SHA256 / RSA của JWT Token. Khi Attacker sửa payload (`sub`, `role`), verification signature thất bại lập tức trả lỗi HTTP 401 Unauthorized.
* **NFR-SEC-05 (Kiểm soát Quyền API 403 Forbidden - Rubric Item 28):** Áp dụng RBAC tại API Gateway/Service level. Khách hàng gọi API dành riêng cho Tài xế hoặc Admin lập tức bị chặn với lỗi HTTP 403 Forbidden.
* **NFR-SEC-06 (Rate Limiting Attack 429 - Rubric Item 29):** Thiết lập Rate Limiter trên API Gateway. Client gửi spam quá 1000 requests/sec tới API (`POST /api/v1/bookings`) lập tức nhận HTTP 429 Too Many Requests.
* **NFR-SEC-07 (Chống Replay Attack / Idempotency - Rubric Item 30):** API Thanh toán sử dụng `Idempotency-Key` header. Request gửi lại y hệt (Replay) sẽ không bị tính tiền 2 lần, hệ thống trả về kết quả đã xử lý trước đó.

#### 10.3 Hiệu năng, Độ sẵn sàng & Khả năng Chịu lỗi (Performance & Reliability)
* **NFR-PERF-01:** Thời gian phản hồi API đồng bộ (P95) ≤ 2.0 giây.
* **NFR-AVAIL-01:** Mức độ sẵn sàng Uptime toàn hệ thống ≥ 99.9%.
* **NFR-RELI-01 (Fault Isolation):** Lỗi vô hiệu hóa của Payment hoặc Notification Provider không được gây crash luồng đặt xe và thực hiện chuyến đi.

--------------------------------------------------------------------------------

### BƯỚC 11. USE CASES & MÔ TẢ CHI TIẾT USE CASE

#### 11.1 Danh sách Use Cases
* **Customer:** UC-01 (Register), UC-02 (Login), UC-03 (Manage Profile), UC-04 (Create Booking), UC-05 (Track Trip), UC-06 (View Trip History), UC-07 (View Payment History), UC-08 (Retry Payment), UC-09 (Rate Driver), UC-27 (Cancel Trip).
* **Driver:** UC-10 (Login Driver), UC-11 (Manage Profile Driver), UC-12 (Manage Vehicle), UC-13 (Set Availability), UC-14 (Receive Trip Request), UC-15 (Accept/Reject Trip), UC-16 (Update Trip Status), UC-25 (Register Driver), UC-28 (Update Location Telemetry).
* **Operation & Admin:** UC-17 (Monitor Active Trips), UC-18 (Monitor Driver Status), UC-19 (Handle Trip Exception), UC-20 (View Transaction History), UC-21 (Manage Users), UC-22 (Manage Roles & Permissions), UC-26 (Approve Driver Profile).
* **System & Integration:** UC-23 (Process Electronic Payment), UC-24 (Send Notification).

#### 11.2 Mô tả Chi tiết Các Use Case Trọng tâm

##### UC-01 — Register Customer Account
* **Actor:** Customer.
* **Pre-conditions:** Khách hàng chưa có tài khoản.
* **Main Flow:** Customer mở ứng dụng → Nhập SĐT, Email, Mật khẩu → System validate dữ liệu → Kiểm tra SĐT/Email chưa tồn tại → Mã hóa mật khẩu Bcrypt → Lưu User & Customer profile → Trả về thông báo thành công.

##### UC-04 — Create Booking & Auto Dispatch [Priority: Critical]
* **Actor:** Customer, System, Driver.
* **Pre-conditions:** Khách hàng đã đăng nhập (JWT valid), tài khoản `ACTIVE`.
* **Main Flow:**
  1. Customer chọn Điểm đón, Điểm đến, Loại xe `VehicleType` → Bấm Đặt xe.
  2. System validate dữ liệu đầu vào → Tạo `Booking` trạng thái `CREATED` → Chuyển `SEARCHING_DRIVER`.
  3. System quét tài xế `AVAILABLE` trong bán kính 1km khớp `VehicleType`.
  4. System gửi offer tuần tự tới từng tài xế (Timeout 15s).
  5. Tài xế bấm Accept → Mutex Lock xác nhận → Booking chuyển `DRIVER_ASSIGNED` → Khởi tạo `Trip` → Thông báo Khách hàng.
* **Exceptions:**
  * Không có tài xế trong 1km / Tất cả từ chối → Chuyển `NO_DRIVER_FOUND` → Thông báo Khách hàng.

##### UC-16 — Update Trip Status [Priority: Critical]
* **Actor:** Driver, System.
* **Pre-conditions:** Trip ở trạng thái `DRIVER_ASSIGNED`, Driver đang thực hiện chuyến.
* **Main Flow:**
  Driver thao tác bấm nút chuyển trạng thái lần lượt:
  `DRIVER_ASSIGNED` → `DRIVER_EN_ROUTE` → `DRIVER_ARRIVED` → `PASSENGER_PICKED_UP` → `IN_PROGRESS` → `COMPLETED`.
  Mỗi bước: System validate Valid Transition → Cập nhật `Trip` → Thêm bản ghi `TripStatusHistory` → Phát Event thông báo Khách hàng.
* **Exceptions:**
  * Bấm nhảy cóc trạng thái → System trả HTTP 400 Bad Request, giữ nguyên trạng thái cũ.

##### UC-18 — Cancel Trip [Rubric Item 18]
* **Actor:** Customer, Driver, System.
* **Pre-conditions:** Trip/Booking đang active và chưa chuyển sang `PASSENGER_PICKED_UP`.
* **Main Flow:** User bấm "Hủy chuyến đi" → Chọn/Nhập lý do hủy → System kiểm tra điều kiện hủy hợp lệ → Chuyển trạng thái `Booking`/`Trip` sang `CANCELED` → Chuyển trạng thái Driver về `AVAILABLE` → Gửi thông báo hủy chuyến cho đối phương.

##### UC-25 — Register Driver Profile [Rubric Item 21]
* **Actor:** Driver.
* **Pre-conditions:** Tài xế chưa có tài khoản.
* **Main Flow:** Driver nhập SĐT → Nhập OTP xác thực → Nhập thông tin cá nhân, Số bằng lái, Biển số xe, Loại xe → System lưu thông tin User và Driver ở trạng thái `PENDING_APPROVAL` → Thông báo hồ sơ đang chờ Admin duyệt.

##### UC-26 — Approve Driver Profile [Rubric Item 22]
* **Actor:** Admin.
* **Pre-conditions:** Admin đã đăng nhập với Role `ADMIN`.
* **Main Flow:** Admin mở danh sách hồ sơ tài xế `PENDING_APPROVAL` → Xem chi tiết giấy tờ → Bấm "Duyệt" (hoặc "Từ chối" kèm lý do) → System chuyển trạng thái Driver sang `ACTIVE` (hoặc `REJECTED`) → Gửi thông báo kết quả cho Tài xế.

--------------------------------------------------------------------------------

### BƯỚC 12. TIÊU CHÍ CHẤM NHẬN (ACCEPTANCE CRITERIA - AC)

| AC ID | FR ID | Given (Điều kiện tiền đề) | When (Hành động kích hoạt) | Then (Kết quả kỳ vọng) | Rubric Ref |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **AC-FR-001** | FR-001 | SĐT/Email chưa tồn tại trên DB | Customer submit Đăng ký | Tài khoản tạo thành công, mật khẩu mã hóa Bcrypt. | Rubric Item 9 |
| **AC-FR-002** | FR-002 | Credential chính xác | User bấm Đăng nhập | Hệ thống trả về JWT Token chứa `sub` và `role`. | Rubric Item 10 |
| **AC-FR-006** | FR-006 | Customer có JWT Token hợp lệ | Gọi API dành riêng cho Driver | Hệ thống chặn và trả lỗi HTTP 403 Forbidden. | Rubric Item 28 |
| **AC-FR-010** | FR-010 | Đầy đủ pickup, dropoff, vehicle_type| Customer submit Đặt xe | Booking khởi tạo trạng thái `CREATED` -> `SEARCHING_DRIVER`.| Rubric Item 15 |
| **AC-FR-017** | FR-017 | Booking `SEARCHING_DRIVER` | System quét tài xế | Chỉ trả về Driver `AVAILABLE` trong bán kính 1km. | Rubric Item 13 |
| **AC-FR-020** | FR-020 | Driver nhận được Offer | Driver bấm Chấp nhận | Trip khởi tạo, Booking chuyển `DRIVER_ASSIGNED`. | Rubric Item 16 |
| **AC-FR-032** | FR-032 | Trip đang `IN_PROGRESS` | Driver bấm Hoàn thành | Trip chuyển `COMPLETED`, tự động kích hoạt tính cước `Fare`.| Rubric Item 17 |
| **AC-FR-045** | FR-045 | Provider gửi Webhook thanh toán | System tiếp nhận Webhook | Checksum hợp lệ -> Payment chuyển `COMPLETED`. | Rubric Item 19 |
| **AC-FR-078** | FR-078 | Trip ở trạng thái `COMPLETED` | Customer chấm 5 sao | Bản ghi Rating lưu thành công vào cơ sở dữ liệu. | Rubric Item 20 |
| **AC-FR-088** | FR-088 | Thông tin bằng lái/xe đầy đủ | Driver submit Đăng ký | Hồ sơ được tạo trạng thái `PENDING_APPROVAL`. | Rubric Item 21 |
| **AC-FR-089** | FR-089 | Admin xem hồ sơ `PENDING_APPROVAL` | Admin bấm "Duyệt" | Trạng thái Driver cập nhật sang `ACTIVE`. | Rubric Item 22 |
| **AC-FR-091** | FR-091 | Trip chưa đón khách (`EN_ROUTE`) | Customer bấm Hủy chuyến | Status chuyển `CANCELED`, Driver trở về `AVAILABLE`.| Rubric Item 18 |
| **AC-FR-093** | FR-093 | Có tọa độ latitude/longitude | Gọi API tìm Driver 1km | Trả danh sách Driver xung quanh có phân trang `limit`/`page`.| Rubric Item 13 |
| **AC-FR-095** | FR-095 | Hệ thống microservices đang chạy | Gọi `/health`, `/ready` | Trả HTTP 200 OK kèm danh sách status từng service. | Rubric Item 6 |

--------------------------------------------------------------------------------

### BƯỚC 13. MA TRẬN TRUY XUẤT YÊU CẦU (REQUIREMENTS TRACEABILITY MATRIX - RTM)

| Business Goal | Business Requirement | Business Process | Functional Requirement | Use Case | Rubric Item Ref |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **BG1, BG2** | BR-01 | BP-01, BP-03 | FR-001, FR-002, FR-008..016 | UC-01, UC-02, UC-04 | Rubric Item 9, 10, 15 |
| **BG2** | BR-02, BR-03 | BP-04 | FR-017 → FR-027, FR-093 | UC-04, UC-14, UC-15 | Rubric Item 13, 15, 16 |
| **BG3** | BR-04 | BP-06 | FR-028 → FR-037, FR-082, FR-090 | UC-05, UC-06, UC-16 | Rubric Item 14, 17 |
| **BG3** | BR-14 | BP-14 | FR-091, FR-092 | UC-27 | Rubric Item 18 |
| **BG1, BG3** | BR-05, BR-06 | BP-07, BP-08 | FR-038 → FR-053, FR-094 | UC-08, UC-23 | Rubric Item 19 |
| **BG3** | BR-08 | BP-09, BP-10 | FR-054 → FR-062, FR-078 → FR-081 | UC-09, UC-24 | Rubric Item 20 |
| **BG4, BG7** | BR-15 | BP-13 | FR-088, FR-089 | UC-25, UC-26 | Rubric Item 21, Rubric Item 22 |
| **BG4, BG7** | BR-09, BR-10, BR-11 | BP-05, BP-11, BP-12 | FR-006, FR-007, FR-063..077, FR-085..087 | UC-13, UC-17..22 | Rubric Item 23, 28 |
| **BG5, BG6** | BR-12, BR-13 | Infrastructure | FR-061, FR-062, FR-095, NFR Architecture | All UC | Rubric Item 1, 3, 4, 5, 6, 7, 8 |
| **BG7** | BR-07, BR-10 | Security NFR | FR-003, FR-007, NFR-SEC-01..07 | All UC | Rubric Item 2, Rubric Item 24, Rubric Item 25, Rubric Item 26, Rubric Item 27, Rubric Item 28, Rubric Item 29, Rubric Item 30 |

--------------------------------------------------------------------------------

### PHỤ LỤC: DANH MỤC API ENDPOINTS & QUY CHUẨN KỸ THUẬT

#### Danh mục API Endpoints Kiểm thử (Postman Test Suite Compliance Table)
* `GET /health`, `GET /ready`, `GET /health/services` — Health check trạng thái hệ thống và microservices [Rubric Item 6].
* `POST /api/v1/auth/customer/register` — Đăng ký tài khoản Khách hàng [Rubric Item 9].
* `POST /api/v1/auth/login` — Đăng nhập và nhận Token JWT [Rubric Item 10].
* `GET /api/v1/customers/{id}` — Lấy thông tin khách hàng theo mã [Rubric Item 11].
* `GET /api/v1/drivers/{id}` — Lấy thông tin tài xế theo mã [Rubric Item 12].
* `GET /api/v1/drivers/nearby?lat={lat}&lng={lng}&radius=1km&limit=10&page=1` — Danh sách tài xế xung quanh bán kính 1km có phân trang [Rubric Item 13].
* `GET /api/v1/customers/{id}/bookings?limit=10&page=1` — Danh sách booking của Khách hàng có phân trang [Rubric Item 14].
* `POST /api/v1/bookings` — Tạo booking đặt xe mới [Rubric Item 15].
* `POST /api/v1/trips/{id}/accept` — Tài xế nhận chuyến đi [Rubric Item 16].
* `PATCH /api/v1/trips/{id}/status` — Cập nhật 5 bước trạng thái chuyến đi [Rubric Item 17].
* `POST /api/v1/trips/{id}/cancel` — Hủy chuyến đi kèm lý do [Rubric Item 18].
* `POST /api/v1/payments/online` & Webhook Callback — Thanh toán điện tử online [Rubric Item 19].
* `POST /api/v1/trips/{id}/rating` — Đánh giá chuyến đi (sao + nhận xét) [Rubric Item 20].
* `POST /api/v1/auth/driver/register` — Đăng ký hồ sơ Tài xế [Rubric Item 21].
* `PATCH /api/v1/admin/drivers/{id}/approve` — Admin duyệt/từ chối hồ sơ Tài xế [Rubric Item 22].
* `PATCH /api/v1/drivers/availability` — Bật/tắt trạng thái Online/Offline [Rubric Item 23].

--------------------------------------------------------------------------------

### NHẬT KÝ THAY ĐỔI TÀI LIỆU (CHANGE LOG)

| STT | Nội dung Chỉnh sửa / Bổ sung | Lý do Chỉnh sửa / Nguồn Đối chiếu | Tiêu chí Rubric / Technical Audit Liên quan |
| :--- | :--- | :--- | :--- |
| **1** | Bổ sung quy trình Đăng ký Tài xế (`FR-088`, `UC-25`) và Duyệt hồ sơ Tài xế bởi Admin (`FR-089`, `UC-26`). | Khắc phục thiếu sót đề cập trong Technical Audit Review & Phủ tiêu chí Rubric chấm điểm. | **Rubric Item 21, Rubric Item 22** |
| **2** | Bổ sung chức năng Hủy chuyến đi (`FR-091`, `FR-092`, `UC-27`) kèm cập nhật trạng thái `CANCELED` và giải phóng tài xế về `AVAILABLE`. | Giải quyết bế tắc luồng nghiệp vụ khi khách hàng/tài xế muốn hủy chuyến & Phủ tiêu chí Rubric. | **Rubric Item 18** |
| **3** | Bổ sung API Tra cứu danh sách Tài xế xung quanh điểm đón trong bán kính 1km (`FR-093`) có phân trang (`limit`, `page`). | Phù hợp BRL-013 & Đáp ứng chính xác yêu cầu Rubric kiểm thử Postman. | **Rubric Item 13** |
| **4** | Chuẩn hóa API Tra cứu danh sách Booking của Customer (`FR-082`) có phân trang (`limit`, `page`). | Đáp ứng yêu cầu Rubric kiểm thử Postman cho danh sách booking khách hàng. | **Rubric Item 14** |
| **5** | Định nghĩa chi tiết Bảng Containers Docker Compose, Kiến trúc Microservices và gRPC/Kafka IPC. | Chuẩn hóa kiến trúc hạ tầng hệ thống theo yêu cầu môn học MSA & Rubric. | **Rubric Item 1, Rubric Item 3, Rubric Item 4, Rubric Item 5, Rubric Item 7, Rubric Item 8** |
| **6** | Bổ sung Yêu cầu & Endpoint API Health Check (`/health`, `/ready`, `/health/services`). | Đáp ứng tiêu chí kiểm thử Endpoint trạng thái dịch vụ trong Rubric. | **Rubric Item 6** |
| **7** | Bổ sung các Yêu cầu Phi chức năng Bảo mật (Mã hóa Bcrypt, Chống SQLi, Chống XSS, JWT Signature Check, Chặn 403 Forbidden, Rate Limit 429, Replay Attack / Idempotency). | Khắc phục các lỗ hổng an toàn thông tin & Đáp ứng trọn vẹn 7 tiêu chí Bảo mật trong Rubric. | **Rubric Item 2, Rubric Item 24, Rubric Item 25, Rubric Item 26, Rubric Item 27, Rubric Item 28, Rubric Item 29, Rubric Item 30** |
| **8** | Giải quyết mâu thuẫn giữa Matching Broadcast và Sequential Dispatch: Chốt cơ chế Sequential Dispatch kèm Mutex Lock (BRL-015, BRL-016). | Xử lý mâu thuẫn nội tại nêu tại file Audit Review, đảm bảo không bị xung đột concurrency. | **Technical Audit Item 1** |
| **9** | Chuẩn hóa 5 bước chuyển trạng thái Chuyến đi (`DRIVER_ASSIGNED` → `EN_ROUTE` → `ARRIVED` → `PICKED_UP` → `IN_PROGRESS` → `COMPLETED`) và khớp với nhãn tiếng Việt. | Khắc phục mâu thuẫn nhãn & số bước chuyển đổi trạng thái chuyến đi. | **Technical Audit Item 1** |
| **10**| Tách bạch rõ ràng giữa `Booking` (Request) và `Trip` (Actual Ride) cùng `booking_id` và `trip_id` độc lập (`FR-012`). | Xử lý mâu thuẫn gộp ID và nhập nhằng trạng thái giữa Booking và Trip. | **Technical Audit Item 1, 3** |
| **11**| Quy định rõ tài xế xác nhận trực tiếp khi nhận tiền mặt (`FR-094`, `BRL-037`) và luồng Cập nhật tọa độ định kỳ (`FR-090`). | Khắc phục các requirement thiếu sót nêu trong file Audit Review. | **Technical Audit Item 2** |
| **12**| Chuẩn hóa cấu trúc Audit Log bao gồm `actor_type` (`SYSTEM`, `EXTERNAL_PROVIDER`) và trường `reason`, `ip_address`. | Thống nhất cấu trúc Audit Log toàn hệ thống. | **Technical Audit Item 1** |
| **13**| Loại bỏ toàn bộ ghi chú nội bộ, câu hỏi thảo luận, placeholder và nhãn tạm. | Làm sạch tài liệu theo mục 5 trong yêu cầu của người dùng, sẵn sàng nộp trực tiếp. | **User Request Requirement 5** |
