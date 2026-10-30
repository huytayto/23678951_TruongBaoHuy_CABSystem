const fs = require('node:fs');
const path = require('node:path');

const directory = path.resolve(__dirname, '../postman');
fs.mkdirSync(directory, { recursive: true });
const collection = {
  info: {
    _postman_id: '9dcde247-73d0-4d76-bdf4-5947ee047030',
    name: 'CAB 3.0 — PHIEU_CHAM_PROJECT — 30 tiêu chí',
    schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
    description: 'Đối chiếu PHIEU_CHAM_PROJECT.pdf (6 trang, 30 tiêu chí). Chạy toàn bộ bằng Collection Runner, 1 iteration, delay 0. Tạo tài khoản và dữ liệu mới mỗi lần chạy. OTP/SMS và payment provider là mô phỏng local. Các mục 1–5, 7, 8 cần xem thêm bằng chứng kiến trúc/Git/Docker trong RUBRIC.md; test API không tự thay thế việc giảng viên chấm. Mục 24 và kiểm chứng DB mục 30 cần local evidence helper: npm run postman:prepare. Không dùng trên production.',
  },
  event: [{ listen: 'test', script: { type: 'text/javascript', exec: [
    "pm.test('Response không có lỗi máy chủ', () => pm.expect(pm.response.code).to.be.below(500));",
  ] } }],
  item: [],
};
const values = {
  base_url: 'http://127.0.0.1:8080', evidence_url: 'http://127.0.0.1:8099', evidence_token: '',
  admin_username: 'admin', admin_password: '', payment_webhook_secret: '',
  test_password: 'CabRubric@2026!', vehicle_type: 'CAB_4_SEAT',
  pickup_lat: 'AUTO', pickup_lng: 'AUTO', dropoff_lat: '', dropoff_lng: '',
  auto_coordinates: 'true',
  geo_radius: '1km', page_size: '2', fixed_fare: '50000',
  notification_poll_ms: '250', notification_poll_attempts: '40',
  rate_limit_requests: '3000', rate_limit_expected: '1000', rate_limit_cooldown_ms: '1600',
  cancel_reason: 'Khách hàng đổi lịch trình — rubric 18',
  xss_payload: "<script>alert('hack')</script>", webhook_status: 'SUCCESS',
};
const dynamic = ['run_id', 'run_started_at', 'customer_username', 'customer_id', 'customer_token', 'outsider_username', 'outsider_id', 'outsider_token',
  'admin_id', 'admin_token', 'booking_id', 'trip_id', 'cancel_booking_id', 'cancel_trip_id', 'payment_id', 'payment_snapshot',
  'idempotency_key', 'other_idempotency_key', 'webhook_signature', 'tampered_token', 'seed_booking_ids',
  'booking_page_1', 'nearby_page_1', 'rate_limit_result', 'seed_booking_id', 'near_driver_lat', 'cash_booking_id', 'cash_trip_id', 'cash_payment_id',
  'customer_code', 'booking_code', 'trip_code', 'payment_code'];
for (let i = 1; i <= 5; i++) for (const key of ['username', 'id', 'code', 'token', 'phone', 'challenge_id', 'otp', 'license', 'plate']) dynamic.push(`driver${i}_${key}`);
for (const key of dynamic) values[key] = '';
const environment = { id: 'f9fb5bca-22c6-493a-b1bb-5947ee047030', name: 'CAB 3.0 — Local rubric (template)',
  values: Object.entries(values).map(([key, value]) => ({ key, value, enabled: true,
    type: /password|secret|token|_otp$/.test(key) ? 'secret' : 'default' })),
  _postman_variable_scope: 'environment', _postman_exported_using: 'CAB build-postman.js' };

function folder(name, description) {
  const result = { name, description, item: [] }; collection.item.push(result); return result;
}
function request(group, name, method, route, body, token, status, checks = '', pre = '', description = '', headers = {}) {
  const req = { name, request: { method, header: [], url: route.startsWith('http') || route.startsWith('{{evidence_url}}') ? route : `{{base_url}}${route}`,
    description: description || name, auth: token ? { type: 'bearer', bearer: [{ key: 'token', value: `{{${token}}}`, type: 'string' }] } : { type: 'noauth' } },
    event: [] };
  if (body !== undefined) {
    req.request.header.push({ key: 'Content-Type', value: 'application/json' });
    req.request.body = { mode: 'raw', raw: JSON.stringify(body, null, 2), options: { raw: { language: 'json' } } };
  }
  for (const [key, value] of Object.entries(headers)) req.request.header.push({ key, value });
  if (pre) req.event.push({ listen: 'prerequest', script: { type: 'text/javascript', exec: ['(function () {', ...pre.split('\n'), '})();'] } });
  const code = `const v = key => pm.environment.get(key);\nconst save = (key, value) => pm.environment.set(key, typeof value === 'object' ? JSON.stringify(value) : value);\nvar data; try { data = pm.response.json(); } catch (_) { data = {}; }\n` +
    (status ? `pm.test(${JSON.stringify(`${name}: HTTP ${Array.isArray(status) ? status.join('/') : status}`)}, () => pm.expect(pm.response.code).to.be.oneOf(${JSON.stringify(Array.isArray(status) ? status : [status])}));\n` : '') + checks;
  req.event.push({ listen: 'test', script: { type: 'text/javascript', exec: ['(function () {', ...code.split('\n'), '})();'] } });
  group.item.push(req); return req;
}
const eq = (label, expression, expected) => `pm.test(${JSON.stringify(label)}, () => pm.expect(${expression}).to.eql(${expected}));\n`;
const ok = (label, expression) => eq(label, `Boolean(${expression})`, 'true');
const bookingBody = { pickup_lat: '{{pickup_lat}}', pickup_lng: '{{pickup_lng}}', dropoff_lat: '{{dropoff_lat}}', dropoff_lng: '{{dropoff_lng}}', vehicle_type: '{{vehicle_type}}' };
const eventPolling = (type, field, variable) => `
let tries = 0;
function poll() {
  pm.sendRequest({ url: v('base_url') + '/api/v1/notifications/me?limit=200',
    header: { Authorization: 'Bearer ' + v('${variable}') } }, (error, response) => {
    const events = !error && response.code === 200 ? response.json().notifications : [];
    const found = events && events.find(n => n.payload.event_type === '${type}' && n.payload.${field} === v('${field === 'driver_id' ? variable.replace('_token', '_id') : field}'));
    if (found) pm.test('${type} đến đúng hộp thư người dùng', () => pm.expect(found.payload.${field}).to.eql(v('${field === 'driver_id' ? variable.replace('_token', '_id') : field}')));
    else if (++tries < Number(v('notification_poll_attempts'))) setTimeout(poll, Number(v('notification_poll_ms')));
    else pm.test('${type} đến đúng hộp thư người dùng', () => pm.expect.fail(error ? error.message : 'Không nhận được event đúng đối tượng sau khi poll'));
  });
}
poll();`;

