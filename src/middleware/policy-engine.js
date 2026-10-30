const db = require('../config/database');

// Fungsi pencatatan audit Policy Engine
function writePolicyAudit(req, decision, reason) {
  try {
    db.prepare(`
      INSERT INTO audit_logs
        (event_time, subject, endpoint, device_id, decision, reason)
      VALUES
        (CURRENT_TIMESTAMP, ?, ?, ?, ?, ?)
    `).run(
      String(req.user?.sub || 'unknown'),
      `${req.method} ${req.originalUrl}`,
      req.headers['x-device-id'] || null,
      decision,
      reason
    );
  } catch (error) {
    console.error('Gagal mencatat audit Policy Engine:', error.message);
  }
}

function policyEngine(req, res, next) {
  const role = req.user?.role;
  const method = req.method.toUpperCase();

  // Mengambil URL asli tanpa query string
  const requestPath = req.originalUrl.split('?')[0];

  // Aturan membaca data nilai
  if (method === 'GET') {
    const allowedRoles = ['mahasiswa', 'dosen', 'admin'];

    if (allowedRoles.includes(role)) {
      writePolicyAudit(
        req,
        'allow',
        'Role diizinkan membaca data nilai'
      );

      return next();
    }
  }

  // Identifikasi endpoint perubahan dan finalisasi
  const isUpdate = method === 'PUT';

  const isFinalization =
    method === 'POST' &&
    /^\/kelas\/\d+\/finalisasi\/?$/.test(requestPath);

  const isLegacyFinalization = method === 'PATCH';

  if (isUpdate || isFinalization || isLegacyFinalization) {

    // Hanya dosen yang boleh mengubah atau memfinalisasi nilai
    if (role !== 'dosen') {
      writePolicyAudit(
        req,
        'deny',
        'Hanya dosen yang boleh mengubah atau memfinalisasi nilai'
      );

      return res.status(403).json({
        error: 'Forbidden',
        message: 'Hanya dosen yang boleh mengubah atau memfinalisasi nilai'
      });
    }

    let classId;

    if (isFinalization) {
      // POST /kelas/:id/finalisasi
      classId = Number(requestPath.match(/^\/kelas\/(\d+)\/finalisasi\/?$/)?.[1]);

    } else if (
      isUpdate &&
      /^\/nilai\/\d+\/?$/.test(requestPath)
    ) {
      // PUT /nilai/:id
      // Mencari ID kelas berdasarkan ID data nilai
      const gradeId = Number(
        requestPath.match(/^\/nilai\/(\d+)\/?$/)?.[1]
      );

      const grade = db.prepare(`
        SELECT class_id
        FROM grades
        WHERE id = ?
      `).get(gradeId);

      classId = grade ? Number(grade.class_id) : null;

    } else {
      // Mendukung endpoint lama
      classId = Number(
        req.params?.classId ||
        req.query?.class_id ||
        req.body?.class_id
      );
    }

    // Validasi ID kelas
    if (!Number.isInteger(classId) || classId <= 0) {
      writePolicyAudit(
        req,
        'deny',
        'ID kelas tidak valid atau data nilai tidak ditemukan'
      );

      return res.status(400).json({
        error: 'Bad Request',
        message: 'ID kelas tidak valid atau data nilai tidak ditemukan'
      });
    }

    // Memastikan kelas diajar oleh dosen yang login
    const ownedClass = db.prepare(`
      SELECT id
      FROM classes
      WHERE id = ? AND dosen_id = ?
    `).get(classId, Number(req.user.sub));

    if (!ownedClass) {
      writePolicyAudit(
        req,
        'deny',
        'Dosen tidak memiliki akses ke kelas ini'
      );

      return res.status(403).json({
        error: 'Forbidden',
        message: 'Dosen tidak memiliki akses ke kelas ini'
      });
    }

    writePolicyAudit(
      req,
      'allow',
      'Dosen memiliki hak akses ke kelas'
    );

    return next();
  }

  // Metode HTTP atau role lainnya ditolak
  writePolicyAudit(
    req,
    'deny',
    'Policy Engine menolak akses'
  );

  return res.status(403).json({
    error: 'Forbidden',
    message: 'Policy Engine menolak akses',
    role: role || 'unknown',
    method
  });
}

module.exports = { policyEngine };