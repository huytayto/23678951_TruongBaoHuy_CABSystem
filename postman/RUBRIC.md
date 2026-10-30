# Ánh xạ đủ 30 tiêu chí từ PHIEU_CHAM_PROJECT.pdf

Tên folder và request chứa `[STT]` đúng số trong PDF. `API` là assertion tự động; `DB` là đọc DB bằng helper có token riêng; `Review` cần trình bày/kiểm tra trực quan. Assertion đạt không tự quy đổi thành điểm do giảng viên chấm.

Khi gõ request bằng tay, dùng [MANUAL.md](MANUAL.md): URL bỏ `/api/v1`, mã đọc được C/D/B/T/P, Environment riêng có sẵn token và dữ liệu. Các alias vẫn chạy cùng handler kiểm tra quyền; không có API đổi dữ liệu bằng GET. Offer manual 300 giây, cấu hình thường 15 giây. OTP riêng và callback mô phỏng chỉ bật trong chế độ local tương ứng.

| STT | Tiêu chí | Kiểm chứng và bằng chứng |
|---:|---|---|
| 1 | Mô tả kiến trúc source | **Review**, folder 12 hỗ trợ: 8 tiến trình ứng dụng; source dùng chung chọn SERVICE_CONTEXT; `services/domain-service.js`, `api-gateway/src`, `shared/proto`, scripts, tests, infrastructure. Gateway + 7 domain service, không nói có 8 domain service. |
| 2 | `.gitignore`, `.env` trên GitHub | **Review + local evidence**: helper xác nhận `.env` bị ignore và không được track hiện tại; file Environment local cũng bị ignore. Cần mở GitHub kiểm tra repository và lịch sử commit riêng. |
| 3 | Nhiệm vụ Gateway | **Review + API**: folder 00/11/13 chứng minh routing, health, JWT, RBAC, rate limit, thu hồi token. Giải thích REST public → gRPC internal. |
| 4 | IPC microservice | **Review + runtime evidence**: folder 12 kiểm tra contract gRPC, source runtime khớp source local, topic Kafka. Các lời gọi gRPC đồng bộ và notification consume bất đồng bộ được thực hiện trong nghiệp vụ. |
| 5 | Compose và danh sách container | **Review + runtime evidence**: folder 12 liệt kê container, state, health, port; chạy `docker compose ps`. Gồm 8 app, PostgreSQL, Redis, Kafka, Kafka UI: tổng 12. |
| 6 | API health check | **API**, folder 00: `/health`, `/ready`, `/health/services`, đủ 8 app và 3 hạ tầng UP. |
| 7 | Kafka/RabbitMQ | **Review + runtime/API evidence**: topic thật trong broker, thông báo phát từ từng nghiệp vụ vào inbox; event settlement ghi một lần trong DB notification. |
| 8 | Request qua Gateway | **Review + runtime evidence**: public API đều base_url gateway; domain gRPC ports không publish host. Helper DB là công cụ local riêng, không phải đường vào nghiệp vụ. |
| 9 | Đăng ký customer | **API**, folder 01: tạo user mới, trả uid/role, đăng nhập được; username trùng trả 409. |
| 10 | Đăng nhập customer | **API**, folder 01: JWT của đúng uid; mật khẩu sai trả 401 không token. |
| 11 | Lấy customer theo mã | **API**, folder 04: lấy đúng customer_id; khách khác 403; không lộ password/hash. |
| 12 | Lấy driver theo mã | **API**, folder 03/04: admin xem hồ sơ, driver xem chính mình; đúng ID/biển số giải mã. |
| 13 | Nearby 1km, >=5 driver nhiều trạng thái, limit/paging | **API**, folder 02–04 tạo đủ 5 hồ sơ; 2 AVAILABLE, 1 PENDING, 1 REJECTED, 1 ACTIVE/OFFLINE. Nearby chỉ lấy hợp lệ trong 1km, tăng dần khoảng cách; limit=1 hai trang không lặp. |
| 14 | >=5 booking, limit/paging theo customer | **API**, folder 05: tạo 5 booking, trang 1/2 đúng giới hạn, không lặp, toàn bộ seed ID có trong DB qua API; khách khác không thấy. |
| 15 | Đặt xe, tìm tài xế, gửi offer | **API**, folder 05/06: SEARCHING_DRIVER, đúng owner, tài xế gần nhất nhận offer, driver tự đọc được thông tin điểm đón/đến. |
| 16 | Driver nhận offer, xem và chấp nhận, customer nhận driver | **API**, folder 06: inbox DriverOfferCreated, GET offers, accept đúng tài xế, sai tài xế 409, tìm trip theo booking bằng token customer, có driver detail và DriverAssigned. |
| 17 | Trạng thái đúng thứ tự và vị trí di chuyển | **API**, folder 07: chặn nhảy trạng thái, chỉ assigned driver, đủ EN_ROUTE → ARRIVED → PICKED_UP → IN_PROGRESS → COMPLETED, cập nhật và đọc lại location. |
| 18 | Hủy có lý do, CANCELED, thông báo các bên | **API**, folder 05/10: hủy booking/trip; chặn thiếu reason và sai owner; lưu lý do, trạng thái bền vững; inbox cả driver/customer có TripCanceled của đúng trip. |
| 19 | Online callback → COMPLETED, trip paid | **API**, folder 08: tạo PENDING, không tin amount/customer từ client, HMAC sai 401, HMAC đúng COMPLETED; đọc trip có PAID và đúng payment_id. Provider local mô phỏng. |
| 20 | Rating lưu và liên kết trip | **API + DB**, folder 09/12: 5 sao, đúng trip, 6 sao/sai owner bị chặn; đánh giá lại 409; DB có đúng một rating. |
| 21 | OTP, gửi hồ sơ PENDING_APPROVAL | **API**, folder 02: request OTP ngẫu nhiên 6 chữ số, ADMIN local inbox, sai mã 400, đúng mã verified, replay 400, chưa OTP không gửi profile; profile chờ duyệt/OFFLINE. SMS local mô phỏng, không claim gửi thật. |
| 22 | Danh sách chờ duyệt, chi tiết, duyệt/từ chối và nhận kết quả | **API**, folder 03: 5 hồ sơ pending xuất hiện, admin xem chi tiết, duyệt 1/2/5 và từ chối 4, driver nhận DriverApprovalChanged qua inbox của mình. |
| 23 | Online/Offline | **API**, folder 04: bật/tắt/bật lại, vị trí Geo; pending/rejected không online; BUSY không thể tự AVAILABLE. Cleanup cuối lượt về OFFLINE. |
| 24 | Encryption at rest, plaintext không đọc được, key management | **DB**, folder 12: đọc trực tiếp auth/customer/driver DB; bcrypt cost 12, AES-GCM name/address/license/plate/phone; decrypt roundtrip; hai key hợp lệ và khác nhau; key không nằm trong ENV của image. Key inject qua Compose, chưa phải production KMS/rotation. |
| 25 | SQL injection | **API**, folder 11: payload email đúng PDF và username đúng contract; 400/401, không token, không lộ SQL/hash. |
| 26 | XSS input/output escape | **API**, folder 09: nguyên payload trong PDF vào rating/profile; đúng HTML escaping, đọc lại vẫn escape. API JSON không tự chạy JavaScript; không tuyên bố browser E2E. |
| 27 | JWT sửa sub/role | **API**, folder 11: đổi cả hai claim thành ADMIN thật, giữ signature cũ; endpoint admin trả 401, không trả dữ liệu driver. |
| 28 | Customer không được gọi Driver API | **API**, folder 11: GET driver, nearby và approve đều 403, không dữ liệu; thiếu token 401. |
| 29 | >1000 POST booking/sec, 429, không sập | **API/load**, folder 13: helper phát 3000 POST ẩn danh qua HTTP/1.1 pipelining từ trong gateway container, 16 kết nối, đo tốc độ phát >1000/giây, có 429, không lỗi kết nối/5xx; ngưỡng server giữ 1000; `/ready` phục hồi. Mỗi POST qua REST/Redis thật; không tạo booking rác. Không mô tả đây là kiểm thử đường truyền từ bên ngoài. |
| 30 | Replay payment, không double charge, response cũ | **API + DB**, folder 08/12: replay trước/sau callback đều deep-equal response gốc và cùng payment_id; callback lặp không event trùng; key khác/cash không tạo payment thứ hai; DB có đúng 1 payment và 1 event settlement cho trip. |

Khi demo, mở báo cáo `reports/latest.json` cùng Collection Runner. Không đánh dấu 30/30 chỉ dựa vào số lượng request màu xanh: các dòng Review và điều kiện mô phỏng cần được người chấm xem xét.
