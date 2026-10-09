// Validates seat numbers against the configured inventory bounds before any booking logic runs.
const config = require('../config');

function validateUnit(req, res, next) {
  const unit = Number(req.body && req.body.unit);

  if (!Number.isInteger(unit) || unit < 1 || unit > config.TOTAL_UNITS) {
    return res.status(400).json({ error: 'INVALID_UNIT' });
  }

  req.body.unit = unit;
  return next();
}

module.exports = validateUnit;
