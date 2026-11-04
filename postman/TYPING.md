# Bảng gõ tay khi bảo vệ

Hướng dẫn bảo vệ thuần gõ tay, URL đầy đủ, không biến Postman/scripts, có login ở từng tiêu chí và số URL/lần Send: [TYPING-30.md](TYPING-30.md). File hiện tại là bảng tóm tắt của Collection smoke dùng biến và b11/b12; kịch bản gõ tay trong TYPING-30 dùng kh0 và b6/b7.

Base URL: `http://localhost:8080`. Chạy `npm.cmd run demo:reset` trước lượt mới. Token vẫn dùng Bearer; lấy từ đăng nhập hoặc để Collection tự điền. Các tên trường dài trước đây vẫn được hỗ trợ; response dùng tên trường đầy đủ.

## Tài khoản

| Username | Vai trò | Mật khẩu | Mã sau reset |
|---|---|---|---|
| ad | ADMIN smoke | adminpassword | — |
| kh0–kh4 | CUSTOMER mẫu | customerpassword | c1–c5 |
| tx1–tx10 | DRIVER mẫu | driverpassword | d1–d10 |
| kh5 | CUSTOMER đăng ký ở bước 09 | customerpassword | c6 |
| tx11 | DRIVER đăng ký ở bước 21 | driverpassword | d11 |

`admin` cấu hình vẫn lấy mật khẩu từ `.env`. Username kh5/tx11 và key pay1 chỉ dùng lại sau reset; không có cơ chế bỏ qua lỗi trùng tài khoản hoặc thanh toán.

## JSON ngắn

Danh sách 5 tài xế quanh vị trí vĩ độ 22, kinh độ 111 — token Admin:

```http
GET /api/drivers/nearby?lat=22&lng=111&radius=1km&limit=5&page=1
```

Response gồm d1–d5 với trạng thái khác nhau. `pagination.total` là tổng trong bán kính; `limit=1` chỉ hiển thị một tài xế mỗi trang. Danh sách này dùng vị trí cuối, bao gồm offline/chờ duyệt/từ chối; khi đặt xe hệ thống chỉ gửi offer cho tài xế ACTIVE/AVAILABLE.

Đăng ký customer — `POST /api/register`:

```json
{"user":"kh5","pass":"customerpassword","fullname":"An","role":"CUSTOMER"}
```

Đăng nhập — `POST /api/login`:

```json
{"user":"kh5","pass":"customerpassword"}
```

Đặt xe — `POST /api/bookings`:

```json
{"from_lat":22,"from_lng":111,"to_lat":22.01,"to_lng":111.01}
```

Nhận chuyến — `POST /api/bookings/b11/accept` nếu đi đúng Collection sau reset. Nếu tự thao tác theo luồng khác, dùng `ID` của booking vừa tạo trong response.

Cập nhật chuyến — gửi start, cập nhật vị trí, rồi done. Hai lần cập nhật trạng thái dùng `PATCH /api/trips/t1/status`:

```json
{"status":"start"}
```

Sau start, cập nhật vị trí qua `PATCH /api/trips/t1/location`:

```json
{"lat":22.01,"lng":111.01}
```

Cuối cùng, gửi đến URL status:

```json
{"status":"done"}
```

Luồng `DRIVER_ASSIGNED → IN_PROGRESS → COMPLETED` giữ đúng thứ tự, không được bỏ qua start.

Hủy chuyến riêng — `POST /api/trips/t2/cancel`:

```json
{"reason":"Ban"}
```

Thanh toán — `POST /api/payments/online`, header `Idempotency-Key: pay1`:

```json
{"trip":"t1"}
```

Callback local — `POST /api/payments/p1/callback`, token admin:

```json
{"status":"SUCCESS"}
```

Đánh giá — `POST /api/trips/t1/rating`:

```json
{"stars":5,"comment":"Tot"}
```

Đăng ký tài khoản tài xế — `POST /api/register`:

```json
{"user":"tx11","pass":"driverpassword","role":"DRIVER"}
```

Đăng nhập tx11, sau đó dùng token của tx11 cho ba bước:

| API | Body |
|---|---|
| `POST /api/otp/request` | `{"phone":"0901234567"}` |
| `POST /api/otp/verify` | `{"code":"<code from OTP response>"}` |
| `POST /api/drivers/register` | `{"license":"L11","plate":"P11"}` |

Duyệt — `PATCH /api/drivers/d11/approve`, token admin:

```json
{"approve":true}
```

Bật nhận chuyến — `PATCH /api/drivers/availability`, token tx11:

```json
{"online":true,"lat":22.02,"lng":111}
```

Tắt nhận chuyến, cùng API/token:

```json
{"online":false}
```

## Quy tắc mã và trường dữ liệu

- Seed: customer c1–c5, driver d1–d10, booking b1–b5 đã hủy.
- Lượt mới: customer c6, driver d11, trip t1/t2, payment p1.
- Ngay sau reset, booking tạo tiếp theo là b6. Collection bước 10 tạo/hủy b6–b10 cho phân trang, nên bước 15 tạo b11; bước 18 tạo b12.
- Dùng uid, booking_id, trip_id hoặc payment_id trả về khi thao tác khác thứ tự trên. Các giá trị c1/d1/b1/t1/p1 chính là khóa chính; không có code hay UUID nghiệp vụ.
- Alias: `user/pass`, `license/plate`, `lat/lng`, `from_lat/from_lng`, `to_lat/to_lng`, `trip`.
- Không gửi alias và tên dài với hai giá trị khác nhau trong cùng request; backend trả 400 để tránh nhập mâu thuẫn.
- Mục 25–29 giữ payload kiểm thử bảo mật có sẵn trong Collection. Mục 30 gửi lại đúng body và key pay1 của mục 19.
