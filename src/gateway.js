require('dotenv').config();

const express = require('express');
const jwt = require('jsonwebtoken');
const db = require('./config/database');
const { createProxyMiddleware } = require('http-proxy-middleware');
const authRoutes = require('./services/auth.routes');
const { policyEngine } = require('./middleware/policy-engine');

const app = express();

// Endpoint autentikasi
app.use('/auth', express.json(), authRoutes);

// Pencatatan audit Gateway
function writeGatewayAudit(req, subject, decision, reason) {
  try {
    db.prepare(`
      INSERT INTO audit_logs
        (event_time, subject, endpoint, device_id, decision, reason)
      VALUES
        (CURRENT_TIMESTAMP, ?, ?, ?, ?, ?)
    `).run(
      String(subject || 'unknown'),
      `${req.method} ${req.originalUrl}`,
      req.headers['x-device-id'] || null,
      decision,
      reason
    );
  } catch (error) {
    console.error('Gagal mencatat audit Gateway:', error.message);
  }
}

// Pemeriksaan Gateway
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'API Gateway',
    port: Number(process.env.PORT_GATEWAY || 3000)
  });
});

// Autentikasi pengguna dan pemeriksaan perangkat
function verifyUser(req, res, next) {
  const authorization = req.headers.authorization;
  const deviceId = req.headers['x-device-id'];

  if (!authorization || !authorization.startsWith('Bearer ')) {
    writeGatewayAudit(
      req,
      'unknown',
      'deny',
      'Token Bearer wajib disertakan'
    );

    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Token Bearer wajib disertakan'
    });
  }

  let user;

  try {
    user = jwt.verify(
      authorization.slice(7),
      process.env.JWT_SECRET
    );
  } catch (error) {
    writeGatewayAudit(
      req,
      'unknown',
      'deny',
      'Token tidak valid atau kedaluwarsa'
    );

    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Token tidak valid atau kedaluwarsa'
    });
  }

  const allowedRoles = ['admin', 'dosen', 'mahasiswa'];

  if (!allowedRoles.includes(user.role)) {
    writeGatewayAudit(
      req,
      user.sub,
      'deny',
      'Role pengguna tidak valid'
    );

    return res.status(403).json({
      error: 'Forbidden',
      message: 'Token bukan token pengguna'
    });
  }

  const registeredDevice = db.prepare(`
    SELECT id
    FROM devices
    WHERE user_id = ? AND device_id = ? AND active = 1
  `).get(Number(user.sub), deviceId);

  if (!registeredDevice) {
    writeGatewayAudit(
      req,
      user.sub,
      'deny',
      'Device tidak terdaftar'
    );

    return res.status(403).json({
      error: 'Forbidden',
      message: 'Device tidak terdaftar'
    });
  }

  req.user = user;
  next();
}

// Autentikasi khusus service-to-service
function verifyServiceToken(req, res, next) {
  const authorization = req.headers.authorization;

  if (!authorization || !authorization.startsWith('Bearer ')) {
    writeGatewayAudit(
      req,
      'unknown',
      'deny',
      'Service token wajib disertakan'
    );

    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Service token wajib disertakan'
    });
  }

  try {
    const service = jwt.verify(
      authorization.slice(7),
      process.env.JWT_SECRET
    );

    if (service.role !== 'service' || !service.service) {
      writeGatewayAudit(
        req,
        service.sub,
        'deny',
        'Token bukan token service'
      );

      return res.status(403).json({
        error: 'Forbidden',
        message: 'Token bukan token service'
      });
    }

    req.user = service;
    next();

  } catch (error) {
    writeGatewayAudit(
      req,
      'unknown',
      'deny',
      'Service token tidak valid atau kedaluwarsa'
    );

    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Service token tidak valid atau kedaluwarsa'
    });
  }
}

// Endpoint informasi pengguna
app.get('/me', verifyUser, (req, res) => {
  res.json({
    message: 'Autentikasi berhasil',
    user: req.user
  });
});

// Membuat konfigurasi proxy untuk setiap service
function createServiceProxy(port) {
  return createProxyMiddleware({
    target: `http://127.0.0.1:${Number(port)}`,
    changeOrigin: true,

    on: {
      proxyReq: (proxyReq, req) => {
        proxyReq.setHeader(
          'X-Gateway-Secret',
          process.env.GATEWAY_SECRET
        );

        if (req.headers.authorization) {
          proxyReq.setHeader(
            'Authorization',
            req.headers.authorization
          );
        }

        if (req.headers['x-device-id']) {
          proxyReq.setHeader(
            'X-Device-ID',
            req.headers['x-device-id']
          );
        }
      }
    }
  });
}

// Proxy Service Nilai
const nilaiProxy = createServiceProxy(
  process.env.PORT_NILAI || 3001
);

// Proxy Service Transkrip
const transkripProxy = createServiceProxy(
  process.env.PORT_TRANSKRIP || 3002
);

// Semua request Service Nilai wajib melalui
// autentikasi pengguna dan Policy Engine
app.use(
  '/nilai',
  verifyUser,
  policyEngine,
  (req, res, next) => {
    req.url = '/nilai' + (
      req.url === '/' ? '' : req.url
    );

    nilaiProxy(req, res, next);
  }
);

// Finalisasi kelas melalui Service Nilai
app.use(
  '/kelas',
  verifyUser,
  policyEngine,
  (req, res, next) => {
    req.url = '/kelas' + (
      req.url === '/' ? '' : req.url
    );

    nilaiProxy(req, res, next);
  }
);

// Service Nilai mengakses sinkronisasi Transkrip
// menggunakan service token, bukan token pengguna
app.use(
  '/transkrip/sinkron',
  verifyServiceToken,
  (req, res, next) => {
    req.url = '/transkrip/sinkron' + (
      req.url === '/' ? '' : req.url
    );

    transkripProxy(req, res, next);
  }
);

// Pengguna mengakses Transkrip menggunakan
// access token dan perangkat terdaftar
app.use(
  '/transkrip',
  verifyUser,
  (req, res, next) => {
    req.url = '/transkrip' + (
      req.url === '/' ? '' : req.url
    );

    transkripProxy(req, res, next);
  }
);

// Menjalankan Gateway
const port = Number(process.env.PORT_GATEWAY || 3000);

app.listen(port, () => {
  console.log(`API Gateway berjalan pada port ${port}`);
});