# Kiểm thử phiếu chấm CAB — 30 tiêu chí

Nguồn đối chiếu: `../PHIEU_CHAM_PROJECT.pdf`, 6 trang, tiêu chí 1–30. Collection bao phủ toàn bộ mục có kiểm thử trong phiếu, gồm mục 30 Replay attack. Bảng ánh xạ đầy đủ: [RUBRIC.md](RUBRIC.md).

**Chấm bằng gõ tay URL/body:** xem [MANUAL.md](MANUAL.md). Chạy manual Compose override rồi `npm.cmd run manual:prepare`, import `CAB.manual.local.postman_environment.json`; có sẵn 5 tài xế, ít nhất 5 booking, token và mã ngắn. Nghiệp vụ dùng cổng 8080, không cần mở helper. Các bước dưới đây dành cho bộ hồi quy tự động và kiểm chứng DB/tạo tải.

## Chạy bằng Postman

Từ thư mục gốc `3.0`:

```powershell
npm.cmd ci
docker compose -f docker-compose.yml -f postman/docker-compose.rubric.yml up --build -d
docker compose ps
npm.cmd run postman:prepare
```

Giữ terminal cuối mở. Công cụ này đọc `.env`, tạo **`postman/CAB.local.postman_environment.json`** có sẵn admin credentials, webhook secret và token công cụ bằng chứng. File local và report được `.gitignore` bảo vệ. Không đưa file local lên Git hoặc chia sẻ: đánh dấu kiểu `secret` của Postman chỉ che giao diện, không mã hóa file export.

Import vào Postman:

1. `CAB-30-Criteria.postman_collection.json`.
2. `CAB.local.postman_environment.json`, chọn Environment này.
3. Mở Collection → **Run collection** → chọn tất cả folder, **1 iteration**, delay **0**, chạy từ folder `00` đến `14`. Dùng Desktop Agent hoặc Postman desktop để truy cập localhost. Không dùng Performance Runner cho luồng tạo dữ liệu.

Không cần nhập trước ID, token, OTP, booking, trip hay payment. Các request tự nối dữ liệu. Tọa độ mặc định `AUTO` tạo vùng thử riêng mỗi lần, tránh tài xế demo cũ làm thay đổi thứ tự nearest-first. Muốn dùng tọa độ cố định: đặt `pickup_lat`, `pickup_lng`, `auto_coordinates=false` và bảo đảm không có tài xế cũ ở đó.

Collection có 164 request trong 16 folder, gồm kiểm tra URL/mã ngắn, vòng poll thông báo Kafka và replay đồng thời trong script. Bấm **Send** từng request không thay thế chạy đầy đủ Collection Runner; các request sau phụ thuộc các biến được tạo ở request trước. Cho phép timeout ít nhất 60 giây cho request bằng chứng DB/tạo tải.

## Chạy tự động bằng Newman

Đóng terminal helper trước nếu đang chạy `postman:prepare`, tránh trùng cổng 8099:

```powershell
npm.cmd run test:postman
```

Runner tự chuẩn bị Environment, mở helper, chạy collection, đóng helper và trả exit code khác 0 nếu bất kỳ assertion nào lỗi. Báo cáo đã loại dữ liệu credential nằm tại **`postman/reports/latest.json`**; không lưu nguyên Newman execution/environment có secret. Không dùng `--suppress-exit-code` để che lỗi.

`npm.cmd run postman:build` tái sinh collection/template từ `scripts/build-postman.js`. Nếu sửa test, sửa generator rồi sinh lại để JSON không lệch. Environment local được tạo lại từ template khi chạy prepare/runner; không sửa template để chèn secret thật.

## Biến dùng lại

| Nhóm | Biến | Nguồn |
|---|---|---|
| Kết nối | `base_url`, `evidence_url` | Gateway 8080; helper loopback 8099 |
| Admin | `admin_username`, `admin_password` | Tự lấy từ `.env` bằng prepare |
| Callback | `payment_webhook_secret`, `webhook_status` | Secret từ `.env`; mặc định SUCCESS |
| Dữ liệu | `test_password`, `vehicle_type`, `fixed_fare`, `cancel_reason`, `xss_payload` | Template có giá trị mặc định |
| Vị trí | `pickup_lat`, `pickup_lng`, `dropoff_lat`, `dropoff_lng`, `geo_radius` | AUTO tạo tọa độ riêng; bán kính 1km |
| Phân trang | `page_size` | Mặc định 2; test kiểm tra cả giới hạn và không lặp |
| Thông báo | `notification_poll_ms`, `notification_poll_attempts` | 250ms × 40 lần, không chỉ sleep rồi mặc định pass |
| Rate limit | `rate_limit_requests`, `rate_limit_expected`, `rate_limit_cooldown_ms` | 3000 request; giới hạn thật 1000; phục hồi sau 1600ms |
| Runtime | `*_id`, `*_token`, `driver*_otp`, `payment_snapshot`, `run_id`… | Tự lưu trong lần chạy; không hardcode |

