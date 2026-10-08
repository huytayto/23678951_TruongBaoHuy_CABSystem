const crypto = require('crypto');

const incrementScript = `
  local hits = redis.call('INCR', KEYS[1])
  local ttl = redis.call('PTTL', KEYS[1])
  if hits == 1 or ttl < 0 then
    redis.call('PEXPIRE', KEYS[1], ARGV[1])
    ttl = ARGV[1]
  end
  return { hits, ttl }
`;

class RedisRateLimitStore {
  constructor(redis) {
    this.redis = redis;
    this.localKeys = false;
    this.windowMs = 1000;
  }

  init(options) {
    this.windowMs = options.windowMs;
  }

  keyFor(key) {
    const digest = crypto.createHash('sha256').update(key).digest('hex');
    return `cab:rate-limit:${digest}`;
  }

  async increment(key) {
    const [totalHits, ttl] = await this.redis.eval(
      incrementScript,
      1,
      this.keyFor(key),
      this.windowMs,
    );
    return {
      totalHits: Number(totalHits),
      resetTime: new Date(Date.now() + Math.max(Number(ttl), 0)),
    };
  }

  async decrement(key) {
    const redisKey = this.keyFor(key);
    await this.redis.eval(
      "if redis.call('exists', KEYS[1]) == 1 then return redis.call('decr', KEYS[1]) else return 0 end",
      1,
      redisKey,
    );
  }

  async resetKey(key) {
    await this.redis.del(this.keyFor(key));
  }
}

module.exports = RedisRateLimitStore;
