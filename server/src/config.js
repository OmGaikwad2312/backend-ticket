// Global runtime configuration for the reservation engine. It loads .env, normalizes values,
// and exposes a frozen configuration object plus the Redis key builders used everywhere else.
require('dotenv').config();

const EVENT_ID = process.env.EVENT_ID || 'e1';

function holdKey(unit) {
  return `evt:{${EVENT_ID}}:hold:${unit}`;
}

function soldKey() {
  return `evt:{${EVENT_ID}}:sold`;
}

function payKey(id) {
  return `pay:${id}`;
}

const config = Object.freeze({
  PORT: Number(process.env.PORT || 3001),
  REDIS_URL: process.env.REDIS_URL || 'redis://127.0.0.1:6379',
  DATABASE_URL: process.env.DATABASE_URL || 'postgres://postgres:pass@localhost:5432/tickets',
  EVENT_ID,
  TOTAL_UNITS: Number(process.env.TOTAL_UNITS || 200),
  HOLD_TTL_MS: Number(process.env.HOLD_TTL_MS || 90000),
  PAY_SESSION_TTL_MS: Number(process.env.PAY_SESSION_TTL_MS || 90000),
  PAID_SESSION_TTL_MS: Number(process.env.PAID_SESSION_TTL_MS || 3600000),
  PAYMENT_DELAY_MS: Number(process.env.PAYMENT_DELAY_MS || 100),
  PAYMENT_FAIL_RATE: Number(process.env.PAYMENT_FAIL_RATE || 0),
  RATE_LIMIT_ENABLED: (process.env.RATE_LIMIT_ENABLED || 'true') !== 'false',
  BUCKET_CAPACITY: Number(process.env.BUCKET_CAPACITY || 20),
  BUCKET_REFILL_PER_SEC: Number(process.env.BUCKET_REFILL_PER_SEC || 10),
  WORKER_ID: process.env.WORKER_ID || 'w1',
  streamKey: 'bookings',
  group: 'persisters',
  channel: 'seat-events',
  holdKey,
  soldKey,
  payKey,
});

module.exports = config;
