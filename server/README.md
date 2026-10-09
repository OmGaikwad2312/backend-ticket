# High-Contention Flash-Reservation & Seat Inventory Locking Engine

This project is a Redis-first, PostgreSQL-backed seat reservation system designed for high contention and zero double-bookings. Redis handles the hot path, including hold creation, release, and the atomic check/confirm logic. Postgres stores the final sold seats and is fed asynchronously by background workers consuming a Redis stream. The API layer never reads Postgres on the request path.

## Architecture in plain English

- Redis is the source of truth for live seat state: sold seats, active holds, and rate-limits.
- Every booking decision is made inside atomic Lua scripts so the check and write happen as one operation.
- Postgres stores the durable booking ledger and is updated by two persist workers that consume the `bookings` stream.
- A reconciler periodically checks stale paid sessions and refunds them if the seat was never durably sold to that booking.
- Three API instances run on ports 3001, 3002, and 3003. They share nothing in memory and only talk to Redis and Postgres.

## Prerequisites

- Docker Desktop or Docker Engine with Compose support
- Node.js 18 or newer
- A shell that can run `npm` and `docker compose`

## Setup

1. Open a terminal in this project folder.
2. Start Redis and Postgres: `docker compose up -d`
3. Install dependencies: `npm install`
4. Copy the environment file: `copy .env.example .env` on Windows, or `cp .env.example .env` on Unix-like systems.
5. If your machine already uses 6379 or 5432, change the port mappings in [docker-compose.yml](docker-compose.yml) and the matching URLs in [.env.example](.env.example).

## Run the system

Start everything together:

```bash
npm run start:all
```

This starts:

- 3 API instances on 3001, 3002, and 3003
- 2 persist workers with IDs `w1` and `w2`
- 1 reconciler

## Reset state

```bash
npm run reset
```

This clears the event-specific Redis keys, deletes the rate limit data, truncates Postgres booking tables, and recreates the consumer group.

## Run the load test

```bash
npm run loadtest
```

Then verify final consistency:

```bash
npm run verify
```

## Full verification flow

```bash
npm run reset
npm run loadtest
npm run verify
```

Expected default result:

- 200 booked seats
- all remaining outcomes are 409 SOLD or HELD
- Redis sold count equals Postgres count
- duplicate seats equals 0
- dead letters equals 0

## API contract

| Method | Route | Purpose | Typical success | Notes |
| --- | --- | --- | --- | --- |
| GET | /health | Redis + Postgres health | 200 with redis=ok and postgres=ok | Internal readiness check |
| GET | /seats | Seat snapshot | 200 with event, total, counts, and seat list | Lists sold/held/free state |
| POST | /hold | Reserve a seat | 200 {ok:true, unit, expiresInMs} | Returns HELD or SOLD conflict |
| POST | /release | Remove a hold | 200 {released:true|false} | Only the owner can release |
| POST | /checkout | Begin payment session | 200 {status:"PENDING"} | Requires x-user-id |
| POST | /pay | Pay and finalize one booking | 200 {ok:true,status:"BOOKED",bookingId,unit} | Payment failure becomes 402 |
| POST | /book | Convenience route for the load test | 200 BOOKED | Encapsulates the full flow |

## Crash and recovery behavior

- Redis is the only hop on the hot path. If Redis is unreachable, the API returns 503 quickly instead of falling back to Postgres.
- Holds expire automatically using Redis TTL and are not decided by server-side timestamps.
- If Postgres is temporarily down, the workers retry pending stream entries without acking them.
- If the Redis service restarts, the app invokes rehydration and rebuilds the sold hash from Postgres.
- If a worker crashes, the `start-all` script restarts it automatically.

## Change ports if 6379 or 5432 are already in use

Edit both the Compose file and the `.env` values:

- [docker-compose.yml](docker-compose.yml) — change the host port mapping from `6379:6379` or `5432:5432`
- [.env.example](.env.example) — update `REDIS_URL` and `DATABASE_URL` to match the changed ports

Example:

```env
REDIS_URL=redis://127.0.0.1:6380
DATABASE_URL=postgres://postgres:pass@localhost:5433/tickets
```

## Production upgrades

- Redis replica + WAIT: add a replica to improve durability and failover before promoting a new primary.
- TigerBeetle payments ledger: replace the mock gateway with a ledger-backed money movement system for final settlement.
- Virtual waiting room: gate high-demand traffic before the seat inventory engine to smooth spikes.
- Redis Cluster with the `{e1}` hash-tag: scale the event-specific hotkeys across cluster slots while preserving the event key grouping.

## Notes

The system follows the exact requirement set in this project: three API instances, two persist workers, one reconciler, Redis-as-source-of-truth for live holds, PostgreSQL as the ledger of sold seats, and fail-closed behavior when Redis is unavailable.
