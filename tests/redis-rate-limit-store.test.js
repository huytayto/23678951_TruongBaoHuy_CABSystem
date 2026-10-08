const test = require('node:test');
const assert = require('node:assert/strict');
const RedisRateLimitStore = require('../api-gateway/src/redisRateLimitStore');

test('rate limit store uses an atomic Redis counter and configured expiry window', async () => {
  const calls = [];
  const redis = {
    async eval(...args) {
      calls.push(args);
      return [3, 750];
    },
  };
  const store = new RedisRateLimitStore(redis);
  store.init({ windowMs: 1000 });

  const result = await store.increment('192.0.2.4');

  assert.equal(result.totalHits, 3);
  assert.ok(result.resetTime instanceof Date);
  assert.equal(calls[0][0].includes("redis.call('INCR'"), true);
  assert.equal(calls[0][3], 1000);
  assert.match(calls[0][2], /^cab:rate-limit:[a-f0-9]{64}$/);
});

test('rate limit store resets only the hashed client key', async () => {
  let deletedKey;
  const redis = {
    async eval() { return 0; },
    async del(key) { deletedKey = key; },
  };
  const store = new RedisRateLimitStore(redis);
  await store.resetKey('192.0.2.5');

  assert.match(deletedKey, /^cab:rate-limit:[a-f0-9]{64}$/);
  assert.equal(deletedKey.includes('192.0.2.5'), false);
});
