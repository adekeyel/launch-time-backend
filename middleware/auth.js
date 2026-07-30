const { verifyAccessToken } = require('../utils/jwt');
const { ApiError } = require('../utils/response');
const { query } = require('../config/db');

/**
 * Verifies the Bearer access token and attaches a trimmed user object to
 * req.user. Also re-checks is_active from the DB so a deactivated account
 * is rejected immediately, even if its token hasn't expired yet.
 */
const authenticate = async (req, res, next) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    throw new ApiError(401, 'Authentication required. Please log in.');
  }

  let decoded;
  try {
    decoded = verifyAccessToken(token);
  } catch (err) {
    throw new ApiError(401, 'Invalid or expired token. Please log in again.');
  }

  const { rows } = await query(
    'SELECT id, fullname, email, role, is_active FROM users WHERE id = $1',
    [decoded.sub]
  );
  const user = rows[0];

  if (!user || !user.is_active) {
    throw new ApiError(401, 'Account not found or has been deactivated.');
  }

  req.user = user;
  next();
};

/**
 * Restricts access to one or more roles, e.g. authorize('vendor', 'admin').
 */
const authorize =
  (...allowedRoles) =>
  (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      throw new ApiError(403, 'You do not have permission to perform this action.');
    }
    next();
  };

module.exports = { authenticate, authorize };
