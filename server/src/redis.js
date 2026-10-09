// Redis client setup and Lua command registration. This file creates the shared client used by the HTTP API,
// a factory for per-worker subscriber/blocking connections, and a small ready-wait helper for startup logic.
const fs = require('fs');
const path = require('path');
const Redis = require('ioredis');
const config = require('./config');

const redisOptions = {
  enableOfflineQueue: true,
  maxRetriesPerRequest: 1,
  retryStrategy: (times) => Math.min(times * 200, 2000),
};

const scriptFiles = {
  hold: 'hold.lua',
  confirm: 'confirm.lua',
  release: 'release.lua',
  bucket: 'bucket.lua',
};

function attachLogging(client) {
  let connectLogged = false;
  let errorLogged = false;
  let closeLogged = false;

  client.on('connect', () => {
    if (!connectLogged) {
      console.log('Redis connected');
      connectLogged = true;
    }
  });

  client.on('error', (error) => {
    if (!errorLogged) {
      console.error('Redis error:', error.message);
      errorLogged = true;
    }
  });

  client.on('close', () => {
    if (!closeLogged) {
      console.warn('Redis connection closed');
      closeLogged = true;
    }
  });
}

const client = new Redis(config.REDIS_URL, redisOptions);

Object.entries(scriptFiles).forEach(([name, fileName]) => {
  const script = fs.readFileSync(path.join(__dirname, 'lua', fileName), 'utf8');
  const numberOfKeys = {
    hold: 2,
    confirm: 3,
    release: 1,
    bucket: 1,
  }[name];

  client.defineCommand(name, {
    numberOfKeys,
    lua: script,
  });
});

attachLogging(client);

function createRedis() {
  const connection = new Redis(config.REDIS_URL, redisOptions);
  attachLogging(connection);
  return connection;
}

function waitUntilReady(redisClient) {
  if (redisClient.status === 'ready') {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const onReady = () => {
      cleanup();
      resolve();
    };

    const onError = (error) => {
      cleanup();
      reject(error);
    };

    const cleanup = () => {
      redisClient.off('ready', onReady);
      redisClient.off('error', onError);
    };

    redisClient.once('ready', onReady);
    redisClient.once('error', onError);
  });
}

module.exports = client;
module.exports.createRedis = createRedis;
module.exports.waitUntilReady = waitUntilReady;
