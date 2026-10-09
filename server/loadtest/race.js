// Race test. It spreads 5,000 virtual users across three API ports to stress the distributed hold/checkout
// flow while measuring latency and final result counts.
const { Pool } = require('undici');

const USERS = Number(process.env.USERS || 5000);
const SEATS = Number(process.env.SEATS || 200);
const PORTS = [3001, 3002, 3003];
const PORTS_BY_INDEX = PORTS.map((port) => `http://127.0.0.1:${port}`);

const pools = PORTS_BY_INDEX.map((url) => new Pool(url, { connections: 100 }));
const outcomes = {
  BOOKED: 0,
  SOLD: 0,
  HELD: 0,
  PAYMENT_FAILED: 0,
  EXPIRED: 0,
  RATE_LIMITED: 0,
  SERVICE_UNAVAILABLE: 0,
  NETWORK_ERROR: 0,
};
const latencies = [];
let requestsCompleted = 0;
let totalDurationMs = 0;
let startedAt = Date.now();
let nextPortIndex = 0;

function randomSeat(excluded = null) {
  let seat = Math.floor(Math.random() * SEATS) + 1;
  if (excluded && seat === excluded) {
    seat = ((seat % SEATS) + 1);
  }
  return seat;
}

function getPool() {
  const target = pools[nextPortIndex % pools.length];
  nextPortIndex += 1;
  return target;
}

async function requestBook(userId, unit) {
  const pool = getPool();
  const started = Date.now();

  try {
    const response = await pool.request({
      method: 'POST',
      path: '/book',
      headers: {
        'content-type': 'application/json',
        'x-user-id': userId,
      },
      body: JSON.stringify({ unit }),
    });

    const text = await response.body.text();
    const payload = text ? JSON.parse(text) : {};
    const latency = Date.now() - started;
    latencies.push(latency);
    requestsCompleted += 1;
    return { status: response.statusCode, body: payload };
  } catch (error) {
    latencies.push(Date.now() - started);
    requestsCompleted += 1;
    outcomes.NETWORK_ERROR += 1;
    return { status: 0, body: { error: error.message } };
  }
}

function recordOutcome(name) {
  if (outcomes[name] !== undefined) {
    outcomes[name] += 1;
  }
}

function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index];
}

async function runUser(userIndex) {
  const userId = `user-${userIndex}`;
  let seat = randomSeat();
  let attempts = 0;

  while (attempts < 5) {
    const result = await requestBook(userId, seat);
    const status = result.status;
    const body = result.body || {};

    if (status === 200 && body.status === 'BOOKED') {
      recordOutcome('BOOKED');
      return;
    }
    if (status === 409 && body.reason === 'HELD') {
      attempts += 1;
      await new Promise((resolve) => setTimeout(resolve, 20 + Math.random() * 60));
      continue;
    }
    if (status === 409 && body.reason === 'SOLD') {
      const altSeat = randomSeat(seat);
      const altResult = await requestBook(userId, altSeat);
      const altStatus = altResult.status;
      const altBody = altResult.body || {};

      if (altStatus === 200 && altBody.status === 'BOOKED') {
        recordOutcome('BOOKED');
        return;
      }
      if (altStatus === 409 && (altBody.reason === 'HELD' || altBody.reason === 'SOLD')) {
        recordOutcome('SOLD');
        return;
      }
      if (altStatus === 402) {
        recordOutcome('PAYMENT_FAILED');
        return;
      }
      if (altStatus === 410) {
        recordOutcome('EXPIRED');
        return;
      }
      if (altStatus === 429) {
        recordOutcome('RATE_LIMITED');
        return;
      }
      if (altStatus === 503) {
        recordOutcome('SERVICE_UNAVAILABLE');
        return;
      }
      recordOutcome('SOLD');
      return;
    }
    if (status === 429) {
      attempts += 1;
      await new Promise((resolve) => setTimeout(resolve, 100));
      if (attempts >= 3) {
        recordOutcome('RATE_LIMITED');
        return;
      }
      continue;
    }
    if (status === 402) {
      recordOutcome('PAYMENT_FAILED');
      return;
    }
    if (status === 410) {
      recordOutcome('EXPIRED');
      return;
    }
    if (status === 503) {
      recordOutcome('SERVICE_UNAVAILABLE');
      return;
    }
    if (status === 0) {
      recordOutcome('NETWORK_ERROR');
      return;
    }

    if (status === 409 && body.reason === 'HELD') {
      recordOutcome('HELD');
      return;
    }

    recordOutcome('SOLD');
    return;
  }

  recordOutcome('HELD');
}

async function main() {
  startedAt = Date.now();
  const userIds = Array.from({ length: USERS }, (_, index) => index + 1);
  await Promise.all(userIds.map((index) => runUser(index)));
  totalDurationMs = Date.now() - startedAt;

  const summary = {
    BOOKED: outcomes.BOOKED,
    SOLD: outcomes.SOLD,
    HELD: outcomes.HELD,
    PAYMENT_FAILED: outcomes.PAYMENT_FAILED,
    EXPIRED: outcomes.EXPIRED,
    RATE_LIMITED: outcomes.RATE_LIMITED,
    SERVICE_UNAVAILABLE: outcomes.SERVICE_UNAVAILABLE,
    NETWORK_ERROR: outcomes.NETWORK_ERROR,
  };

  console.log('=== Reservation Load Test Summary ===');
  console.log(`Users: ${USERS} | Seats: ${SEATS} | Requests: ${requestsCompleted}`);
  console.log(`Total duration: ${totalDurationMs} ms`);
  console.log(`Throughput: ${(requestsCompleted / Math.max(totalDurationMs / 1000, 1)).toFixed(2)} req/s`);
  console.log('Counters:');
  for (const [key, value] of Object.entries(summary)) {
    console.log(`  ${key}: ${value}`);
  }

  console.log('Latency(ms):');
  console.log(`  p50=${percentile(latencies, 50)} p95=${percentile(latencies, 95)} p99=${percentile(latencies, 99)}`);

  if (outcomes.BOOKED > SEATS) {
    console.error('BOOKED count exceeded seat capacity.');
    process.exit(1);
  }

  process.exit(0);
}

main().catch((error) => {
  console.error('Load test failed:', error.message);
  process.exit(1);
});
