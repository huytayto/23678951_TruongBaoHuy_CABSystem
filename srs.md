### 1. Business Context
- ABC đang chuyển đổi từ mô hình đặt xe phụ thuộc vào tổng đài và phân công tài xế thủ công sang mô hình nền tảng CAB số hóa và tự động hóa. CAB đóng vai trò là hệ thống trung tâm kết nối khách hàng, tài xế và bộ phận vận hành, quản lý toàn bộ vòng đời chuyến xe từ đặt xe, tìm tài xế, thực hiện chuyến, tính cước, thanh toán, thông báo đến đánh giá. Hệ thống đồng thời tích hợp với các hệ thống bên ngoài như Payment Provider, Notification Provider và Map/Location Provider.

- Về mặt kinh doanh, CAB cần giúp ABC giảm thao tác thủ công, nâng cao tỷ lệ đáp ứng chuyến, cải thiện trải nghiệm khách hàng, tăng hiệu quả vận hành và tạo nền tảng có khả năng mở rộng cho các loại dịch vụ, phương thức thanh toán và kênh thông báo mới.

- Trong phạm vi hiện tại, các quy tắc về pricing, driver matching, timeout, cancellation, payment retry, location tracking và data retention chưa được chốt và cần được xác nhận trước khi hoàn thiện thiết kế chi tiết.
### 2. Business Problem
- ABC hiện đang gặp khó khăn trong việc vận hành và mở rộng dịch vụ đặt xe do quy trình booking và phân công tài xế còn phụ thuộc nhiều vào thao tác thủ công, trong khi khả năng theo dõi chuyến, quản lý thanh toán, thông báo và hỗ trợ vận hành chưa được tập trung trên một nền tảng thống nhất.

- Những hạn chế này làm tăng thời gian xử lý yêu cầu, tăng tải cho bộ phận vận hành, làm giảm khả năng cung cấp thông tin realtime cho khách hàng và gây khó khăn trong việc xử lý các trường hợp ngoại lệ. Đồng thời, kiến trúc hiện tại chưa đáp ứng tốt yêu cầu mở rộng số lượng khách hàng, tài xế và chuyến đi, cũng như việc bổ sung các loại dịch vụ, phương thức thanh toán và kênh thông báo mới.

- Do đó, ABC cần một nền tảng CAB có khả năng số hóa và tự động hóa toàn bộ vòng đời chuyến xe, đồng thời cung cấp khả năng quản lý tập trung, realtime visibility, integration với các hệ thống bên ngoài và kiến trúc đủ linh hoạt để đáp ứng nhu cầu phát triển dài hạn.


### 3. Stakeholder
1. Business Stakeholders
   - Ban Giám đốc / Sponsor
   - Finance / Accounting

2. Operational Stakeholders
   - Operation Staff
   - Customer Support
   - Admin

3. End Users
   - Customer
   - Driver

4. Technology Stakeholders
   - IT / Technical Team
   - Security / Compliance

5. External Stakeholders
   - Payment Provider
   - Notification Provider
   - Map / Location Provider
   - Other External Service Providers


- Matrix Stakeholder tổng quan:
                         ┌──────────────────────┐
                         │    BAN GIÁM ĐỐC      │
                         │   Business Sponsor   │
                         └──────────┬───────────┘
                                    │
                              Business Goal
                                    │
                                    ▼
┌──────────────┐             ┌───────────────┐             ┌──────────────┐
│   CUSTOMER   │────────────►│               │◄────────────│    DRIVER    │
│              │             │   CAB SYSTEM  │             │              │
└──────────────┘             │               │             └──────────────┘
                             └───────┬───────┘
                                     │
                          ┌──────────┼──────────┐
                          ▼          ▼          ▼
                     Operation   Finance    IT/Technical
                          │          │          │
                          └──────────┼──────────┘
                                     │
                                     ▼
                         External Service Providers
                         ├── Payment Provider
                         ├── Notification Provider
                         └── Map/Location Provider