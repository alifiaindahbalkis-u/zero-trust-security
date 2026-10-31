
# Zero Trust Security System

## Deskripsi

**Zero Trust Security System** adalah implementasi konsep keamanan **Zero Trust Architecture** pada sistem berbasis microservices.

Sistem ini menggunakan prinsip:

> **Never Trust, Always Verify**

Setiap request tidak langsung dipercaya, meskipun berasal dari pengguna atau service yang sebelumnya telah terautentikasi. Sistem akan melakukan verifikasi terhadap identitas pengguna, perangkat, role, hak akses, dan policy sebelum memberikan akses ke resource.

Studi kasus yang digunakan adalah sistem akademik sederhana yang terdiri dari autentikasi pengguna, pengelolaan nilai, dan transkrip mahasiswa.

---

## Fitur Utama

### 1. JWT Authentication

Sistem menggunakan JSON Web Token atau JWT untuk melakukan autentikasi pengguna.

Token digunakan untuk memastikan bahwa pengguna yang mengakses sistem telah berhasil melakukan proses autentikasi.

---

### 2. Device Verification

Selain token, sistem juga memeriksa perangkat pengguna menggunakan header:

```text
X-Device-ID
```

Pengguna hanya dapat mengakses resource apabila perangkat yang digunakan telah terdaftar dan aktif.

---

### 3. Role-Based Access Control

Sistem memiliki beberapa role pengguna, yaitu:

- **Mahasiswa**
- **Dosen**
- **Admin**

Setiap role memiliki hak akses yang berbeda.

Contohnya:

- Mahasiswa dapat melihat data yang diizinkan untuk mahasiswa.
- Dosen dapat mengelola nilai sesuai kelas yang menjadi tanggung jawabnya.
- Admin memiliki akses administratif sesuai policy sistem.

---

### 4. Policy Engine

Setiap request yang masuk ke Service Nilai akan diperiksa oleh **Policy Engine**.

Policy Engine memastikan:

- Role pengguna memiliki izin.
- Dosen hanya dapat mengakses kelas miliknya.
- Mahasiswa tidak dapat mengubah nilai.
- Perubahan nilai mengikuti aturan keamanan dan bisnis yang berlaku.

---

### 5. Service-to-Service Authentication

Komunikasi antarservice menggunakan **service token** khusus.

Token service berbeda dengan token pengguna.

Dengan mekanisme ini, pengguna biasa tidak dapat menggunakan token pengguna untuk mengakses endpoint internal yang hanya ditujukan untuk komunikasi antarservice.

---

### 6. API Gateway

API Gateway berfungsi sebagai pintu masuk utama sistem.

Gateway menangani:

- Verifikasi JWT.
- Verifikasi perangkat.
- Pemeriksaan role pengguna.
- Policy Engine.
- Routing request ke service yang sesuai.
- Penerusan request antarservice.

---

### 7. Audit Logging

Aktivitas penting dalam sistem dicatat ke dalam **audit log**.

Audit log mencatat informasi seperti:

- Waktu aktivitas.
- Pengguna atau subject.
- Endpoint.
- Device ID.
- Keputusan akses.
- Alasan request diizinkan atau ditolak.

Keputusan akses dapat berupa:

```text
allow
deny
```

---

## Arsitektur Sistem

```text
                         CLIENT
                           |
                           v
                    +--------------+
                    | API GATEWAY  |
                    |   Port 3000  |
                    +--------------+
                     |     |     |
                     |     |     |
              Authentication  Policy
                     |       Engine
                     |         |
                     v         v
              +--------------------+
              | Device Verification|
              +--------------------+
                     |
             +-------+-------+
             |               |
             v               v
      +-------------+  +-------------+
      | Service     |  | Service     |
      | Nilai       |  | Transkrip   |
      | Port 3001   |  | Port 3002   |
      +-------------+  +-------------+
             |
             | Service Token
             +-------------------->
```

---

## Struktur Project

```text
zero-trust-security/
│
├── data/
│
├── src/
│   ├── config/
│   │   ├── database.js
│   │   └── seed.js
│   │
│   ├── middleware/
│   │   ├── auth.js
│   │   ├── gateway-secret.js
│   │   └── policy-engine.js
│   │
│   ├── services/
│   │   ├── auth.routes.js
│   │   ├── nilai.js
│   │   └── transkrip.js
│   │
│   ├── utils/
│   │   ├── policy.js
│   │   └── tokens.js
│   │
│   └── gateway.js
│
├── cek-audit.js
├── package.json
├── package-lock.json
└── README.md
```

---

# Teknologi yang Digunakan

Project ini menggunakan:

- Node.js
- Express.js
- SQLite
- better-sqlite3
- JSON Web Token
- bcryptjs
- http-proxy-middleware
- dotenv

---

# Instalasi

Clone repository:

```bash
git clone https://github.com/alifiaindahbalkis-u/zero-trust-security.git
```

Masuk ke folder project:

```bash
cd zero-trust-security
```

Install dependency:

```bash
npm install
```

---

# Menjalankan Sistem

Sistem terdiri dari tiga service utama.

## 1. Menjalankan Service Nilai

```bash
npm run start:nilai
```

Service Nilai berjalan pada:

```text
http://localhost:3001
```

---

## 2. Menjalankan Service Transkrip

Buka terminal baru, kemudian jalankan:

```bash
npm run start:transkrip
```

Service Transkrip berjalan pada:

```text
http://localhost:3002
```

---

## 3. Menjalankan API Gateway

Buka terminal baru, kemudian jalankan:

