const crypto = require('crypto');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const express = require('express');
const rateLimit = require('express-rate-limit');
const { Kafka } = require('kafkajs');
const { Pool } = require('pg');
const Redis = require('ioredis');
const { authorize, requireAuth } = require('./auth');
const { contexts, invoke } = require('./grpcClients');
const RedisRateLimitStore = require('./redisRateLimitStore');
const { isEntityId } = require('../../services/entity-ids');
const { canonicalApiUrl } = require('../../shared/api-paths');
const { normalizeInput } = require('../../shared/request-input');

process.env.PGHOST = process.env.PGHOST || process.env.POSTGRES_HOST;
process.env.PGPORT = process.env.PGPORT || process.env.POSTGRES_PORT || '5432';
process.env.PGUSER = process.env.PGUSER || process.env.POSTGRES_USER || '';
process.env.PGPASSWORD = process.env.PGPASSWORD || process.env.POSTGRES_PASSWORD || '';
process.env.PGDATABASE = process.env.PGDATABASE || 'postgres';

const app = express();
const port = Number(process.env.PORT || 8080);
const redis = new Redis(process.env.REDIS_URL || 'redis://127.0.0.1:6379', { lazyConnect: true, maxRetriesPerRequest: 1 });
const pool = new Pool({
  ...(process.env.DATABASE_URL ? { connectionString: process.env.DATABASE_URL } : {
    host: process.env.PGHOST,
    port: Number(process.env.PGPORT || 5432),
    database: process.env.PGDATABASE,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
  }),
  max: 2,
  connectionTimeoutMillis: 1500,
});
const kafka = new Kafka({
  clientId: 'cab-gateway-health',
  brokers: (process.env.KAFKA_BROKERS || '127.0.0.1:9092').split(','),
  connectionTimeout: 1500,
  requestTimeout: 1500,
});
const authn = requireAuth(redis);
const demoBookingLimiter = rateLimit({
  windowMs: 10000, max: 20,
  store: new RedisRateLimitStore(redis, 'cab:demo-bookings:'),
  keyGenerator: (req) => req.user.sub,
  standardHeaders: true, legacyHeaders: false,
  message: { success: false, demo: true, message: 'Demo limit: 20 requests / 10 seconds' },
});

app.disable('x-powered-by');
app.use(express.json({ limit: '1mb', strict: true }));
const gatewayRateLimit = rateLimit({
  windowMs: 1000,
  max: Math.max(1, Number(process.env.RATE_LIMIT_MAX || 1000)),
  store: new RedisRateLimitStore(redis),
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests' },
});
app.use((req, res, next) => {
  gatewayRateLimit(req, res, (error) => {
    if (!error) return next();
    console.error('Redis rate limit check failed:', error.message);
    return res.status(503).json({ success: false, message: 'Rate limiting temporarily unavailable' });
  });
});

