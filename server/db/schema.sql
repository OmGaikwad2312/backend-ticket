CREATE TABLE IF NOT EXISTS bookings (
  id SERIAL PRIMARY KEY,
  booking_id UUID NOT NULL UNIQUE,
  event_id TEXT NOT NULL,
  unit_id INT NOT NULL,
  user_id TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (event_id, unit_id)
);

CREATE TABLE IF NOT EXISTS dead_letters (
  id SERIAL PRIMARY KEY,
  payload JSONB NOT NULL,
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
