const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { isValidSecret } = require('../../services/domain-rules');
const { isEntityId } = require('../../services/entity-ids');

const jwtSecret = process.env.JWT_SECRET;

function getTokenFromRequest(req) {
  const header = req.headers.authorization || '';
  const match = header.match(/^Bearer\s+(\S+)$/i);
  return match ? match[1] : null;
}

function requireAuth(redis) {
  return async (req, res, next) => {
    const token = getTokenFromRequest(req);
    if (!token) return res.status(401).json({ success: false, message: 'Missing token' });
    if (!isValidSecret(jwtSecret)) {
      return res.status(503).json({ success: false, message: 'Authentication is not configured' });
    }

    let payload;
    try {
      payload = jwt.verify(token, jwtSecret, {
        algorithms: ['HS256'],
        issuer: 'cab-auth',
      });
      const kind = { ADMIN: 'admin', CUSTOMER: 'customer', DRIVER: 'driver' }[payload.role];
      if (!isEntityId(kind,payload.sub)) throw new Error('Invalid user ID; log in again');
    } catch {
      return res.status(401).json({ success: false, message: 'Invalid or expired token' });
    }
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    try {
      if (await redis.exists(`cab:revoked:${tokenHash}`)) {
        return res.status(401).json({ success: false, message: 'Token has been revoked' });
      }
      req.user = payload;
      req.token = token;
      req.tokenHash = tokenHash;
      return next();
    } catch (error) {
      console.error('Token revocation check failed:', error.message);
      return res.status(503).json({ success: false, message: 'Authentication service temporarily unavailable' });
    }
  };
}

function authorize(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ success: false, message: 'Unauthorized' });
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    return next();
  };
}

module.exports = { getTokenFromRequest, requireAuth, authorize };
