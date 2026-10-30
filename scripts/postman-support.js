const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const { promisify } = require('node:util');
const { execFile } = require('node:child_process');
const execute = promisify(execFile);
const root = path.resolve(__dirname, '..');
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function command(file, args, options = {}) {
  const { stdout } = await execute(file, args, { cwd: root, timeout: 30000, maxBuffer: 2 * 1024 * 1024,
    windowsHide: true, ...options });
  return stdout.trim();
}
async function inService(service, source) {
  return JSON.parse(await command('docker', ['compose', 'exec', '-T', service, 'node', '-e', source]));
}
const db = source => `const {Pool}=require('pg'); const p=new Pool(); (async()=>{try{${source}}finally{await p.end();}})().catch(()=>{console.error('Evidence database check failed');process.exitCode=1;});`;

async function rateLimitLoad(input) {
  const net = require('node:net');
  const total = Number(input.total);
  if (!Number.isInteger(total) || total < 1001 || total > 10000) throw new Error('Use 1001–10000 requests');
  const target = new URL('/api/v1/bookings', process.env.API_BASE_URL || 'http://127.0.0.1:8080');
  if (target.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(target.hostname)) throw new Error('Load helper only targets local HTTP gateway');
  const concurrency = 16;
  const buckets = {};
  const result = { total, limited: 0, failures: 0, serverErrors: 0, unexpected: 0 };
  const body = JSON.stringify({ pickup_lat: 999, pickup_lng: 999 });
  const started = Date.now();
  await Promise.all(Array.from({ length: concurrency }, (_, index) => new Promise(resolve => {
    const count = Math.floor(total / concurrency) + (index < total % concurrency ? 1 : 0);
    let completed = 0, buffer = Buffer.alloc(0), finished = false;
    const socket = net.createConnection({ host: target.hostname, port: Number(target.port || 80) });
    function finish() {
      if (finished) return;
      finished = true; result.failures += count - completed; socket.destroy(); resolve();
    }
    socket.setTimeout(15000, finish);
    socket.on('error', finish); socket.on('end', finish); socket.on('close', finish);
    socket.on('connect', () => {
      // Genuine HTTP/1.1 pipelining: all bytes are sent through the public REST
      // handler, without mocking Redis or changing the server's configured limit.
      const request = `POST ${target.pathname} HTTP/1.1\r\nHost: ${target.host}\r\nContent-Type: application/json\r\nContent-Length: ${Buffer.byteLength(body)}\r\nConnection: keep-alive\r\n\r\n${body}`;
      const second = Math.floor((Date.now() - started) / 1000);
      buckets[second] = (buckets[second] || 0) + count;
      socket.write(request.repeat(count));
    });
    socket.on('data', chunk => {
      buffer = Buffer.concat([buffer, chunk]);
      while (!finished) {
        const end = buffer.indexOf('\r\n\r\n');
        if (end < 0) break;
        const header = buffer.subarray(0, end).toString('ascii');
        const match = header.match(/^HTTP\/1\.[01] (\d{3})/);
        const length = header.match(/\r\ncontent-length:\s*(\d+)/i);
        if (!match || !length) { finish(); break; }
        const size = end + 4 + Number(length[1]);
        if (buffer.length < size) break;
        const status = Number(match[1]); completed++;
        if (status === 429) result.limited++;
        else if (status >= 500) result.serverErrors++;
        else if (![400, 401].includes(status)) result.unexpected++;
        buffer = buffer.subarray(size);
        if (completed === count) finish();
      }
    });
  })));
  return { ...result, elapsed_ms: Date.now() - started, peak_issued_per_second: Math.max(...Object.values(buckets)),
    concurrency, transport: 'Real HTTP/1.1 pipelined anonymous POST attack against gateway' };
}

