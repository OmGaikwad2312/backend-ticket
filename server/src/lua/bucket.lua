-- KEYS[1]=bucket key, ARGV[1]=capacity, ARGV[2]=refill tokens per second
-- returns 1 if allowed else 0
local cap = tonumber(ARGV[1]); local rate = tonumber(ARGV[2])
-- This line converts the bucket configuration values from strings into numbers.
local t = redis.call('TIME')
-- This line reads Redis's own clock so the limiter uses a single source of truth.
local now = tonumber(t[1]) * 1000 + math.floor(tonumber(t[2]) / 1000)
-- This line converts the current epoch time to milliseconds for token accounting.
local d = redis.call('HMGET', KEYS[1], 'tokens', 'ts')
-- This line reads the current token balance and the last refill timestamp from the bucket hash.
local tokens = tonumber(d[1]); local ts = tonumber(d[2])
-- This line converts the stored token counters back into numbers.
if tokens == nil then tokens = cap; ts = now end
-- This line initializes a fresh bucket to full capacity when there has been no prior state.
tokens = math.min(cap, tokens + (now - ts) * rate / 1000)
-- This line refills the bucket based on elapsed time and the configured rate.
local allowed = 0
-- This line starts with the assumption that the request is denied until proven otherwise.
if tokens >= 1 then tokens = tokens - 1; allowed = 1 end
-- This line consumes one token when there is enough capacity to grant the request.
redis.call('HSET', KEYS[1], 'tokens', tokens, 'ts', now)
-- This line stores the updated token count and the current time back into the bucket state.
redis.call('PEXPIRE', KEYS[1], 60000)
-- This line keeps the bucket state from living forever by renewing the short expiry window.
return allowed
-- This line returns 1 if the request passed and 0 if it was rate limited.
