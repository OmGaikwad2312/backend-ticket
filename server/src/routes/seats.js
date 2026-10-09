// Seat view endpoint returns the live Redis-held inventory state for the event, plus aggregate counts.
const express = require('express');
const identify = require('../middleware/identify');
const inventory = require('../services/inventory');

const router = express.Router();

router.get('/', identify, async (req, res, next) => {
  try {
    const seatMap = await inventory.getSeatMap();
    return res.status(200).json(seatMap);
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
