require('dotenv').config();

const crypto = require('crypto');
const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Kafka } = require('kafkajs');
const { Pool } = require('pg');
const Redis = require('ioredis');
const path = require('path');
const {
  isValidCoordinates,
  escapeResponseStrings,
  isValidPassword,
  isValidSecret,
  isValidTripTransition,
} = require('./domain-rules');
const { decryptField, encryptField, loadEncryptionKey, lookupHash } = require('./data-encryption');
const { ensurePublicCodes, isPublicCode, resolvePublicCode } = require('./public-codes');

const context = process.env.SERVICE_CONTEXT;
const port = Number(process.env.GRPC_PORT);
const jwtSecret = process.env.JWT_SECRET;
const fareAmount = Number(process.env.FIXED_FARE_AMOUNT || 50000);
const offerTtlSeconds = Math.min(Math.max(Math.trunc(Number(process.env.OFFER_TTL_SECONDS)) || 15, 5), 600);
const protoPath = path.resolve(__dirname, '../shared/proto/cab-domain.proto');
const defaultPorts = {
  auth: 50051,
  customer: 50052,
  driver: 50053,
  booking: 50054,
  trip: 50055,
  notification: 50056,
  payment: 50057,
};
const eventTopics = [
  'cab.booking.events',
  'cab.driver.events',
  'cab.trip.events',
  'cab.payment.events',
];

const tables = {
  auth: `
    CREATE TABLE IF NOT EXISTS users (
      uid UUID PRIMARY KEY,
      username VARCHAR(100) UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role VARCHAR(20) NOT NULL CHECK (role IN ('CUSTOMER', 'DRIVER', 'ADMIN')),
      status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
  customer: `
    CREATE TABLE IF NOT EXISTS customers (
      uid UUID PRIMARY KEY,
      fullname TEXT NOT NULL,
      age INTEGER CHECK (age IS NULL OR age BETWEEN 0 AND 120),
      address TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
  driver: `
    CREATE TABLE IF NOT EXISTS drivers (
      uid UUID PRIMARY KEY,
      license_number TEXT NOT NULL,
      plate_number TEXT NOT NULL,
      license_lookup_hash CHAR(64) UNIQUE NOT NULL,
      plate_lookup_hash CHAR(64) UNIQUE NOT NULL,
      vehicle_type VARCHAR(40) NOT NULL DEFAULT 'CAB_4_SEAT',
      approval_status VARCHAR(30) NOT NULL DEFAULT 'PENDING_APPROVAL',
      availability VARCHAR(20) NOT NULL DEFAULT 'OFFLINE',
      latitude DOUBLE PRECISION,
      longitude DOUBLE PRECISION,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    ALTER TABLE drivers ADD COLUMN IF NOT EXISTS phone TEXT;
    ALTER TABLE drivers ALTER COLUMN phone TYPE TEXT;
    ALTER TABLE drivers ADD COLUMN IF NOT EXISTS phone_verified BOOLEAN NOT NULL DEFAULT false`,
  booking: `
    CREATE TABLE IF NOT EXISTS bookings (
      booking_id UUID PRIMARY KEY,
      customer_id UUID NOT NULL,
      pickup_lat DOUBLE PRECISION NOT NULL,
      pickup_lng DOUBLE PRECISION NOT NULL,
      dropoff_lat DOUBLE PRECISION NOT NULL,
      dropoff_lng DOUBLE PRECISION NOT NULL,
      vehicle_type VARCHAR(40) NOT NULL,
      status VARCHAR(30) NOT NULL,
      offered_driver_uid UUID,
      candidate_driver_uids UUID[] NOT NULL DEFAULT '{}',
      offered_index INTEGER NOT NULL DEFAULT 0,
      assigned_driver_uid UUID,
      cancel_reason TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      offered_at TIMESTAMPTZ
    );
    ALTER TABLE bookings ADD COLUMN IF NOT EXISTS candidate_driver_uids UUID[] NOT NULL DEFAULT '{}';
    ALTER TABLE bookings ADD COLUMN IF NOT EXISTS offered_index INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE bookings ADD COLUMN IF NOT EXISTS offered_at TIMESTAMPTZ`,
  trip: `
    CREATE TABLE IF NOT EXISTS trips (
      trip_id UUID PRIMARY KEY,
      booking_id UUID UNIQUE NOT NULL,
      customer_id UUID NOT NULL,
      driver_id UUID NOT NULL,
      status VARCHAR(30) NOT NULL,
      fare_amount NUMERIC(12,2) NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS ratings (
      rating_id UUID PRIMARY KEY,
      trip_id UUID UNIQUE NOT NULL REFERENCES trips(trip_id),
      customer_id UUID NOT NULL,
      stars INTEGER NOT NULL CHECK (stars BETWEEN 1 AND 5),
      comment TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    ALTER TABLE trips ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION;
    ALTER TABLE trips ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;
    ALTER TABLE trips ADD COLUMN IF NOT EXISTS cancel_reason TEXT;
    ALTER TABLE trips ADD COLUMN IF NOT EXISTS payment_status VARCHAR(20) NOT NULL DEFAULT 'UNPAID';
    ALTER TABLE trips ADD COLUMN IF NOT EXISTS payment_id UUID`,
  payment: `
    CREATE TABLE IF NOT EXISTS payments (
      payment_id UUID PRIMARY KEY,
      trip_id UUID NOT NULL,
      customer_id UUID,
      payment_method VARCHAR(30) NOT NULL,
      status VARCHAR(20) NOT NULL,
      amount NUMERIC(12,2) NOT NULL,
      idempotency_key VARCHAR(200) UNIQUE,
      idempotency_response JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    ALTER TABLE payments ADD COLUMN IF NOT EXISTS idempotency_response JSONB;
    CREATE UNIQUE INDEX IF NOT EXISTS payments_cash_trip_unique
      ON payments (trip_id) WHERE payment_method = 'CASH_POSTPAID'`,
  notification: `
    CREATE TABLE IF NOT EXISTS notification_logs (
      notification_id BIGSERIAL PRIMARY KEY,
      event_id VARCHAR(100) UNIQUE NOT NULL,
      topic VARCHAR(200) NOT NULL,
      payload JSONB NOT NULL,
      received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
};

let pool;
let redis;
let kafka;
let producer;
let grpcServer;
let dataEncryptionKey;
let clients = {};

function failure(status, message) {
  return { status, body: escapeResponseStrings({ success: false, message }) };
}

function success(status, body) {
  return { status, body: escapeResponseStrings({ success: true, ...body }) };
}

function decryptCustomer(customer) {
  if (!customer) return customer;
  return {
    ...customer,
    fullname: decryptField(customer.fullname, dataEncryptionKey),
    address: decryptField(customer.address, dataEncryptionKey),
  };
}

function decryptDriver(driver) {
  if (!driver) return driver;
  return {
    ...driver,
    ...(driver.license_number !== undefined
      ? { license_number: decryptField(driver.license_number, dataEncryptionKey) } : {}),
    ...(driver.plate_number !== undefined
      ? { plate_number: decryptField(driver.plate_number, dataEncryptionKey) } : {}),
    ...(driver.phone !== undefined
      ? { phone: decryptField(driver.phone, dataEncryptionKey) } : {}),
  };
}

function parsePayload(raw) {
  try {
    return JSON.parse(raw || '{}');
  } catch {
    throw Object.assign(new Error('Invalid JSON payload'), { status: 400 });
  }
}

function clientFor(targetContext) {
  const envName = `${targetContext.toUpperCase()}_SERVICE_ADDRESS`;
  const address = process.env[envName] || `127.0.0.1:${defaultPorts[targetContext]}`;
  if (!clients[targetContext]) {
    const definition = protoLoader.loadSync(protoPath, {
      keepCase: true,
      longs: String,
      enums: String,
      defaults: true,
      oneofs: true,
    });
    const loaded = grpc.loadPackageDefinition(definition);
    clients[targetContext] = new loaded.cab.domain.DomainService(
      address,
      grpc.credentials.createInsecure(),
      { 'grpc.keepalive_time_ms': 10000 },
    );
  }
  return clients[targetContext];
}

function invokePeer(targetContext, action, payload) {
  return new Promise((resolve, reject) => {
    clientFor(targetContext).Invoke(
      { action, payload_json: JSON.stringify(payload || {}) },
      { deadline: Date.now() + 5000 },
      (error, response) => {
        if (error) return reject(error);
        try {
          const result = JSON.parse(response.body_json);
          if (result.status >= 400) {
            const domainError = new Error(result.body.message || 'Service request failed');
            domainError.status = result.status;
            return reject(domainError);
          }
          return resolve(result.body);
        } catch (parseError) {
          return reject(parseError);
        }
      },
    );
  });
}

async function publish(topic, event) {
  await producer.send({
    topic,
    messages: [{
      key: event.aggregate_id || event.event_id,
      value: JSON.stringify({
        event_id: event.event_id || crypto.randomUUID(),
        occurred_at: new Date().toISOString(),
        ...event,
      }),
    }],
  });
}

async function ensureDatabase() {
  for (const statement of tables[context].split(';').map((part) => part.trim()).filter(Boolean)) {
    await pool.query(statement);
  }
  await ensurePublicCodes(pool, context);
  if (context === 'auth' && process.env.ADMIN_USERNAME && process.env.ADMIN_PASSWORD) {
    const passwordHash = await bcrypt.hash(process.env.ADMIN_PASSWORD, 12);
    await pool.query(
      `INSERT INTO users (uid, username, password_hash, role)
       VALUES ($1, $2, $3, 'ADMIN')
       ON CONFLICT (username) DO UPDATE SET password_hash = EXCLUDED.password_hash, role = 'ADMIN'`,
      [crypto.randomUUID(), process.env.ADMIN_USERNAME, passwordHash],
    );
  }
  if (context === 'auth' && process.env.SEED_DEMO_PASSWORD) {
    if (process.env.SEED_DEMO_PASSWORD.length < 12) throw new Error('SEED_DEMO_PASSWORD must be at least 12 characters');
    const hash = await bcrypt.hash(process.env.SEED_DEMO_PASSWORD, 12);
    for (let index = 1; index <= 5; index += 1) {
      await pool.query(
        `INSERT INTO users (uid, username, password_hash, role)
         VALUES ($1, $2, $3, 'DRIVER')
       ON CONFLICT (username) DO UPDATE SET password_hash = EXCLUDED.password_hash`,
        [`00000000-0000-4000-8000-${String(index).padStart(12, '0')}`, `demo-driver-${index}`, hash],
      );
    }
  }
  if (context === 'driver' && process.env.SEED_DEMO_PASSWORD) {
    for (let index = 1; index <= 5; index += 1) {
      const uid = `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
      const latitude = 10.776889 + (index * 0.00015);
      const longitude = 106.700806 + (index * 0.00015);
      const licenseNumber = `DEMO-LICENSE-${index}`;
      const plateNumber = `DEMO-PLATE-${index}`;
      await pool.query(
        `INSERT INTO drivers
          (uid, license_number, plate_number, license_lookup_hash, plate_lookup_hash,
           approval_status, availability, latitude, longitude)
         VALUES ($1, $2, $3, $4, $5, 'ACTIVE', 'AVAILABLE', $6, $7)
         ON CONFLICT (uid) DO NOTHING`,
        [
          uid, encryptField(licenseNumber, dataEncryptionKey), encryptField(plateNumber, dataEncryptionKey),
          lookupHash(licenseNumber, 'license', dataEncryptionKey),
          lookupHash(plateNumber, 'plate', dataEncryptionKey), latitude, longitude,
        ],
      );
      await redis.geoadd('cab:drivers:available', longitude, latitude, uid);
    }
  }
}

