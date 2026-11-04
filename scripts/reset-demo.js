const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const dotenv = require('dotenv');
const smoke = require('../services/smoke-fixtures');

const root = path.resolve(__dirname, '..');
let composeEnvironment = process.env;
const applications = ['api-gateway', 'auth-service', 'customer-service', 'driver-service',
  'booking-service', 'trip-service', 'payment-service', 'notification-service'];

function compose(args, input, capture = false) {
  const result = spawnSync('docker', ['compose', ...args], {
    cwd: root, input, encoding: 'utf8', env: composeEnvironment,
    stdio: [input === undefined ? 'ignore' : 'pipe', capture ? 'pipe' : 'inherit', capture ? 'pipe' : 'inherit'],
    maxBuffer: 10 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    if (capture && result.stderr) console.error(result.stderr);
    throw new Error(`docker compose ${args.slice(0, 3).join(' ')} failed`);
  }
  return (result.stdout || '') + (capture ? result.stderr || '' : '');
}

// Sent over stdin to a disposable auth container; no extra application endpoint.
async function databaseWorker(fixtures, execute) {
  const assert = require('node:assert/strict');
  const { Pool } = require('pg');
  const Redis = require('ioredis');
  assert.equal(process.env.SMOKE_MODE, 'true', 'SMOKE_MODE must be true');
  assert.ok(process.env.ADMIN_USERNAME, 'Configured admin is required');
  assert.ok(!process.env.SEED_DEMO_PASSWORD, 'Disable legacy SEED_DEMO_PASSWORD first');
  const tables = { auth: ['users'], customer: ['customers'], driver: ['drivers'], booking: ['bookings'],
    trip: ['ratings', 'trips'], payment: ['payments'], notification: ['notification_logs'] };
  const pools = {}, clients = {};
  let redis;
  try {
    for (const context of Object.keys(tables)) {
      pools[context] = new Pool({ host: process.env.PGHOST, port: process.env.PGPORT || 5432,
        user: process.env.PGUSER, password: process.env.PGPASSWORD, database: `cab_${context}` });
      clients[context] = await pools[context].connect();
      await clients[context].query('BEGIN');
    }
    const ids = [fixtures.admin.uid, ...fixtures.customers.map(c => c.uid), ...fixtures.drivers.map(d => d.uid)];
    const users = (await clients.auth.query('SELECT uid,role FROM users WHERE uid=ANY($1::text[]) OR username=$2',
      [ids, process.env.ADMIN_USERNAME])).rows;
    assert.ok(ids.every(id => users.some(u => u.uid === id)), 'Run demo:prepare first: smoke accounts are missing');
    const admin = (await clients.auth.query("SELECT uid FROM users WHERE username=$1 AND role='ADMIN'",
      [process.env.ADMIN_USERNAME])).rows;
    assert.equal(admin.length, 1, 'Configured admin missing');
    const bookings = (await clients.booking.query(`SELECT booking_id FROM bookings
      WHERE customer_id=$1 AND status='CANCELED' AND cancel_reason='Seed for pagination'
      ORDER BY created_at,booking_id LIMIT 5`, [fixtures.customer.uid])).rows.map(b => b.booking_id);
    assert.equal(bookings.length, 5, 'Run demo:prepare first: five seed bookings are required');
    const counts = {};
    for (const [context, names] of Object.entries(tables)) {
      for (const table of names) counts[table] = Number((await clients[context].query(`SELECT count(*) FROM ${table}`)).rows[0].count);
    }
    if (execute !== true) {
      console.log('Current records:', JSON.stringify(counts));
      if (execute === 'verify') assert.deepEqual(counts, {
        users: users.length, customers: fixtures.customers.length, drivers: fixtures.drivers.length, bookings: 5,
        ratings: 0, trips: 0, payments: 0, notification_logs: 0,
      }, 'Unexpected records remain after reset');
      if (execute === 'verify') {
        const {syncIdSequences}=require('/app/services/entity-ids');
        for(const context of ['auth','booking','trip','payment'])await syncIdSequences(clients[context],context,true);
        assert.deepEqual((await clients.customer.query('SELECT uid FROM customers ORDER BY uid')).rows.map(c=>c.uid),fixtures.customers.map(c=>c.uid).sort());
        assert.deepEqual((await clients.driver.query('SELECT uid FROM drivers ORDER BY uid')).rows.map(d=>d.uid),fixtures.drivers.map(d=>d.uid).sort());
        await clients.auth.query('COMMIT');
      }
      return;
    }
    await clients.payment.query('DELETE FROM payments');
    await clients.trip.query('DELETE FROM ratings');
    await clients.trip.query('DELETE FROM trips');
    await clients.notification.query('DELETE FROM notification_logs');
    await clients.booking.query('DELETE FROM bookings WHERE NOT (booking_id=ANY($1::text[]))', [bookings]);
    await clients.customer.query('DELETE FROM customers WHERE NOT (uid=ANY($1::text[]))', [fixtures.customers.map(c => c.uid)]);
    await clients.driver.query('DELETE FROM drivers WHERE NOT (uid=ANY($1::text[]))', [fixtures.drivers.map(d => d.uid)]);
    await clients.auth.query('DELETE FROM users WHERE NOT (uid=ANY($1::text[]))', [users.map(u => u.uid)]);
    for (const user of [fixtures.admin, ...fixtures.customers, ...fixtures.drivers]) {
      await clients.auth.query('UPDATE users SET username=$2 WHERE uid=$1', [user.uid, user.username]);
    }
    await clients.booking.query("UPDATE bookings SET booking_id='reset-'||booking_id");
    for (const [i,id] of bookings.entries())await clients.booking.query('UPDATE bookings SET booking_id=$2 WHERE booking_id=$1',['reset-'+id,'b'+(i+1)]);
    for (const client of Object.values(clients)) await client.query('COMMIT');
    redis = new Redis(process.env.REDIS_URL);
    // Keep revoked JWTs revoked. Remove only this application's transient state.
    let cursor = '0';
    do {
      const [next, keys] = await redis.scan(cursor, 'MATCH', 'cab:*', 'COUNT', 200);
      cursor = next;
      const stale = keys.filter(key => !key.startsWith('cab:revoked:'));
      if (stale.length) await redis.del(...stale);
    } while (cursor !== '0');
    console.log(`Retained: configured admin, ${ids.length} smoke accounts, ${fixtures.customers.length} customers, ${fixtures.drivers.length} drivers, 5 bookings.`);
  } finally {
    for (const client of Object.values(clients)) {
      await client.query('ROLLBACK').catch(() => {});
      client.release();
    }
    for (const pool of Object.values(pools)) await pool.end();
    if (redis) await redis.quit();
  }
}

function worker(execute) {
  // Only public fixture identities/coordinates go over stdin; passwords are seeded by the running service.
  const fixtures = { admin: { uid: smoke.admin.uid, username: smoke.admin.username },
    customer: { uid: smoke.customer.uid, username: smoke.customer.username },
    customers: smoke.customers.map(c => ({ uid: c.uid, username: c.username })),
    drivers: smoke.drivers.map(d => ({ uid: d.uid, username: d.username })) };
  compose(['run', '--rm', '--no-deps', '-T', 'auth-service', 'node'],
    `(${databaseWorker.toString()})(${JSON.stringify(fixtures)},${JSON.stringify(execute)}).catch(e=>{console.error(e.message);process.exitCode=1;});`);
}

async function waitForNotificationGroup() {
  const { Kafka } = require('kafkajs');
  const admin = new Kafka({ clientId: 'cab-demo-reset', brokers: process.env.KAFKA_BROKERS.split(',') }).admin();
  const groupId = 'cab-notification-service';
  await admin.connect();
  try {
    // A stopped container can remain a group member until its Kafka session expires.
    // The CLI prints an error but can exit 0 in this state; wait and use the admin API.
    const deadline = Date.now() + 65000;
    while (true) {
      const { groups } = await admin.describeGroups([groupId]);
      const group = groups[0];
      if (['Empty', 'Dead'].includes(group?.state) && !group.members.length) break;
      if (Date.now() >= deadline) throw new Error('Notification group is still active; database cleanup was not started');
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    console.log('Notification consumer group is inactive.');
  } finally {
    await admin.disconnect();
  }
}

async function main() {
  const options = process.argv.slice(2);
  if (options.some(arg => arg !== '--check')) throw new Error('Usage: npm run demo:reset [-- --check]');
  const config = dotenv.parse(fs.readFileSync(path.join(root, '.env')));
  if (config.SMOKE_MODE !== 'true') throw new Error('Set SMOKE_MODE=true in .env first');
  if (config.SEED_DEMO_PASSWORD) throw new Error('Set SEED_DEMO_PASSWORD= in .env to disable legacy fixtures');
  // Compose normally gives the calling shell precedence over .env. Pin the validated
  // file values so an old PowerShell variable cannot silently reactivate legacy seeds.
  composeEnvironment = { ...process.env, ...config, SEED_DEMO_PASSWORD: config.SEED_DEMO_PASSWORD || '' };
  worker(false);
  if (options.includes('--check')) { console.log('Check only: no data deleted, no services stopped.'); return; }
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backup = path.join(root, 'postman', 'reports', `demo-reset-${stamp}`);
  fs.mkdirSync(backup, { recursive: true });
  console.log('Backup directory:', backup);
  let stopped = false;
  let resetCompleted = false;
  try {
    stopped = true;
    compose(['stop', ...applications]);
    compose(['exec', '-T', 'postgres', 'sh', '-c', 'pg_dumpall -U "$POSTGRES_USER" -f /tmp/cab-demo-reset.sql']);
    compose(['cp', 'postgres:/tmp/cab-demo-reset.sql', path.join(backup, 'postgres.sql')]);
    compose(['exec', '-T', 'redis', 'redis-cli', 'SAVE']);
    compose(['cp', 'redis:/data/dump.rdb', path.join(backup, 'redis.rdb')]);
    for (const file of ['postgres.sql', 'redis.rdb']) {
      if (!fs.statSync(path.join(backup, file)).size) throw new Error(`Empty backup: ${file}`);
    }
    // Prevent unconsumed old events from recreating deleted notifications on restart.
    const kafkaCli = ['/opt/kafka/bin/kafka-consumer-groups.sh', '--bootstrap-server', 'kafka:9092', '--group', 'cab-notification-service'];
    const offsets = compose(['exec', '-T', 'kafka', ...kafkaCli, '--describe'], undefined, true);
    fs.writeFileSync(path.join(backup, 'notification-offsets.txt'), offsets);
    compose(['run', '--rm', '--no-deps', '-T', 'auth-service', 'node'],
      `(${waitForNotificationGroup.toString()})().catch(e=>{console.error(e.message);process.exitCode=1;});`);
    const resetOutput = compose(['exec', '-T', 'kafka', ...kafkaCli, '--reset-offsets', '--all-topics', '--to-latest', '--execute'], undefined, true);
    if (/Error:|Exception/.test(resetOutput)) throw new Error('Kafka offset reset failed; database cleanup was not started');
    fs.writeFileSync(path.join(backup, 'notification-offset-reset.txt'), resetOutput);
    worker(true);
    resetCompleted = true;
  } finally {
    if (stopped) {
      // Apply .env as well: an old running container may still have legacy seeding enabled.
      compose(['up', '-d', '--no-deps', '--wait', '--wait-timeout', '60',
        ...applications.filter(name => name !== 'api-gateway')]);
      if (resetCompleted) compose(['run','--rm','--no-deps','-T','api-gateway','node','-e',
        "require('./services/prepare-smoke').prepare(require('./api-gateway/src/grpcClients').invoke,true).then(()=>process.exit(0)).catch(e=>{console.error(e.message);process.exit(1)})"]);
      compose(['up', '-d', '--no-deps', 'api-gateway']);
    }
  }
  // The gateway reloads smoke fixture states and the available-driver Geo index on startup.
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    let ready = false;
    try {
      const response = await fetch('http://127.0.0.1:8080/api/ready');
      ready = response.ok;
    } catch {}
    if (ready) {
      worker('verify');
      console.log('Reset complete. Start Postman again from step 06.');
      return;
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  throw new Error('Reset finished but gateway is not ready; check docker compose ps/logs.');
}

if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { databaseWorker, waitForNotificationGroup };
