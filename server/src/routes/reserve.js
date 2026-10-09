// Hold and release endpoints. Both accept a user id from the x-user-id header and make inventory state
// decisions atomically inside Redis Lua.
const express = require('express');
const identify = require('../middleware/identify');
const validate = require('../middleware/validate');
const rateLimit = require('../middleware/rateLimit');
const inventory = require('../services/inventory');
const config = require('../config');

const router = express.Router();
router.use(identify);
router.use(rateLimit);

router.post('/hold', validate, async (req, res, next) => {
  try {
    const { unit } = req.body;
    const status = await inventory.holdSeat(unit, req.userId);

    if (status === 'OK') {
      return res.status(200).json({ ok: true, unit, expiresInMs: config.HOLD_TTL_MS });
    }
    if (status === 'HELD') {
      return res.status(409).json({ ok: false, reason: 'HELD' });
    }
    if (status === 'SOLD') {
      return res.status(409).json({ ok: false, reason: 'SOLD' });
    }

    return res.status(200).json({ ok: true, unit, expiresInMs: config.HOLD_TTL_MS });
  } catch (error) {
    return next(error);
  }
});

router.post('/release', validate, async (req, res, next) => {
  try {
    const { unit } = req.body;
    const released = await inventory.releaseSeat(unit, req.userId);
    return res.status(200).json({ released });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
