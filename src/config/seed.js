
const bcrypt = require('bcryptjs');
const db = require('./database');

const seed = db.transaction(() => {
  // Bersihkan data awal sebelumnya agar seed bisa dijalankan ulang.
  db.exec(`
    DELETE FROM audit_logs;
    DELETE FROM refresh_tokens;
    DELETE FROM transcripts;
    DELETE FROM grades;
    DELETE FROM enrollments;
    DELETE FROM classes;
    DELETE FROM devices;
    DELETE FROM users;
  `);

  const insertUser = db.prepare(`
    INSERT INTO users (username, password_hash, role, nama, nim)
    VALUES (?, ?, ?, ?, ?)
  `);

  const insertDevice = db.prepare(`
    INSERT INTO devices (user_id, device_id, device_name)
    VALUES (?, ?, ?)
  `);

  const accounts = [
    {
      username: 'admin',
      password: 'Admin123!',
      role: 'admin',
      nama: 'Administrator Sistem',
      nim: null,
      device: 'DEV-ADMIN-001'
    },
    {
      username: 'dosen1',
      password: 'Dosen123!',
      role: 'dosen',
      nama: 'Dosen Informatika 1',
      nim: null,
      device: 'DEV-DOSEN-001'
    },
    {
      username: 'dosen2',
      password: 'Dosen123!',
      role: 'dosen',
      nama: 'Dosen Informatika 2',
      nim: null,
      device: 'DEV-DOSEN-002'
    },
    {
      username: 'mahasiswa1',
      password: 'Mhs123!',
      role: 'mahasiswa',
      nama: 'Mahasiswa 1',
      nim: '247006111101',
      device: 'DEV-MHS-001'
    },
    {
      username: 'mahasiswa2',
      password: 'Mhs123!',
      role: 'mahasiswa',
      nama: 'Mahasiswa 2',
      nim: '247006111102',
      device: 'DEV-MHS-002'
    },
    {
      username: 'mahasiswa3',
      password: 'Mhs123!',
      role: 'mahasiswa',
      nama: 'Mahasiswa 3',
      nim: '247006111103',
      device: 'DEV-MHS-003'
    }
  ];

  const userIds = {};

  for (const account of accounts) {
    const passwordHash = bcrypt.hashSync(account.password, 10);

    const result = insertUser.run(
      account.username,
      passwordHash,
      account.role,
      account.nama,
      account.nim
    );

    userIds[account.username] = Number(result.lastInsertRowid);

    insertDevice.run(
      userIds[account.username],
      account.device,
      'Perangkat terdaftar ' + account.username
    );
  }

  const insertClass = db.prepare(`
    INSERT INTO classes (kode, nama, dosen_id)
    VALUES (?, ?, ?)
  `);

  const class1 = insertClass.run(
    'IF101',
    'Pemrograman Dasar',
    userIds.dosen1
  ).lastInsertRowid;

  const class2 = insertClass.run(
    'IF102',
    'Keamanan Informasi',
    userIds.dosen2
  ).lastInsertRowid;

  const insertEnrollment = db.prepare(`
    INSERT INTO enrollments (class_id, mahasiswa_id)
    VALUES (?, ?)
  `);

  const insertGrade = db.prepare(`
    INSERT INTO grades (class_id, mahasiswa_id, nilai, final)
    VALUES (?, ?, ?, 0)
  `);

  const students = [
    { username: 'mahasiswa1', grade1: 85, grade2: 90 },
    { username: 'mahasiswa2', grade1: 78, grade2: 82 },
    { username: 'mahasiswa3', grade1: 92, grade2: 88 }
  ];

  for (const student of students) {
    const studentId = userIds[student.username];

    insertEnrollment.run(class1, studentId);
    insertEnrollment.run(class2, studentId);

    insertGrade.run(class1, studentId, student.grade1);
    insertGrade.run(class2, studentId, student.grade2);
  }
});

try {
  seed();

  console.log('Seed berhasil dijalankan!\n');

  console.log('Akun pengujian:');
  console.table(
    db.prepare(`
      SELECT username, role, nim
      FROM users
      ORDER BY id
    `).all()
  );

  console.log('Jumlah device:', db.prepare(
    'SELECT COUNT(*) AS total FROM devices'
  ).get().total);

  console.log('Jumlah kelas:', db.prepare(
    'SELECT COUNT(*) AS total FROM classes'
  ).get().total);

  console.log('Jumlah data nilai:', db.prepare(
    'SELECT COUNT(*) AS total FROM grades'
  ).get().total);

} catch (error) {
  console.error('Seed gagal:', error.message);
  process.exitCode = 1;
} finally {
  db.close();
}
