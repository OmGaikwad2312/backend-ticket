// Inventory operations live in Redis. The hold/confirm/release decisions are atomic Lua scripts, with
// Socket.IO event publication kept as best-effort fire-and-forget.
const redis = require('../redis');
const config = require('../config');

function publishState(unit, state) {
  try {
    redis.publish(config.channel, JSON.stringify({ unit, state }));
  } catch (error) {
    console.warn('publishState failed:', error.message);
  }
}

async function holdSeat(unit, userId) {
  const result = await redis.hold(
    config.soldKey(),
    config.holdKey(unit),
    String(unit),
    String(userId),
    String(config.HOLD_TTL_MS)
  );

  if (result === 'OK') {
    publishState(unit, 'held');
  }

  return result;
}

async function releaseSeat(unit, userId) {
  const released = await redis.release(config.holdKey(unit), String(userId));
  if (released === 1) {
    publishState(unit, 'free');
  }
  return released === 1;
}

async function confirmSeat(unit, userId, bookingId) {
  const result = await redis.confirm(
    config.soldKey(),
    config.holdKey(unit),
    config.streamKey,
    String(unit),
    String(userId),
    String(bookingId),
    config.EVENT_ID
  );

  if (result === 'OK') {
    publishState(unit, 'sold');
  }

  return result;
}

async function getSeatMap() {
  const soldKey = config.soldKey();
  const pipeline = redis.pipeline();
  pipeline.hgetall(soldKey);

  const holdKeys = Array.from({ length: config.TOTAL_UNITS }, (_, index) => config.holdKey(index + 1));
  pipeline.mget(holdKeys);

  const [soldResult, holdResult] = await pipeline.exec();
  const soldMap = soldResult[1] || {};
  const holdValues = holdResult[1] || [];

  const seats = [];
  const counts = { free: 0, held: 0, sold: 0 };

  for (let unit = 1; unit <= config.TOTAL_UNITS; unit += 1) {
    const soldBookingId = soldMap[String(unit)];
    const hasHold = Boolean(holdValues[unit - 1]);

    let state = 'free';
    if (soldBookingId) {
      state = 'sold';
      counts.sold += 1;
    } else if (hasHold) {
      state = 'held';
      counts.held += 1;
    } else {
      counts.free += 1;
    }

    seats.push({ unit, state });
  }

  return {
    event: config.EVENT_ID,
    total: config.TOTAL_UNITS,
    seats,
    counts,
  };
}

module.exports = {
  holdSeat,
  releaseSeat,
  confirmSeat,
  getSeatMap,
};