## Dữ liệu và giới hạn của phép thử

- Mỗi lần chạy tạo 2 customer và 5 driver account. Trạng thái tài xế gồm 2 AVAILABLE, 1 PENDING_APPROVAL, 1 REJECTED, 1 ACTIVE/OFFLINE; lúc nhận chuyến còn kiểm tra BUSY.
- Tạo 5 booking seed rồi hủy, giữ lịch sử để kiểm tra paging; tạo thêm trip hoàn thành và trip hủy. Cuối lượt đưa tài xế test về OFFLINE và logout customer. Không xóa dữ liệu có sẵn. Nếu dừng giữa chừng, chỉ dọn tài khoản có namespace `rubric-*` của lượt đó.
- OTP có kiểm tra thật mã ngẫu nhiên, TTL, sai mã, dùng lại và ràng buộc tài khoản. **Transport là mô phỏng SMS local** qua inbox ADMIN hoặc hộp thư riêng `/auth/otp` của chính Driver, chỉ bật bằng Compose override. Verify có thể chỉ nhập `code`, không cần challenge UUID. Production SMS chưa triển khai. Tắt test mode bằng `docker compose up -d auth-service` hoặc bỏ override khi triển khai lại.
- Payment provider là **mô phỏng callback có chữ ký**, không phát sinh giao dịch tiền thật. Test không tự tuyên bố đã tích hợp ngân hàng.
- Notification được gửi vào **hộp thư riêng theo người dùng**, lấy bằng polling; chưa có push/SMS ra thiết bị. Test xác nhận đúng người nhận và đúng event, không chỉ log chung.
- Burst rate-limit gửi body tọa độ sai vào `POST /api/v1/bookings`, nên không tạo hàng nghìn booking. Helper tạo tấn công **ẩn danh**, HTTP/1.1 pipelining trên **16 kết nối TCP trong gateway container** để loại giới hạn socket Windows/Postman. Từng request vẫn đi qua REST middleware và Redis limiter thật; request được phép qua limiter trả 401, request vượt ngưỡng trả 429. Giữ nguyên ngưỡng 1000; không hạ ngưỡng để làm test pass. Test đo thời điểm phát byte lên socket, nhận 429, không có 5xx/lỗi kết nối và readiness phục hồi. Đây là smoke tải local, không phải thử mạng từ máy bên ngoài hoặc chứng nhận SLA production.
- `postman-support.js` là **công cụ kiểm chứng**, không phải endpoint quản trị public của CAB. Chỉ bind `127.0.0.1:8099`, yêu cầu token ngẫu nhiên, dùng Docker để đọc DB và trả boolean/count; không trả key, password hash hay ciphertext. Không đóng gói nó vào image backend.
- Tiêu chí 1–5, 7, 8 có phần mô tả/kiểm tra trực quan. Collection cung cấp bằng chứng kỹ thuật hỗ trợ, còn điểm của giảng viên phải dựa vào phiếu thực tế. Riêng mục 2 cần kiểm tra thêm GitHub và lịch sử commit; chỉ kiểm tra local index không chứng minh repository từ trước tới nay chưa lộ secret.

Các API mới và thay đổi contract được ghi trong `API-Specifications/cab-openapi-spec.yaml`: OTP bắt buộc trước khi gửi hồ sơ tài xế; tài xế BUSY không thể tự đổi availability; trip có location và payment_status/payment_id; thanh toán trùng trip bằng key mới bị từ chối.

Tham khảo cách dùng Collection Runner/Newman và script theo [Postman workflows](https://learning.postman.com/docs/tests-and-scripts/write-scripts/postman-sandbox-reference/pm-execution) và [pm.sendRequest](https://learning.postman.com/docs/tests-and-scripts/write-scripts/postman-sandbox-reference/pm-send-request).
