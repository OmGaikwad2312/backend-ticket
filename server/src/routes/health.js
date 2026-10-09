// Health endpoint for validating Redis and Postgres readiness before traffic is accepted.
const express = require('express');
const redis = require('../redis');
const pg = require('../pg');

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    await redis.ping();
    await pg.query('SELECT 1');
    return res.status(200).json({ redis: 'ok', postgres: 'ok', port: process.env.PORT || 3001 });
  } catch (error) {
    console.error('Health check failed:', error.message);
    return res.status(503).json({ redis: 'error', postgres: 'error', port: process.env.PORT || 3001 });
  }
});

module.exports = router;
