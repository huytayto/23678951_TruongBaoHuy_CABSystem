# SRS — CAB System (Nền tảng đặt xe)

---

## Bước 1 — Business Context & Business Problem 

### 1. Business Context

- ABC đang chuyển đổi từ mô hình đặt xe phụ thuộc vào tổng đài và phân công tài xế thủ công sang mô hình nền tảng CAB số hóa và tự động hóa. CAB đóng vai trò là hệ thống trung tâm kết nối khách hàng, tài xế và bộ phận vận hành, quản lý toàn bộ vòng đời chuyến xe từ đặt xe, tìm tài xế, thực hiện chuyến, tính cước, thanh toán, thông báo đến đánh giá. Hệ thống đồng thời tích hợp với các hệ thống bên ngoài như Payment Provider, Notification Provider và Map/Location Provider.

- Về mặt kinh doanh, CAB cần giúp ABC giảm thao tác thủ công, nâng cao tỷ lệ đáp ứng chuyến, cải thiện trải nghiệm khách hàng, tăng hiệu quả vận hành và tạo nền tảng có khả năng mở rộng cho các loại dịch vụ, phương thức thanh toán và kênh thông báo mới.

- Trong phạm vi hiện tại, các quy tắc về pricing, driver matching, timeout, cancellation, payment retry, location tracking và data retention chưa được chốt và cần được xác nhận trước khi hoàn thiện thiết kế chi tiết.

### 2. Business Problem

- ABC hiện đang gặp khó khăn trong việc vận hành và mở rộng dịch vụ đặt xe do quy trình booking và phân công tài xế còn phụ thuộc nhiều vào thao tác thủ công, trong khi khả năng theo dõi chuyến, quản lý thanh toán, thông báo và hỗ trợ vận hành chưa được tập trung trên một nền tảng thống nhất.

- Những hạn chế này làm tăng thời gian xử lý yêu cầu, tăng tải cho bộ phận vận hành, làm giảm khả năng cung cấp thông tin realtime cho khách hàng và gây khó khăn trong việc xử lý các trường hợp ngoại lệ. Đồng thời, kiến trúc hiện tại chưa đáp ứng tốt yêu cầu mở rộng số lượng khách hàng, tài xế và chuyến đi, cũng như việc bổ sung các loại dịch vụ, phương thức thanh toán và kênh thông báo mới.

- Do đó, ABC cần một nền tảng CAB có khả năng số hóa và tự động hóa toàn bộ vòng đời chuyến xe, đồng thời cung cấp khả năng quản lý tập trung, realtime visibility, integration với các hệ thống bên ngoài và kiến trúc đủ linh hoạt để đáp ứng nhu cầu phát triển dài hạn.

---

## Bước 2 — Stakeholder 

### 3. Stakeholder

**1. Business Stakeholders**
- Ban Giám đốc / Sponsor
- Finance / Accounting

**2. Operational Stakeholders**
- Operation Staff
- Customer Support
- Admin

**3. End Users**
- Customer
- Driver

**4. Technology Stakeholders**
- IT / Technical Team
- Security / Compliance

**5. External Stakeholders**
- Payment Provider
- Notification Provider
- Map / Location Provider
- Other External Service Providers

**Matrix Stakeholder tổng quan:**

# Power–Interest Matrix

| Nhóm Stakeholder | Power | Interest | Quadrant | Cách quản lý |
|---|---|---|---|---|
| Ban Giám đốc / Sponsor | Cao | Cao | **Manage closely** | Quản lý chặt chẽ |
| Operation Staff | Cao | Cao | **Manage closely** | Quản lý chặt chẽ |
| IT / Technical Team | Cao | Cao | **Manage closely** | Quản lý chặt chẽ |
| Security / Compliance | Cao | Cao | **Manage closely** | Quản lý chặt chẽ |
| Finance / Accounting | Cao | Thấp | **Keep satisfied** | Duy trì hài lòng |
| Admin | Thấp | Thấp | **Monitor** | Theo dõi |
| Customer | Thấp | Cao | **Keep informed** | Cập nhật thông tin |
| Driver | Thấp | Cao | **Keep informed** | Cập nhật thông tin |
| Customer Support | Thấp | Cao | **Keep informed** | Cập nhật thông tin |
| Payment Provider | Thấp | Thấp | **Monitor** | Theo dõi |
| Notification Provider | Thấp | Thấp | **Monitor** | Theo dõi |
| Map/Location Provider | Thấp | Thấp | **Monitor** | Theo dõi |
| Other External Providers | Thấp | Thấp | **Monitor** | Theo dõi |