async function getNearbyDrivers({ lat, lng, radius = 1000, limit = 20, page = 1 }) {
  const radiusMeters = Math.min(Math.max(Number(radius) || 1000, 1), 50000);
  const pageSize = Math.min(Math.max(Number(limit) || 20, 1), 100);
  const pageNumber = Math.max(Number(page) || 1, 1);
  const results = await redis.call(
    'GEOSEARCH',
    'cab:drivers:available',
    'FROMLONLAT', String(lng), String(lat),
    'BYRADIUS', String(radiusMeters), 'm',
    'ASC', 'WITHDIST',
  );
  const start = (pageNumber - 1) * pageSize;
  const slice = results.slice(start, start + pageSize);
  const ids = slice.map((entry) => entry[0]);
  if (ids.length === 0) return { drivers: [], pagination: { page: pageNumber, limit: pageSize, total: results.length } };
  const rows = await pool.query(
    `SELECT uid, code, vehicle_type, approval_status, availability FROM drivers WHERE uid = ANY($1::uuid[])`,
    [ids],
  );
  const byId = new Map(rows.rows.map((row) => [row.uid, row]));
  const drivers = slice
    .map(([uid, distance]) => {
      const row = byId.get(uid);
      return row && row.approval_status === 'ACTIVE' && row.availability === 'AVAILABLE'
        ? { uid: row.uid, code: row.code, vehicle_type: row.vehicle_type, distance_meters: Number(distance) }
        : null;
    })
    .filter(Boolean);
  return { drivers, pagination: { page: pageNumber, limit: pageSize, total: results.length } };
}

