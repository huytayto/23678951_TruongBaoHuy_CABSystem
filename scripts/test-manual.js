const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const directory = path.resolve(__dirname, '../postman');
const environment = JSON.parse(fs.readFileSync(path.join(directory, 'CAB.manual.local.postman_environment.json'), 'utf8'));
const value = key => environment.values.find(entry => entry.key === key)?.value;
const base = value('base_url');
const results = [];
async function request(name, method, route, token, body, expected = 200, headers = {}) {
  const response = await fetch(base + route, { method, signal: AbortSignal.timeout(15000),
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
    ...(body ? { body: JSON.stringify(body) } : {}) });
  const data = await response.json();
  assert.equal(response.status, expected, `${name}: expected ${expected}, received ${response.status}`);
  results.push({ name, method, route, status: response.status });
  return data;
}
async function main() {
  const admin = value('admin_token'), customer = value('customer_token'), driver = value('driver1_token');
  if (process.argv.includes('--default-mode')) {
    // Run after `docker compose up -d auth-service payment-service booking-service`.
    await request('Default mode has no simulated OTP inbox', 'GET', '/auth/otp', driver, undefined, 404);
    const previous = JSON.parse(fs.readFileSync(path.join(directory, 'reports/manual-latest.json'), 'utf8'));
    const paymentPath = previous.results.find(item => item.name === 'Payment state readable by code').route;
    await request('Default mode disables provider simulator', 'POST', `/demo${paymentPath}/callback`, admin, { status: 'SUCCESS' }, 404);
    const booking = await request('Default mode creates normal booking', 'POST', '/bookings', customer,
      { pickup_lat: 10.77, pickup_lng: 106.70, dropoff_lat: 10.78, dropoff_lng: 106.71 }, 201);
    assert.equal(booking.offer_expires_in, 15);
    await request('Cancel default-mode test booking', 'POST', `/bookings/${booking.booking.code}/cancel`, customer, { reason: 'Default mode regression' });
    const profile = await request('Code survives service restart', 'GET', '/drivers/me', driver);
    assert.equal(profile.driver.code, value('driver1_code'));
    fs.writeFileSync(path.join(directory, 'reports/default-mode-latest.json'), JSON.stringify({ executed_at: new Date().toISOString(), results }, null, 2) + '\n');
    console.log(`Default-mode checks passed: ${results.length} requests; simulators disabled; offer TTL 15; public codes stable.`);
    return;
  }
  const index = await request('Discover short API', 'GET', '/');
  assert.ok(index.routes.includes('GET /drivers/me'));
  const me = await request('Own customer profile', 'GET', '/customers/me', customer);
  assert.equal(me.customer.code, value('customer_code'));
  assert.deepEqual((await request('Same profile by lower-case code', 'GET', `/customers/${me.customer.code.toLowerCase()}`, customer)).customer, me.customer);
  const d = await request('Own driver profile', 'GET', '/drivers/me', driver);
  assert.equal(d.driver.code, value('driver1_code'));
  await request('No auth bypass for short code', 'GET', `/drivers/${d.driver.code}`, null, undefined, 401);
  await request('Customer forbidden from Driver API', 'GET', `/drivers/${d.driver.code}`, customer, undefined, 403);
  await request('Driver cannot read another driver by code', 'GET', `/drivers/${value('driver2_code')}`, driver, undefined, 403);
  await request('Missing code returns 404', 'GET', '/drivers/D99999999999999', admin, undefined, 404);
  const outsiderName = `manual-check-${Date.now()}`;
  await request('Create unrelated customer', 'POST', '/auth/register', null, { username: outsiderName, password: value('test_password') }, 201);
  const outsider = (await request('Login unrelated customer', 'POST', '/auth/login', null, { username: outsiderName, password: value('test_password') })).token;
  await request('Customer code still enforces ownership', 'GET', `/customers/${me.customer.code}`, outsider, undefined, 403);
  const booking = (await request('Create booking with short URL', 'POST', '/bookings', customer,
    { pickup_lat: 10.77, pickup_lng: 106.70, dropoff_lat: 10.78, dropoff_lng: 106.71 }, 201));
  assert.match(booking.booking.code, /^B[1-9][0-9]*$/);
  assert.equal(booking.offer_expires_in, 300);
  const b = booking.booking.code;
  await request('Read booking by code', 'GET', `/bookings/${b}`, customer);
  await request('Booking ownership protected', 'GET', `/bookings/${b}`, outsider, undefined, 403);
  const trip = (await request('Accept by booking code', 'POST', `/bookings/${b}/accept`, driver)).trip;
  assert.match(trip.code, /^T[1-9][0-9]*$/);
  const t = trip.code;
  const resolvedTrip = await request('Find trip by short booking code', 'GET', `/bookings/${b}/trip`, customer);
  assert.equal(resolvedTrip.trip.code, t);
  await request('Trip ownership protected', 'GET', `/trips/${t}`, outsider, undefined, 403);
  await request('No state jump using short URL', 'PATCH', `/trips/${t}/status`, driver, { status: 'COMPLETED' }, 400);
  for (const status of ['EN_ROUTE', 'ARRIVED', 'PICKED_UP', 'IN_PROGRESS', 'COMPLETED']) {
    assert.equal((await request(`Trip ${status}`, 'PATCH', `/trips/${t}/status`, driver, { status })).trip.status, status);
  }
  const key = `manual-${Date.now()}`;
  const payment = await request('Pay using trip code in JSON', 'POST', '/payments/online', customer, { trip_id: t }, 200, { 'Idempotency-Key': key });
  assert.match(payment.payment.code, /^P[1-9][0-9]*$/);
  const p = payment.payment.code;
  await request('Payment ownership protected', 'GET', `/payments/${p}`, outsider, undefined, 403);
  await request('Simulator still requires token', 'POST', `/demo/payments/${p}/callback`, null, { status: 'SUCCESS' }, 401);
  await request('Customer cannot impersonate provider', 'POST', `/demo/payments/${p}/callback`, customer, { status: 'SUCCESS' }, 403);
  await request('Admin simulator validates status', 'POST', `/demo/payments/${p}/callback`, admin, { status: 'INVALID' }, 400);
  assert.equal((await request('Admin sends local signed callback', 'POST', `/demo/payments/${p}/callback`, admin, { status: 'SUCCESS' })).payment.status, 'COMPLETED');
  assert.equal((await request('Payment state readable by code', 'GET', `/payments/${p}`, customer)).payment.status, 'COMPLETED');
  assert.equal((await request('Trip is PAID', 'GET', `/trips/${t}`, customer)).trip.payment_status, 'PAID');
  assert.deepEqual(await request('Replay by short trip code', 'POST', '/payments/online', customer, { trip_id: t }, 200, { 'Idempotency-Key': key }), payment);
  await request('Duplicate charge rejected', 'POST', '/payments/online', customer, { trip_id: t }, 409, { 'Idempotency-Key': `${key}-other` });
  // Leave demo driver AVAILABLE for the examiner's next manually typed booking.
  fs.mkdirSync(path.join(directory, 'reports'), { recursive: true });
  fs.writeFileSync(path.join(directory, 'reports/manual-latest.json'), JSON.stringify({ executed_at: new Date().toISOString(), results }, null, 2) + '\n');
  console.log(`Manual API checks passed: ${results.length} requests; ${b} -> ${t} -> ${p}. Driver remains AVAILABLE.`);
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
