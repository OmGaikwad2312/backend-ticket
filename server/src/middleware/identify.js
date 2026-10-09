// Requires an x-user-id header on protected routes and attaches the canonical user id to the request.
function identify(req, res, next) {
  const userId = req.get('x-user-id');
  if (!userId) {
    return res.status(401).json({ error: 'UNAUTHORIZED' });
  }

  req.userId = userId;
  return next();
}

module.exports = identify;
