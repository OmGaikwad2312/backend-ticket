-- KEYS[1]=sold hash, KEYS[2]=hold key
-- ARGV[1]=unit, ARGV[2]=userId, ARGV[3]=ttlMs
-- returns 'OK' | 'SOLD' | 'HELD'
if redis.call('HEXISTS', KEYS[1], ARGV[1]) == 1 then return 'SOLD' end
-- This line refuses the hold if the seat is already sold in Redis.
local holder = redis.call('GET', KEYS[2])
-- This line reads the current holder for the specific hold key.
if holder and holder ~= ARGV[2] then return 'HELD' end
-- This line rejects the operation if another user currently holds the seat.
redis.call('SET', KEYS[2], ARGV[2], 'PX', ARGV[3])
-- This line writes the new hold owner with the configured TTL.
return 'OK'
-- This line confirms that the seat was successfully reserved for the caller.
