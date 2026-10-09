// Reset script. It clears event data from Redis using SCAN, truncates Postgres tables, and recreates the
// stream consumer group so a fresh test run starts from a known-good state.
const redis = require('../src/redis');
const pg = require('../src/pg');
const config = require('../src/config');

async function scanDelete(pattern) {
  let cursor = '0';
  let deleted = 0;

  do {
    const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 200);
    cursor = nextCursor;

    if (keys.length) {
      await redis.del(...keys);
      deleted += keys.length;
    }
  } while (cursor !== '0');

  return deleted;
}

async function recreateGroup() {
  try {
    await redis.xgroup('CREATE', config.streamKey, config.group, '0', 'MKSTREAM');
  } catch (error) {
    if (!String(error.message).includes('BUSYGROUP')) {
      throw error;
    }
  }
}

async function main() {
  const eventPattern = `evt:{${config.EVENT_ID}}:*`;
  const deletedEventKeys = await scanDelete(eventPattern);
  const deletedPayKeys = await scanDelete('pay:*');
  const deletedRateLimitKeys = await scanDelete('rl:*');
  await redis.del(config.streamKey);

  await pg.query('TRUNCATE bookings, dead_letters RESTART IDENTITY');
  await recreateGroup();

  console.log(`Reset complete: deleted ${deletedEventKeys} event keys, ${deletedPayKeys} pay keys, ${deletedRateLimitKeys} rate-limit keys, and the bookings stream.`);
}

main().catch((error) => {
  console.error('Reset failed:', error.message);
  process.exit(1);
});
