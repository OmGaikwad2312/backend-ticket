// Mock payment gateway logic. It validates hold ownership, marks payment state, and provides the session
// data needed for the reconciler and the pay route.
const redis = require('../redis');
const config = require('../config');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function createSession(userId, unit, bookingId) {
  const holdOwner = await redis.get(config.holdKey(unit));
  if (holdOwner !== userId) {
    return { error: 'NO_HOLD' };
  }

  const payKey = config.payKey(bookingId);
  const existing = await redis.hgetall(payKey);
  if (Object.keys(existing).length > 0) {
    return {
      bookingId,
      user: existing.user,
      unit: Number(existing.unit),
      status: existing.status || 'PENDING',
    };
  }

  await redis.hset(payKey, {
    user: userId,
    unit: String(unit),
    status: 'PENDING',
  });
  await redis.pexpire(payKey, config.PAY_SESSION_TTL_MS);

  return {
    bookingId,
    user: userId,
    unit,
    status: 'PENDING',
  };
}

async function pay(bookingId) {
  const payKey = config.payKey(bookingId);
  const lockSet = await redis.hsetnx(payKey, 'lock', '1');

  if (lockSet === 0) {
    const current = await redis.hgetall(payKey);
    return {
      status: current.status || 'PENDING',
      bookingId,
    };
  }

  await sleep(config.PAYMENT_DELAY_MS);

  const doesPay = Math.random() >= config.PAYMENT_FAIL_RATE;
  const status = doesPay ? 'PAID' : 'FAILED';

  const existing = await redis.hgetall(payKey);
  const payload = {
    user: existing.user,
    unit: String(existing.unit),
    status,
  };

  if (doesPay) {
    payload.paidAt = String(Date.now());
    await redis.hset(payKey, payload);
    await redis.pexpire(payKey, config.PAID_SESSION_TTL_MS);
  } else {
    await redis.hset(payKey, payload);
    await redis.pexpire(payKey, config.PAY_SESSION_TTL_MS);
  }

  return {
    status,
    bookingId,
  };
}

module.exports = {
  createSession,
  pay,
};