let f = folder('00 — Khởi tạo và Health [06]', 'Mỗi lần Run tạo namespace dữ liệu và vị trí riêng. Không hardcode ID/token.');
const init = `${dynamic.map(key => `pm.environment.unset(${JSON.stringify(key)});`).join('\n')}
const run = Date.now().toString(36) + '-' + pm.variables.replaceIn('{{$randomUUID}}').slice(0, 8);
pm.environment.set('run_id', run); pm.environment.set('run_started_at', new Date().toISOString());
pm.environment.set('customer_username', 'rubric-customer-' + run);
pm.environment.set('outsider_username', 'rubric-outsider-' + run);
if (!pm.environment.get('admin_password') || !pm.environment.get('payment_webhook_secret')) throw new Error('Chạy npm run postman:prepare và chọn local Environment; không để trống admin_password/payment_webhook_secret.');
if (!pm.environment.get('pickup_lat') || pm.environment.get('pickup_lat') === 'AUTO' || pm.environment.get('auto_coordinates') === 'true') {
  pm.environment.set('pickup_lat', (20 + Math.random() * 20).toFixed(6));
  pm.environment.set('pickup_lng', (70 + Math.random() * 20).toFixed(6));
  pm.environment.set('auto_coordinates', 'true');
}
pm.environment.set('dropoff_lat', (Number(pm.environment.get('pickup_lat')) + 0.02).toFixed(6));
pm.environment.set('dropoff_lng', (Number(pm.environment.get('pickup_lng')) + 0.02).toFixed(6));
pm.environment.set('idempotency_key', 'rubric-payment-' + run);
pm.environment.set('other_idempotency_key', 'rubric-other-payment-' + run);
pm.environment.set('seed_booking_ids', '[]');
for (let i = 1; i <= 5; i++) {
  pm.environment.set('driver' + i + '_username', 'rubric-driver' + i + '-' + run);
  pm.environment.set('driver' + i + '_phone', '+849' + String(Math.floor(Math.random() * 1e8)).padStart(8, '0'));
  pm.environment.set('driver' + i + '_license', 'RUBRIC-L-' + run + '-' + i);
  pm.environment.set('driver' + i + '_plate', 'RUBRIC-P-' + run + '-' + i);
}`;
request(f, '[06] Liveness và khởi tạo lần chạy', 'GET', '/health', undefined, null, 200, eq('Gateway healthy', 'data.status', "'healthy'"), init);
request(f, 'Manual — Danh sách URL ngắn', 'GET', '/', undefined, null, 200,
  ok('Có hướng dẫn URL gõ tay', "Array.isArray(data.routes) && data.routes.includes('GET /drivers/me')"));
request(f, '[06] Readiness', 'GET', '/ready', undefined, null, 200, eq('Ready', 'data.status', "'ready'"));
request(f, '[06][07] Tất cả service và hạ tầng', 'GET', '/health/services', undefined, null, 200,
  `for (const service of ['api-gateway','auth-service','customer-service','driver-service','booking-service','trip-service','payment-service','notification-service','postgres','redis','kafka']) pm.test(service + ' UP', () => pm.expect(data.services[service]).to.eql('UP'));`);

f = folder('01 — Đăng ký và đăng nhập [09,10]', 'Có thêm tài khoản ngoài cuộc để kiểm tra quyền sở hữu.');
request(f, 'Setup — Admin đăng nhập', 'POST', '/api/v1/auth/login', { username: '{{admin_username}}', password: '{{admin_password}}' }, null, 200,
  eq('Đúng role ADMIN', 'data.role', "'ADMIN'") + `if (data.token) { save('admin_token', data.token); save('admin_id', data.uid); }`);
for (const role of ['customer', 'outsider']) {
  request(f, `[09] Đăng ký ${role}`, 'POST', '/api/v1/auth/register', { username: `{{${role}_username}}`, password: '{{test_password}}', fullname: `CAB ${role} {{run_id}}`, role: 'CUSTOMER' }, null, 201,
    eq('Đúng role CUSTOMER', 'data.role', "'CUSTOMER'") + `if (data.uid) save('${role}_id', data.uid);`);
  request(f, `[10] Đăng nhập ${role}`, 'POST', '/api/v1/auth/login', { username: `{{${role}_username}}`, password: '{{test_password}}' }, null, 200,
    eq('Token của đúng tài khoản', 'data.uid', `v('${role}_id')`) + ok('Có JWT', "typeof data.token === 'string' && data.token.split('.').length === 3") + `if (data.token) save('${role}_token', data.token);`);
}
request(f, '[09] Từ chối username trùng', 'POST', '/api/v1/auth/register', { username: '{{customer_username}}', password: '{{test_password}}' }, null, 409);
request(f, '[10] Mật khẩu sai', 'POST', '/api/v1/auth/login', { username: '{{customer_username}}', password: 'DefinitelyWrong@123' }, null, 401,
  ok('Không cấp token khi sai mật khẩu', '!data.token'));