async function invoke(action, payload) {
  if (action === 'resolve_code') {
    const reference = await resolvePublicCode(pool, context, payload.code);
    return reference ? success(200, reference) : failure(404, 'Record code not found');
  }
  switch (context) {
    case 'auth': {
      if (action === 'health') return success(200, { context, status: 'UP' });
      if (action === 'otp_request') {
        if (process.env.OTP_TEST_MODE !== 'true') return failure(503, 'Configure an SMS adapter or enable local OTP_TEST_MODE for demos');
        if (!/^\+?[0-9]{9,15}$/.test(String(payload.phone || ''))) return failure(400, 'Valid phone number required');
        const cooldown = await redis.set(`cab:otp:cooldown:${payload.uid}`, '1', 'EX', 30, 'NX');
        if (!cooldown) return failure(429, 'Wait 30 seconds before requesting another OTP');
        const challengeId = crypto.randomUUID();
        const code = String(crypto.randomInt(100000, 1000000));
        const key = crypto.createHash('sha256').update(jwtSecret).digest();
        await redis.set(`cab:otp:${challengeId}`, JSON.stringify({
          uid: payload.uid, phone: payload.phone,
          digest: crypto.createHmac('sha256', jwtSecret).update(`${challengeId}:${code}`).digest('hex'),
          local_code: process.env.OTP_TEST_MODE === 'true' ? encryptField(code, key) : null,
        }), 'EX', 300);
        await redis.set(`cab:otp:current:${payload.uid}`, challengeId, 'EX', 300);
        // Local demo transport. A production SMS adapter must replace this mode.
        return success(201, { challenge_id: challengeId, expires_in: 300, delivery: 'LOCAL_DEMO' });
      }
      if (action === 'otp_test_code') {
        if (process.env.OTP_TEST_MODE !== 'true') return failure(404, 'Local OTP test inbox is disabled');
        const challengeId = payload.challenge_id || await redis.get(`cab:otp:current:${payload.uid}`);
        const record = await redis.get(`cab:otp:${challengeId}`);
        if (!record) return failure(404, 'OTP challenge not found or expired');
        const challenge = JSON.parse(record);
        if (payload.uid && challenge.uid !== payload.uid) return failure(403, 'OTP challenge belongs to another driver');
        const key = crypto.createHash('sha256').update(jwtSecret).digest();
        return success(200, { challenge_id: challengeId, code: decryptField(challenge.local_code, key), delivery: 'LOCAL_DEMO' });
      }
      if (action === 'otp_verify') {
        const challengeId = payload.challenge_id || await redis.get(`cab:otp:current:${payload.uid}`);
        const key = `cab:otp:${challengeId}`;
        const record = await redis.get(key);
        if (!record) return failure(400, 'OTP challenge not found or expired');
        const challenge = JSON.parse(record);
        if (challenge.uid !== payload.uid) return failure(403, 'OTP challenge belongs to another driver');
        const attempts = await redis.incr(`${key}:attempts`);
        await redis.expire(`${key}:attempts`, 300);
        if (attempts > 5) { await redis.del(key); return failure(429, 'OTP attempt limit exceeded'); }
        const digest = crypto.createHmac('sha256', jwtSecret).update(`${challengeId}:${payload.code}`).digest('hex');
        if (!crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(challenge.digest))) return failure(400, 'Invalid OTP code');
        const consumed = await redis.eval("if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end", 1, key, record);
        if (!consumed) return failure(409, 'OTP already used');
        await redis.set(`cab:otp:verified:${payload.uid}`, challenge.phone, 'EX', 600);
        return success(200, { phone: challenge.phone, phone_verified: true });
      }
      if (action === 'consume_phone_verification') {
        const phone = await redis.getdel(`cab:otp:verified:${payload.uid}`);
        return phone ? success(200, { phone }) : failure(403, 'Verify phone OTP before submitting driver profile');
      }
      if (action === 'register') {
        const { username, password } = payload;
        const role = String(payload.role || 'CUSTOMER').toUpperCase();
        if (!username || !password || !['CUSTOMER', 'DRIVER'].includes(role)) {
          return failure(400, 'username, password, and role CUSTOMER or DRIVER are required');
        }
        if (String(username).length > 100 || !isValidPassword(password)) {
          return failure(400, 'Password must be 8-128 characters and contain upper/lowercase letters, a number, and a symbol');
        }
        const uid = crypto.randomUUID();
        const passwordHash = await bcrypt.hash(password, 12);
        try {
          await pool.query(
            `INSERT INTO users (uid, username, password_hash, role) VALUES ($1, $2, $3, $4)`,
            [uid, username, passwordHash, role],
          );
        } catch (error) {
          if (error.code === '23505') return failure(409, 'Username already exists');
          throw error;
        }
        if (role === 'CUSTOMER') {
          try {
            await invokePeer('customer', 'create_profile', {
              uid, fullname: String(payload.fullname || username), address: '',
            });
          } catch (error) {
            await pool.query('DELETE FROM users WHERE uid = $1', [uid]);
            throw error;
          }
        }
        return success(201, { message: 'User registered successfully', uid, username, role });
      }
      if (action === 'login') {
        const { username, password } = payload;
        if (!username || !password) return failure(400, 'username and password are required');
        const result = await pool.query(
          `SELECT uid, username, password_hash, role, status FROM users WHERE username = $1`,
          [username],
        );
        const user = result.rows[0];
        if (!user || !(await bcrypt.compare(password, user.password_hash))) {
          return failure(401, 'Invalid credentials');
        }
        if (user.status !== 'ACTIVE') return failure(403, 'Account is not active');
        const token = jwt.sign({ sub: user.uid, role: user.role }, jwtSecret, { expiresIn: '1h', issuer: 'cab-auth' });
        return success(200, { token, uid: user.uid, role: user.role, token_type: 'Bearer', expires_in: 3600 });
      }
      if (action === 'logout') {
        const seconds = Math.max(1, Number(payload.token_exp) - Math.floor(Date.now() / 1000));
        await redis.set(`cab:revoked:${payload.token_hash}`, '1', 'EX', seconds);
        return success(200, { message: 'Logged out successfully' });
      }
      return failure(404, 'Unknown auth action');
    }
    case 'customer': {
      if (action === 'health') return success(200, { context, status: 'UP' });
      if (action === 'get_for_user') {
        if (payload.role !== 'ADMIN' && payload.requester_id !== payload.uid) return failure(403, 'Customers may only view their own profile');
        return invoke('get_profile', payload);
      }
      if (action === 'create_profile') {
        const { uid, fullname, age, address = '' } = payload;
        if (!uid || !fullname) return failure(400, 'uid and fullname are required');
        if (age !== undefined && age !== null && (!Number.isInteger(Number(age)) || Number(age) < 0 || Number(age) > 120)) {
          return failure(400, 'age must be an integer between 0 and 120');
        }
        try {
          const result = await pool.query(
          `INSERT INTO customers (uid, fullname, age, address)
           VALUES ($1, $2, $3, $4) RETURNING uid, code, fullname, age, address`,
            [
              uid, encryptField(fullname, dataEncryptionKey),
              age === undefined || age === null ? null : Number(age),
              encryptField(address, dataEncryptionKey),
            ],
          );
          return success(201, { customer: decryptCustomer(result.rows[0]) });
        } catch (error) {
          if (error.code === '23505') return failure(409, 'Customer profile already exists');
          throw error;
        }
      }
      if (action === 'get_profile') {
        const result = await pool.query(
          `SELECT uid, code, fullname, age, address FROM customers WHERE uid = $1`,
          [payload.uid],
        );
        return result.rows[0] ? success(200, { customer: decryptCustomer(result.rows[0]) }) : failure(404, 'Customer not found');
      }
      if (action === 'list_profiles') {
        const limit = Math.min(Math.max(Number(payload.limit) || 20, 1), 100);
        const page = Math.max(Number(payload.page) || 1, 1);
        const result = await pool.query(
          `SELECT uid, code, fullname, age, address FROM customers ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
          [limit, (page - 1) * limit],
        );
        return success(200, { customers: result.rows.map(decryptCustomer), pagination: { page, limit } });
      }
      if (action === 'update_profile') {
        if (payload.age !== undefined && payload.age !== null
          && (!Number.isInteger(Number(payload.age)) || Number(payload.age) < 0 || Number(payload.age) > 120)) {
          return failure(400, 'age must be an integer between 0 and 120');
        }
        const result = await pool.query(
          `UPDATE customers SET fullname = COALESCE($2, fullname), age = COALESCE($3, age),
           address = COALESCE($4, address) WHERE uid = $1 RETURNING uid, code, fullname, age, address`,
          [
            payload.uid,
            payload.fullname === undefined ? null : encryptField(payload.fullname, dataEncryptionKey),
            payload.age ?? null,
            payload.address === undefined ? null : encryptField(payload.address, dataEncryptionKey),
          ],
        );
        return result.rows[0] ? success(200, { customer: decryptCustomer(result.rows[0]) }) : failure(404, 'Customer not found');
      }
      if (action === 'delete_profile') {
        const result = await pool.query('DELETE FROM customers WHERE uid = $1', [payload.uid]);
        return result.rowCount ? success(200, { message: 'Customer deleted' }) : failure(404, 'Customer not found');
      }
      return failure(404, 'Unknown customer action');
    }
    case 'driver': {
      if (action === 'health') return success(200, { context, status: 'UP' });
      if (action === 'register') {
        const { uid, license_number, plate_number, vehicle_type = 'CAB_4_SEAT' } = payload;
        if (!uid || !license_number || !plate_number || vehicle_type !== 'CAB_4_SEAT') {
          return failure(400, 'uid, license_number, plate_number, and vehicle_type CAB_4_SEAT are required');
        }
        const licenseHash = lookupHash(license_number, 'license', dataEncryptionKey);
        const plateHash = lookupHash(plate_number, 'plate', dataEncryptionKey);
        const verification = await invokePeer('auth', 'consume_phone_verification', { uid });
        try {
          const result = await pool.query(
            `INSERT INTO drivers
               (uid, license_number, plate_number, license_lookup_hash, plate_lookup_hash, vehicle_type, phone, phone_verified)
             VALUES ($1, $2, $3, $4, $5, $6, $7, true)
             RETURNING uid, code, license_number, plate_number, vehicle_type, approval_status, availability, phone, phone_verified`,
            [
              uid, encryptField(license_number, dataEncryptionKey),
              encryptField(plate_number, dataEncryptionKey), licenseHash, plateHash, vehicle_type, encryptField(verification.phone, dataEncryptionKey),
            ],
          );
          return success(201, { driver: decryptDriver(result.rows[0]) });
        } catch (error) {
          if (error.code === '23505') return failure(409, 'Driver profile or vehicle details already exist');
          throw error;
        }
      }
      if (action === 'list_pending') {
        const limit = Math.min(Math.max(Math.trunc(Number(payload.limit)) || 20, 1), 100);
        const page = Math.max(Math.trunc(Number(payload.page)) || 1, 1);
        const result = await pool.query(
          `SELECT uid, code, vehicle_type, approval_status, availability, phone_verified FROM drivers
           WHERE approval_status = 'PENDING_APPROVAL' ORDER BY created_at DESC LIMIT $1 OFFSET $2`, [limit, (page - 1) * limit],
        );
        return success(200, { drivers: result.rows, pagination: { limit, page } });
      }
      if (action === 'get') {
        const columns = payload.role === 'ADMIN'
          ? 'uid, code, license_number, plate_number, vehicle_type, approval_status, availability, latitude, longitude, phone_verified'
          : 'uid, code, plate_number, vehicle_type, availability, approval_status, phone_verified';
        const result = await pool.query(`SELECT ${columns} FROM drivers WHERE uid = $1`, [payload.uid]);
        if (payload.role === 'DRIVER' && payload.requester_id !== payload.uid) {
          return failure(403, 'Drivers may only view their own profile');
        }
        return result.rows[0] ? success(200, { driver: decryptDriver(result.rows[0]) }) : failure(404, 'Driver not found');
      }
      if (action === 'approve') {
        const result = await pool.query(
          `UPDATE drivers SET approval_status = $2, availability = 'OFFLINE'
           WHERE uid = $1 AND approval_status = 'PENDING_APPROVAL'
           RETURNING uid, code, approval_status, availability`,
          [payload.uid, payload.approve === false ? 'REJECTED' : 'ACTIVE'],
        );
        if (!result.rows[0]) return failure(404, 'Pending driver profile not found');
        await publish('cab.driver.events', { event_type: 'DriverApprovalChanged', aggregate_id: payload.uid,
          driver_id: payload.uid, approval_status: result.rows[0].approval_status });
        return success(200, { driver: result.rows[0] });
      }
      if (action === 'availability') {
        if (typeof payload.online !== 'boolean') return failure(400, 'online must be a boolean');
        const online = payload.online;
        const { latitude, longitude } = payload;
        if (online && !isValidCoordinates(latitude, longitude)) return failure(400, 'Valid latitude and longitude are required when going online');
        const result = await pool.query(
          `UPDATE drivers SET availability = $2, latitude = $3, longitude = $4
           WHERE uid = $1 AND approval_status = 'ACTIVE' AND availability <> 'BUSY'
           RETURNING uid, code, approval_status, availability, latitude, longitude`,
          [payload.uid, online ? 'AVAILABLE' : 'OFFLINE', online ? Number(latitude) : null, online ? Number(longitude) : null],
        );
        if (!result.rows[0]) return failure(403, 'Active driver profile required');
        if (online) await redis.geoadd('cab:drivers:available', Number(longitude), Number(latitude), payload.uid);
        else await redis.zrem('cab:drivers:available', payload.uid);
        await publish('cab.driver.events', {
          event_type: 'DriverAvailabilityChanged', aggregate_id: payload.uid,
          driver_id: payload.uid, availability: online ? 'AVAILABLE' : 'OFFLINE',
        });
        return success(200, { driver: result.rows[0] });
      }
      if (action === 'nearby') {
        if (!isValidCoordinates(payload.lat, payload.lng)) return failure(400, 'Valid lat and lng query parameters are required');
        return success(200, await getNearbyDrivers(payload));
      }
      if (action === 'set_busy') {
        const result = await pool.query(
          `UPDATE drivers SET availability = $2
           WHERE uid = $1 AND approval_status = 'ACTIVE'
             AND (($3::boolean AND availability = 'AVAILABLE') OR (NOT $3::boolean AND availability = 'BUSY'))
           RETURNING uid, code, availability, latitude, longitude`,
          [payload.uid, payload.busy ? 'BUSY' : 'AVAILABLE', Boolean(payload.busy)],
        );
        if (!result.rows[0]) return failure(409, 'Driver is not in the required availability state');
        if (payload.busy) await redis.zrem('cab:drivers:available', payload.uid);
        else if (result.rows[0].latitude !== null && result.rows[0].longitude !== null) {
          await redis.geoadd('cab:drivers:available', result.rows[0].longitude, result.rows[0].latitude, payload.uid);
        }
        return success(200, { driver: result.rows[0] });
      }
      return failure(404, 'Unknown driver action');
    }
    case 'booking': {
      if (action === 'health') return success(200, { context, status: 'UP' });
      if (action === 'get_for_user') {
        const result = await pool.query('SELECT * FROM bookings WHERE booking_id = $1', [payload.booking_id]);
        const booking = result.rows[0];
        if (!booking) return failure(404, 'Booking not found');
        const isCustomer = booking.customer_id === payload.user_id;
        const isDriver = booking.assigned_driver_uid === payload.user_id
          || (booking.offered_driver_uid === payload.user_id && await redis.get(`cab:booking:offer-exp:${booking.booking_id}`) === payload.user_id);
        if (payload.role !== 'ADMIN' && !isCustomer && !isDriver) return failure(403, 'Only booking participants may view it');
        return success(200, { booking });
      }
      if (action === 'offers_for_driver') {
        const result = await pool.query(`SELECT * FROM bookings WHERE offered_driver_uid = $1 AND status = 'SEARCHING_DRIVER' ORDER BY created_at DESC`, [payload.driver_id]);
        const offers = [];
        for (const booking of result.rows) {
          if (await redis.get(`cab:booking:offer-exp:${booking.booking_id}`) === payload.driver_id) offers.push(booking);
        }
        return success(200, { offers });
      }
      if (action === 'sync_trip_status') {
        await pool.query(`UPDATE bookings SET status = $2, cancel_reason = COALESCE($3, cancel_reason), updated_at = NOW()
          WHERE booking_id = $1 AND status NOT IN ('COMPLETED', 'CANCELED')`, [payload.booking_id, payload.status, payload.reason || null]);
        return success(200, {});
      }
      if (action === 'create') {
        const { pickup_lat, pickup_lng, dropoff_lat, dropoff_lng, vehicle_type = 'CAB_4_SEAT' } = payload;
        if (!payload.customer_id || !isValidCoordinates(pickup_lat, pickup_lng)
          || !isValidCoordinates(dropoff_lat, dropoff_lng) || vehicle_type !== 'CAB_4_SEAT') {
          return failure(400, 'customer_id, valid pickup/dropoff coordinates, and vehicle_type CAB_4_SEAT are required');
        }
        const candidates = await invokePeer('driver', 'nearby', {
          lat: Number(pickup_lat), lng: Number(pickup_lng), radius: 1000, limit: 100, page: 1,
        });
        const offered = candidates.drivers[0] || null;
        const candidateIds = candidates.drivers.map((driver) => driver.uid);
        const id = crypto.randomUUID();
        const result = await pool.query(
          `INSERT INTO bookings
            (booking_id, customer_id, pickup_lat, pickup_lng, dropoff_lat, dropoff_lng,
             vehicle_type, status, offered_driver_uid, candidate_driver_uids, offered_index, offered_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 0, CASE WHEN $9::uuid IS NULL THEN NULL ELSE NOW() END)
           RETURNING *`,
          [
            id, payload.customer_id, Number(pickup_lat), Number(pickup_lng),
            Number(dropoff_lat), Number(dropoff_lng), vehicle_type,
            candidateIds.length ? 'SEARCHING_DRIVER' : 'NO_DRIVERS_AVAILABLE',
            offered?.uid || null, candidateIds,
          ],
        );
        await publish('cab.booking.events', {
          event_type: 'BookingCreated', aggregate_id: id, booking_id: id,
          customer_id: payload.customer_id, offered_driver_uid: offered?.uid || null,
        });
        if (offered) {
          await redis.set(`cab:booking:offer-exp:${id}`, offered.uid, 'EX', offerTtlSeconds);
          await publish('cab.booking.events', {
            event_type: 'DriverOfferCreated', aggregate_id: id, booking_id: id,
            driver_id: offered.uid, offer_index: 1,
          });
        }
        return success(201, { booking: result.rows[0], offer_expires_in: offered ? offerTtlSeconds : null,
          message: offered ? 'Searching for driver; offer sent' : 'No drivers currently nearby' });
      }
      if (action === 'list_by_customer') {
        const result = await pool.query(
          `SELECT * FROM bookings WHERE customer_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
          [payload.customer_id, Math.min(Math.max(Number(payload.limit) || 20, 1), 100), (Math.max(Number(payload.page) || 1, 1) - 1) * Math.min(Math.max(Number(payload.limit) || 20, 1), 100)],
        );
        return success(200, { bookings: result.rows, pagination: { page: Math.max(Math.trunc(Number(payload.page)) || 1, 1),
          limit: Math.min(Math.max(Math.trunc(Number(payload.limit)) || 20, 1), 100) } });
      }
      if (action === 'accept') {
        const bookingId = payload.booking_id;
        const lockKey = `cab:booking:lock:${bookingId}`;
        const driverLockKey = `cab:driver:lock:${payload.driver_id}`;
        const lockToken = crypto.randomUUID();
        const locked = await redis.set(lockKey, lockToken, 'EX', 30, 'NX');
        if (locked !== 'OK') return failure(409, 'Booking is being accepted by another driver');
        const driverLocked = await redis.set(driverLockKey, lockToken, 'EX', 30, 'NX');
        if (driverLocked !== 'OK') {
          await redis.eval(
            "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
            1, lockKey, lockToken,
          );
          return failure(409, 'Driver is accepting another booking');
        }
        let driverAcquired = false;
        let tripCreated = false;
        try {
          const result = await pool.query(
            `SELECT * FROM bookings WHERE booking_id = $1 FOR UPDATE`,
            [bookingId],
          );
          const booking = result.rows[0];
          if (!booking || booking.status !== 'SEARCHING_DRIVER') return failure(409, 'Booking is no longer available');
          const currentOffer = await redis.get(`cab:booking:offer-exp:${bookingId}`);
          if (!currentOffer || currentOffer !== payload.driver_id
            || (booking.offered_driver_uid && booking.offered_driver_uid !== payload.driver_id)) {
            return failure(409, 'Booking offer belongs to another driver');
          }
          await invokePeer('driver', 'set_busy', { uid: payload.driver_id, busy: true });
          driverAcquired = true;
          await redis.del(`cab:booking:offer-exp:${bookingId}`);
          const trip = await invokePeer('trip', 'create_from_booking', {
            booking_id: booking.booking_id, customer_id: booking.customer_id,
            driver_id: payload.driver_id, fare_amount: fareAmount,
          });
          tripCreated = true;
          await pool.query(
             `UPDATE bookings SET status = 'DRIVER_ASSIGNED', assigned_driver_uid = $2, updated_at = NOW() WHERE booking_id = $1 AND status = 'SEARCHING_DRIVER'`,
            [bookingId, payload.driver_id],
          );
          await publish('cab.trip.events', {
            event_type: 'DriverAssigned', aggregate_id: trip.trip.trip_id,
            booking_id: bookingId, trip_id: trip.trip.trip_id, driver_id: payload.driver_id,
            customer_id: booking.customer_id,
          });
          return success(200, { booking_id: bookingId, trip: trip.trip });
        } catch (error) {
          try {
            if (driverAcquired && !tripCreated) {
            await invokePeer('driver', 'set_busy', { uid: payload.driver_id, busy: false });
            }
          } catch {
            console.error('Unable to release driver after failed booking acceptance');
          }
          throw error;
        } finally {
          await redis.eval(
            "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
            1, lockKey, lockToken,
          );
          await redis.eval(
            "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
            1, driverLockKey, lockToken,
          );
        }
      }
      if (action === 'cancel') {
        const reason = String(payload.reason || '').trim();
        if (!reason) return failure(400, 'Cancellation reason is required');
        const lockKey = `cab:booking:lock:${payload.booking_id}`;
        const token = crypto.randomUUID();
        if (await redis.set(lockKey, token, 'EX', 30, 'NX') !== 'OK') return failure(409, 'Booking is being modified');
        try {
        const result = await pool.query(
          `UPDATE bookings SET status = 'CANCELED', cancel_reason = $3, updated_at = NOW()
           WHERE booking_id = $1 AND customer_id = $2 AND status IN ('SEARCHING_DRIVER', 'NO_DRIVERS_AVAILABLE')
            RETURNING booking_id, code, status, cancel_reason`,
          [payload.booking_id, payload.customer_id, reason.slice(0, 500)],
        );
        if (!result.rows[0]) return failure(409, 'Booking not found or cannot be canceled');
        await publish('cab.booking.events', {
          event_type: 'BookingCanceled', aggregate_id: payload.booking_id,
          booking_id: payload.booking_id, customer_id: payload.customer_id, reason,
        });
        await redis.del(`cab:booking:offer-exp:${payload.booking_id}`);
        return success(200, { booking: result.rows[0] });
        } finally {
          await redis.eval("if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end", 1, lockKey, token);
        }
      }
      return failure(404, 'Unknown booking action');
    }
    case 'trip': {
      if (action === 'health') return success(200, { context, status: 'UP' });
      if (action === 'mark_paid') {
        const result = await pool.query(`UPDATE trips SET payment_status = 'PAID', payment_id = $2, updated_at = NOW()
          WHERE trip_id = $1 AND status = 'COMPLETED' AND (payment_id IS NULL OR payment_id = $2) RETURNING *`,
        [payload.trip_id, payload.payment_id]);
        return result.rows[0] ? success(200, { trip: result.rows[0] }) : failure(409, 'Trip already paid by another payment or not completed');
      }
      if (action === 'get_by_booking') {
        const result = await pool.query('SELECT trip_id FROM trips WHERE booking_id = $1', [payload.booking_id]);
        if (!result.rows[0]) return failure(404, 'Trip not yet assigned');
        return invoke('get_for_user', { ...payload, trip_id: result.rows[0].trip_id });
      }
      if (action === 'update_location') {
        if (!isValidCoordinates(payload.latitude, payload.longitude)) return failure(400, 'Valid latitude and longitude required');
        const result = await pool.query(`UPDATE trips SET latitude = $3, longitude = $4, updated_at = NOW()
          WHERE trip_id = $1 AND driver_id = $2 AND status NOT IN ('CANCELED', 'COMPLETED') RETURNING *`,
        [payload.trip_id, payload.driver_id, Number(payload.latitude), Number(payload.longitude)]);
        if (!result.rows[0]) return failure(409, 'Only assigned driver of an active trip may update location');
        await publish('cab.trip.events', { event_type: 'TripLocationUpdated', aggregate_id: payload.trip_id,
          trip_id: payload.trip_id, customer_id: result.rows[0].customer_id, driver_id: payload.driver_id,
          latitude: Number(payload.latitude), longitude: Number(payload.longitude) });
        return success(200, { trip: result.rows[0] });
      }
      if (action === 'create_from_booking') {
        const tripId = crypto.randomUUID();
        const result = await pool.query(
          `INSERT INTO trips (trip_id, booking_id, customer_id, driver_id, status, fare_amount)
           VALUES ($1, $2, $3, $4, 'DRIVER_ASSIGNED', $5)
           ON CONFLICT (booking_id) DO UPDATE SET booking_id = EXCLUDED.booking_id
           RETURNING *`,
          [tripId, payload.booking_id, payload.customer_id, payload.driver_id, Number(payload.fare_amount || fareAmount)],
        );
        return success(201, { trip: result.rows[0] });
      }
      if (action === 'get') {
        const result = await pool.query('SELECT * FROM trips WHERE trip_id = $1', [payload.trip_id]);
        return result.rows[0] ? success(200, { trip: result.rows[0] }) : failure(404, 'Trip not found');
      }
      if (action === 'get_for_user') {
        const result = await pool.query('SELECT * FROM trips WHERE trip_id = $1', [payload.trip_id]);
        const trip = result.rows[0];
        if (!trip) return failure(404, 'Trip not found');
        if (payload.role !== 'ADMIN'
          && payload.user_id !== trip.customer_id
          && payload.user_id !== trip.driver_id) {
          return failure(403, 'Only trip participants may view trip details');
        }
        const driver = await invokePeer('driver', 'get', { uid: trip.driver_id });
        return success(200, { trip, driver: driver.driver });
      }
      if (action === 'cancel') {
        const reason = String(payload.reason || '').trim();
        if (!reason) return failure(400, 'Cancellation reason is required');
        const result = await pool.query(
          `UPDATE trips SET status = 'CANCELED', cancel_reason = $3, updated_at = NOW()
           WHERE trip_id = $1 AND customer_id = $2 AND status NOT IN ('COMPLETED', 'CANCELED')
           RETURNING *`,
          [payload.trip_id, payload.customer_id, reason],
        );
        if (!result.rows[0]) return failure(409, 'Trip not found or cannot be canceled');
        await invokePeer('driver', 'set_busy', { uid: result.rows[0].driver_id, busy: false });
        await invokePeer('booking', 'sync_trip_status', { booking_id: result.rows[0].booking_id, status: 'CANCELED', reason });
        await publish('cab.trip.events', {
          event_type: 'TripCanceled', aggregate_id: payload.trip_id,
          trip_id: payload.trip_id, customer_id: payload.customer_id, driver_id: result.rows[0].driver_id, reason,
        });
        return success(200, { trip: result.rows[0] });
      }
      if (action === 'update_status') {
        const current = await pool.query('SELECT * FROM trips WHERE trip_id = $1', [payload.trip_id]);
        const trip = current.rows[0];
        if (!trip) return failure(404, 'Trip not found');
        if (trip.driver_id !== payload.driver_id) return failure(403, 'Only the assigned driver can update trip status');
        if (!isValidTripTransition(trip.status, payload.status)) return failure(400, 'Invalid trip status transition');
        const updated = await pool.query(
          `UPDATE trips SET status = $2, updated_at = NOW() WHERE trip_id = $1 AND status = $3 RETURNING *`,
          [payload.trip_id, payload.status, trip.status],
        );
        if (!updated.rows[0]) return failure(409, 'Trip changed concurrently; refresh before retrying');
        if (payload.status === 'COMPLETED') {
          await invokePeer('driver', 'set_busy', { uid: trip.driver_id, busy: false });
          await invokePeer('booking', 'sync_trip_status', { booking_id: trip.booking_id, status: 'COMPLETED' });
          await publish('cab.trip.events', {
            event_type: 'TripCompleted', aggregate_id: payload.trip_id,
            trip_id: payload.trip_id, customer_id: trip.customer_id, driver_id: trip.driver_id,
          });
        } else {
          await publish('cab.trip.events', {
            event_type: 'TripStatusUpdated', aggregate_id: payload.trip_id,
            trip_id: payload.trip_id, status: payload.status, customer_id: trip.customer_id, driver_id: trip.driver_id,
          });
        }
        return success(200, { trip: updated.rows[0] });
      }
      if (action === 'rate') {
        const stars = Number(payload.stars);
        if (!Number.isInteger(stars) || stars < 1 || stars > 5) return failure(400, 'stars must be an integer between 1 and 5');
        const tripResult = await pool.query('SELECT * FROM trips WHERE trip_id = $1', [payload.trip_id]);
        const trip = tripResult.rows[0];
        if (!trip || trip.customer_id !== payload.customer_id || trip.status !== 'COMPLETED') {
          return failure(400, 'Only the customer of a completed trip can rate it');
        }
        try {
          const result = await pool.query(
            `INSERT INTO ratings (rating_id, trip_id, customer_id, stars, comment)
             VALUES ($1, $2, $3, $4, $5) RETURNING *`,
            [crypto.randomUUID(), payload.trip_id, payload.customer_id, stars, String(payload.comment || '').slice(0, 2000)],
          );
          return success(201, { rating: result.rows[0] });
        } catch (error) {
          if (error.code === '23505') return failure(409, 'Trip has already been rated');
          throw error;
        }
      }
      return failure(404, 'Unknown trip action');
    }
    case 'payment': {
      if (action === 'health') return success(200, { context, status: 'UP' });
      if (action === 'get_for_user') {
        const result = await pool.query(`SELECT payment_id, code, trip_id, customer_id, payment_method, status, amount, created_at, updated_at
          FROM payments WHERE payment_id = $1`, [payload.payment_id]);
        const payment = result.rows[0];
        if (!payment) return failure(404, 'Payment not found');
        if (payload.role !== 'ADMIN' && payload.user_id !== payment.customer_id) {
          const trip = await invokePeer('trip', 'get', { trip_id: payment.trip_id });
          if (payload.user_id !== trip.trip.driver_id) return failure(403, 'Only payment participants may view it');
        }
        return success(200, { payment });
      }
      if (action === 'demo_callback') {
        if (process.env.PAYMENT_TEST_MODE !== 'true') return failure(404, 'Local payment simulator is disabled');
        if (!['SUCCESS', 'FAILED'].includes(payload.status)) return failure(400, 'status must be SUCCESS or FAILED');
        // This local provider simulator still exercises the signed webhook flow.
        const signature = crypto.createHmac('sha256', process.env.PAYMENT_WEBHOOK_SECRET)
          .update(`${payload.order_id}:${payload.status}`).digest('hex');
        return invoke('webhook', { ...payload, signature });
      }
      if (action === 'online') {
        if (!payload.trip_id || !payload.customer_id || !payload.idempotency_key) return failure(400, 'trip_id and Idempotency-Key are required');
        const existing = await pool.query('SELECT * FROM payments WHERE idempotency_key = $1', [payload.idempotency_key]);
        if (existing.rows[0]) {
          const prior = existing.rows[0];
          if (prior.customer_id !== payload.customer_id || prior.trip_id !== payload.trip_id) {
            return failure(409, 'Idempotency-Key has already been used for a different payment');
          }
          return prior.idempotency_response
            ? { status: 200, body: prior.idempotency_response }
            : success(200, { payment: prior, idempotent_replay: true });
        }
        const trip = await invokePeer('trip', 'get', { trip_id: payload.trip_id });
        if (trip.trip.customer_id !== payload.customer_id || trip.trip.status !== 'COMPLETED') {
          return failure(403, 'Payment is only available to the customer of a completed trip');
        }
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [payload.trip_id]);
          const active = await client.query(`SELECT * FROM payments WHERE trip_id = $1 AND status IN ('PENDING', 'COMPLETED')`, [payload.trip_id]);
          if (active.rows[0]) {
            const prior = active.rows[0];
            await client.query('COMMIT');
            if (prior.idempotency_key === payload.idempotency_key && prior.customer_id === payload.customer_id) {
              return { status: 200, body: prior.idempotency_response };
            }
            return failure(409, 'Trip already has an active or completed payment');
          }
          const result = await client.query(
            `INSERT INTO payments (payment_id, trip_id, customer_id, payment_method, status, amount, idempotency_key)
             VALUES ($1, $2, $3, 'ONLINE_PREPAID', 'PENDING', $4, $5)
             ON CONFLICT (idempotency_key) DO NOTHING RETURNING *`,
            [crypto.randomUUID(), payload.trip_id, payload.customer_id, trip.trip.fare_amount, payload.idempotency_key],
          );
          if (result.rows[0]) {
            const response = success(200, { payment: result.rows[0], idempotent_replay: false });
            await client.query(
              'UPDATE payments SET idempotency_response = $2::jsonb WHERE payment_id = $1',
              [result.rows[0].payment_id, JSON.stringify(response.body)],
            );
            await client.query('COMMIT');
            return response;
          }

          const conflict = await client.query(
            'SELECT * FROM payments WHERE idempotency_key = $1',
            [payload.idempotency_key],
          );
          const prior = conflict.rows[0];
          if (!prior || prior.customer_id !== payload.customer_id || prior.trip_id !== payload.trip_id) {
            await client.query('ROLLBACK');
            return failure(409, 'Idempotency-Key has already been used for a different payment');
          }
          await client.query('COMMIT');
          return prior.idempotency_response
            ? { status: 200, body: prior.idempotency_response }
            : success(200, { payment: prior, idempotent_replay: true });
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        } finally {
          client.release();
        }
      }
      if (action === 'cash_confirm') {
        const trip = await invokePeer('trip', 'get', { trip_id: payload.trip_id });
        if (trip.trip.driver_id !== payload.driver_id || trip.trip.status !== 'COMPLETED') return failure(403, 'Only the assigned driver can confirm cash for a completed trip');
        if (payload.amount !== undefined && Number(payload.amount) !== Number(trip.trip.fare_amount)) return failure(400, 'Cash amount must equal the trip fare');
        const client = await pool.connect();
        let payment;
        try {
          await client.query('BEGIN');
          await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [payload.trip_id]);
          const prior = await client.query(`SELECT * FROM payments WHERE trip_id = $1 AND status IN ('PENDING', 'COMPLETED')`, [payload.trip_id]);
          if (prior.rows[0] && prior.rows[0].payment_method !== 'CASH_POSTPAID') {
            await client.query('ROLLBACK'); return failure(409, 'Trip already has an online payment');
          }
          payment = prior.rows[0] || (await client.query(`INSERT INTO payments
            (payment_id, trip_id, customer_id, payment_method, status, amount)
            VALUES ($1, $2, $3, 'CASH_POSTPAID', 'COMPLETED', $4) RETURNING *`,
          [crypto.randomUUID(), payload.trip_id, trip.trip.customer_id, trip.trip.fare_amount])).rows[0];
          await client.query('COMMIT');
        } catch (error) { await client.query('ROLLBACK'); throw error; }
        finally { client.release(); }
        await invokePeer('trip', 'mark_paid', { trip_id: payload.trip_id, payment_id: payment.payment_id });
        await publish('cab.payment.events', { event_id: `cash:${payment.payment_id}`, event_type: 'PaymentCompleted',
          aggregate_id: payment.payment_id, payment_id: payment.payment_id, trip_id: payload.trip_id,
          customer_id: trip.trip.customer_id, driver_id: trip.trip.driver_id });
        return success(200, { payment });
      }
      if (action === 'webhook') {
        let { order_id } = payload;
        const { status: paymentStatus, signature } = payload;
        if (!order_id || !['SUCCESS', 'FAILED'].includes(paymentStatus) || !signature) return failure(400, 'order_id, valid status, and signature are required');
        const expected = crypto.createHmac('sha256', process.env.PAYMENT_WEBHOOK_SECRET)
          .update(`${order_id}:${paymentStatus}`).digest('hex');
        const suppliedBuffer = Buffer.from(String(signature));
        const expectedBuffer = Buffer.from(expected);
        if (suppliedBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(suppliedBuffer, expectedBuffer)) {
          return failure(401, 'Invalid webhook signature');
        }
        if (isPublicCode('payment', order_id)) {
          const reference = await resolvePublicCode(pool, 'payment', order_id);
          if (!reference) return failure(404, 'Payment code not found');
          order_id = reference.id;
        }
        const result = await pool.query(
          `UPDATE payments SET status = $2, updated_at = NOW()
           WHERE payment_id = $1 AND payment_method = 'ONLINE_PREPAID' AND status = 'PENDING'
           RETURNING *`,
          [order_id, paymentStatus === 'SUCCESS' ? 'COMPLETED' : 'FAILED'],
        );
        if (!result.rows[0]) {
          const prior = await pool.query(
            `SELECT * FROM payments WHERE payment_id = $1 AND status = $2`,
            [order_id, paymentStatus === 'SUCCESS' ? 'COMPLETED' : 'FAILED'],
          );
          if (prior.rows[0]) {
            if (paymentStatus === 'SUCCESS') await invokePeer('trip', 'mark_paid', { trip_id: prior.rows[0].trip_id, payment_id: order_id });
            await publish('cab.payment.events', { event_id: `payment:${order_id}:${paymentStatus}`,
              event_type: paymentStatus === 'SUCCESS' ? 'PaymentCompleted' : 'PaymentFailed', aggregate_id: order_id,
              payment_id: order_id, trip_id: prior.rows[0].trip_id, customer_id: prior.rows[0].customer_id });
            return success(200, { payment: prior.rows[0], idempotent_replay: true });
          }
          return failure(404, 'Pending payment not found');
        }
        if (paymentStatus === 'SUCCESS') await invokePeer('trip', 'mark_paid', { trip_id: result.rows[0].trip_id, payment_id: order_id });
        await publish('cab.payment.events', {
          event_id: `payment:${order_id}:${paymentStatus}`,
          event_type: paymentStatus === 'SUCCESS' ? 'PaymentCompleted' : 'PaymentFailed',
          aggregate_id: order_id, payment_id: order_id, trip_id: result.rows[0].trip_id, customer_id: result.rows[0].customer_id,
        });
        return success(200, { payment: result.rows[0] });
      }
      return failure(404, 'Unknown payment action');
    }
    case 'notification': {
      if (action === 'health') return success(200, { context, status: 'UP' });
      if (action === 'for_user') {
        const result = await pool.query(`SELECT event_id, topic, payload, received_at FROM notification_logs
          WHERE payload->>'customer_id' = $1 OR payload->>'driver_id' = $1 OR payload->>'offered_driver_uid' = $1
          ORDER BY received_at DESC LIMIT $2`, [payload.user_id, Math.min(Math.max(Math.trunc(Number(payload.limit)) || 50, 1), 200)]);
        return success(200, { notifications: result.rows });
      }
      if (action === 'logs') {
        const result = await pool.query(
          `SELECT event_id, topic, payload, received_at FROM notification_logs ORDER BY received_at DESC LIMIT $1`,
          [Math.min(Math.max(Number(payload.limit) || 50, 1), 200)],
        );
        return success(200, { notifications: result.rows });
      }
      return failure(404, 'Unknown notification action');
    }
    default:
      return failure(500, 'Invalid service context');
  }
}

