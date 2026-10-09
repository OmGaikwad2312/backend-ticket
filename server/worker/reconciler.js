// Reconciler. It periodically scans payment sessions to find stale PAID state that should be refunded when
// the sold-hash no longer marks the seat as owned by the same booking.
const redis = require('../src/redis');
const config = require('../src/config');

async function reconcile() {
  let cursor = '0';

  do {
    const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', 'pay:*', 'COUNT', 100);
    cursor = nextCursor;

    for (const key of keys || []) {
      const session = await redis.hgetall(key);
      if (session.status !== 'PAID') {
        continue;
      }

      const paidAt = Number(session.paidAt || 0);
      if (!paidAt || Date.now() - paidAt < 30000) {
        continue;
      }

      const bookingId = key.replace(/^pay:/, '');
      const unit = Number(session.unit);
      const soldBookingId = await redis.hget(config.soldKey(), String(unit));

      if (soldBookingId !== bookingId) {
        await redis.hset(key, 'status', 'REFUND');
        console.log(`refunded ${bookingId}`);
      }
    }
  } while (cursor !== '0');
}

async function main() {
  console.log('reconciler started');
  setInterval(() => {
    reconcile().catch((error) => {
      console.error('reconcile failed:', error.message);
    });
  }, 30000);

  await reconcile();
}

process.on('SIGINT', () => {
  console.log('reconciler stopping');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('reconciler stopping');
  process.exit(0);
});

main().catch((error) => {
  console.error('Fatal reconciler error:', error.message);
  process.exit(1);
});