f = folder('02 — OTP và 5 hồ sơ tài xế [21]', 'OTP local chỉ đọc được từ inbox ADMIN khi OTP_TEST_MODE=true; code sai, replay và bỏ qua OTP đều bị chặn.');
for (let i = 1; i <= 5; i++) {
  const d = `driver${i}`;
  request(f, `Setup — Đăng ký tài khoản ${d}`, 'POST', '/api/v1/auth/register', { username: `{{${d}_username}}`, password: '{{test_password}}', role: 'DRIVER' }, null, 201,
    `if (data.uid) save('${d}_id', data.uid);`);
  request(f, `Setup — Đăng nhập ${d}`, 'POST', '/api/v1/auth/login', { username: `{{${d}_username}}`, password: '{{test_password}}' }, null, 200,
    eq('Role DRIVER', 'data.role', "'DRIVER'") + `if (data.token) save('${d}_token', data.token);`);
  if (i === 1) request(f, '[21] Không cho gửi hồ sơ khi chưa xác thực OTP', 'POST', '/api/v1/drivers/register', { license_number: `{{${d}_license}}`, plate_number: `{{${d}_plate}}` }, `${d}_token`, 403);
  request(f, `[21] Yêu cầu OTP ${d}`, 'POST', '/api/v1/auth/otp/request', { phone: `{{${d}_phone}}` }, `${d}_token`, 201,
    eq('OTP có hạn 300 giây', 'data.expires_in', '300') + ok('Response public không lộ OTP', '!data.code') + `if (data.challenge_id) save('${d}_challenge_id', data.challenge_id);`);
  request(f, `[21] Đọc OTP local ${d} bằng ADMIN`, 'GET', `/api/v1/admin/test/otp/{{${d}_challenge_id}}`, undefined, 'admin_token', 200,
    ok('OTP gồm 6 chữ số', '/^\\d{6}$/.test(data.code)') + `if (data.code) save('${d}_otp', data.code);`);
  if (i === 1) request(f, 'Manual — Tài xế đọc OTP mô phỏng của chính mình', 'GET', '/auth/otp', undefined, `${d}_token`, 200,
    eq('Đúng OTP của driver đang đăng nhập', 'data.code', `v('${d}_otp')`));
  if (i === 1) {
    request(f, '[21] Driver không được đọc test inbox', 'GET', `/api/v1/admin/test/otp/{{${d}_challenge_id}}`, undefined, `${d}_token`, 403);
    request(f, '[21] OTP sai bị từ chối', 'POST', '/api/v1/auth/otp/verify', { challenge_id: `{{${d}_challenge_id}}`, code: '000000' }, `${d}_token`, 400);
  }
  request(f, `[21] Xác thực OTP ${d}`, 'POST', '/api/v1/auth/otp/verify', i === 5 ? { code: `{{${d}_otp}}` } : { challenge_id: `{{${d}_challenge_id}}`, code: `{{${d}_otp}}` }, `${d}_token`, 200,
    eq('Số điện thoại được xác thực', 'data.phone_verified', 'true') + eq('Đúng số điện thoại', 'data.phone', `v('${d}_phone')`));
  if (i === 1) request(f, '[21] Không dùng lại OTP', 'POST', '/api/v1/auth/otp/verify', { challenge_id: `{{${d}_challenge_id}}`, code: `{{${d}_otp}}` }, `${d}_token`, 400);
  request(f, `[21] Gửi hồ sơ ${d}`, 'POST', '/api/v1/drivers/register', { license_number: `{{${d}_license}}`, plate_number: `{{${d}_plate}}`, vehicle_type: '{{vehicle_type}}' }, `${d}_token`, 201,
    eq('Hồ sơ chờ duyệt', 'data.driver.approval_status', "'PENDING_APPROVAL'") + eq('Chưa tự online', 'data.driver.availability', "'OFFLINE'") + eq('Hồ sơ đã xác thực điện thoại', 'data.driver.phone_verified', 'true') + `if (data.driver) save('${d}_code', data.driver.code);`);
}
request(f, '[21][23] Tài xế chờ duyệt không thể online', 'PATCH', '/api/v1/drivers/availability', { online: true, latitude: '{{pickup_lat}}', longitude: '{{pickup_lng}}' }, 'driver3_token', 403);

f = folder('03 — Duyệt/từ chối và thông báo [22]', 'Tạo 2 AVAILABLE, 1 PENDING_APPROVAL, 1 REJECTED, 1 ACTIVE/OFFLINE cho tiêu chí 13.');
request(f, '[22] Admin lấy danh sách chờ duyệt', 'GET', '/api/v1/admin/drivers?limit=100&page=1', undefined, 'admin_token', 200,
  `for (let i = 1; i <= 5; i++) pm.test('Có hồ sơ driver' + i, () => pm.expect(data.drivers.some(d => d.uid === v('driver' + i + '_id'))).to.eql(true));`);
request(f, '[12][22] Admin xem chi tiết hồ sơ trước khi duyệt', 'GET', '/api/v1/drivers/{{driver1_id}}', undefined, 'admin_token', 200,
  eq('Đúng tài xế', 'data.driver.uid', "v('driver1_id')") + eq('Giải mã đúng bằng lái', 'data.driver.license_number', "v('driver1_license')"));
for (const i of [1, 2, 5, 4]) request(f, `[22] ${i === 4 ? 'Từ chối' : 'Duyệt'} driver${i}`, 'PATCH', `/api/v1/admin/drivers/{{driver${i}_id}}/approve`, { approve: i !== 4 }, 'admin_token', 200,
  eq('Kết quả phê duyệt', 'data.driver.approval_status', i === 4 ? "'REJECTED'" : "'ACTIVE'"));
request(f, '[22] Tài xế nhận kết quả phê duyệt', 'GET', '/api/v1/notifications/me', undefined, 'driver1_token', 200,
  eventPolling('DriverApprovalChanged', 'driver_id', 'driver1_token'));
request(f, '[22] Tài xế nhận kết quả từ chối', 'GET', '/api/v1/notifications/me', undefined, 'driver4_token', 200,
  eventPolling('DriverApprovalChanged', 'driver_id', 'driver4_token'));
request(f, '[22][23] Tài xế bị từ chối không thể online', 'PATCH', '/api/v1/drivers/availability', { online: true, latitude: '{{pickup_lat}}', longitude: '{{pickup_lng}}' }, 'driver4_token', 403);

f = folder('04 — Hồ sơ, online/offline và tìm kiếm [11,12,13,23]', 'Tọa độ random mỗi lần chạy để tránh ảnh hưởng tài xế demo cũ. driver1 gần nhất, driver2 cách khoảng 100m.');
request(f, '[11] Lấy khách hàng bằng mã số', 'GET', '/api/v1/customers/{{customer_id}}', undefined, 'customer_token', 200,
  eq('Đúng khách hàng', 'data.customer.uid', "v('customer_id')") + ok('Không lộ password/hash', '!data.customer.password && !data.customer.password_hash') + `if (data.customer) save('customer_code', data.customer.code);`);
request(f, 'Manual — Đọc customer bằng mã ngắn', 'GET', '/customers/{{customer_code}}', undefined, 'customer_token', 200,
  eq('Mã ngắn đúng khách hàng', 'data.customer.uid', "v('customer_id')"));
