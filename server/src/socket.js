// Socket.IO bridge between Redis seat events and the local HTTP instance. Redis remains the source of truth;
// failure here is best-effort and must never affect bookings.
const { Server } = require('socket.io');
const config = require('./config');
const { createRedis } = require('./redis');
const inventory = require('./services/inventory');

function attachSocket(server) {
  const io = new Server(server, {
    cors: { origin: '*' },
  });

  const subscriber = createRedis();
  subscriber.subscribe(config.channel);

  subscriber.on('message', (channel, message) => {
    try {
      const payload = JSON.parse(message);
      io.emit('seat', payload);
    } catch (error) {
      console.warn('socket message parse failed:', error.message);
    }
  });

  io.on('connection', async (socket) => {
    try {
      const snapshot = await inventory.getSeatMap();
      socket.emit('seat', { type: 'snapshot', data: snapshot });
    } catch (error) {
      console.warn('socket snapshot failed:', error.message);
    }
  });

  return io;
}

module.exports = attachSocket;
