
require('dotenv').config();

const express = require('express');
const db = require('../config/database');
const { verifyGatewaySecret } = require('../middleware/gateway-secret');
const {
  authenticateToken,
  authenticateServiceToken
} = require('../middleware/auth');

const app = express();

app.use(express.json());

// Fungsi pencatatan audit log
function writeAudit(req, subject, decision, reason) {
  try {
    db.prepare(`
      INSERT INTO audit_logs
        (subject, endpoint, device_id, decision, reason)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      subject ? String(subject) : 'unknown',
      `${req.method} ${req.originalUrl}`,
      req.headers['x-device-id'] || null,
      decision,
      reason
    );
  } catch (error) {
    console.error('Gagal mencatat audit log:', error.message);
  }
}

// Semua request wajib berasal dari Gateway
app.use(verifyGatewaySecret);

// Pemeriksaan kesehatan
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'Service Transkrip',
    port: Number(process.env.PORT_TRANSKRIP || 3002)
  });
});

// Mengambil transkrip berdasarkan NIM
app.get('/transkrip/:nim', authenticateToken, (req, res) => {
  const { nim } = req.params;
  const user = req.user;

  try {
    const mahasiswa = db.prepare(`
      SELECT id, nim, nama
      FROM users
      WHERE nim = ? AND role = 'mahasiswa'
    `).get(nim);

    if (!mahasiswa) {
      writeAudit(req, user.username || user.sub, 'deny',
        'Mahasiswa tidak ditemukan');

      return res.status(404).json({
        error: 'Not Found',
        message: 'Mahasiswa tidak ditemukan'
      });
    }

    if (user.role === 'mahasiswa' &&
        Number(user.sub) !== mahasiswa.id) {
      writeAudit(req, user.username || user.sub, 'deny',
        'Mahasiswa mencoba mengakses transkrip orang lain');

      return res.status(403).json({
        error: 'Forbidden',
        message: 'Mahasiswa hanya boleh melihat transkrip miliknya'
      });
    }

    if (!['mahasiswa', 'admin'].includes(user.role)) {
      writeAudit(req, user.username || user.sub, 'deny',
        'Role tidak memiliki akses ke transkrip');

      return res.status(403).json({
        error: 'Forbidden',
        message: 'Role tidak memiliki akses ke transkrip'
      });
    }

    const rows = db.prepare(`
      SELECT
        c.kode AS kode_kelas,
        c.nama AS nama_kelas,
        t.nilai,
        t.synced_at
      FROM transcripts AS t
      JOIN classes AS c ON c.id = t.class_id
      WHERE t.mahasiswa_id = ?
      ORDER BY c.kode
    `).all(mahasiswa.id);

    writeAudit(req, user.username || user.sub, 'allow',
      'Transkrip berhasil diakses');

    return res.status(200).json({
      message: 'Transkrip berhasil diambil',
      mahasiswa: {
        nim: mahasiswa.nim,
        nama: mahasiswa.nama
      },
      data: rows
    });

  } catch (error) {
    console.error('Gagal mengambil transkrip:', error.message);

    writeAudit(req, user.username || user.sub, 'deny',
      'Kesalahan internal saat mengambil transkrip');

    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Terjadi kesalahan saat mengambil transkrip'
    });
  }
});

// Sinkronisasi nilai final dari Service Nilai
app.post(
  '/transkrip/sinkron',
  authenticateServiceToken,
  (req, res) => {
    const { class_id } = req.body;
    const user = req.user;

    if (!Number.isInteger(Number(class_id)) || Number(class_id) <= 0) {
      writeAudit(req, user.sub, 'deny',
        'class_id tidak valid');

      return res.status(400).json({
        error: 'Bad Request',
        message: 'class_id wajib diisi dengan benar'
      });
    }

    try {
      const result = db.transaction(() => {
        const finalGrades = db.prepare(`
          SELECT mahasiswa_id, class_id, nilai
          FROM grades
          WHERE class_id = ? AND final = 1
        `).all(Number(class_id));

        if (finalGrades.length === 0) {
          return {
            error: 'Belum ada nilai final untuk kelas ini',
            status: 404
          };
        }

        const upsert = db.prepare(`
          INSERT INTO transcripts
            (mahasiswa_id, class_id, nilai, synced_at)
          VALUES (?, ?, ?, CURRENT_TIMESTAMP)
          ON CONFLICT(mahasiswa_id, class_id)
          DO UPDATE SET
            nilai = excluded.nilai,
            synced_at = CURRENT_TIMESTAMP
        `);

        for (const grade of finalGrades) {
          upsert.run(
            grade.mahasiswa_id,
            grade.class_id,
            grade.nilai
          );
        }

        return {
          success: true,
          jumlah: finalGrades.length
        };
      })();

      if (result.error) {
        writeAudit(req, user.sub, 'deny', result.error);

        return res.status(result.status).json({
          error: 'Not Found',
          message: result.error
        });
      }

      writeAudit(req, user.sub, 'allow',
        'Sinkronisasi transkrip berhasil');

      return res.status(200).json({
        message: 'Sinkronisasi transkrip berhasil',
        class_id: Number(class_id),
        jumlah_data_disinkronkan: result.jumlah
      });

    } catch (error) {
      console.error('Gagal sinkronisasi transkrip:', error.message);

      writeAudit(req, user.sub, 'deny',
        'Kesalahan internal saat sinkronisasi transkrip');

      return res.status(500).json({
        error: 'Internal Server Error',
        message: 'Terjadi kesalahan saat sinkronisasi transkrip'
      });
    }
  }
);

const PORT = Number(process.env.PORT_TRANSKRIP || 3002);

app.listen(PORT, () => {
  console.log(`Service Transkrip berjalan pada port ${PORT}`);
});