request(f, 'Manual — Mã ngắn không bỏ qua quyền sở hữu', 'GET', '/customers/{{customer_code}}', undefined, 'outsider_token', 403);
request(f, 'Manual — Driver xem hồ sơ qua /me', 'GET', '/drivers/me', undefined, 'driver1_token', 200,
  eq('Đúng mã tài xế', 'data.driver.code', "v('driver1_code')"));
request(f, '[11] Không đọc hồ sơ khách hàng khác', 'GET', '/api/v1/customers/{{customer_id}}', undefined, 'outsider_token', 403);
request(f, '[12] Tài xế đọc hồ sơ của mình', 'GET', '/api/v1/drivers/{{driver1_id}}', undefined, 'driver1_token', 200,
  eq('Đúng mã tài xế', 'data.driver.uid', "v('driver1_id')") + eq('Đúng biển số', 'data.driver.plate_number', "v('driver1_plate')"));
request(f, '[23] Bật online driver1', 'PATCH', '/api/v1/drivers/availability', { online: true, latitude: '{{pickup_lat}}', longitude: '{{pickup_lng}}' }, 'driver1_token', 200,
  eq('AVAILABLE', 'data.driver.availability', "'AVAILABLE'"));
request(f, '[23] Tắt online driver1', 'PATCH', '/api/v1/drivers/availability', { online: false }, 'driver1_token', 200,
  eq('OFFLINE', 'data.driver.availability', "'OFFLINE'"));
request(f, '[23] Bật lại online driver1', 'PATCH', '/api/v1/drivers/availability', { online: true, latitude: '{{pickup_lat}}', longitude: '{{pickup_lng}}' }, 'driver1_token', 200,
  eq('AVAILABLE', 'data.driver.availability', "'AVAILABLE'"));
request(f, '[23] Bật online driver2', 'PATCH', '/api/v1/drivers/availability', { online: true, latitude: '{{near_driver_lat}}', longitude: '{{pickup_lng}}' }, 'driver2_token', 200,
  eq('AVAILABLE', 'data.driver.availability', "'AVAILABLE'"), "pm.environment.set('near_driver_lat', (Number(pm.environment.get('pickup_lat')) + 0.001).toFixed(6));");
const geo = '/api/v1/drivers/nearby?lat={{pickup_lat}}&lng={{pickup_lng}}&radius={{geo_radius}}';
request(f, '[13] Nearby 1km — trang 1', 'GET', `${geo}&limit=1&page=1`, undefined, 'admin_token', 200,
  eq('Giới hạn đúng 1 tài xế', 'data.drivers.length', '1') + eq('Tài xế gần nhất đứng đầu', 'data.drivers[0].uid', "v('driver1_id')") +
  eq('Trang 1', 'data.pagination.page', '1') + `save('nearby_page_1', data.drivers.map(d => d.uid));`);
request(f, '[13] Nearby 1km — trang 2', 'GET', `${geo}&limit=1&page=2`, undefined, 'admin_token', 200,
  eq('Trang 2', 'data.pagination.page', '2') + eq('Tài xế thứ hai', 'data.drivers[0].uid', "v('driver2_id')") +
  ok('Không trùng trang 1', "data.drivers.every(d => !JSON.parse(v('nearby_page_1')).includes(d.uid))"));
request(f, '[13] Nearby loại bỏ offline/pending/rejected', 'GET', `${geo}&limit=100&page=1`, undefined, 'admin_token', 200,
  eq('Chỉ 2 tài xế AVAILABLE hợp lệ', 'data.drivers.map(d => d.uid).sort()', "[v('driver1_id'),v('driver2_id')].sort()") +
  ok('Tất cả nằm trong 1km và sắp xếp tăng dần', 'data.drivers.every((d,i,a) => d.distance_meters <= 1000 && (!i || a[i-1].distance_meters <= d.distance_meters))'));

f = folder('05 — Tạo ít nhất 5 booking và phân trang [14,15,18]', 'Hủy booking seed ngay sau khi tạo để không để offer rác. Các bản ghi vẫn tồn tại để kiểm tra paging.');
for (let i = 1; i <= 5; i++) {
  request(f, `[14][15] Tạo booking seed ${i}/5`, 'POST', '/api/v1/bookings', bookingBody, 'customer_token', 201,
    eq('Đang tìm tài xế', 'data.booking.status', "'SEARCHING_DRIVER'") + eq('Đúng khách hàng', 'data.booking.customer_id', "v('customer_id')") +
    `if (data.booking) { save('seed_booking_id', data.booking.booking_id); const ids = JSON.parse(v('seed_booking_ids')); ids.push(data.booking.booking_id); save('seed_booking_ids', ids); }`);
  request(f, `[18] Hủy booking seed ${i}/5`, 'POST', '/api/v1/bookings/{{seed_booking_id}}/cancel', { reason: '{{cancel_reason}}' }, 'customer_token', 200,
    eq('Booking CANCELED', 'data.booking.status', "'CANCELED'"));
}
request(f, '[14] Booking trang 1', 'GET', '/api/v1/bookings?limit={{page_size}}&page=1', undefined, 'customer_token', 200,
  eq('Đúng page size', 'data.bookings.length', "Number(v('page_size'))") + ok('Chỉ dữ liệu của customer', "data.bookings.every(b => b.customer_id === v('customer_id'))") + `save('booking_page_1', data.bookings.map(b => b.booking_id));`);
request(f, '[14] Booking trang 2 không lặp', 'GET', '/api/v1/bookings?limit={{page_size}}&page=2', undefined, 'customer_token', 200,
  eq('Đủ 2 bản ghi trang 2', 'data.bookings.length', "Number(v('page_size'))") + ok('Không trùng trang 1', "data.bookings.every(b => !JSON.parse(v('booking_page_1')).includes(b.booking_id))"));
request(f, '[14] Đã tạo đủ 5 booking', 'GET', '/api/v1/bookings?limit=100&page=1', undefined, 'customer_token', 200,
  ok('5 booking seed nằm trong kết quả', "JSON.parse(v('seed_booking_ids')).length === 5 && JSON.parse(v('seed_booking_ids')).every(id => data.bookings.some(b => b.booking_id === id))"));