async function startNotificationConsumer() {
  const admin = kafka.admin();
  await admin.connect();
  try {
    await admin.createTopics({
      topics: eventTopics.map((topic) => ({ topic, numPartitions: 3, replicationFactor: 1 })),
      waitForLeaders: true,
    });
  } finally {
    await admin.disconnect();
  }
  const consumer = kafka.consumer({ groupId: 'cab-notification-service' });
  await consumer.connect();
  await consumer.subscribe({ topics: eventTopics, fromBeginning: true });
  consumer.run({
    eachMessage: async ({ topic, message }) => {
      if (!message.value) return;
      const payload = JSON.parse(message.value.toString());
      await pool.query(
        `INSERT INTO notification_logs (event_id, topic, payload)
         VALUES ($1, $2, $3::jsonb) ON CONFLICT (event_id) DO NOTHING`,
        [payload.event_id, topic, JSON.stringify(payload)],
      );
    },
  }).catch((error) => {
    console.error('Notification consumer stopped:', error);
    process.exitCode = 1;
  });
}

async function dispatchNextOffer() {
  const bookings = await pool.query(
    `SELECT * FROM bookings
     WHERE status = 'SEARCHING_DRIVER' AND offered_driver_uid IS NOT NULL
     ORDER BY created_at ASC LIMIT 50`,
  );
  for (const booking of bookings.rows) {
    const lockKey = `cab:booking:lock:${booking.booking_id}`;
    const lockToken = crypto.randomUUID();
    if (await redis.set(lockKey, lockToken, 'EX', 10, 'NX') !== 'OK') continue;
    try {
      const current = await pool.query(
        `SELECT * FROM bookings WHERE booking_id = $1 AND status = 'SEARCHING_DRIVER'`,
        [booking.booking_id],
      );
      const activeBooking = current.rows[0];
      if (!activeBooking || await redis.exists(`cab:booking:offer-exp:${booking.booking_id}`)) continue;
      const nextIndex = activeBooking.offered_index + 1;
      const nextDriverId = activeBooking.candidate_driver_uids[nextIndex];
      if (!nextDriverId) {
        await pool.query(
          `UPDATE bookings SET status = 'NO_DRIVERS_AVAILABLE', offered_driver_uid = NULL, updated_at = NOW()
           WHERE booking_id = $1 AND status = 'SEARCHING_DRIVER' AND offered_index = $2`,
          [activeBooking.booking_id, activeBooking.offered_index],
        );
        continue;
      }
      const updated = await pool.query(
        `UPDATE bookings SET offered_driver_uid = $2, offered_index = $3, offered_at = NOW(), updated_at = NOW()
         WHERE booking_id = $1 AND status = 'SEARCHING_DRIVER' AND offered_index = $4
         RETURNING booking_id`,
        [activeBooking.booking_id, nextDriverId, nextIndex, activeBooking.offered_index],
      );
      if (updated.rowCount) {
        await redis.set(`cab:booking:offer-exp:${activeBooking.booking_id}`, nextDriverId, 'EX', offerTtlSeconds);
        await publish('cab.booking.events', {
          event_type: 'DriverOfferCreated', aggregate_id: activeBooking.booking_id,
          booking_id: activeBooking.booking_id, driver_id: nextDriverId, offer_index: nextIndex + 1,
        });
      }
    } finally {
      await redis.eval(
        "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
        1, lockKey, lockToken,
      );
    }
  }
}

