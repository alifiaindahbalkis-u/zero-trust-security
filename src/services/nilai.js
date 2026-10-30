
require('dotenv').config();

const express = require('express');
const db = require('../config/database');
const { verifyGatewaySecret } = require('../middleware/gateway-secret');
const { authenticateToken } = require('../middleware/auth');

const app = express();

app.use(express.json());

// Service hanya menerima request dari Gateway
app.use(verifyGatewaySecret);

// Service memverifikasi token pengguna kembali
app.use(authenticateToken);

// Mencatat aktivitas pada audit log
function writeAudit(req, decision, reason) {
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
        console.error('Gagal mencatat audit:', error.message);
    }
}

// Memeriksa jam akses
function isWithinAccessHours() {
    const start = Number(process.env.ACCESS_START_HOUR ?? 7);
    const end = Number(process.env.ACCESS_END_HOUR ?? 21);
    const hour = new Date().getHours();

    return hour >= start && hour < end;
}

// Format respons penolakan
function deny(req, res, status, message) {
    writeAudit(req, 'deny', message);

    const error =
        status === 401 ? 'Unauthorized' :
        status === 403 ? 'Forbidden' :
        status === 404 ? 'Not Found' :
        status === 409 ? 'Conflict' :
        status === 500 ? 'Internal Server Error' :
        'Bad Request';

    return res.status(status).json({
        error,
        message
    });
}

// Meminta service token melalui API Gateway
async function getServiceToken() {
    const gatewayPort = Number(
        process.env.PORT_GATEWAY || 3000
    );

    const response = await fetch(
        `http://127.0.0.1:${gatewayPort}/auth/service`,
        {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                clientId: process.env.SERVICE_CLIENT_ID,
                clientSecret: process.env.SERVICE_CLIENT_SECRET
            })
        }
    );

    const result = await response.json();

    const token =
        result.accessToken ||
        result.serviceToken ||
        result.token;

    if (!response.ok || !token) {
        throw new Error(
            result.message || 'Gagal mendapatkan service token'
        );
    }

    return token;
}

