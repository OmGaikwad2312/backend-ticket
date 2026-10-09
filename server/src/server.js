// Server bootstrap. It waits for Redis readiness, verifies Postgres, rehydrates sold state, and then starts
// the HTTP server with the Socket.IO bridge and reconnect handling.
const http = require('http');
const redis = require('./redis');
const pg = require('./pg');
const config = require('./config');
const app = require('./app');
const attachSocket = require('./socket');
const rehydrate = require('./rehydrate');
const { waitUntilReady } = require('./redis');

async function shutdown(server) {
  console.log('Shutting down server...');
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
  await redis.quit();
  await pg.end();
  process.exit(0);
}

async function start() {
  try {
    await waitUntilReady(redis);
    await pg.query('SELECT 1');
    await rehydrate();

    const server = http.createServer(app);
    server.keepAliveTimeout = 65000;
    server.headersTimeout = 66000;
    server.maxConnections = 20000;

    attachSocket(server);
    server.listen(config.PORT, () => {
      console.log(`API listening on ${config.PORT}`);
    });

    redis.on('ready', async () => {
      try {
        await rehydrate();
      } catch (error) {
        console.error('Rehydrate on ready failed:', error.message);
      }
    });

    const handleShutdown = () => shutdown(server).catch((error) => {
      console.error('Shutdown failed:', error.message);
      process.exit(1);
    });

    process.on('SIGINT', handleShutdown);
    process.on('SIGTERM', handleShutdown);
  } catch (error) {
    console.error('Fatal startup error:', error.message);
    try {
      await pg.end();
    } catch (pgError) {
      console.error('Postgres shutdown error:', pgError.message);
    }
    process.exit(1);
  }
}

start();
