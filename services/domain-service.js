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

const context = process.env.SERVICE_CONTEXT;
const port = Number(process.env.GRPC_PORT);
const jwtSecret = process.env.JWT_SECRET;
const fareAmount = Number(process.env.FIXED_FARE_AMOUNT || 50000);
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
    )`,
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
    )`,
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
    `SELECT uid, vehicle_type, approval_status, availability FROM drivers WHERE uid = ANY($1::uuid[])`,
    [ids],
  );
  const byId = new Map(rows.rows.map((row) => [row.uid, row]));
  const drivers = slice
    .map(([uid, distance]) => {
      const row = byId.get(uid);
      return row && row.approval_status === 'ACTIVE' && row.availability === 'AVAILABLE'
        ? { uid: row.uid, vehicle_type: row.vehicle_type, distance_meters: Number(distance) }
        : null;
    })
    .filter(Boolean);
  return { drivers, pagination: { page: pageNumber, limit: pageSize, total: results.length } };
}

async function invoke(action, payload) {
  switch (context) {
    case 'auth': {
      if (action === 'health') return success(200, { context, status: 'UP' });
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
      if (action === 'create_profile') {
        const { uid, fullname, age, address = '' } = payload;
        if (!uid || !fullname) return failure(400, 'uid and fullname are required');
        if (age !== undefined && age !== null && (!Number.isInteger(Number(age)) || Number(age) < 0 || Number(age) > 120)) {
          return failure(400, 'age must be an integer between 0 and 120');
        }
        try {
          const result = await pool.query(
          `INSERT INTO customers (uid, fullname, age, address)
           VALUES ($1, $2, $3, $4) RETURNING uid, fullname, age, address`,
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
          `SELECT uid, fullname, age, address FROM customers WHERE uid = $1`,
          [payload.uid],
        );
        return result.rows[0] ? success(200, { customer: decryptCustomer(result.rows[0]) }) : failure(404, 'Customer not found');
      }
      if (action === 'list_profiles') {
        const limit = Math.min(Math.max(Number(payload.limit) || 20, 1), 100);
        const page = Math.max(Number(payload.page) || 1, 1);
        const result = await pool.query(
          `SELECT uid, fullname, age, address FROM customers ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
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
           address = COALESCE($4, address) WHERE uid = $1 RETURNING uid, fullname, age, address`,
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
        try {
          const result = await pool.query(
            `INSERT INTO drivers
              (uid, license_number, plate_number, license_lookup_hash, plate_lookup_hash, vehicle_type)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING uid, license_number, plate_number, vehicle_type, approval_status, availability`,
            [
              uid, encryptField(license_number, dataEncryptionKey),
              encryptField(plate_number, dataEncryptionKey), licenseHash, plateHash, vehicle_type,
            ],
          );
          return success(201, { driver: decryptDriver(result.rows[0]) });
        } catch (error) {
          if (error.code === '23505') return failure(409, 'Driver profile or vehicle details already exist');
          throw error;
        }
      }
      if (action === 'get') {
        const columns = payload.role === 'ADMIN'
          ? 'uid, license_number, plate_number, vehicle_type, approval_status, availability, latitude, longitude'
          : 'uid, plate_number, vehicle_type, availability';
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
           RETURNING uid, approval_status, availability`,
          [payload.uid, payload.approve === false ? 'REJECTED' : 'ACTIVE'],
        );
        return result.rows[0] ? success(200, { driver: result.rows[0] }) : failure(404, 'Pending driver profile not found');
      }
      if (action === 'availability') {
        const online = Boolean(payload.online);
        const { latitude, longitude } = payload;
        if (online && !isValidCoordinates(latitude, longitude)) return failure(400, 'Valid latitude and longitude are required when going online');
        const result = await pool.query(
          `UPDATE drivers SET availability = $2, latitude = $3, longitude = $4
           WHERE uid = $1 AND approval_status = 'ACTIVE'
           RETURNING uid, approval_status, availability, latitude, longitude`,
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
           RETURNING uid, availability, latitude, longitude`,
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
          await redis.set(`cab:booking:offer-exp:${id}`, offered.uid, 'EX', 15);
          await publish('cab.booking.events', {
            event_type: 'DriverOfferCreated', aggregate_id: id, booking_id: id,
            driver_id: offered.uid, offer_index: 1,
          });
        }
        return success(201, { booking: result.rows[0], message: offered ? 'Searching for driver; offer sent' : 'No drivers currently nearby' });
      }
      if (action === 'list_by_customer') {
        const result = await pool.query(
          `SELECT * FROM bookings WHERE customer_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
          [payload.customer_id, Math.min(Math.max(Number(payload.limit) || 20, 1), 100), (Math.max(Number(payload.page) || 1, 1) - 1) * Math.min(Math.max(Number(payload.limit) || 20, 1), 100)],
        );
        return success(200, { bookings: result.rows });
      }
      if (action === 'accept') {
        const bookingId = payload.booking_id;
        const lockKey = `cab:booking:lock:${bookingId}`;
        const driverLockKey = `cab:driver:lock:${payload.driver_id}`;
        const lockToken = crypto.randomUUID();
        const locked = await redis.set(lockKey, lockToken, 'EX', 10, 'NX');
        if (locked !== 'OK') return failure(409, 'Booking is being accepted by another driver');
        const driverLocked = await redis.set(driverLockKey, lockToken, 'EX', 10, 'NX');
        if (driverLocked !== 'OK') {
          await redis.eval(
            "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
            1, lockKey, lockToken,
          );
          return failure(409, 'Driver is accepting another booking');
        }
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
          await redis.del(`cab:booking:offer-exp:${bookingId}`);
          const trip = await invokePeer('trip', 'create_from_booking', {
            booking_id: booking.booking_id, customer_id: booking.customer_id,
            driver_id: payload.driver_id, fare_amount: fareAmount,
          });
          await pool.query(
            `UPDATE bookings SET status = 'DRIVER_ASSIGNED', assigned_driver_uid = $2, updated_at = NOW() WHERE booking_id = $1`,
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
            await invokePeer('driver', 'set_busy', { uid: payload.driver_id, busy: false });
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
        const result = await pool.query(
          `UPDATE bookings SET status = 'CANCELED', cancel_reason = $3, updated_at = NOW()
           WHERE booking_id = $1 AND customer_id = $2 AND status IN ('SEARCHING_DRIVER', 'NO_DRIVERS_AVAILABLE')
           RETURNING booking_id, status, cancel_reason`,
          [payload.booking_id, payload.customer_id, reason.slice(0, 500)],
        );
        if (!result.rows[0]) return failure(409, 'Booking not found or cannot be canceled');
        await publish('cab.booking.events', {
          event_type: 'BookingCanceled', aggregate_id: payload.booking_id,
          booking_id: payload.booking_id, reason: payload.reason || '',
        });
        return success(200, { booking: result.rows[0] });
      }
      return failure(404, 'Unknown booking action');
    }
    case 'trip': {
      if (action === 'health') return success(200, { context, status: 'UP' });
      if (action === 'create_from_booking') {
        const tripId = crypto.randomUUID();
        const result = await pool.query(
          `INSERT INTO trips (trip_id, booking_id, customer_id, driver_id, status, fare_amount)
           VALUES ($1, $2, $3, $4, 'DRIVER_ASSIGNED', $5)
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
          `UPDATE trips SET status = 'CANCELED', updated_at = NOW()
           WHERE trip_id = $1 AND customer_id = $2 AND status NOT IN ('COMPLETED', 'CANCELED')
           RETURNING *`,
          [payload.trip_id, payload.customer_id],
        );
        if (!result.rows[0]) return failure(409, 'Trip not found or cannot be canceled');
        await invokePeer('driver', 'set_busy', { uid: result.rows[0].driver_id, busy: false });
        await publish('cab.trip.events', {
          event_type: 'TripCanceled', aggregate_id: payload.trip_id,
          trip_id: payload.trip_id, customer_id: payload.customer_id, reason,
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
          `UPDATE trips SET status = $2, updated_at = NOW() WHERE trip_id = $1 RETURNING *`,
          [payload.trip_id, payload.status],
        );
        if (payload.status === 'COMPLETED') {
          await invokePeer('driver', 'set_busy', { uid: trip.driver_id, busy: false });
          await publish('cab.trip.events', {
            event_type: 'TripCompleted', aggregate_id: payload.trip_id,
            trip_id: payload.trip_id, customer_id: trip.customer_id, driver_id: trip.driver_id,
          });
        } else {
          await publish('cab.trip.events', {
            event_type: 'TripStatusUpdated', aggregate_id: payload.trip_id,
            trip_id: payload.trip_id, status: payload.status,
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
        const result = await pool.query(
          `INSERT INTO payments (payment_id, trip_id, payment_method, status, amount)
           VALUES ($1, $2, 'CASH_POSTPAID', 'COMPLETED', $3)
           ON CONFLICT DO NOTHING RETURNING *`,
          [crypto.randomUUID(), payload.trip_id, Number(payload.amount || trip.trip.fare_amount)],
        );
        const payment = result.rows[0] || (await pool.query(
          `SELECT * FROM payments WHERE trip_id = $1 AND payment_method = 'CASH_POSTPAID'`, [payload.trip_id],
        )).rows[0];
        return success(200, { payment });
      }
      if (action === 'webhook') {
        const { order_id, status: paymentStatus, signature } = payload;
        if (!order_id || !['SUCCESS', 'FAILED'].includes(paymentStatus) || !signature) return failure(400, 'order_id, valid status, and signature are required');
        const expected = crypto.createHmac('sha256', process.env.PAYMENT_WEBHOOK_SECRET)
          .update(`${order_id}:${paymentStatus}`).digest('hex');
        const suppliedBuffer = Buffer.from(String(signature));
        const expectedBuffer = Buffer.from(expected);
        if (suppliedBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(suppliedBuffer, expectedBuffer)) {
          return failure(401, 'Invalid webhook signature');
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
          if (prior.rows[0]) return success(200, { payment: prior.rows[0], idempotent_replay: true });
          return failure(404, 'Pending payment not found');
        }
        await publish('cab.payment.events', {
          event_type: paymentStatus === 'SUCCESS' ? 'PaymentCompleted' : 'PaymentFailed',
          aggregate_id: order_id, payment_id: order_id, trip_id: result.rows[0].trip_id,
        });
        return success(200, { payment: result.rows[0] });
      }
      return failure(404, 'Unknown payment action');
    }
    case 'notification': {
      if (action === 'health') return success(200, { context, status: 'UP' });
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
        await redis.set(`cab:booking:offer-exp:${activeBooking.booking_id}`, nextDriverId, 'EX', 15);
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
