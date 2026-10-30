
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

function createAccessToken(user) {
  return jwt.sign(
    {
      sub: String(user.id),
      role: user.role,
      username: user.username,
      nim: user.nim || null
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.ACCESS_TOKEN_EXPIRES || '10m' }
  );
}

function createServiceToken() {
  return jwt.sign(
    {
      sub: process.env.SERVICE_CLIENT_ID || 'nilai-service',
      role: 'service',
      service: 'nilai'
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.SERVICE_TOKEN_EXPIRES || '5m' }
  );
}

function createRefreshToken() {
  return crypto.randomBytes(48).toString('hex');
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

module.exports = {
  createAccessToken,
  createServiceToken,
  createRefreshToken,
  hashToken
};