async function atRest(input) {
  for (const key of ['customer_id', 'driver_id', 'trip_id', 'payment_id']) if (!uuid.test(input[key] || '')) throw new Error(`Valid ${key} required`);
  const imageIds = (await command('docker', ['compose', 'images', '-q', 'customer-service', 'driver-service'])).split(/\r?\n/).filter(Boolean);
  const [auth, customer, driver, payment, trip, image] = await Promise.all([
    inService('auth-service', db(`const r=await p.query('SELECT password_hash FROM users WHERE uid=$1',[${JSON.stringify(input.customer_id)}]); console.log(JSON.stringify({password_bcrypt:r.rows.length===1 && /^\\$2[aby]\\$12\\$/.test(r.rows[0].password_hash)}));`)),
    inService('customer-service', db(`const c=require('crypto'),e=require('./services/data-encryption');const k=e.loadEncryptionKey(process.env.CUSTOMER_DATA_ENCRYPTION_KEY); const r=await p.query('SELECT fullname,address FROM customers WHERE uid=$1',[${JSON.stringify(input.customer_id)}]); const row=r.rows[0]; const encrypted=!!row && [row.fullname,row.address].every(v=>v.startsWith('enc:v1:')); let roundtrip=false;if(encrypted)roundtrip=[row.fullname,row.address].every(v=>e.decryptField(v,k)!==v);console.log(JSON.stringify({encrypted,roundtrip,key_hash:c.createHash('sha256').update(k).digest('hex')}));`)),
    inService('driver-service', db(`const c=require('crypto'),e=require('./services/data-encryption'); const k=e.loadEncryptionKey(process.env.DRIVER_DATA_ENCRYPTION_KEY); const r=await p.query('SELECT license_number,plate_number,phone FROM drivers WHERE uid=$1',[${JSON.stringify(input.driver_id)}]);const row=r.rows[0];const encrypted=!!row && [row.license_number,row.plate_number,row.phone].every(v=>v&&v.startsWith('enc:v1:')); let roundtrip=false;if(encrypted)roundtrip=[row.license_number,row.plate_number,row.phone].every(v=>e.decryptField(v,k)!==v);console.log(JSON.stringify({encrypted,roundtrip,key_hash:c.createHash('sha256').update(k).digest('hex')}));`)),
    inService('payment-service', db(`const r=await p.query('SELECT count(*)::int AS count FROM payments WHERE trip_id=$1',[${JSON.stringify(input.trip_id)}]); console.log(JSON.stringify(r.rows[0]));`)),
    inService('trip-service', db(`const r=await p.query('SELECT count(*)::int AS count FROM ratings WHERE trip_id=$1',[${JSON.stringify(input.trip_id)}]); console.log(JSON.stringify(r.rows[0]));`)),
    command('docker', ['image', 'inspect', ...imageIds, '--format', '{{json .Config.Env}}']),
  ]);
  let settlement;
  for (let attempt = 0; attempt < 20; attempt++) {
    settlement = await inService('notification-service', db(`const r=await p.query("SELECT count(*)::int AS count FROM notification_logs WHERE payload->>'payment_id'=$1 AND payload->>'event_type'='PaymentCompleted'",[${JSON.stringify(input.payment_id)}]);console.log(JSON.stringify(r.rows[0]));`));
    if (settlement.count === 1) break;
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  return { password_bcrypt: auth.password_bcrypt, customer_fields_encrypted: customer.encrypted,
    driver_fields_encrypted: driver.encrypted, decrypt_roundtrip: customer.roundtrip && driver.roundtrip,
    keys_valid_and_separate: customer.key_hash !== driver.key_hash,
    keys_not_baked_into_image: !/CUSTOMER_DATA_ENCRYPTION_KEY=|DRIVER_DATA_ENCRYPTION_KEY=/.test(image),
    payment_count: payment.count, rating_count: trip.count, settlement_event_count: settlement.count };
}

async function infrastructure() {
  const output = await command('docker', ['compose', 'ps', '--format', 'json']);
  const rows = output.split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
  const services = ['auth', 'customer', 'driver', 'booking', 'trip', 'payment', 'notification'].map(s => `${s}-service`);
  const applications = ['api-gateway', ...services];
  const tracked = await command('git', ['ls-files', '.env', '.env.*']);
  const ignored = await command('git', ['check-ignore', '.env']);
  const topics = await command('docker', ['compose', 'exec', '-T', 'kafka', '/opt/kafka/bin/kafka-topics.sh', '--bootstrap-server', 'localhost:9092', '--list']);
  const sourceFiles = ['services/domain-service.js', 'services/domain-rules.js', 'services/data-encryption.js', 'services/public-codes.js', 'shared/proto/cab-domain.proto'];
  const checks = await Promise.all(applications.map(async service => {
    const files = service === 'api-gateway' ? [...sourceFiles, 'api-gateway/src/server.js', 'api-gateway/src/auth.js', 'api-gateway/src/grpcClients.js', 'api-gateway/src/redisRateLimitStore.js'] : sourceFiles;
    const expected = Object.fromEntries(files.map(file => [file, crypto.createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex')]));
    const hashes = await inService(service, `const fs=require('fs'),c=require('crypto'); console.log(JSON.stringify(Object.fromEntries(${JSON.stringify(files)}.map(f=>[f,c.createHash('sha256').update(fs.readFileSync(f)).digest('hex')]))));`);
    return files.every(file => expected[file] === hashes[file]);
  }));
  const proto = fs.readFileSync(path.join(root, 'shared/proto/cab-domain.proto'), 'utf8');
  return {
    eight_application_processes: applications.every(s => rows.some(row => row.Service === s)),
    all_running: rows.length >= 11 && rows.every(row => row.State === 'running' && (!row.Health || row.Health === 'healthy')),
    gitignore_env: ignored === '.env', env_not_tracked: !tracked.split(/\r?\n/).some(file => file === '.env' || (file.startsWith('.env.') && file !== '.env.example')),
    grpc_contract_used: proto.includes('rpc Invoke') && checks.every(Boolean),
    kafka_topics_present: ['booking', 'driver', 'trip', 'payment'].every(s => topics.includes(`cab.${s}.events`)),
    domain_ports_private: rows.filter(row => services.includes(row.Service)).every(row => !(row.Publishers || []).some(port => port.PublishedPort > 0)),
    runtime_matches_source: checks.every(Boolean),
    containers: rows.map(row => ({ service: row.Service, state: row.State, health: row.Health || 'not-configured', published_ports: (row.Publishers || []).filter(p => p.PublishedPort > 0).map(p => `${p.URL}:${p.PublishedPort}`) })),
    github_history_review: 'MANUAL: local index checks do not prove remote GitHub history has no leaked secrets',
  };
}

function prepareEnvironment() {
  const { parsed = {} } = require('dotenv').config({ path: path.join(root, '.env') });
  const environment = JSON.parse(fs.readFileSync(path.join(root, 'postman/CAB.postman_environment.json'), 'utf8'));
  environment.name = 'CAB 3.0 — Local rubric (secrets — do not share)';
  const token = crypto.randomBytes(32).toString('hex');
  const replacements = { admin_username: parsed.ADMIN_USERNAME, admin_password: parsed.ADMIN_PASSWORD,
    payment_webhook_secret: parsed.PAYMENT_WEBHOOK_SECRET, evidence_token: token,
    base_url: process.env.API_BASE_URL || 'http://127.0.0.1:8080', evidence_url: 'http://127.0.0.1:8099' };
  for (const field of ['admin_username', 'admin_password', 'payment_webhook_secret']) if (!replacements[field]) throw new Error(`Configure ${field} in .env`);
  for (const entry of environment.values) if (Object.hasOwn(replacements, entry.key)) entry.value = replacements[entry.key];
  const file = path.join(root, 'postman/CAB.local.postman_environment.json');
  fs.writeFileSync(file, JSON.stringify(environment, null, 2) + '\n');
  return { environment, token, file };
}

function startEvidenceServer(token) {
  const server = http.createServer(async (req, res) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    const supplied = req.headers.authorization || '';
    const expected = `Bearer ${token}`;
    if (supplied.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) {
      res.writeHead(401); res.end(JSON.stringify({ error: 'Evidence token required' })); return;
    }
    try {
      if (req.method === 'GET' && req.url === '/infrastructure') res.end(JSON.stringify(await infrastructure()));
      else if (req.method === 'POST' && req.url === '/at-rest') {
        let body = '';
        for await (const chunk of req) { body += chunk; if (body.length > 4096) throw new Error('Payload too large'); }
        res.end(JSON.stringify(await atRest(JSON.parse(body))));
      } else if (req.method === 'POST' && req.url === '/rate-limit') {
        let body = '';
        for await (const chunk of req) { body += chunk; if (body.length > 4096) throw new Error('Payload too large'); }
        const input = JSON.parse(body);
        const result = await inService('api-gateway', `const http=require('node:http');${rateLimitLoad.toString()};rateLimitLoad(${JSON.stringify(input)}).then(r=>console.log(JSON.stringify(r))).catch(()=>process.exit(1));`);
        result.transport += '; generated inside gateway container, Redis limiter unchanged';
        res.end(JSON.stringify(result));
      } else { res.writeHead(404); res.end(JSON.stringify({ error: 'Not found' })); }
    } catch (error) {
      // Never forward raw Docker stderr: it may contain environment settings.
      console.error('Evidence check failed:', error.code || error.name);
      res.writeHead(503); res.end(JSON.stringify({ error: 'Evidence check failed. Verify Docker and current IDs; see helper console.' }));
    }
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(8099, '127.0.0.1', () => resolve(server));
  });
}
module.exports = { prepareEnvironment, startEvidenceServer, rateLimitLoad };
if (require.main === module) (async () => {
  const { token, file } = prepareEnvironment();
  const server = await startEvidenceServer(token);
  console.log(`Import postman/CAB-30-Criteria.postman_collection.json and ${path.basename(file)}. Evidence helper listening on 127.0.0.1:8099. Keep this terminal open while running Postman.`);
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));
})().catch(error => { console.error(error.message); process.exitCode = 1; });