// Mengirim nilai final ke Service Transkrip melalui Gateway
async function syncTranscript(classId) {
    const gatewayPort = Number(
        process.env.PORT_GATEWAY || 3000
    );

    const serviceToken = await getServiceToken();

    const response = await fetch(
        `http://127.0.0.1:${gatewayPort}/transkrip/sinkron`,
        {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${serviceToken}`
            },
            body: JSON.stringify({
                class_id: classId
            })
        }
    );

    const result = await response.json();

    if (!response.ok) {
        throw new Error(
            result.message || 'Sinkronisasi transkrip gagal'
        );
    }

    return result;
}

// Pemeriksaan status Service Nilai
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        service: 'Service Nilai',
        port: Number(process.env.PORT_NILAI || 3001)
    });
});

// Mengambil data nilai sesuai role pengguna
app.get(['/nilai', '/nilai/'], (req, res) => {
    const user = req.user;

    try {
        let rows;

        if (user.role === 'mahasiswa') {
            rows = db.prepare(`
                SELECT
                    g.id,
                    g.class_id,
                    u.nim,
                    u.nama AS mahasiswa,
                    c.kode AS kode_kelas,
                    c.nama AS kelas,
                    g.nilai,
                    g.final,
                    g.updated_at
                FROM grades AS g
                JOIN users AS u ON u.id = g.mahasiswa_id
                JOIN classes AS c ON c.id = g.class_id
                WHERE g.mahasiswa_id = ?
            `).all(Number(user.sub));

        } else if (user.role === 'dosen') {
            rows = db.prepare(`
                SELECT
                    g.id,
                    g.class_id,
                    u.nim,
                    u.nama AS mahasiswa,
                    c.kode AS kode_kelas,
                    c.nama AS kelas,
                    g.nilai,
                    g.final,
                    g.updated_at
                FROM grades AS g
                JOIN users AS u ON u.id = g.mahasiswa_id
                JOIN classes AS c ON c.id = g.class_id
                WHERE c.dosen_id = ?
            `).all(Number(user.sub));

        } else {
            return deny(
                req,
                res,
                403,
                'Role tidak memiliki akses ke data nilai'
            );
        }

        writeAudit(req, 'allow', 'Membaca data nilai');

        return res.status(200).json({
            message: 'Data nilai berhasil diambil',
            data: rows
        });

    } catch (error) {
        console.error('Gagal mengambil data nilai:', error.message);

        return deny(
            req,
            res,
            500,
            'Terjadi kesalahan pada Service Nilai'
        );
    }
});

// Mengubah nilai seorang mahasiswa
// Endpoint baru: PUT /nilai/:id
// Endpoint lama tetap didukung: PUT /nilai?class_id=...
app.put(['/nilai/:id', '/nilai', '/nilai/'], (req, res) => {
    const user = req.user;

    if (user.role !== 'dosen') {
        return deny(
            req,
            res,
            403,
            'Hanya dosen yang boleh mengubah nilai'
        );
    }

    const gradeId = req.params.id
        ? Number(req.params.id)
        : null;

    const nilai = req.body.nilai;

    if (
        typeof nilai !== 'number' ||
        !Number.isFinite(nilai) ||
        nilai < 0 ||
        nilai > 100
    ) {
        return deny(
            req,
            res,
            400,
            'Nilai harus berupa angka antara 0–100'
        );
    }

    if (
        gradeId !== null &&
        (!Number.isInteger(gradeId) || gradeId <= 0)
    ) {
        return deny(req, res, 400, 'ID nilai tidak valid');
    }

    if (!isWithinAccessHours()) {
        return deny(
            req,
            res,
            403,
            'Perubahan nilai hanya diizinkan pukul 07.00–21.00'
        );
    }

    try {
        const result = db.transaction(() => {
            let grade;

            if (gradeId !== null) {
                grade = db.prepare(`
                    SELECT id, class_id, mahasiswa_id, final
                    FROM grades
                    WHERE id = ?
                `).get(gradeId);

            } else {
                const classId = Number(
                    req.query.class_id ?? req.body.class_id
                );

                const mahasiswaId = Number(
                    req.body.mahasiswa_id
                );

                if (
                    !Number.isInteger(classId) || classId <= 0 ||
                    !Number.isInteger(mahasiswaId) || mahasiswaId <= 0
                ) {
                    return {
                        error: 'class_id dan mahasiswa_id wajib diisi dengan benar',
                        status: 400
                    };
                }

                grade = db.prepare(`
                    SELECT id, class_id, mahasiswa_id, final
                    FROM grades
                    WHERE class_id = ? AND mahasiswa_id = ?
                `).get(classId, mahasiswaId);
            }

            if (!grade) {
                return {
                    error: 'Data nilai mahasiswa tidak ditemukan',
                    status: 404
                };
            }

            const ownedClass = db.prepare(`
                SELECT id
                FROM classes
                WHERE id = ? AND dosen_id = ?
            `).get(grade.class_id, Number(user.sub));

            if (!ownedClass) {
                return {
                    error: 'Dosen tidak mengampu kelas ini',
                    status: 403
                };
            }

            if (grade.final === 1) {
                return {
                    error: 'Nilai sudah difinalisasi dan tidak dapat diubah',
                    status: 409
                };
            }

            db.prepare(`
                UPDATE grades
                SET nilai = ?, updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `).run(nilai, grade.id);

            return {
                success: true,
                gradeId: grade.id,
                classId: grade.class_id,
                mahasiswaId: grade.mahasiswa_id
            };
        })();

        if (result.error) {
            return deny(req, res, result.status, result.error);
        }

        writeAudit(req, 'allow', 'Nilai mahasiswa berhasil diubah');

        return res.status(200).json({
            message: 'Nilai berhasil diperbarui',
            id: result.gradeId,
            class_id: result.classId,
            mahasiswa_id: result.mahasiswaId,
            nilai
        });

    } catch (error) {
        console.error('Gagal mengubah nilai:', error.message);

        return deny(
            req,
            res,
            500,
            'Terjadi kesalahan saat mengubah nilai'
        );
    }
});

// Memfinalisasi seluruh nilai dan sinkronisasi transkrip
// Endpoint baru: POST /kelas/:id/finalisasi
// Endpoint lama: PATCH /nilai/finalisasi
app.post('/kelas/:id/finalisasi', finalizeClass);
app.patch('/nilai/finalisasi', finalizeClass);

async function finalizeClass(req, res) {
    const user = req.user;

    const classId = Number(
        req.params.id ??
        req.query.class_id ??
        req.body.class_id
    );

    if (user.role !== 'dosen') {
        return deny(
            req,
            res,
            403,
            'Hanya dosen yang boleh memfinalisasi nilai'
        );
    }

    if (!Number.isInteger(classId) || classId <= 0) {
        return deny(
            req,
            res,
            400,
            'ID kelas wajib diisi dengan benar'
        );
    }

    if (!isWithinAccessHours()) {
        return deny(
            req,
            res,
            403,
            'Finalisasi hanya diizinkan pukul 07.00–21.00'
        );
    }

    try {
        const result = db.transaction(() => {
            const ownedClass = db.prepare(`
                SELECT id
                FROM classes
                WHERE id = ? AND dosen_id = ?
            `).get(classId, Number(user.sub));

            if (!ownedClass) {
                return {
                    error: 'Dosen tidak mengampu kelas ini',
                    status: 403
                };
            }

            const grades = db.prepare(`
                SELECT id, final
                FROM grades
                WHERE class_id = ?
            `).all(classId);

            if (grades.length === 0) {
                return {
                    error: 'Belum ada data nilai dalam kelas ini',
                    status: 404
                };
            }

            const finalizedCount = grades.filter(
                grade => grade.final === 1
            ).length;

            if (
                finalizedCount > 0 &&
                finalizedCount < grades.length
            ) {
                return {
                    error: 'Sebagian nilai sudah difinalisasi. Periksa data kelas.',
                    status: 409
                };
            }

            if (finalizedCount === 0) {
                db.prepare(`
                    UPDATE grades
                    SET final = 1, updated_at = CURRENT_TIMESTAMP
                    WHERE class_id = ?
                `).run(classId);
            }

            return {
                success: true,
                jumlah: grades.length,
                sudahFinal: finalizedCount === grades.length
            };
        })();

        if (result.error) {
            return deny(req, res, result.status, result.error);
        }

        // Sinkronisasi setelah finalisasi berhasil
        try {
            const syncResult = await syncTranscript(classId);

            writeAudit(
                req,
                'allow',
                'Nilai difinalisasi dan transkrip berhasil disinkronkan'
            );

            return res.status(200).json({
                message: 'Nilai berhasil difinalisasi dan disinkronkan',
                class_id: classId,
                jumlah_nilai_difinalisasi: result.jumlah,
                status_finalisasi: result.sudahFinal
                    ? 'Sudah difinalisasi sebelumnya'
                    : 'Baru difinalisasi',
                sinkronisasi: syncResult
            });

        } catch (error) {
            console.error(
                'Sinkronisasi transkrip gagal:',
                error.message
            );

            writeAudit(
                req,
                'deny',
                'Finalisasi berhasil tetapi sinkronisasi transkrip gagal'
            );

            return res.status(502).json({
                error: 'Bad Gateway',
                message: 'Nilai sudah difinalisasi, tetapi sinkronisasi transkrip gagal',
                detail: error.message,
                class_id: classId
            });
        }

    } catch (error) {
        console.error('Gagal memfinalisasi nilai:', error.message);

        return deny(
            req,
            res,
            500,
            'Terjadi kesalahan saat finalisasi nilai'
        );
    }
}

// Menjalankan Service Nilai
const PORT = Number(process.env.PORT_NILAI || 3001);

app.listen(PORT, () => {
    console.log(`Service Nilai berjalan pada port ${PORT}`);
});
