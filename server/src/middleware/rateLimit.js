// Token-bucket request throttling against Redis so a single caller cannot overload the lock engine.
const redis = require('../redis');
const config = require('../config');

async function rateLimit(req, res, next) {
  if (!config.RATE_LIMIT_ENABLED) {
    return next();
  }

  const allowed = await redis.bucket(`rl:${req.userId}`, config.BUCKET_CAPACITY, config.BUCKET_REFILL_PER_SEC);
  if (!allowed) {
    return res.status(429).json({ error: 'RATE_LIMITED' });
  }

  return next();
}

module.exports = rateLimit;
