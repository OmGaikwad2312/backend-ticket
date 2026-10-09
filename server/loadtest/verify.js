// Verification script. It waits for stream draining and sold-seat reconciliation, then prints and enforces the
// correctness checks used to grade the reservation engine.
const redis = require('../src/redis');
const pg = require('../src/pg');
const config = require('../src/config');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function getSnapshot() {
  const soldPromise = redis.hlen(config.soldKey());
  const pgPromise = pg.query('SELECT COUNT(*) AS count FROM bookings');
  const duplicatesPromise = pg.query(`
    SELECT COUNT(*) AS count
    FROM (
      SELECT unit_id
      FROM bookings
      WHERE event_id = $1
      GROUP BY unit_id
      HAVING COUNT(*) > 1
    ) d
  `, [config.EVENT_ID]);
  const deadLettersPromise = pg.query('SELECT COUNT(*) AS count FROM dead_letters');
  const pendingPromise = redis.xpending(config.streamKey, config.group);

  const [redisSold, pgResult, duplicatesResult, deadLettersResult, pendingResult] = await Promise.all([
    soldPromise,
    pgPromise,
    duplicatesPromise,
    deadLettersPromise,
    pendingPromise,
  ]);

  const pgCount = Number(pgResult.rows[0].count || 0);
  const duplicates = Number(duplicatesResult.rows[0].count || 0);
  const deadLetters = Number(deadLettersResult.rows[0].count || 0);
  const pending = Number(pendingResult && pendingResult.pending ? pendingResult.pending : 0);

  return {
    redisSold,
    pgCount,
    duplicates,
    deadLetters,
    pending,
  };
}

async function main() {
  const deadline = Date.now() + 30000;
  let snapshot = await getSnapshot();

  while (Date.now() < deadline) {
    snapshot = await getSnapshot();
    if (snapshot.pending === 0 && snapshot.redisSold === snapshot.pgCount) {
      break;
    }
    await sleep(500);
  }

  console.log('=== Verify Summary ===');
  console.log(`Redis sold count: ${snapshot.redisSold}`);
  console.log(`Postgres bookings count: ${snapshot.pgCount}`);
  console.log(`Duplicate seats: ${snapshot.duplicates}`);
  console.log(`Dead letters: ${snapshot.deadLetters}`);

  const pass =
    snapshot.redisSold === snapshot.pgCount &&
    snapshot.duplicates === 0 &&
    snapshot.deadLetters === 0 &&
    snapshot.pgCount <= 200 &&
    snapshot.pending === 0;

  if (pass) {
    console.log('PASS');
    process.exit(0);
  }

  console.log('FAIL');
  process.exit(1);
}

main().catch((error) => {
  console.error('Verification failed:', error.message);
  process.exit(1);
});
