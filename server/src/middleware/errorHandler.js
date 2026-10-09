// Centralizes request error handling. Redis connectivity issues and stream write failures are mapped to 503,
// while unexpected errors stay as 500 without killing the process.
function isServiceUnavailable(error) {
  if (!error) return false;
  const message = String(error.message || '');
  return (
    error.code === 'ECONNRESET' ||
    /Redis|redis/i.test(message) ||
    /Stream isn't writeable|not writeable/i.test(message) ||
    /Connection.*closed|read ECONNRESET|connect ECONNREFUSED/i.test(message)
  );
}

function errorHandler(error, req, res, next) {
  if (res.headersSent) {
    return next(error);
  }

  if (isServiceUnavailable(error)) {
    return res.status(503).json({ error: 'SERVICE_UNAVAILABLE' });
  }

  console.error('Request error:', error);
  return res.status(500).json({ error: 'INTERNAL_ERROR' });
}

module.exports = errorHandler;