## Ma trận

| | **Interest thấp** | **Interest cao** |
|---|---|---|
| **Power cao** | 🟡 **Keep satisfied**<br>- Finance / Accounting | 🔴 **Manage closely**<br>- Ban Giám đốc / Sponsor<br>- Operation Staff<br>- IT / Technical Team<br>- Security / Compliance |
| **Power thấp** | 🟢 **Monitor**<br>- Admin<br>- Payment Provider<br>- Notification Provider<br>- Map/Location Provider<br>- Other External Providers | 🔵 **Keep informed**<br>- Customer<br>- Driver<br>- Customer Support |

### Chiến lược
- 🔴 **Manage closely:** Phối hợp thường xuyên, tham vấn và cập nhật liên tục.
- 🟡 **Keep satisfied:** Đảm bảo nhu cầu được đáp ứng, tránh để phát sinh vấn đề.
- 🔵 **Keep informed:** Cung cấp thông tin và cập nhật tiến độ phù hợp.
- 🟢 **Monitor:** Theo dõi ở mức cần thiết, không cần giao tiếp thường xuyên.

---

## Bước 3 — Business Goal 

### 4. Business Goal

| Mã | Business Goal | Mô tả |
|---|---|---|
| BG1 | Số hóa và tự động hóa vòng đời chuyến xe | Chuyển đổi toàn bộ quy trình đặt xe, tìm tài xế và phân công từ thao tác thủ công qua tổng đài sang quy trình tự động trên nền tảng số, giảm sự phụ thuộc vào con người trong các bước có thể tự động hóa (matching, thông báo, tính cước). |
| BG2 | Nâng cao tỷ lệ đáp ứng chuyến (fulfillment rate) | Tăng tỷ lệ chuyến được tìm thấy tài xế thành công và hoàn thành, thông qua cơ chế matching thông minh và xử lý timeout/reassign khi tài xế không phản hồi hoặc từ chối, hạn chế tình trạng khách hàng không tìm được xe. |
| BG3 | Cải thiện trải nghiệm khách hàng và tài xế | Cung cấp khả năng theo dõi realtime trạng thái chuyến đi (tìm tài xế, tài xế nhận chuyến, thời gian dự kiến đến, hoàn thành chuyến), lịch sử chuyến, thanh toán minh bạch và đánh giá sau chuyến, giúp tăng mức độ hài lòng và giữ chân người dùng. |
| BG4 | Tập trung hóa quản lý vận hành và dữ liệu | Xây dựng giao diện quản trị tập trung cho nhân viên vận hành để giám sát chuyến, tài xế, xử lý ngoại lệ và tra cứu lịch sử giao dịch, thay vì thông tin phân tán như hiện tại; đồng thời cung cấp báo cáo về số lượng chuyến, doanh thu, tỷ lệ hoàn thành/hủy và hiệu quả tài xế phục vụ ra quyết định. |
| BG5 | Đảm bảo khả năng mở rộng (scalability) và tính sẵn sàng cao (high availability) | Thiết kế kiến trúc cho phép các thành phần hệ thống (booking, payment, notification, tracking) mở rộng độc lập khi tải tăng, và đảm bảo lỗi ở một phân hệ (ví dụ payment hoặc notification) không làm gián đoạn toàn bộ hệ thống đặt xe. |
| BG6 | Tạo nền tảng linh hoạt cho phát triển dài hạn | Cho phép bổ sung trong tương lai các loại hình dịch vụ mới, phương thức thanh toán mới, nhà cung cấp thông báo mới hoặc thay đổi thành phần kỹ thuật mà không cần xây dựng lại toàn bộ hệ thống, thông qua kiến trúc tích hợp (Payment Provider, Notification Provider, Map/Location Provider) theo hướng module hóa. |
| BG7 | Đảm bảo an toàn và tuân thủ dữ liệu | Bảo vệ thông tin cá nhân, dữ liệu vị trí, dữ liệu giao dịch và thông tin thanh toán; kiểm soát quyền truy cập theo vai trò (role-based access) đối với các thao tác quản trị nhạy cảm; lưu vết (audit log) các thao tác quan trọng phục vụ điều tra sự cố. |