```bash
npm run start:gateway
```

API Gateway berjalan pada:

```text
http://localhost:3000
```

---

# Alur Keamanan Sistem

Setiap request pengguna melalui proses berikut:

```text
User Request
     |
     v
API Gateway
     |
     v
JWT Verification
     |
     v
Device Verification
     |
     v
Role Verification
     |
     v
Policy Engine
     |
     v
Service
     |
     v
Audit Log
```

Apabila salah satu proses verifikasi gagal, request akan ditolak.

---

# Contoh Pengujian

## 1. Login Pengguna

Endpoint:

```text
POST /auth/login
```

Pengguna melakukan login menggunakan kredensial yang valid.

Apabila berhasil, sistem menghasilkan access token dan refresh token.

---

## 2. Mengakses Data Nilai

Endpoint:

```text
GET /nilai
```

Request harus menyertakan:

```text
Authorization: Bearer <access_token>
X-Device-ID: <device_id>
```

Gateway akan memverifikasi token dan perangkat sebelum request diteruskan ke Service Nilai.

---

## 3. Mahasiswa Tidak Dapat Mengubah Nilai

Mahasiswa dapat memiliki token yang valid, tetapi ketika mencoba melakukan perubahan nilai, request akan ditolak.

Contoh respons:

```json
{
    "error": "Forbidden",
    "message": "Hanya dosen yang boleh mengubah atau memfinalisasi nilai"
}
```

---

## 4. Dosen Tidak Dapat Mengakses Kelas yang Bukan Miliknya

Sistem memeriksa apakah kelas yang diakses benar-benar menjadi tanggung jawab dosen.

Contoh respons:

```json
{
    "error": "Forbidden",
    "message": "Dosen tidak memiliki akses ke kelas ini"
}
```

---

## 5. Device Tidak Terdaftar

Meskipun token valid, request akan ditolak apabila perangkat tidak terdaftar.

Contoh respons:

```json
{
    "error": "Forbidden",
    "message": "Device tidak terdaftar"
}
```

---

## 6. Nilai yang Sudah Final Tidak Dapat Diubah

Setelah nilai difinalisasi, sistem menolak perubahan terhadap nilai tersebut.

Contoh respons:

```json
{
    "error": "Conflict",
    "message": "Nilai sudah difinalisasi dan tidak dapat diubah"
}
```

---

## 7. Service-to-Service Authentication

Endpoint internal sinkronisasi transkrip hanya dapat diakses menggunakan service token.

Token pengguna biasa akan ditolak.

Contoh respons:

```json
{
    "error": "Forbidden",
    "message": "Token bukan token service"
}
```

---

# Finalisasi dan Sinkronisasi Nilai

Dosen dapat melakukan finalisasi nilai melalui API Gateway.

Setelah proses finalisasi berhasil, Service Nilai akan melakukan sinkronisasi ke Service Transkrip menggunakan autentikasi service-to-service.

Contoh hasil:

```json
{
    "message": "Nilai berhasil difinalisasi dan disinkronkan",
    "class_id": 2,
    "jumlah_nilai_difinalisasi": 3,
    "sinkronisasi": {
        "message": "Sinkronisasi transkrip berhasil"
    }
}
```

---

# Audit Log

Untuk melihat aktivitas keamanan yang tercatat dalam sistem, jalankan:

```bash
node cek-audit.js
```

Audit log dapat menunjukkan aktivitas seperti:

- Login berhasil.
- Login gagal.
- Device tidak terdaftar.
- Token tidak valid.
- Mahasiswa mencoba mengubah nilai.
- Dosen mencoba mengakses kelas yang bukan miliknya.
- Nilai berhasil diubah.
- Nilai berhasil difinalisasi.
- Sinkronisasi transkrip.
- Service token ditolak atau diterima.

---

# Konsep Zero Trust yang Diimplementasikan

| Konsep | Implementasi |
|---|---|
| Never Trust, Always Verify | Setiap request diverifikasi |
| Authentication | JWT Authentication |
| Device Trust | Verifikasi X-Device-ID |
| Least Privilege | Pembatasan akses berdasarkan role dan kelas |
| Policy Enforcement | Policy Engine |
| Service Authentication | Service Token |
| Monitoring | Audit Log |
| API Protection | API Gateway |

---

# Hasil

Sistem berhasil menerapkan beberapa mekanisme utama dalam Zero Trust Architecture.

Pengguna tidak hanya diverifikasi berdasarkan proses login, tetapi setiap akses juga diperiksa berdasarkan:

1. Validitas token.
2. Identitas perangkat.
3. Role pengguna.
4. Hak akses terhadap resource.
5. Policy keamanan.
6. Jenis token yang digunakan.
7. Status dan aturan bisnis data.

Dengan pendekatan tersebut, sistem tidak memberikan kepercayaan secara otomatis kepada pengguna maupun service.

---

# Kesimpulan

Project **Zero Trust Security System** merupakan implementasi konsep keamanan Zero Trust pada sistem microservices sederhana.

Sistem menerapkan autentikasi menggunakan JWT, verifikasi perangkat, Role-Based Access Control, Policy Engine, API Gateway, service-to-service authentication, dan audit logging.

Setiap request harus melalui proses verifikasi sebelum diberikan akses.

Prinsip utama yang diterapkan dalam sistem ini adalah:

> **Never Trust, Always Verify**

---

## Repository

[Zero Trust Security System Repository](https://github.com/alifiaindahbalkis-u/zero-trust-security?utm_source=chatgpt.com)