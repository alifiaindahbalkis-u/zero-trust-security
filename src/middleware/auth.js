
const jwt = require('jsonwebtoken');

function authenticateToken(req, res, next) {
  const authorization = req.headers.authorization;

  if (!authorization || !authorization.startsWith('Bearer ')) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Token Bearer wajib disertakan'
    });
  }

  const token = authorization.slice(7);

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Tolak service token pada endpoint pengguna
    if (decoded.role === 'service') {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Service token tidak boleh digunakan sebagai token pengguna'
      });
    }

    // Pastikan role pengguna valid
    const allowedRoles = ['admin', 'dosen', 'mahasiswa'];

    if (!allowedRoles.includes(decoded.role)) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Role pengguna tidak valid'
      });
    }

    req.user = decoded;
    next();

  } catch (error) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Token tidak valid atau sudah kedaluwarsa'
    });
  }
}

// Middleware khusus komunikasi antar-service
function authenticateServiceToken(req, res, next) {
  const authorization = req.headers.authorization;

  if (!authorization || !authorization.startsWith('Bearer ')) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Service token wajib disertakan'
    });
  }

  try {
    const decoded = jwt.verify(
      authorization.slice(7),
      process.env.JWT_SECRET
    );

    if (decoded.role !== 'service' || !decoded.service) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Token bukan token service'
      });
    }

    req.user = decoded;
    next();

  } catch (error) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Service token tidak valid atau kedaluwarsa'
    });
  }
}

module.exports = {
  authenticateToken,
  authenticateServiceToken
};