---

## Bước 4 — Project Scope 

### 5. Project Scope

#### 5.1 In-Scope (MVP)

**A. Customer**
- Đăng ký / đăng nhập tài khoản
- Cập nhật thông tin cá nhân cơ bản
- Nhập điểm đón, điểm đến, chọn loại xe
- Gửi yêu cầu đặt xe
- Theo dõi trạng thái chuyến (đang tìm tài xế / đã có tài xế / đang di chuyển / hoàn thành)
- Xem lịch sử chuyến và số tiền đã thanh toán
- Đánh giá tài xế sau chuyến (rating đơn giản)

**B. Driver**
- Đăng ký / được Operation tạo tài khoản
- Cập nhật hồ sơ, thông tin phương tiện
- Chuyển trạng thái sẵn sàng / không sẵn sàng nhận chuyến
- Nhận thông báo chuyến mới, chấp nhận / từ chối
- Cập nhật trạng thái chuyến: đã đến điểm đón, đã đón khách, đang di chuyển, hoàn thành

**C. Driver Matching**
- Tìm tài xế phù hợp dựa trên vị trí và trạng thái sẵn sàng (thuật toán matching cơ bản — chưa cần tối ưu nâng cao)
- Cơ chế timeout + reassign sang tài xế khác nếu không phản hồi/từ chối
- Thông báo cho khách hàng nếu không tìm được tài xế

**D. Pricing & Payment**
- Tính cước cơ bản dựa trên loại dịch vụ + thông tin chuyến (công thức đơn giản, chưa gồm surge/dynamic pricing)
- Thanh toán tiền mặt
- Tích hợp 1 Payment Provider cho thanh toán điện tử (không lưu thông tin thẻ trong hệ thống CAB)
- Thông báo khi giao dịch thất bại + cho phép retry cơ bản

**E. Notification**
- Thông báo cho khách hàng: yêu cầu được tiếp nhận, tài xế nhận chuyến, tài xế đến, hoàn thành chuyến, kết quả thanh toán
- Thông báo cho tài xế: chuyến mới, thay đổi chuyến đang thực hiện
- Tích hợp 1 kênh thông báo (ví dụ push notification hoặc SMS) — kiến trúc cho phép mở rộng thêm kênh sau

**F. Operation/Admin**
- Giao diện quản trị cơ bản: xem chuyến đang diễn ra, trạng thái tài xế
- Hỗ trợ xử lý chuyến lỗi (thủ công)
- Tra cứu lịch sử giao dịch
- Phân quyền cơ bản (Admin vs Operation Staff)

**G. Non-functional (mức tối thiểu cho MVP)**
- Xác thực người dùng (Customer, Driver, Admin)
- Kiểm soát truy cập cho thao tác quản trị nhạy cảm
- Log các thao tác quan trọng (audit log cơ bản)
- Kiến trúc cho phép các module (payment, notification) lỗi độc lập không kéo sập toàn hệ thống

#### 5.2 Out-of-Scope

