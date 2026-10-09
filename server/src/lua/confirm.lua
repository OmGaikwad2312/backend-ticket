-- KEYS[1]=sold hash, KEYS[2]=hold key, KEYS[3]=stream
-- ARGV[1]=unit, ARGV[2]=userId, ARGV[3]=bookingId, ARGV[4]=eventId
-- returns 'OK' | 'SOLD' | 'EXPIRED'
local sold = redis.call('HGET', KEYS[1], ARGV[1])
-- This line checks whether the seat is already in the sold hash.
if sold then
  -- This line starts the branch that handles already-sold seats.
  if sold == ARGV[3] then return 'OK' end   -- retry of the same booking (idempotent)
  -- This line allows a replay of the same booking to pass without double-booking.
  return 'SOLD'
  -- This line rejects the confirm if some other booking already owns the seat.
end
if redis.call('GET', KEYS[2]) ~= ARGV[2] then return 'EXPIRED' end
-- This line verifies the hold still belongs to the caller before finalizing the booking.
redis.call('DEL', KEYS[2])
-- This line removes the temporary hold when the booking is finalized.
redis.call('HSET', KEYS[1], ARGV[1], ARGV[3])
-- This line marks the seat as sold and attaches the booking id as the canonical ownership token.
redis.call('XADD', KEYS[3], '*', 'unit', ARGV[1], 'user', ARGV[2], 'bookingId', ARGV[3], 'event', ARGV[4])
-- This line adds a persisted booking event to the Redis stream for async Postgres writes.
return 'OK'
-- This line tells the API the booking was accepted and recorded in Redis.
