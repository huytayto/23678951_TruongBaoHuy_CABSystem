# Kết quả kiểm thử thực tế

- Thời điểm hồi quy Postman: lúc 10:31:45 GMT+7 30 tháng 10, 2026.
- Nguồn tiêu chí: PHIEU_CHAM_PROJECT.pdf, 30 tiêu chí.
- Collection: 164 request / 16 folder; 175 HTTP request gồm polling và replay đồng thời.
- Assertion: 539; lỗi: 0.
- Lỗi request: 0; script lỗi: 0.
- Unit/contract tests: 14/14 đạt.

## Chấm tay bằng URL và mã ngắn

- 33 request kiểm tra URL ngắn, mã C/D/B/T/P, token, quyền sở hữu, trạng thái chuyến và callback mô phỏng: đạt.
- 5 request kiểm tra cấu hình thường: OTP/payment simulator tắt (404), offer TTL 15 giây, mã không đổi sau restart: đạt.
- Đã khôi phục cấu hình manual: offer 300 giây, tài khoản demo và Environment có sẵn. Hướng dẫn: MANUAL.md; mã hiện có: MANUAL.local.md.

## Rate limit thật

- Phát 3000 POST, peak 3000 request trong một giây.
- Nhận 1000 HTTP 429; lỗi kết nối 0; HTTP 5xx 0.
- HTTP/1.1 pipelining, 16 kết nối, client tạo tải trong gateway container; mọi POST qua REST middleware và Redis limiter thật. Ngưỡng giữ nguyên 1000.
- Readiness sau burst đạt HTTP 200.

## Phạm vi xác nhận

OTP/SMS và payment provider là mô phỏng local; notification là inbox polling. Bộ test xác nhận DB mã hóa, snapshot idempotency và một payment/settlement event.

Xem RUBRIC.md: tiêu chí mô tả kiến trúc, GitHub/lịch sử cần người chấm xem xét. Assertion không tự thay thế điểm 30/30. Báo cáo chi tiết đã loại credentials trong reports/ (Git ignore).