// Short paths use exactly the same handlers, authentication and rate limiter.
app.use((req, res, next) => {
  req.url = canonicalApiUrl(req.url);
  if (/^\/(auth|customers|drivers|admin|bookings|trips|payments|notifications|demo)(\/|\?|$)/.test(req.url)) {
    req.url = `/api/v1${req.url}`;
  }
  try {
    req.body = normalizeInput(req.body, req.method === 'PATCH' && /^\/api\/v1\/trips\/[^/?]+\/status(?:\?|$)/.test(req.url));
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
  next();
});

function sendDomainResult(res, result) {
  if (!result || !Number.isInteger(result.status) || !result.body) {
    return res.status(502).json({ success: false, message: 'Invalid response from service' });
  }
  return res.status(result.status).json(result.body);
}

function serviceRoute(context, action, payloadFromRequest) {
  return async (req, res) => {
    try {
      const payload = payloadFromRequest(req);
      const references = {
        customer: { uid: 'customer' }, driver: { uid: 'driver' },
        booking: { booking_id: 'booking' }, trip: { trip_id: 'trip', booking_id: 'booking' },
        payment: { trip_id: 'trip', order_id: 'payment', payment_id: 'payment' },
      };
      for (const [field, target] of Object.entries(references[context] || {})) {
        // Webhook signatures cover the literal order_id supplied by the sender.
        if (context === 'payment' && action === 'webhook' && field === 'order_id') continue;
        if (payload[field] === undefined || payload[field] === null) continue;
        const id = typeof payload[field] === 'string' ? payload[field].toLowerCase() : payload[field];
        if (!isEntityId(target,id)) return res.status(400).json({success:false,message:`Invalid ${target} ID`});
        payload[field] = id;
      }
      const result = await invoke(context, action, payload);
      return sendDomainResult(res, result);
    } catch (error) {
      console.error(`${context}.${action} request failed:`, error.message);
      return res.status(503).json({ success: false, message: 'Service temporarily unavailable' });
    }
  };
}

async function checkKafka() {
  const admin = kafka.admin();
  try {
    await admin.connect();
    await admin.listTopics();
    return 'UP';
  } finally {
    await admin.disconnect();
  }
}

async function checkInfrastructure() {
  const statuses = {};
  const checks = await Promise.allSettled([
    pool.query('SELECT 1'),
    (redis.status === 'wait' ? redis.connect() : Promise.resolve()).then(() => redis.ping()),
    checkKafka(),
  ]);
  statuses.postgres = checks[0].status === 'fulfilled' ? 'UP' : 'DOWN';
  statuses.redis = checks[1].status === 'fulfilled' ? 'UP' : 'DOWN';
  statuses.kafka = checks[2].status === 'fulfilled' ? 'UP' : 'DOWN';
  return statuses;
}

async function checkAllServices() {
  const checks = await Promise.all(contexts.map(async (context) => {
    try {
      const result = await invoke(context, 'health');
      return [context === 'auth' ? 'auth-service' : `${context}-service`,
        result.status === 200 && result.body.status === 'UP' ? 'UP' : 'DOWN'];
    } catch {
      return [context === 'auth' ? 'auth-service' : `${context}-service`, 'DOWN'];
    }
  }));
  return Object.fromEntries(checks);
}

app.get('/health', (_req, res) => res.json({ status: 'healthy' }));
app.get('/', (_req, res) => res.json({
  name: 'CAB API', base_url: 'http://localhost:8080',
  usage: 'Use GET/POST/PATCH in Postman. Protected routes require Authorization: Bearer <token>.',
  ids: { customer: 'c1', driver: 'd1', booking: 'b1', trip: 't1', payment: 'p1' },
  note: 'IDs are primary keys in responses and database references. There is no code alias or UUID entity ID.',
  routes: ['GET /api/health', 'GET /api/ready', 'POST /api/register', 'POST /api/login',
    'GET /api/customers/me', 'GET /api/drivers/me', 'POST /api/otp/request', 'GET /api/otp', 'POST /api/otp/verify',
    'POST /api/drivers/register', 'GET /api/drivers/pending', 'PATCH /api/drivers/d1/approve', 'PATCH /api/drivers/availability',
    'GET /api/drivers/nearby?lat=22&lng=111&radius=1km&limit=5&page=1',
    'POST /api/bookings', 'GET /api/bookings?limit=2&page=1', 'GET /api/drivers/offers',
    'POST /api/bookings/b1/accept', 'GET /api/bookings/b1/trip', 'GET /api/trips/t1', 'PATCH /api/trips/t1/status',
    'PATCH /api/trips/t1/location', 'POST /api/trips/t1/cancel', 'POST /api/trips/t1/rating', 'POST /api/payments/online',
    'GET /api/payments/p1', 'POST /api/payments/p1/callback', 'GET /api/notifications/me'],
}));

app.get('/ready', async (_req, res) => {
  try {
    const [services, infrastructure] = await Promise.all([checkAllServices(), checkInfrastructure()]);
    const statuses = { 'api-gateway': 'UP', ...services, ...infrastructure };
    const ready = Object.values(statuses).every((status) => status === 'UP');
    return res.status(ready ? 200 : 503).json({ status: ready ? 'ready' : 'not_ready', services: statuses });
  } catch (error) {
    console.error('Readiness check failed:', error.message);
    return res.status(503).json({ status: 'not_ready', message: 'Dependency check failed' });
  }
});

app.get('/health/services', async (_req, res) => {
  const [services, infrastructure] = await Promise.all([checkAllServices(), checkInfrastructure()]);
  const statuses = { 'api-gateway': 'UP', ...services, ...infrastructure };
  const healthy = Object.values(statuses).every((status) => status === 'UP');
  return res.status(healthy ? 200 : 503).json({ status: healthy ? 'UP' : 'DEGRADED', services: statuses });
});

app.post('/api/v1/auth/register', serviceRoute('auth', 'register', (req) => req.body));
app.post('/api/v1/auth/login', serviceRoute('auth', 'login', (req) => req.body));
app.post('/api/v1/auth/otp/request', authn, authorize('DRIVER'),
  serviceRoute('auth', 'otp_request', (req) => ({ phone: req.body.phone, uid: req.user.sub })));
app.get('/api/v1/auth/otp', authn, authorize('DRIVER'),
  serviceRoute('auth', 'otp_test_code', (req) => ({ uid: req.user.sub })));
app.post('/api/v1/auth/otp/verify', authn, authorize('DRIVER'),
  serviceRoute('auth', 'otp_verify', (req) => ({ challenge_id: req.body.challenge_id, code: req.body.code, uid: req.user.sub })));
app.get('/api/v1/admin/test/otp/:id', authn, authorize('ADMIN'),
  serviceRoute('auth', 'otp_test_code', (req) => ({ challenge_id: req.params.id })));
app.post('/api/v1/auth/logout', authn, serviceRoute('auth', 'logout', (req) => ({
  uid: req.user.sub,
  token_hash: req.tokenHash,
  token_exp: req.user.exp,
})));

app.get('/api/v1/customers/me', authn, authorize('CUSTOMER', 'ADMIN'),
  serviceRoute('customer', 'get_profile', (req) => ({ uid: req.user.sub })));
app.get('/api/v1/customers/:id', authn, authorize('CUSTOMER', 'ADMIN'),
  serviceRoute('customer', 'get_for_user', (req) => ({ uid: req.params.id, requester_id: req.user.sub, role: req.user.role })));
app.post('/api/v1/customers', authn, authorize('ADMIN'),
  serviceRoute('customer', 'create_profile', (req) => req.body));
app.get('/api/v1/customers', authn, authorize('ADMIN'),
  serviceRoute('customer', 'list_profiles', (req) => ({ limit: req.query.limit, page: req.query.page })));
app.put('/api/v1/customers/:id', authn, authorize('ADMIN'), serviceRoute('customer', 'update_profile', (req) => ({
  ...req.body, uid: req.params.id,
})));
app.delete('/api/v1/customers/:id', authn, authorize('ADMIN'),
  serviceRoute('customer', 'delete_profile', (req) => ({ uid: req.params.id })));

app.post('/api/v1/drivers/register', authn, authorize('DRIVER'), serviceRoute('driver', 'register', (req) => ({
  ...req.body, uid: req.user.sub,
})));
app.get('/api/v1/admin/drivers', authn, authorize('ADMIN'),
  serviceRoute('driver', 'list_pending', (req) => ({ limit: req.query.limit, page: req.query.page })));
app.get('/api/v1/drivers/offers', authn, authorize('DRIVER'),
  serviceRoute('booking', 'offers_for_driver', (req) => ({ driver_id: req.user.sub })));
app.get('/api/v1/drivers/me', authn, authorize('DRIVER'),
  serviceRoute('driver', 'get', (req) => ({ uid: req.user.sub, requester_id: req.user.sub, role: req.user.role })));
app.patch('/api/v1/admin/drivers/:id/approve', authn, authorize('ADMIN'),
  serviceRoute('driver', 'approve', (req) => ({ uid: req.params.id, approve: req.body.approve !== false })));
app.patch('/api/v1/drivers/availability', authn, authorize('DRIVER'),
  serviceRoute('driver', 'availability', (req) => ({ ...req.body, uid: req.user.sub })));
app.get('/api/v1/drivers/nearby', authn, authorize('ADMIN'), serviceRoute('driver', 'nearby', (req) => ({
  lat: req.query.lat, lng: req.query.lng, radius: req.query.radius === '1km' ? 1000 : req.query.radius,
  limit: req.query.limit, page: req.query.page,
})));
app.get('/api/v1/drivers/:id', authn, authorize('DRIVER', 'ADMIN'),
  serviceRoute('driver', 'get', (req) => ({
    uid: req.params.id, requester_id: req.user.sub, role: req.user.role,
  })));

app.post('/api/v1/bookings', authn, authorize('CUSTOMER'), (req, res, next) => {
  // Opt-in local load demonstration on the real booking URL. Normal traffic
  // retains the global production limit and cannot activate this when disabled.
  if (process.env.SMOKE_MODE === 'true' && req.get('Limit') === '1') return demoBookingLimiter(req, res, next);
  return next();
}, serviceRoute('booking', 'create', (req) => ({
  ...req.body, customer_id: req.user.sub,
})));
app.get('/api/v1/bookings', authn, authorize('CUSTOMER', 'ADMIN'),
  serviceRoute('booking', 'list_by_customer', (req) => ({
    customer_id: req.user.sub, limit: req.query.limit, page: req.query.page,
  })));
app.get('/api/v1/bookings/:id/trip', authn, authorize('CUSTOMER', 'DRIVER', 'ADMIN'),
  serviceRoute('trip', 'get_by_booking', (req) => ({ booking_id: req.params.id, user_id: req.user.sub, role: req.user.role })));
app.get('/api/v1/bookings/:id', authn, authorize('CUSTOMER', 'DRIVER', 'ADMIN'),
  serviceRoute('booking', 'get_for_user', (req) => ({ booking_id: req.params.id, user_id: req.user.sub, role: req.user.role })));
app.post('/api/v1/bookings/:id/accept', authn, authorize('DRIVER'),
  serviceRoute('booking', 'accept', (req) => ({ booking_id: req.params.id, driver_id: req.user.sub })));
app.post('/api/v1/bookings/:id/cancel', authn, authorize('CUSTOMER'), serviceRoute('booking', 'cancel', (req) => ({
  booking_id: req.params.id, customer_id: req.user.sub, reason: req.body.reason,
})));

app.patch('/api/v1/trips/:id/status', authn, authorize('DRIVER'), serviceRoute('trip', 'update_status', (req) => ({
  trip_id: req.params.id, driver_id: req.user.sub, status: req.body.status,
})));
app.patch('/api/v1/trips/:id/location', authn, authorize('DRIVER'),
  serviceRoute('trip', 'update_location', (req) => ({ trip_id: req.params.id, driver_id: req.user.sub,
    latitude: req.body.latitude, longitude: req.body.longitude })));
app.get('/api/v1/trips/:id', authn, authorize('CUSTOMER', 'DRIVER', 'ADMIN'),
  serviceRoute('trip', 'get_for_user', (req) => ({
    trip_id: req.params.id, user_id: req.user.sub, role: req.user.role,
  })));
app.post('/api/v1/trips/:id/cancel', authn, authorize('CUSTOMER'), serviceRoute('trip', 'cancel', (req) => ({
  trip_id: req.params.id, customer_id: req.user.sub, reason: req.body.reason,
})));
app.post('/api/v1/trips/:id/rating', authn, authorize('CUSTOMER'), serviceRoute('trip', 'rate', (req) => ({
  trip_id: req.params.id, customer_id: req.user.sub, stars: req.body.stars, comment: req.body.comment,
})));

app.post('/api/v1/payments/online', authn, authorize('CUSTOMER'), (req, res, next) => {
  const idempotencyKey = req.get('Idempotency-Key');
  if (!idempotencyKey) return res.status(400).json({ success: false, message: 'Idempotency-Key header is required' });
  req.paymentPayload = { ...req.body, customer_id: req.user.sub, idempotency_key: idempotencyKey };
  return next();
}, serviceRoute('payment', 'online', (req) => req.paymentPayload));
app.post('/api/v1/payments/cash-confirm', authn, authorize('DRIVER'), serviceRoute('payment', 'cash_confirm', (req) => ({
  ...req.body, driver_id: req.user.sub,
})));
app.post('/api/v1/payments/webhook', serviceRoute('payment', 'webhook', (req) => req.body));
app.get('/api/v1/payments/:id', authn, authorize('CUSTOMER', 'DRIVER', 'ADMIN'),
  serviceRoute('payment', 'get_for_user', (req) => ({ payment_id: req.params.id, user_id: req.user.sub, role: req.user.role })));
app.post('/api/v1/demo/payments/:id/callback', authn, authorize('ADMIN'),
  serviceRoute('payment', 'demo_callback', (req) => ({ order_id: req.params.id, status: req.body.status })));

app.get('/api/v1/notifications/logs', authn, authorize('ADMIN'),
  serviceRoute('notification', 'logs', (req) => ({ limit: req.query.limit })));
app.get('/api/v1/notifications/me', authn,
  serviceRoute('notification', 'for_user', (req) => ({ user_id: req.user.sub, limit: req.query.limit })));

app.use((error, _req, res, _next) => {
  if (error instanceof SyntaxError && error.status === 400) {
    return res.status(400).json({ success: false, message: 'Invalid JSON body' });
  }
  console.error('Unhandled gateway error:', error);
  return res.status(500).json({ success: false, message: 'Internal server error' });
});

let server;
async function startGateway() {
  if (process.env.SMOKE_MODE === 'true') await require('../../services/prepare-smoke').prepare(invoke, false);
  server = app.listen(port, '0.0.0.0', () => console.log(`API Gateway listening on port ${port}`));
}
startGateway().catch((error) => { console.error('Gateway startup failed:', error.message); process.exit(1); });

async function shutdown() {
  if (server) server.close();
  await Promise.allSettled([redis.quit(), pool.end()]);
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