async function start() {
  if (!context || !tables[context] || !Number.isInteger(port)) throw new Error('SERVICE_CONTEXT and GRPC_PORT must be configured');
  const databaseConfigured = process.env.DATABASE_URL
    || (process.env.PGHOST && process.env.PGDATABASE && process.env.PGUSER
      && process.env.PGPASSWORD !== undefined);
  if (!databaseConfigured || !process.env.REDIS_URL || !process.env.KAFKA_BROKERS) {
    throw new Error('PostgreSQL connection settings, REDIS_URL, and KAFKA_BROKERS are required');
  }
  if (context === 'auth' && !isValidSecret(jwtSecret)) {
    throw new Error('JWT_SECRET must be a non-placeholder secret of at least 32 characters');
  }
  if (context === 'payment' && !isValidSecret(process.env.PAYMENT_WEBHOOK_SECRET)) {
    throw new Error('PAYMENT_WEBHOOK_SECRET must be a non-placeholder secret of at least 32 characters');
  }
  if (context === 'customer') dataEncryptionKey = loadEncryptionKey(process.env.CUSTOMER_DATA_ENCRYPTION_KEY);
  if (context === 'driver') dataEncryptionKey = loadEncryptionKey(process.env.DRIVER_DATA_ENCRYPTION_KEY);
  pool = new Pool({
    ...(process.env.DATABASE_URL ? { connectionString: process.env.DATABASE_URL } : {
      host: process.env.PGHOST,
      port: Number(process.env.PGPORT || 5432),
      database: process.env.PGDATABASE,
      user: process.env.PGUSER,
      password: process.env.PGPASSWORD,
    }),
    max: 10,
  });
  redis = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 3 });
  kafka = new Kafka({ clientId: `cab-${context}`, brokers: process.env.KAFKA_BROKERS.split(',') });
  producer = kafka.producer();

  await pool.query('SELECT 1');
  await redis.ping();
  await producer.connect();
  await ensureDatabase();
  if (context === 'notification') await startNotificationConsumer();

  const definition = protoLoader.loadSync(protoPath, {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true,
  });
  const loaded = grpc.loadPackageDefinition(definition);
  grpcServer = new grpc.Server();
  grpcServer.addService(loaded.cab.domain.DomainService.service, {
    Invoke(call, callback) {
      Promise.resolve()
        .then(() => parsePayload(call.request.payload_json))
        .then((payload) => invoke(call.request.action, payload))
        .then((result) => callback(null, { body_json: JSON.stringify(result) }))
        .catch((error) => {
          console.error(`${context} action ${call.request.action} failed:`, error);
          const status = Number.isInteger(error.status) && error.status >= 400 && error.status <= 599
            ? error.status
            : error.code === '22P02' ? 400 : 503;
          callback(null, {
            body_json: JSON.stringify(failure(
              status,
              status >= 500 ? 'Service temporarily unavailable' : error.message,
            )),
          });
        });
    },
  });
  grpcServer.bindAsync(`0.0.0.0:${port}`, grpc.ServerCredentials.createInsecure(), (error, boundPort) => {
    if (error) throw error;
    grpcServer.start();
    console.log(`${context} service listening on gRPC port ${boundPort}`);
    if (context === 'booking') {
      const dispatcher = setInterval(() => {
        dispatchNextOffer().catch((dispatchError) => console.error('Booking offer dispatch failed:', dispatchError));
      }, 3000);
      dispatcher.unref();
    }
  });
}

start().catch((error) => {
  console.error(`Failed to start ${context || 'domain'} service:`, error);
  process.exit(1);
});

async function shutdown() {
  if (grpcServer) grpcServer.tryShutdown(() => {});
  if (producer) await producer.disconnect();
  if (redis) await redis.quit();
  if (pool) await pool.end();
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
