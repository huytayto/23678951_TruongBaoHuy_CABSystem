require('dotenv').config();

const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const baseUrl = process.env.API_BASE_URL || 'http://127.0.0.1:8080';
const adminUsername = process.env.ADMIN_USERNAME;
const adminPassword = process.env.ADMIN_PASSWORD;

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    },
  });
  const body = await response.json();
  return { status: response.status, body };
}

function expectStatus(result, expected, label) {
  assert.equal(result.status, expected, `${label}: expected HTTP ${expected}, got ${result.status}: ${JSON.stringify(result.body)}`);
  return result.body;
}

async function waitUntilReady() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const result = await request('/ready');
      if (result.status === 200) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw new Error('Gateway did not become ready within 120 seconds');
}

async function main() {
  if (!adminUsername || !adminPassword) {
    throw new Error('Set ADMIN_USERNAME and ADMIN_PASSWORD in .env before running the smoke test');
  }
  await waitUntilReady();
  const services = await request('/health/services');
  expectStatus(services, 200, 'all service health');
  assert.equal(services.body.status, 'UP');

  const adminLogin = await request('/api/v1/auth/login', {
    method: 'POST', body: JSON.stringify({ username: adminUsername, password: adminPassword }),
  });
  const admin = expectStatus(adminLogin, 200, 'admin login');
  const adminHeaders = { Authorization: `Bearer ${admin.token}` };

  const suffix = `${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
  const pickupLat = 20 + Math.random() * 20;
  const pickupLng = 70 + Math.random() * 20;
  const customerCredentials = { username: `smoke-customer-${suffix}`, password: 'SmokeTest@123' };
  const customerRegister = await request('/api/v1/auth/register', {
    method: 'POST', body: JSON.stringify(customerCredentials),
  });
  const customer = expectStatus(customerRegister, 201, 'customer registration');
  const customerLogin = await request('/api/v1/auth/login', {
    method: 'POST', body: JSON.stringify(customerCredentials),
  });
  const customerSession = expectStatus(customerLogin, 200, 'customer login');
  const customerHeaders = { Authorization: `Bearer ${customerSession.token}` };

  expectStatus(await request('/api/v1/customers/me', { headers: customerHeaders }), 200, 'own profile');
  expectStatus(await request('/api/v1/customers', { headers: customerHeaders }), 403, 'customer blocked from customer directory');
  expectStatus(await request('/api/v1/customers', { headers: adminHeaders }), 200, 'admin lists customer profiles');
  expectStatus(await request('/api/v1/admin/drivers/00000000-0000-4000-8000-000000000001/approve', {
    method: 'PATCH', headers: customerHeaders, body: JSON.stringify({}),
  }), 403, 'customer blocked from admin route');
  expectStatus(await request('/api/v1/auth/register', {
    method: 'POST',
    body: JSON.stringify({ username: `smoke-admin-${suffix}`, password: 'SmokeTest@123', role: 'ADMIN' }),
  }), 400, 'public admin self-registration blocked');
  expectStatus(await request('/api/v1/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username: "' OR 1=1 --", password: 'anything' }),
  }), 401, 'SQL-injection-shaped login');
  const tokenParts = customerSession.token.split('.');
  const tamperedClaims = JSON.parse(Buffer.from(tokenParts[1], 'base64url').toString('utf8'));
  tamperedClaims.role = 'ADMIN';
  const tamperedToken = `${tokenParts[0]}.${Buffer.from(JSON.stringify(tamperedClaims)).toString('base64url')}.${tokenParts[2]}`;
  expectStatus(await request('/api/v1/customers/me', {
    headers: { Authorization: `Bearer ${tamperedToken}` },
  }), 401, 'tampered JWT rejected');

  const driverCredentials = { username: `smoke-driver-${suffix}`, password: 'SmokeDriver@123' };
  const driverRegister = await request('/api/v1/auth/register', {
    method: 'POST', body: JSON.stringify({ ...driverCredentials, role: 'DRIVER' }),
  });
  const driver = expectStatus(driverRegister, 201, 'driver account registration');
  const driverLogin = await request('/api/v1/auth/login', {
    method: 'POST', body: JSON.stringify(driverCredentials),
  });
  const driverSession = expectStatus(driverLogin, 200, 'driver login');
  const driverHeaders = { Authorization: `Bearer ${driverSession.token}` };
  const otpChallenge = expectStatus(await request('/api/v1/auth/otp/request', {
    method: 'POST', headers: driverHeaders,
    body: JSON.stringify({ phone: `+849${String(Date.now()).slice(-8)}` }),
  }), 201, 'local driver OTP request');
  const otpInbox = expectStatus(await request(`/api/v1/admin/test/otp/${otpChallenge.challenge_id}`, {
    headers: adminHeaders,
  }), 200, 'admin local OTP inbox');
  expectStatus(await request('/api/v1/auth/otp/verify', {
    method: 'POST', headers: driverHeaders,
    body: JSON.stringify({ challenge_id: otpChallenge.challenge_id, code: otpInbox.code }),
  }), 200, 'driver phone verification');
  expectStatus(await request('/api/v1/drivers/register', {
    method: 'POST',
    headers: driverHeaders,
    body: JSON.stringify({ license_number: `SMOKE-L-${suffix}`, plate_number: `SMOKE-P-${suffix}` }),
  }), 201, 'driver profile registration');
  expectStatus(await request(`/api/v1/admin/drivers/${driver.uid}/approve`, {
    method: 'PATCH', headers: adminHeaders, body: JSON.stringify({ approve: true }),
  }), 200, 'admin approves driver');
  expectStatus(await request('/api/v1/drivers/availability', {
    method: 'PATCH',
    headers: driverHeaders,
    body: JSON.stringify({ online: true, latitude: pickupLat, longitude: pickupLng }),
  }), 200, 'driver goes online');
  const nearbyUrl = `/api/v1/drivers/nearby?lat=${pickupLat}&lng=${pickupLng}&radius=1km&limit=5&page=1`;
  expectStatus(await request(nearbyUrl, { headers: customerHeaders }), 403, 'customer cannot call driver-service API');
  const nearby = await request(nearbyUrl, { headers: adminHeaders });
  const nearbyBody = expectStatus(nearby, 200, 'nearby driver search');
  assert.ok(nearbyBody.drivers.some((item) => item.uid === driver.uid), 'newly online driver appears in geo search');

  const bookingResult = await request('/api/v1/bookings', {
    method: 'POST',
    headers: customerHeaders,
    body: JSON.stringify({
      pickup_lat: pickupLat, pickup_lng: pickupLng,
      dropoff_lat: 10.7725, dropoff_lng: 106.698,
      vehicle_type: 'CAB_4_SEAT',
    }),
  });
  const booking = expectStatus(bookingResult, 201, 'create booking').booking;
  assert.equal(booking.offered_driver_uid, driver.uid, 'closest eligible driver receives the offer');
  const accepted = await request(`/api/v1/bookings/${booking.booking_id}/accept`, {
    method: 'POST', headers: driverHeaders,
  });
  const trip = expectStatus(accepted, 200, 'driver accepts booking').trip;
  const tripDetails = expectStatus(await request(`/api/v1/trips/${trip.trip_id}`, {
    headers: customerHeaders,
  }), 200, 'customer reads assigned trip details');
  assert.equal(tripDetails.driver.uid, driver.uid);

  expectStatus(await request(`/api/v1/trips/${trip.trip_id}/status`, {
    method: 'PATCH', headers: driverHeaders, body: JSON.stringify({ status: 'COMPLETED' }),
  }), 400, 'invalid trip jump rejected');
  for (const status of ['EN_ROUTE', 'ARRIVED', 'PICKED_UP', 'IN_PROGRESS', 'COMPLETED']) {
    expectStatus(await request(`/api/v1/trips/${trip.trip_id}/status`, {
      method: 'PATCH', headers: driverHeaders, body: JSON.stringify({ status }),
    }), 200, `trip status ${status}`);
  }
  const rating = expectStatus(await request(`/api/v1/trips/${trip.trip_id}/rating`, {
    method: 'POST', headers: customerHeaders, body: JSON.stringify({ stars: 5, comment: '<script>alert(1)</script>' }),
  }), 201, 'completed trip rating');
  assert.equal(rating.rating.comment, '&lt;script&gt;alert(1)&lt;/script&gt;', 'HTML script tags are escaped in JSON responses');

  const idempotencyKey = crypto.randomUUID();
  const paymentBody = JSON.stringify({ trip_id: trip.trip_id });
  const firstPayment = expectStatus(await request('/api/v1/payments/online', {
    method: 'POST',
    headers: { ...customerHeaders, 'Idempotency-Key': idempotencyKey },
    body: paymentBody,
  }), 200, 'online payment creation');
  const duplicatePayment = expectStatus(await request('/api/v1/payments/online', {
    method: 'POST',
    headers: { ...customerHeaders, 'Idempotency-Key': idempotencyKey },
    body: paymentBody,
  }), 200, 'idempotent payment retry');
  assert.deepEqual(duplicatePayment, firstPayment, 'replayed payment returns the original response without creating another payment');

  const webhookStatus = 'SUCCESS';
  const signature = crypto.createHmac('sha256', process.env.PAYMENT_WEBHOOK_SECRET)
    .update(`${firstPayment.payment.payment_id}:${webhookStatus}`).digest('hex');
  expectStatus(await request('/api/v1/payments/webhook', {
    method: 'POST',
    body: JSON.stringify({ order_id: firstPayment.payment.payment_id, status: webhookStatus, signature }),
  }), 200, 'signed payment webhook');
  const replayAfterSettlement = expectStatus(await request('/api/v1/payments/online', {
    method: 'POST',
    headers: { ...customerHeaders, 'Idempotency-Key': idempotencyKey },
    body: paymentBody,
  }), 200, 'payment replay after settlement');
  assert.deepEqual(replayAfterSettlement, firstPayment, 'payment replay returns its original response even after settlement');
  expectStatus(await request('/api/v1/payments/webhook', {
    method: 'POST',
    body: JSON.stringify({ order_id: firstPayment.payment.payment_id, status: webhookStatus, signature: 'invalid' }),
  }), 401, 'invalid webhook signature');

  const secondBooking = expectStatus(await request('/api/v1/bookings', {
    method: 'POST',
    headers: customerHeaders,
    body: JSON.stringify({
      pickup_lat: pickupLat, pickup_lng: pickupLng,
      dropoff_lat: 10.7725, dropoff_lng: 106.698,
      vehicle_type: 'CAB_4_SEAT',
    }),
  }), 201, 'create second booking').booking;
  const secondTrip = expectStatus(await request(`/api/v1/bookings/${secondBooking.booking_id}/accept`, {
    method: 'POST', headers: driverHeaders,
  }), 200, 'accept second booking').trip;
  const canceledTrip = expectStatus(await request(`/api/v1/trips/${secondTrip.trip_id}/cancel`, {
    method: 'POST',
    headers: customerHeaders,
    body: JSON.stringify({ reason: 'Smoke test cancellation' }),
  }), 200, 'cancel assigned trip').trip;
  assert.equal(canceledTrip.status, 'CANCELED');

  await new Promise((resolve) => setTimeout(resolve, 1000));
  const notifications = await request('/api/v1/notifications/logs?limit=50', { headers: adminHeaders });
  const notificationBody = expectStatus(notifications, 200, 'admin notification event log');
  assert.ok(notificationBody.notifications.length > 0, 'Kafka events are consumed and logged');

  expectStatus(await request('/api/v1/auth/logout', {
    method: 'POST', headers: customerHeaders,
  }), 200, 'logout');
  expectStatus(await request('/api/v1/customers/me', { headers: customerHeaders }), 401, 'revoked token rejected');

  console.log('CAB API smoke tests passed');
  console.log(`Customer ${customer.uid}; booking ${booking.booking_id}; trip ${trip.trip_id}; payment ${firstPayment.payment.payment_id}`);
}

main().catch((error) => {
  console.error('CAB API smoke tests failed:', error);
  process.exitCode = 1;
});
