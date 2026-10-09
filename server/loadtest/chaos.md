# Chaos and failure scenarios

## 1) Kill persist worker w1 mid-test, let start-all restart it

1. Start the stack and load test as usual.
2. In a second terminal, run: `docker ps`
3. Find the persist worker and kill it: `pkill -f "worker/persist.js"`
4. Watch logs from `npm run start:all` as the worker restarts.
5. Expected result: the stream backlog drains, counts converge, and the total booked seats remain within the 200-seat limit.

## 2) Stop Postgres for ~10 seconds during a test

1. Run the load test in one window.
2. In another terminal: `docker stop tickets-pg`
3. Wait ~10 seconds, then restart it: `docker start tickets-pg`
4. Expected result: the API continues accepting bookings while the stream backlog is replayed, and final Redis/Postgres counts converge without duplicates.

## 3) Restart Redis during a test

1. Run the load test.
2. In another terminal: `docker restart tickets-redis`
3. Expected result: the API returns 503 briefly while Redis is down, then recovers automatically and rehydrates sold seats from Postgres.

## 4) Hold and abandon a seat with a 5 second TTL

1. Set `HOLD_TTL_MS=5000` in `.env`.
2. Start the app stack and then call the hold endpoint with a user id.
3. Wait ~5 seconds and call `GET /seats`.
4. Expected result: the held seat is free again and can be booked by a new user.

## 5) Kill one API instance

1. Start the full stack with `npm run start:all`.
2. Kill one API process: `pkill -f "src/server.js"` or stop one port process manually.
3. Expected result: the remaining two API instances continue to serve bookings while the crashed one restarts automatically.
