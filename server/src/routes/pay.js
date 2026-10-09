// Payment flow endpoints: checkout creates a session, and pay handles the mock charge and finalize step.
const express = require('express');
const crypto = require('crypto');
const identify = require('../middleware/identify');
const rateLimit = require('../middleware/rateLimit');
const inventory = require('../services/inventory');
const payment = require('../services/payment');
const redis = require('../redis');
const config = require('../config');

const router = express.Router();
router.use(identify);
router.use(rateLimit);

router.post('/checkout', async (req, res, next) => {
  try {
    const { unit, bookingId } = req.body || {};
    if (!Number.isInteger(unit) || unit < 1 || unit > config.TOTAL_UNITS) {
      return res.status(400).json({ error: 'INVALID_UNIT' });
    }

    const finalBookingId = bookingId || crypto.randomUUID();
    const session = await payment.createSession(req.userId, Number(unit), finalBookingId);

    if (session.error === 'NO_HOLD') {
      return res.status(409).json({ reason: 'NO_HOLD' });
    }

    return res.status(200).json({ status: session.status || 'PENDING' });
  } catch (error) {
    return next(error);
  }
});

router.post('/pay', async (req, res, next) => {
  try {
    const { bookingId } = req.body || {};
    if (!bookingId) {
      return res.status(400).json({ error: 'INVALID_BOOKING_ID' });
    }

    const session = await redis.hgetall(config.payKey(bookingId));
    const result = await payment.pay(bookingId);

    if (result.status === 'FAILED') {
      const unit = Number(session.unit);
      const user = session.user;
      if (Number.isInteger(unit) && user) {
        await inventory.releaseSeat(unit, user);
      }
      return res.status(402).json({ ok: false, reason: 'PAYMENT_FAILED' });
    }

    if (result.status === 'PAID') {
      const unit = Number(session.unit);
      const user = session.user;
      const confirmStatus = await inventory.confirmSeat(unit, user, bookingId);

      if (confirmStatus === 'OK') {
        return res.status(200).json({ ok: true, status: 'BOOKED', bookingId, unit });
      }
      if (confirmStatus === 'SOLD') {
        return res.status(409).json({ ok: false, reason: 'SOLD' });
      }
      if (confirmStatus === 'EXPIRED') {
        await redis.hset(config.payKey(bookingId), 'status', 'REFUND');
        return res.status(410).json({ ok: false, reason: 'EXPIRED' });
      }
    }

    return res.status(200).json({ status: result.status || 'PENDING' });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