- Báo cáo nâng cao (doanh thu, tỷ lệ hủy, hiệu quả tài xế theo thời gian, dashboard BI)
- Đa dạng phương thức thanh toán (ví điện tử, thẻ tín dụng lưu sẵn, thanh toán trả sau)
- Nhiều kênh thông báo đồng thời (email + SMS + push + in-app)
- Thuật toán matching nâng cao (machine learning, dự đoán nhu cầu, surge pricing)
- Đa loại hình dịch vụ (giao hàng, xe ghép, đặt trước theo lịch)
- Ứng dụng riêng cho Driver/Customer (MVP có thể dùng web responsive hoặc app tối giản)
- Tối ưu hóa location tracking nâng cao (dự đoán ETA chính xác cao, bản đồ realtime chi tiết)
- Chính sách hủy chuyến phức tạp, phí phạt hủy
- Tích hợp nhiều Payment/Notification/Map Provider song song (chỉ 1 provider mỗi loại cho MVP)

---

## Bước 5 — Business Requirement 

### 6. Business Requirement

> **Business Requirement** mô tả cái hệ thống cần làm được ở mức nghiệp vụ (chưa đi sâu vào chi tiết chức năng/màn hình như Functional Requirement), gắn với từng Business Goal và nằm trong phạm vi MVP đã chốt.

| Mã | Business Requirement | Liên kết Business Goal | Nhóm |
|---|---|---|---|
| BR-01 | Hệ thống phải cho phép khách hàng tự đăng ký, xác thực và tạo yêu cầu đặt xe mà không cần qua tổng đài | BG1, BG2 | Booking |
| BR-02 | Hệ thống phải tự động tìm và phân công tài xế phù hợp dựa trên vị trí và trạng thái sẵn sàng, không cần thao tác thủ công của Operation | BG1, BG2 | Matching |
| BR-03 | Hệ thống phải xử lý được trường hợp tài xế không phản hồi/từ chối bằng cách tự động chuyển sang tài xế khác, không yêu cầu khách hàng tạo lại yêu cầu | BG2 | Matching |
| BR-04 | Hệ thống phải cung cấp cho khách hàng khả năng theo dõi trạng thái chuyến đi theo thời gian thực | BG3 | Tracking |
| BR-05 | Hệ thống phải tự động tính cước dựa trên loại dịch vụ và thông tin chuyến sau khi hoàn thành | BG1, BG2 | Payment |
| BR-06 | Hệ thống phải hỗ trợ thanh toán tiền mặt và tích hợp với một nhà cung cấp thanh toán điện tử bên ngoài | BG3, BG6 | Payment |
| BR-07 | Hệ thống không được lưu trữ trực tiếp thông tin nhạy cảm về thẻ/tài khoản thanh toán của khách hàng | BG7 | Payment / Security |
| BR-08 | Hệ thống phải gửi thông báo tới khách hàng và tài xế tại các mốc quan trọng của chuyến đi (tiếp nhận, tài xế nhận chuyến, đến điểm đón, hoàn thành, kết quả thanh toán) | BG3 | Notification |
| BR-09 | Hệ thống phải cung cấp giao diện quản trị để Operation Staff giám sát chuyến đang diễn ra và xử lý các trường hợp ngoại lệ | BG4 | Operation |
| BR-10 | Hệ thống phải phân quyền truy cập, đảm bảo nhân viên thông thường không thể thực hiện các thao tác quản trị nhạy cảm | BG7 | Security |
| BR-11 | Hệ thống phải ghi log các thao tác quan trọng phục vụ tra soát khi có sự cố | BG7 | Security / Audit |
| BR-12 | Kiến trúc hệ thống phải cho phép các thành phần (booking, payment, notification) hoạt động và mở rộng độc lập, lỗi một thành phần không được làm gián đoạn toàn hệ thống | BG5 | Architecture |
| BR-13 | Kiến trúc hệ thống phải cho phép bổ sung provider mới (thanh toán, thông báo, bản đồ) trong tương lai mà không cần xây dựng lại toàn bộ hệ thống | BG6 | Architecture |










