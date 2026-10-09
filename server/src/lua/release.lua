-- KEYS[1]=hold key, ARGV[1]=userId. Deletes hold only if the caller owns it.
-- returns 1 if released else 0
if redis.call('GET', KEYS[1]) == ARGV[1] then redis.call('DEL', KEYS[1]) return 1 end
-- This line deletes the hold only when the caller still owns it and returns success.
return 0
-- This line means no hold was released because the caller was not the owner.