request(f, '[14] Khách khác không thấy booking', 'GET', '/api/v1/bookings?limit=100&page=1', undefined, 'outsider_token', 200,
  eq('Không lộ booking', 'data.bookings', '[]'));

f = folder('06 — Đặt xe, nhận offer và ghép chuyến [15,16]', 'Tài xế tự lấy offer, khách tự tìm trip theo booking; không truyền trip_id bằng token ADMIN.');
request(f, '[15] Khách hàng đặt xe', 'POST', '/api/v1/bookings', bookingBody, 'customer_token', 201,
  eq('SEARCHING_DRIVER', 'data.booking.status', "'SEARCHING_DRIVER'") + eq('Offer cho tài xế gần nhất', 'data.booking.offered_driver_uid', "v('driver1_id')") + `if (data.booking) { save('booking_id', data.booking.booking_id); save('booking_code', data.booking.code); }`);
request(f, 'Manual — Xem booking bằng mã ngắn', 'GET', '/bookings/{{booking_code}}', undefined, 'customer_token', 200,
  eq('Đúng booking', 'data.booking.booking_id', "v('booking_id')"));
request(f, '[16] Tài xế xem offer đang chờ', 'GET', '/api/v1/drivers/offers', undefined, 'driver1_token', 200,
  ok('Offer chứa thông tin chuyến của mình', "data.offers.some(b => b.booking_id === v('booking_id') && b.offered_driver_uid === v('driver1_id') && Number(b.pickup_lat) === Number(v('pickup_lat')))"));
request(f, '[16] Sai tài xế không nhận được offer', 'POST', '/api/v1/bookings/{{booking_id}}/accept', undefined, 'driver2_token', 409);
request(f, '[16] Thông báo offer gửi tới tài xế', 'GET', '/api/v1/notifications/me?limit=200', undefined, 'driver1_token', 200,
  eventPolling('DriverOfferCreated', 'booking_id', 'driver1_token'));
request(f, '[16] Tài xế chấp nhận chuyến', 'POST', '/api/v1/bookings/{{booking_id}}/accept', undefined, 'driver1_token', 200,
  eq('Gán đúng tài xế', 'data.trip.driver_id', "v('driver1_id')") + eq('Gán đúng customer', 'data.trip.customer_id', "v('customer_id')") +
  eq('Trip DRIVER_ASSIGNED', 'data.trip.status', "'DRIVER_ASSIGNED'") + `if (data.trip) { save('trip_id', data.trip.trip_id); save('trip_code', data.trip.code); }`);
request(f, 'Manual — Tìm trip qua mã booking', 'GET', '/bookings/{{booking_code}}/trip', undefined, 'customer_token', 200,
  eq('Đúng mã trip', 'data.trip.code', "v('trip_code')"));
request(f, '[16] Khách hàng tìm trip từ booking của mình', 'GET', '/api/v1/bookings/{{booking_id}}/trip', undefined, 'customer_token', 200,
  eq('Đúng trip', 'data.trip.trip_id', "v('trip_id')") + eq('Khách nhận thông tin tài xế', 'data.driver.uid', "v('driver1_id')"));
request(f, '[16] Khách nhận DriverAssigned', 'GET', '/api/v1/notifications/me?limit=200', undefined, 'customer_token', 200,
  eventPolling('DriverAssigned', 'trip_id', 'customer_token'));
request(f, '[16] Tài xế BUSY không tự bật lại AVAILABLE', 'PATCH', '/api/v1/drivers/availability', { online: true, latitude: '{{pickup_lat}}', longitude: '{{pickup_lng}}' }, 'driver1_token', [403, 409]);
request(f, '[16] Không nhận một booking hai lần', 'POST', '/api/v1/bookings/{{booking_id}}/accept', undefined, 'driver1_token', 409);
request(f, '[16] Người ngoài không đọc trip', 'GET', '/api/v1/trips/{{trip_id}}', undefined, 'outsider_token', 403);

f = folder('07 — Trạng thái và vị trí chuyến [17]', 'Kiểm tra 5 bước, vị trí di chuyển, quyền tài xế và trạng thái cuối.');
request(f, '[17] Chặn nhảy thẳng COMPLETED', 'PATCH', '/api/v1/trips/{{trip_id}}/status', { status: 'COMPLETED' }, 'driver1_token', 400);
request(f, '[17] Tài xế khác không cập nhật chuyến', 'PATCH', '/api/v1/trips/{{trip_id}}/status', { status: 'EN_ROUTE' }, 'driver2_token', 403);
for (const state of ['EN_ROUTE', 'ARRIVED', 'PICKED_UP', 'IN_PROGRESS', 'COMPLETED']) {
  request(f, `[17] Chuyển ${state}`, 'PATCH', '/trips/{{trip_code}}/status', { status: state }, 'driver1_token', 200,
    eq('Trạng thái lưu đúng', 'data.trip.status', JSON.stringify(state)));
  if (state === 'IN_PROGRESS') {
    request(f, '[17] Cập nhật vị trí di chuyển', 'PATCH', '/api/v1/trips/{{trip_id}}/location', { latitude: '{{dropoff_lat}}', longitude: '{{dropoff_lng}}' }, 'driver1_token', 200,
      eq('Đúng latitude', 'data.trip.latitude', "Number(v('dropoff_lat'))") + eq('Đúng longitude', 'data.trip.longitude', "Number(v('dropoff_lng'))"));
    request(f, '[17] Khách theo dõi vị trí đã lưu', 'GET', '/api/v1/trips/{{trip_id}}', undefined, 'customer_token', 200,
      eq('Vị trí tồn tại khi đọc lại', 'data.trip.latitude', "Number(v('dropoff_lat'))"));
    request(f, '[17] Chặn tọa độ không hợp lệ', 'PATCH', '/api/v1/trips/{{trip_id}}/location', { latitude: 91, longitude: 181 }, 'driver1_token', 400);
  }
}
request(f, '[17] Trạng thái hoàn tất lưu bền', 'GET', '/api/v1/trips/{{trip_id}}', undefined, 'customer_token', 200,
  eq('COMPLETED', 'data.trip.status', "'COMPLETED'") + eq('Cước cố định', 'Number(data.trip.fare_amount)', "Number(v('fixed_fare'))"));

