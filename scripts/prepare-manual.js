// Optional local fixture setup. All writes go through the public REST API.
const fs = require('node:fs');
const path = require('node:path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const base = process.env.API_BASE_URL || 'http://localhost:8080';
const password = process.env.MANUAL_DEMO_PASSWORD || 'CabDemo@2026!';
const pickup = { latitude: 10.77, longitude: 106.70 };
const values = { base_url: base, admin_username: process.env.ADMIN_USERNAME,
  admin_password: process.env.ADMIN_PASSWORD, test_password: password,
  customer_username: 'khach1', customer_password: password,
  pickup_lat: pickup.latitude, pickup_lng: pickup.longitude, dropoff_lat: 10.78, dropoff_lng: 106.71,
  booking_code: '', trip_code: '', payment_code: '', idempotency_key: 'pay-1',
};

async function call(route, { method = 'GET', body, token, statuses = [200] } = {}) {
  const response = await fetch(base + route, { method, signal: AbortSignal.timeout(15000),
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}) });
  const data = await response.json();
  if (!statuses.includes(response.status)) throw new Error(`${method} ${route}: HTTP ${response.status}; ${data.message || 'Unexpected response'}`);
  return { status: response.status, data };
}

async function account(username, role) {
  let response = await call('/auth/login', { method: 'POST', body: { username, password }, statuses: [200, 401] });
  if (response.status === 401) {
    // Never reset or overwrite an account with the same name and a different password.
    await call('/auth/register', { method: 'POST', body: { username, password, role, fullname: username }, statuses: [201] });
    response = await call('/auth/login', { method: 'POST', body: { username, password } });
  }
  if (response.data.role !== role) throw new Error(`${username} already belongs to a different role`);
  return response.data;
}

async function main() {
  if (!values.admin_username || !values.admin_password) throw new Error('Set ADMIN_USERNAME and ADMIN_PASSWORD in .env');
  await call('/ready');
  const admin = (await call('/auth/login', { method: 'POST', body: { username: values.admin_username, password: values.admin_password } })).data;
  values.admin_token = admin.token;
  const customer = await account('khach1', 'CUSTOMER');
  values.customer_token = customer.token;
  const profile = (await call('/customers/me', { token: customer.token })).data.customer;
  values.customer_code = profile.code;
  const drivers = [];
  for (let i = 1; i <= 5; i++) {
    const username = `taixe${i}`;
    const session = await account(username, 'DRIVER');
    values[`driver${i}_username`] = username;
    values[`driver${i}_password`] = password;
    values[`driver${i}_token`] = session.token;
    let result = await call('/drivers/me', { token: session.token, statuses: [200, 404] });
    if (result.status === 404) {
      await call('/auth/otp/request', { method: 'POST', token: session.token, body: { phone: `+8490000000${i}` }, statuses: [201] });
      const otp = (await call('/auth/otp', { token: session.token })).data;
      await call('/auth/otp/verify', { method: 'POST', token: session.token, body: { code: otp.code } });
      result = await call('/drivers/register', { method: 'POST', token: session.token,
        body: { license_number: `MANUAL-L${i}`, plate_number: `MANUAL-P${i}` }, statuses: [201] });
    }
    let driver = result.data.driver;
    if (driver.approval_status === 'PENDING_APPROVAL' && i !== 3) {
      await call(`/admin/drivers/${driver.code}/approve`, { method: 'PATCH', token: admin.token, body: { approve: i !== 4 } });
      driver = (await call('/drivers/me', { token: session.token })).data.driver;
    }
    if (driver.availability === 'BUSY') throw new Error(`${username} is BUSY; finish or cancel its existing trip before preparing again`);
    if (driver.approval_status === 'ACTIVE') {
      await call('/drivers/availability', { method: 'PATCH', token: session.token,
        body: { online: i <= 2, latitude: pickup.latitude + (i === 2 ? 0.001 : 0), longitude: pickup.longitude } });
      driver = (await call('/drivers/me', { token: session.token })).data.driver;
    }
    values[`driver${i}_code`] = driver.code;
    drivers.push({ username, code: driver.code, approval: driver.approval_status, availability: driver.availability });
  }
  const existing = (await call('/bookings?limit=100&page=1', { token: customer.token })).data.bookings;
  for (let i = existing.length; i < 5; i++) {
    const booking = (await call('/bookings', { method: 'POST', token: customer.token, statuses: [201],
      body: { pickup_lat: 10.77, pickup_lng: 106.70, dropoff_lat: 10.78, dropoff_lng: 106.71 } })).data.booking;
    await call(`/bookings/${booking.code}/cancel`, { method: 'POST', token: customer.token, body: { reason: 'Du lieu mau de cham phan trang' } });
  }
  const directory = path.resolve(__dirname, '../postman');
  fs.mkdirSync(directory, { recursive: true });
  const environment = { name: 'CAB — Chấm tay (local)', _postman_variable_scope: 'environment',
    values: Object.entries(values).map(([key, value]) => ({ key, value, enabled: true, type: /token|password/.test(key) ? 'secret' : 'default' })) };
  fs.writeFileSync(path.join(directory, 'CAB.manual.local.postman_environment.json'), JSON.stringify(environment, null, 2) + '\n');
  fs.writeFileSync(path.join(directory, 'MANUAL.local.md'), [
    '# Dữ liệu đang sẵn sàng để chấm tay', '', `Gateway: ${base}`, `Customer: khach1 — ${profile.code}`, '',
    '| Username | Code | Phê duyệt | Availability |', '|---|---|---|---|',
    ...drivers.map(d => `| ${d.username} | ${d.code} | ${d.approval} | ${d.availability} |`), '',
    'Environment: CAB.manual.local.postman_environment.json (có credentials/token, không chia sẻ).',
    'Token hết hạn sau 1 giờ; đăng nhập lại khi chấm. Hướng dẫn nhập URL/body: MANUAL.md.',
    'Mã trả về phụ thuộc dữ liệu hiện có; không mặc định C1/D1 là tài khoản vừa tạo.', '',
  ].join('\n'));
  console.log(`Prepared ${profile.code} (khach1), ${drivers.map(d => `${d.code} (${d.username})`).join(', ')} and at least five bookings.`);
  console.log('Import postman/CAB.manual.local.postman_environment.json. See postman/MANUAL.local.md and postman/MANUAL.md.');
}
main().catch(error => { console.error('Manual setup failed:', error.message); process.exitCode = 1; });
