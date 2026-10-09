// Express application assembly. The API never touches Postgres directly; all booking decisions remain in Redis.
const express = require('express');
const cors = require('cors');
const healthRouter = require('./routes/health');
const seatsRouter = require('./routes/seats');
const reserveRouter = require('./routes/reserve');
const payRouter = require('./routes/pay');
const bookRouter = require('./routes/book');
const errorHandler = require('./middleware/errorHandler');

const app = express();

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'x-user-id', 'Authorization'],
}));
app.options('*', cors());
app.use(express.json({ limit: '1mb' }));
app.use('/health', healthRouter);
app.use('/seats', seatsRouter);
app.use('/', reserveRouter);
app.use('/', payRouter);
app.use('/book', bookRouter);
app.use(errorHandler);

module.exports = app;
