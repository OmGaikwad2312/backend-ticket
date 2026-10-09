// Persist worker. It reclaims stale stream claims and consumes the Redis bookings stream, writing each booking
// into Postgres with idempotent semantics and dead-letter handling for impossible duplicates.
const config = require('../src/config');
const { createRedis } = require('../src/redis');
const pg = require('../src/pg');

const workerId = process.env.WORKER_ID || config.WORKER_ID;
const redis = createRedis();

async function ensureGroup() {
  try {
    await redis.xgroup('CREATE', config.streamKey, config.group, '0', 'MKSTREAM');
  } catch (error) {
    if (!String(error.message).includes('BUSYGROUP')) {
      throw error;
    }
  }
}

async function recordDeadLetter(payload, reason) {
  await pg.query('INSERT INTO dead_letters (payload, reason) VALUES ($1, $2)', [payload, reason]);
}

async function processEntry(entry) {
  if (!entry || !Array.isArray(entry)) {
    return;
  }

  const [id, fields] = entry;
  const payload = {};
  for (let index = 0; index < fields.length; index += 2) {
    payload[fields[index]] = fields[index + 1];
  }

  const bookingId = payload.bookingId;
  const unit = Number(payload.unit);
  const user = payload.user;
  const event = payload.event;

  try {
    await pg.query(
      `INSERT INTO bookings (booking_id, event_id, unit_id, user_id)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (booking_id) DO NOTHING`,
      [bookingId, event, unit, user]
    );

    await redis.xack(config.streamKey, config.group, id);
    await redis.xdel(config.streamKey, id);
    console.log(`persisted ${bookingId} unit ${unit} by ${workerId}`);
  } catch (error) {
    if (error.code === '23505') {
      await recordDeadLetter(payload, 'duplicate-seat-conflict');
      await redis.xack(config.streamKey, config.group, id);
      await redis.xdel(config.streamKey, id);
      console.error(`duplicate allocation for booking ${bookingId} on unit ${unit}; dead-letter recorded`);
      return;
    }

    console.error(`persist failed for booking ${bookingId} on unit ${unit}:`, error.message);
    throw error;
  }
}

async function processReclaimedEntries() {
  try {
    const result = await redis.xautoclaim(config.streamKey, config.group, workerId, 5000, '0-0', 'COUNT', 50);
    const entries = Array.isArray(result) && Array.isArray(result[1]) ? result[1] : [];
    for (const entry of entries) {
      await processEntry(entry);
    }
  } catch (error) {
    console.error('Reclaim processing error:', error.message);
  }
}

async function processPendingEntries() {
  try {
    const response = await redis.xreadgroup('GROUP', config.group, workerId, 'COUNT', 50, 'BLOCK', 2000, 'STREAMS', config.streamKey, '>');
    if (!response || !response[0] || !response[0][1]) {
      return;
    }

    for (const entry of response[0][1]) {
      await processEntry(entry);
    }
  } catch (error) {
    if (!String(error.message).includes('NOGROUP')) {
      console.error('Pending read error:', error.message);
    }
  }
}

async function main() {
  await ensureGroup();
  console.log(`persist worker ${workerId} started`);

  while (true) {
    try {
      await processReclaimedEntries();
      await processPendingEntries();
    } catch (error) {
      console.error('Worker loop error:', error.message);
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
}

const shutdown = async () => {
  console.log(`worker ${workerId} shutting down`);
  await redis.quit();
  await pg.end();
  process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

main().catch((error) => {
  console.error('Fatal worker error:', error.message);
  process.exit(1);
});