f = folder('08 — Thanh toán online và replay [19,30]', 'Snapshot gốc phải giống hoàn toàn trước và sau settlement. Có kiểm tra DB bằng evidence helper ở folder 12.');
request(f, '[19] Bắt buộc Idempotency-Key', 'POST', '/api/v1/payments/online', { trip_id: '{{trip_id}}' }, 'customer_token', 400);
request(f, '[19] Khởi tạo thanh toán online', 'POST', '/payments/online', { trip_id: '{{trip_code}}', amount: 1, customer_id: '{{outsider_id}}' }, 'customer_token', 200,
  eq('Payment PENDING', 'data.payment.status', "'PENDING'") + eq('Không tin số tiền client', 'Number(data.payment.amount)', "Number(v('fixed_fare'))") +
  eq('Không tin customer_id client', 'data.payment.customer_id', "v('customer_id')") + `if (data.payment) { save('payment_id', data.payment.payment_id); save('payment_code', data.payment.code); save('payment_snapshot', data); }`, '', '', { 'Idempotency-Key': '{{idempotency_key}}' });
request(f, 'Manual — Xem payment bằng mã ngắn', 'GET', '/payments/{{payment_code}}', undefined, 'customer_token', 200,
  eq('Đúng payment', 'data.payment.payment_id', "v('payment_id')"));
request(f, 'Manual — Người ngoài không xem được payment', 'GET', '/payments/{{payment_code}}', undefined, 'outsider_token', 403);
const replay = eq('Trả chính xác response gốc', 'data', "JSON.parse(v('payment_snapshot'))") + eq('Giữ nguyên transaction ID', 'data.payment.payment_id', "v('payment_id')");
request(f, '[30] Replay request y hệt trước callback', 'POST', '/api/v1/payments/online', { trip_id: '{{trip_id}}', amount: 1, customer_id: '{{outsider_id}}' }, 'customer_token', 200, replay, '', '', { 'Idempotency-Key': '{{idempotency_key}}' });
request(f, '[30] Năm replay đồng thời trả cùng snapshot', 'GET', '/health', undefined, null, 200, `
for (let i = 0; i < 5; i++) pm.sendRequest({url:v('base_url') + '/api/v1/payments/online', method:'POST',
  header:{'Content-Type':'application/json',Authorization:'Bearer ' + v('customer_token'),'Idempotency-Key':v('idempotency_key')},
  body:{mode:'raw',raw:JSON.stringify({trip_id:v('trip_id'),amount:1,customer_id:v('outsider_id')})}}, (error,response) => {
  pm.test('[30] Replay đồng thời ' + (i + 1), () => {pm.expect(error).to.eql(null);pm.expect(response.code).to.eql(200);pm.expect(response.json()).to.eql(JSON.parse(v('payment_snapshot')));});
});`);
request(f, '[19] Callback sai chữ ký', 'POST', '/api/v1/payments/webhook', { order_id: '{{payment_id}}', status: 'SUCCESS', signature: 'invalid' }, null, 401);
const sign = "const CryptoJS = require('crypto-js'); pm.environment.set('webhook_signature', CryptoJS.HmacSHA256(pm.environment.get('payment_id') + ':' + pm.environment.get('webhook_status'), pm.environment.get('payment_webhook_secret')).toString(CryptoJS.enc.Hex));";
request(f, '[19] Callback hợp lệ', 'POST', '/api/v1/payments/webhook', { order_id: '{{payment_id}}', status: '{{webhook_status}}', signature: '{{webhook_signature}}' }, null, 200,
  eq('Payment COMPLETED', 'data.payment.status', "'COMPLETED'") + eq('Đúng payment ID', 'data.payment.payment_id', "v('payment_id')"), sign);
request(f, '[19] Trip ghi nhận đã thanh toán', 'GET', '/api/v1/trips/{{trip_id}}', undefined, 'customer_token', 200,
  eq('Trip PAID', 'data.trip.payment_status', "'PAID'") + eq('Liên kết đúng payment', 'data.trip.payment_id', "v('payment_id')"));
request(f, '[30] Replay sau callback vẫn trả response gốc', 'POST', '/api/v1/payments/online', { trip_id: '{{trip_id}}', amount: 1, customer_id: '{{outsider_id}}' }, 'customer_token', 200, replay, '', '', { 'Idempotency-Key': '{{idempotency_key}}' });
request(f, '[30] Callback lặp không settlement lại', 'POST', '/api/v1/payments/webhook', { order_id: '{{payment_id}}', status: '{{webhook_status}}', signature: '{{webhook_signature}}' }, null, 200,
  eq('Vẫn cùng payment', 'data.payment.payment_id', "v('payment_id')") + eq('Callback replay được nhận diện', 'data.idempotent_replay', 'true'));
request(f, '[30] Khóa mới không thu tiền lần hai cho cùng trip', 'POST', '/api/v1/payments/online', { trip_id: '{{trip_id}}' }, 'customer_token', 409, '', '', '', { 'Idempotency-Key': '{{other_idempotency_key}}' });
request(f, '[30] Không xác nhận cash sau khi đã trả online', 'POST', '/api/v1/payments/cash-confirm', { trip_id: '{{trip_id}}' }, 'driver1_token', 409);
request(f, '[30] Người khác không replay payment', 'POST', '/api/v1/payments/online', { trip_id: '{{trip_id}}' }, 'outsider_token', 409, '', '', '', { 'Idempotency-Key': '{{idempotency_key}}' });

f = folder('09 — Đánh giá và XSS [20,26]', 'Chặn sao ngoài khoảng và đánh giá trùng, kiểm tra payload escape cả khi đọc lại.');
request(f, '[20] Chặn đánh giá 6 sao', 'POST', '/api/v1/trips/{{trip_id}}/rating', { stars: 6 }, 'customer_token', 400);
request(f, '[20] Người ngoài không được đánh giá', 'POST', '/api/v1/trips/{{trip_id}}/rating', { stars: 5 }, 'outsider_token', 400);
request(f, '[20][26] Đánh giá 5 sao với XSS input', 'POST', '/api/v1/trips/{{trip_id}}/rating', { stars: 5, comment: '{{xss_payload}}' }, 'customer_token', 201,
  eq('Đúng số sao', 'data.rating.stars', '5') + eq('Liên kết đúng chuyến', 'data.rating.trip_id', "v('trip_id')") +
  eq('Output được escape đúng', 'data.rating.comment', '"&lt;script&gt;alert(&#x27;hack&#x27;)&lt;/script&gt;"') + ok('Không trả raw script tag', "!pm.response.text().includes('<script>')"));
