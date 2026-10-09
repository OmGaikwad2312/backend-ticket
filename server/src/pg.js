// PostgreSQL connection pool used by the API rehydration flow and the persist workers.
const { Pool } = require('pg');
const config = require('./config');

const pool = new Pool({
  connectionString: config.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

module.exports = pool;
