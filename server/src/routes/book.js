// Convenience endpoint used by the load test. It performs the hold -> checkout/pay -> confirm/release flow
// in a single request while keeping the same external response semantics as the underlying routes.
const express = require('express');
const crypto = require('crypto');
const identify = require('../middleware/identify');
const validate = require('../middleware/validate');
const rateLimit = require('../middleware/rateLimit');
const inventory = require('../services/inventory');
const payment = require('../services/payment');

const router = express.Router();
router.use(identify);
router.use(rateLimit);

router.post('/', validate, async (req, res, next) => {
  try {
    const { unit, bookingId } = req.body || {};
    const finalBookingId = bookingId || crypto.randomUUID();

    const holdStatus = await inventory.holdSeat(unit, req.userId);
    if (holdStatus === 'SOLD') {
      return res.status(409).json({ reason: 'SOLD' });
    }
    if (holdStatus === 'HELD') {
      return res.status(409).json({ reason: 'HELD' });
    }

    const session = await payment.createSession(req.userId, unit, finalBookingId);
    if (session.error === 'NO_HOLD') {
      return res.status(409).json({ reason: 'NO_HOLD' });
    }

    const payResult = await payment.pay(finalBookingId);
    if (payResult.status === 'FAILED') {
      return res.status(402).json({ ok: false, reason: 'PAYMENT_FAILED' });
    }

    if (payResult.status === 'PAID') {
      const confirmStatus = await inventory.confirmSeat(unit, req.userId, finalBookingId);
      if (confirmStatus === 'OK') {
        return res.status(200).json({ ok: true, status: 'BOOKED', bookingId: finalBookingId, unit });
      }
      if (confirmStatus === 'SOLD') {
        return res.status(409).json({ ok: false, reason: 'SOLD' });
      }
      if (confirmStatus === 'EXPIRED') {
        return res.status(410).json({ ok: false, reason: 'EXPIRED' });
      }
    }

    return res.status(200).json({ status: payResult.status || 'PENDING' });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
