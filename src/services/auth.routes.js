
const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../config/database');

const {
  createAccessToken,
  createServiceToken,
  createRefreshToken,
  hashToken
} = require('../utils/tokens');

const router = express.Router();

function getDeviceId(req) {
  return req.headers['x-device-id'];
}

function writeAudit(req, subject, decision, reason) {
  db.prepare(`
    INSERT INTO audit_logs
      (subject, endpoint, device_id, decision, reason)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    subject || null,
    req.originalUrl,
    getDeviceId(req) || null,
    decision,
    reason
  );
}

function verifyRegisteredDevice(userId, deviceId) {
  if (!deviceId) return false;

  return Boolean(db.prepare(`
    SELECT id FROM devices
    WHERE user_id = ? AND device_id = ? AND active = 1
  `).get(userId, deviceId));
}

// LOGIN PENGGUNA
router.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  const deviceId = getDeviceId(req);

  const user = db.prepare(`
    SELECT * FROM users WHERE username = ?
  `).get(username);

  if (!user || !bcrypt.compareSync(password || '', user.password_hash)) {
    writeAudit(req, username, 'deny', 'Kredensial tidak valid');

    return res.status(401).json({
      error: 'Username atau password salah'
    });
  }

  if (!verifyRegisteredDevice(user.id, deviceId)) {
    writeAudit(req, user.username, 'deny', 'Device tidak terdaftar');

    return res.status(403).json({
      error: 'Device tidak terdaftar'
    });
  }

  const accessToken = createAccessToken(user);
  const refreshToken = createRefreshToken();

  const expiresAt = new Date(
    Date.now() + 24 * 60 * 60 * 1000
  ).toISOString();

  db.prepare(`
    INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
    VALUES (?, ?, ?)
  `).run(user.id, hashToken(refreshToken), expiresAt);

  writeAudit(req, user.username, 'allow', 'Login berhasil');

  return res.json({
    message: 'Login berhasil',
    accessToken,
    refreshToken,
    expiresIn: process.env.ACCESS_TOKEN_EXPIRES || '10m',
    user: {
      id: user.id,
      username: user.username,
      nama: user.nama,
      role: user.role,
      nim: user.nim
    }
  });
});

// REFRESH ACCESS TOKEN
router.post('/refresh', (req, res) => {
  const { refreshToken } = req.body || {};

  if (!refreshToken) {
    writeAudit(req, null, 'deny', 'Refresh token tidak diberikan');

    return res.status(401).json({
      error: 'Refresh token wajib diberikan'
    });
  }

  const tokenHash = hashToken(refreshToken);

  const storedToken = db.prepare(`
    SELECT rt.*, u.username, u.role, u.nim
    FROM refresh_tokens rt
    JOIN users u ON u.id = rt.user_id
    WHERE rt.token_hash = ?
      AND rt.revoked = 0
      AND rt.expires_at > ?
  `).get(tokenHash, new Date().toISOString());

  if (!storedToken) {
    writeAudit(req, null, 'deny', 'Refresh token tidak valid');

    return res.status(401).json({
      error: 'Refresh token tidak valid, kedaluwarsa, atau dicabut'
    });
  }

  const user = {
    id: storedToken.user_id,
    username: storedToken.username,
    role: storedToken.role,
    nim: storedToken.nim
  };

  const newAccessToken = createAccessToken(user);

  writeAudit(req, user.username, 'allow', 'Access token diperbarui');

  return res.json({
    accessToken: newAccessToken,
    expiresIn: process.env.ACCESS_TOKEN_EXPIRES || '10m'
  });
});

// LOGOUT DAN PENCABUTAN REFRESH TOKEN
router.post('/logout', (req, res) => {
  const { refreshToken } = req.body || {};

  if (!refreshToken) {
    writeAudit(req, null, 'deny', 'Refresh token tidak diberikan');

    return res.status(400).json({
      error: 'Refresh token wajib diberikan'
    });
  }

  const result = db.prepare(`
    UPDATE refresh_tokens
    SET revoked = 1
    WHERE token_hash = ? AND revoked = 0
  `).run(hashToken(refreshToken));

  if (result.changes === 0) {
    writeAudit(req, null, 'deny', 'Token tidak ditemukan atau sudah dicabut');

    return res.status(401).json({
      error: 'Refresh token tidak valid atau sudah dicabut'
    });
  }

  writeAudit(req, null, 'allow', 'Refresh token berhasil dicabut');

  return res.json({
    message: 'Logout berhasil, refresh token dicabut'
  });
});

// PENERBITAN SERVICE TOKEN
router.post('/service', (req, res) => {
  const { clientId, clientSecret } = req.body || {};

  const configuredClientId = process.env.SERVICE_CLIENT_ID;
  const configuredClientSecret = process.env.SERVICE_CLIENT_SECRET;

  if (
    !configuredClientId ||
    !configuredClientSecret ||
    clientId !== configuredClientId ||
    clientSecret !== configuredClientSecret
  ) {
    writeAudit(
      req,
      clientId || 'unknown',
      'deny',
      'Service client credentials tidak valid'
    );

    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Client ID atau Client Secret tidak valid'
    });
  }

  const serviceToken = createServiceToken();

  writeAudit(
    req,
    configuredClientId,
    'allow',
    'Service token berhasil diterbitkan'
  );

  return res.json({
    message: 'Service token berhasil diterbitkan',
    accessToken: serviceToken,
    tokenType: 'Bearer',
    expiresIn: process.env.SERVICE_TOKEN_EXPIRES || '5m'
  });
});

module.exports = router;
