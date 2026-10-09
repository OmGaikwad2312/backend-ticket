// Rebuilds Redis sold-seat state from Postgres so the in-memory hot path stays in Redis.
const pg = require('./pg');
const redis = require('./redis');
const config = require('./config');

async function rehydrate() {
  const result = await pg.query(
    'SELECT unit_id, booking_id FROM bookings WHERE event_id = $1',
    [config.EVENT_ID]
  );

  if (!result.rows.length) {
    console.log('Redis rehydrated 0 sold seats');
    return 0;
  }

  const pipeline = redis.pipeline();
  for (const row of result.rows) {
    pipeline.hsetnx(config.soldKey(), String(row.unit_id), row.booking_id);
  }

  await pipeline.exec();
  console.log(`Redis rehydrated ${result.rows.length} sold seats`);
  return result.rows.length;
}

module.exports = rehydrate;