request(f, '[20] Mỗi trip chỉ đánh giá một lần', 'POST', '/api/v1/trips/{{trip_id}}/rating', { stars: 4, comment: 'duplicate' }, 'customer_token', 409);
request(f, '[26] Admin cập nhật profile với XSS input', 'PUT', '/api/v1/customers/{{customer_id}}', { fullname: '{{xss_payload}}', address: 'CAB rubric address {{run_id}}' }, 'admin_token', 200,
  ok('Response update đã escape', "!data.customer.fullname.includes('<script>') && data.customer.fullname.includes('&lt;script&gt;')"));
request(f, '[26] Đọc lại profile vẫn escape', 'GET', '/api/v1/customers/{{customer_id}}', undefined, 'customer_token', 200,
  eq('Stored XSS được escape', 'data.customer.fullname', '"&lt;script&gt;alert(&#x27;hack&#x27;)&lt;/script&gt;"'));

f = folder('10 — Hủy trip và thông báo hai bên [18]', 'Tạo trip riêng, kiểm tra lý do, quyền sở hữu và thông báo đến customer/driver.');
request(f, 'Setup — Booking cho luồng hủy', 'POST', '/api/v1/bookings', bookingBody, 'customer_token', 201,
  `if (data.booking) save('cancel_booking_id', data.booking.booking_id);`);
request(f, 'Setup — Nhận chuyến để hủy', 'POST', '/api/v1/bookings/{{cancel_booking_id}}/accept', undefined, 'driver1_token', 200,
  `if (data.trip) save('cancel_trip_id', data.trip.trip_id);`);
request(f, '[18] Hủy thiếu lý do bị chặn', 'POST', '/api/v1/trips/{{cancel_trip_id}}/cancel', {}, 'customer_token', 400);
request(f, '[18] Khách khác không được hủy', 'POST', '/api/v1/trips/{{cancel_trip_id}}/cancel', { reason: '{{cancel_reason}}' }, 'outsider_token', 409);
request(f, '[18] Hủy chuyến có lý do', 'POST', '/api/v1/trips/{{cancel_trip_id}}/cancel', { reason: '{{cancel_reason}}' }, 'customer_token', 200,
  eq('Trip CANCELED', 'data.trip.status', "'CANCELED'") + eq('Lưu lý do hủy', 'data.trip.cancel_reason', "v('cancel_reason')"));
request(f, '[18] Đọc lại trip đã hủy', 'GET', '/api/v1/trips/{{cancel_trip_id}}', undefined, 'customer_token', 200,
  eq('Hủy được lưu bền', 'data.trip.status', "'CANCELED'"));
for (const who of ['customer', 'driver1']) request(f, `[18] ${who} nhận thông báo hủy`, 'GET', '/api/v1/notifications/me?limit=200', undefined, `${who}_token`, 200,
  eventPolling('TripCanceled', 'trip_id', `${who}_token`).replaceAll("v('trip_id')", "v('cancel_trip_id')"));
request(f, '[18] Không hồi sinh trip đã hủy', 'PATCH', '/api/v1/trips/{{cancel_trip_id}}/status', { status: 'EN_ROUTE' }, 'driver1_token', 400);

f = folder('10b — Kiểm tra hồi quy thanh toán tiền mặt', 'Bổ sung kiểm chứng luồng cash sau khi chặn double payment giữa online và tiền mặt.');
request(f, 'Cash setup — Tạo booking', 'POST', '/api/v1/bookings', bookingBody, 'customer_token', 201,
  `if (data.booking) save('cash_booking_id', data.booking.booking_id);`);
request(f, 'Cash setup — Nhận chuyến', 'POST', '/api/v1/bookings/{{cash_booking_id}}/accept', undefined, 'driver1_token', 200,
  `if (data.trip) save('cash_trip_id', data.trip.trip_id);`);
for (const state of ['EN_ROUTE', 'ARRIVED', 'PICKED_UP', 'IN_PROGRESS', 'COMPLETED']) request(f, `Cash setup — ${state}`, 'PATCH', '/api/v1/trips/{{cash_trip_id}}/status', { status: state }, 'driver1_token', 200,
  eq('Trạng thái đúng', 'data.trip.status', JSON.stringify(state)));
request(f, 'Cash — Không tin số tiền client', 'POST', '/api/v1/payments/cash-confirm', { trip_id: '{{cash_trip_id}}', amount: -1 }, 'driver1_token', 400);
request(f, 'Cash — Xác nhận đúng cước', 'POST', '/api/v1/payments/cash-confirm', { trip_id: '{{cash_trip_id}}', amount: '{{fixed_fare}}' }, 'driver1_token', 200,
  eq('Cash COMPLETED', 'data.payment.status', "'COMPLETED'") + eq('Đúng cước', 'Number(data.payment.amount)', "Number(v('fixed_fare'))") + `if (data.payment) save('cash_payment_id', data.payment.payment_id);`);
request(f, 'Cash — Xác nhận lại không tạo payment thứ hai', 'POST', '/api/v1/payments/cash-confirm', { trip_id: '{{cash_trip_id}}' }, 'driver1_token', 200,
  eq('Giữ payment cũ', 'data.payment.payment_id', "v('cash_payment_id')"));
request(f, 'Cash — Trip PAID', 'GET', '/api/v1/trips/{{cash_trip_id}}', undefined, 'customer_token', 200,
  eq('Trip PAID', 'data.trip.payment_status', "'PAID'") + eq('Đúng payment cash', 'data.trip.payment_id', "v('cash_payment_id')"));
request(f, 'Cash — Không trả online thêm lần nữa', 'POST', '/api/v1/payments/online', { trip_id: '{{cash_trip_id}}' }, 'customer_token', 409, '', '', '', { 'Idempotency-Key': 'cash-extra-{{run_id}}' });

f = folder('11 — SQL injection, JWT và RBAC [25,27,28]', 'Payload đúng như phiếu PDF, kiểm tra cả HTTP và không lộ dữ liệu.');
request(f, '[25] SQL injection theo payload email trong PDF', 'POST', '/api/v1/auth/login', { email: "' OR 1=1 --", password: 'anything' }, null, [400, 401],
  ok('Không có token hoặc dữ liệu DB', '!data.token && !data.users && !data.password_hash'));
request(f, '[25] SQL injection ở trường username thực tế', 'POST', '/api/v1/auth/login', { username: "' OR 1=1 --", password: 'anything' }, null, [400, 401],
  ok('Không bypass và không lộ SQL', "!data.token && !/SELECT|password_hash|postgres|syntax error/i.test(pm.response.text())"));
const tamper = `const CryptoJS = require('crypto-js'); const parts = pm.environment.get('customer_token').split('.');
const claims = JSON.parse(CryptoJS.enc.Base64.parse(parts[1].replace(/-/g, '+').replace(/_/g, '/')).toString(CryptoJS.enc.Utf8));
claims.sub = pm.environment.get('admin_id'); claims.role = 'ADMIN';
parts[1] = CryptoJS.enc.Base64.stringify(CryptoJS.enc.Utf8.parse(JSON.stringify(claims))).replace(/=/g, '').replace(/\\+/g, '-').replace(/\\//g, '_');
pm.environment.set('tampered_token', parts.join('.'));`;
request(f, '[27] Sửa sub và role trong JWT, giữ signature cũ', 'GET', '/api/v1/admin/drivers', undefined, 'tampered_token', 401,
  ok('Không cấp quyền ADMIN', '!data.drivers'), tamper);
request(f, '[28] Customer gọi API Driver', 'GET', '/api/v1/drivers/{{driver1_id}}', undefined, 'customer_token', 403,
  ok('Không lộ dữ liệu tài xế', '!data.driver'));
request(f, '[28] Customer không gọi nearby', 'GET', geo, undefined, 'customer_token', 403);
request(f, '[28] Customer không duyệt tài xế', 'PATCH', '/api/v1/admin/drivers/{{driver3_id}}/approve', { approve: true }, 'customer_token', 403);
request(f, '[28] Thiếu token bị chặn', 'GET', '/api/v1/customers/{{customer_id}}', undefined, null, 401);

f = folder('12 — Bằng chứng DB và hạ tầng [01–05,07,08,24,30]', 'Local evidence helper chạy ngoài backend, bind loopback và yêu cầu token riêng. Chỉ trả kết quả boolean/count, không trả password/hash/key/ciphertext. Không thay thế đánh giá mô tả của giảng viên.');
request(f, '[24] Kiểm tra trực tiếp DB và key management', 'POST', '{{evidence_url}}/at-rest', { customer_id: '{{customer_id}}', driver_id: '{{driver1_id}}', trip_id: '{{trip_id}}', payment_id: '{{payment_id}}' }, 'evidence_token', 200,
  `for (const field of ['password_bcrypt','customer_fields_encrypted','driver_fields_encrypted','keys_valid_and_separate','keys_not_baked_into_image','decrypt_roundtrip']) pm.test('[24] ' + field, () => pm.expect(data[field]).to.eql(true));
pm.test('[30] Chính xác 1 payment cho trip, 1 settlement event', () => { pm.expect(data.payment_count).to.eql(1); pm.expect(data.settlement_event_count).to.eql(1); });
pm.test('[20] Rating thực sự tồn tại trong DB', () => pm.expect(data.rating_count).to.eql(1));`);
request(f, '[01–05][07][08] Bằng chứng source/Git/Docker/IPC', 'GET', '{{evidence_url}}/infrastructure', undefined, 'evidence_token', 200,
  `for (const field of ['eight_application_processes','all_running','gitignore_env','env_not_tracked','grpc_contract_used','kafka_topics_present','domain_ports_private','runtime_matches_source']) pm.test(field, () => pm.expect(data[field]).to.eql(true));`);

f = folder('13 — Rate limit thực tế và phục hồi [29]', 'Local helper tạo tấn công POST ẩn danh bằng HTTP/1.1 pipelining trên 16 kết nối trong gateway container để loại giới hạn socket Windows/Postman; mọi request vẫn qua REST và Redis limiter thật. Không giảm ngưỡng 1000.');
request(f, '[29] Ngưỡng thật của Gateway', 'GET', '/health', undefined, null, 200,
  eq('Giới hạn thực tế vẫn là 1000', "Number(pm.response.headers.get('RateLimit-Limit'))", "Number(v('rate_limit_expected'))"));
request(f, '[29] Burst >1000 POST booking/giây', 'POST', '{{evidence_url}}/rate-limit', { total: '{{rate_limit_requests}}' }, 'evidence_token', 200,
  `save('rate_limit_result', data);
pm.test('[29] Đủ số request', () => pm.expect(data.total).to.eql(Number(v('rate_limit_requests'))));
pm.test('[29] Phát >1000 request trong một giây', () => pm.expect(data.peak_issued_per_second).to.be.above(Number(v('rate_limit_expected'))));
pm.test('[29] Nhận HTTP 429', () => pm.expect(data.limited).to.be.above(0));
pm.test('[29] Không lỗi kết nối/5xx hoặc response bất thường', () => {pm.expect(data.failures).to.eql(0);pm.expect(data.serverErrors).to.eql(0);pm.expect(data.unexpected).to.eql(0);});`);
request(f, '[29] Hệ thống phục hồi sau burst', 'GET', '/ready', undefined, null, 200, eq('Vẫn ready', 'data.status', "'ready'"),
  "setTimeout(() => {}, Number(pm.environment.get('rate_limit_cooldown_ms')));");

f = folder('14 — Dọn trạng thái và đăng xuất', 'Không xóa lịch sử kiểm thử. Tài xế test về OFFLINE; thu hồi token customer và xác nhận 401.');
for (const i of [1, 2, 5]) request(f, `Cleanup — driver${i} OFFLINE`, 'PATCH', '/api/v1/drivers/availability', { online: false }, `driver${i}_token`, 200,
  eq('OFFLINE', 'data.driver.availability', "'OFFLINE'"));
request(f, 'Logout customer', 'POST', '/api/v1/auth/logout', undefined, 'customer_token', 200);
request(f, 'Token đã logout không dùng lại được', 'GET', '/api/v1/customers/me', undefined, 'customer_token', 401);

fs.writeFileSync(path.join(directory, 'CAB-30-Criteria.postman_collection.json'), JSON.stringify(collection, null, 2) + '\n');
fs.writeFileSync(path.join(directory, 'CAB.postman_environment.json'), JSON.stringify(environment, null, 2) + '\n');
let count = 0; for (const group of collection.item) count += group.item.length;
console.log(`Generated ${count} requests in ${collection.item.length} folders and reusable environment.`);
